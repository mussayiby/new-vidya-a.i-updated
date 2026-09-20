import { createServerFn } from "@tanstack/react-start";
import { GoogleGenAI } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  VideoClassroom,
  VideoClassroomCheckpoint,
  VideoClassroomDatabase,
  VideoClassroomKnowledgeMap,
  VideoClassroomTranscriptSegment,
  VideoClassroomVoiceTranslation,
  VideoClassroomTopic,
} from "@/lib/video-classroom.types";
import { createIndicTtsProvider } from "@/lib/tts/indic-tts.provider";

const db = supabaseAdmin as unknown as SupabaseClient<VideoClassroomDatabase>;

const STORAGE_BUCKET = "ai-video-classrooms";
const voicePreparationLocks = new Map<string, Promise<VideoClassroomVoiceTranslation>>();

const GENERATE_CONTENT_TIMEOUT_MS = 3 * 60 * 1000;
const GENERATE_CONTENT_MAX_ATTEMPTS = 5;
const GENERATE_CONTENT_RETRY_DELAYS_MS = [
  5_000,
  10_000,
  20_000,
  40_000,
  60_000,
] as const;

const accessTokenSchema = z.string().trim().min(20).max(4096);

const classroomIdSchema = z.object({
  accessToken: accessTokenSchema,
  classroomId: z.string().uuid(),
});

const createClassroomSchema = z.object({
  accessToken: accessTokenSchema,
  title: z.string().trim().min(1).max(200),
  classLevel: z.string().trim().min(1).max(100),
  subject: z.string().trim().min(1).max(160),
  topic: z.string().trim().min(1).max(200),
  chapter: z.string().trim().max(200).optional(),
  teacherLanguage: z.string().trim().min(2).max(20),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  learningObjectives: z.string().trim().min(1).max(4000),
  teachingInstructions: z.string().trim().max(4000).optional(),
});

const videoSchema = classroomIdSchema.extend({
  videoPath: z.string().trim().min(3).max(500),
  videoName: z.string().trim().min(1).max(255),
  videoMimeType: z.enum([
    "video/mp4",
    "video/webm",
    "video/quicktime",
  ]),
  videoSize: z.number().int().positive().max(524288000),
});

const joinSchema = z.object({
  accessToken: accessTokenSchema,
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^VIDYA-[A-Z0-9]{6}$/),
  language: z.string().trim().min(2).max(20),
  learningStyle: z.string().trim().max(80).optional(),
  learningPreference: z.string().trim().max(500).optional(),
});

const progressSchema = classroomIdSchema.extend({
  checkpointId: z.string().uuid().nullable(),
  lastPositionSeconds: z.number().finite().min(0),
  completed: z.boolean().optional(),
  timeSpentSeconds: z.number().finite().min(0).optional(),
});

const evaluateSchema = z.object({
  accessToken: accessTokenSchema,
  classroomId: z.string().uuid(),
  checkpointId: z.string().uuid(),
  answer: z.string().trim().min(1).max(4000),
  language: z.string().trim().min(2).max(20),
});

const voiceSchema = classroomIdSchema.extend({
  language: z.enum([
    "bn",
    "gu",
    "hi",
    "kn",
    "ml",
    "mr",
    "ta",
    "te",
  ]),
});

const evaluationSchema = z.object({
  result: z.enum(["correct", "partial", "incorrect"]),
  feedback: z.string().trim().min(1).max(1200),
  missingConcept: z.string().trim().max(300).nullable(),
  nextAction: z.enum(["continue", "remediate", "escalate"]),
});

const GeminiTranslationBatchResponseSchema = z.object({
  translatedSegments: z.array(
    z.object({
      segmentIndex: z.number().int().min(0),
      startTime: z.number().finite().min(0),
      endTime: z.number().finite().min(0),
      translatedText: z.string().trim().min(1),
    }),
  ),
});

const LANGUAGE_NAMES: Record<string, string> = {
  bn: "Bengali",
  gu: "Gujarati",
  hi: "Hindi",
  kn: "Kannada",
  ml: "Malayalam",
  mr: "Marathi",
  ta: "Tamil",
  te: "Telugu",
};

function getGeminiApiKey(): string | undefined {
  return (
    process.env["GEMINI_API_KEY"]?.trim() ||
    process.env["AI_API_KEY"]?.trim()
  );
}

async function getUser(accessToken: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new Error("Authentication required. Please sign in again.");
  }

  return data.user;
}

function makeClassroomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);

  crypto.getRandomValues(bytes);

  return `VIDYA-${Array.from(
    bytes,
    (byte) => alphabet[byte % alphabet.length],
  ).join("")}`;
}

async function uniqueClassroomCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = makeClassroomCode();

    const { data, error } = await db
      .from("ai_video_classrooms")
      .select("id")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      throw new Error("Could not verify classroom code availability.");
    }

    if (!data) {
      return code;
    }
  }

  throw new Error(
    "Could not generate a unique classroom code. Please try again.",
  );
}

function parseJsonResponse(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  if (!cleaned) {
    throw new Error("Gemini returned an empty lesson analysis response.");
  }

  return JSON.parse(cleaned);
}

async function uploadWavSegmentWithRetry(
  audioPath: string,
  wav: Blob,
  mimeType: string,
): Promise<void> {
  let lastError: { message?: string } | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).upload(audioPath, wav, {
      contentType: mimeType,
      upsert: true,
    });

    if (!error) {
      console.info("[Video Classroom Voice] upload succeeded", {
        audioPath,
        attempt,
        size: wav.size,
      });
      return;
    }

    lastError = error;
    console.warn("[Video Classroom Voice] upload retry", {
      audioPath,
      attempt,
      error: safeErrorDetailsForLog(error),
    });

    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }

  throw new Error(`Translated voice storage failed: ${lastError?.message ?? "upload failed"}`);
}

function errorDetailsForLog(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const providerError = error as Error & {
      status?: unknown;
      statusCode?: unknown;
      code?: unknown;
      issues?: unknown;
    };

    return {
      name: providerError.name,
      message: providerError.message,
      status: providerError.status,
      statusCode: providerError.statusCode,
      code: providerError.code,
      issues: providerError.issues,
      stack: providerError.stack,
    };
  }

  return { error };
}

function safeErrorDetailsForLog(error: unknown): string {
  return JSON.stringify(
    errorDetailsForLog(error),
    (_key, value: unknown) => {
      if (typeof value !== "string") {
        return value;
      }

      return value
        .replace(
          /(api[-_ ]?key|key|token|access_token|signature)=([^&\s]+)/gi,
          "$1=[REDACTED]",
        )
        .replace(/(AIza[0-9A-Za-z_-]{20,})/g, "[REDACTED]");
    },
  );
}

async function generateContentWithTimeout<T>(
  requestFactory: () => Promise<T>,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      requestFactory(),

      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(
          () =>
            reject(
              new Error(
                "Gemini video analysis timed out while generating the lesson analysis.",
              ),
            ),
          GENERATE_CONTENT_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function isTransientGenerateContentError(error: unknown): boolean {
  const details =
    error && typeof error === "object"
      ? (error as {
          status?: unknown;
          statusCode?: unknown;
          code?: unknown;
        })
      : {};

  const status =
    typeof details.status === "number" ||
    typeof details.status === "string"
      ? String(details.status).toLowerCase()
      : typeof details.statusCode === "number" ||
          typeof details.statusCode === "string"
        ? String(details.statusCode).toLowerCase()
        : "";

  const code =
    typeof details.code === "string"
      ? details.code.toLowerCase()
      : "";

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : "";

  return (
    ["429", "500", "502", "503", "504", "unavailable"].includes(status) ||
    code.includes("unavailable") ||
    code.includes("resource_exhausted") ||
    code.includes("internal") ||
    message.includes("high demand") ||
    message.includes("temporarily unavailable") ||
    message.includes("service unavailable") ||
    message.includes("internal server error") ||
    message.includes("temporary server error")
  );
}

function transientErrorLabel(error: unknown): string {
  const details =
    error && typeof error === "object"
      ? (error as {
          status?: unknown;
          statusCode?: unknown;
          code?: unknown;
        })
      : {};

  const status =
    typeof details.status === "number" ||
    typeof details.status === "string"
      ? String(details.status)
      : typeof details.statusCode === "number" ||
          typeof details.statusCode === "string"
        ? String(details.statusCode)
        : "";

  const code =
    typeof details.code === "string"
      ? details.code
      : "";

  return [
    status,
    code || "transient error",
  ]
    .filter(Boolean)
    .join("/");
}

async function generateContentWithRetry<T>(
  requestFactory: () => Promise<T>,
): Promise<T> {
  for (
    let attempt = 1;
    attempt <= GENERATE_CONTENT_MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await generateContentWithTimeout(requestFactory);
    } catch (error) {
      const isLastAttempt =
        attempt === GENERATE_CONTENT_MAX_ATTEMPTS;

      if (
        isLastAttempt ||
        !isTransientGenerateContentError(error)
      ) {
        console.error(
          `[Gemini Video] generateContent failed after ${attempt} attempt${
            attempt === 1 ? "" : "s"
          }.`,
        );

        throw error;
      }

      const baseDelay =
        GENERATE_CONTENT_RETRY_DELAYS_MS[attempt - 1] ??
        60_000;

      const jitter = Math.floor(
        Math.random() *
          Math.min(2_000, baseDelay * 0.2),
      );

      const delay = Math.min(
        60_000,
        baseDelay + jitter,
      );

      console.warn(
        `[Gemini Video] generateContent transient error (${transientErrorLabel(
          error,
        )}). Retrying ${attempt}/${GENERATE_CONTENT_MAX_ATTEMPTS} in ${Math.ceil(
          delay / 1_000,
        )}s...`,
      );

      await new Promise((resolve) =>
        setTimeout(resolve, delay),
      );
    }
  }

  throw new Error(
    "Gemini generateContent retry loop exited unexpectedly.",
  );
}

function describeProcessingError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown processing error";

  const details =
    error && typeof error === "object"
      ? (error as {
          status?: unknown;
          statusCode?: unknown;
        })
      : {};

  const status =
    typeof details.status === "number"
      ? details.status
      : typeof details.statusCode === "number"
        ? details.statusCode
        : null;

  const lowerMessage = message.toLowerCase();

  if (
    status === 429 ||
    lowerMessage.includes("quota") ||
    lowerMessage.includes("rate limit")
  ) {
    return "Gemini analysis is temporarily rate-limited. Please retry the analysis.";
  }

  if (
    status === 401 ||
    status === 403 ||
    lowerMessage.includes("api key") ||
    lowerMessage.includes("unauthorized")
  ) {
    return "Gemini analysis was rejected by the provider. Check the server-side Gemini configuration.";
  }

  if (
    status === 404 ||
    lowerMessage.includes("not found") ||
    lowerMessage.includes("no longer available")
  ) {
    return "The configured Gemini model or uploaded video was not available to the provider.";
  }

  if (
    status === 503 ||
    lowerMessage.includes("unavailable") ||
    lowerMessage.includes("high demand")
  ) {
    return "Gemini is temporarily busy processing video lessons. Please retry in a few minutes.";
  }

  if (lowerMessage.includes("timed out")) {
    return "Gemini video analysis timed out. Please retry the analysis.";
  }

  if (
    status === 400 ||
    lowerMessage.includes("invalid argument") ||
    lowerMessage.includes("invalid request") ||
    lowerMessage.includes("unsupported")
  ) {
    return "Gemini could not analyze this video request. Check the video format and try again.";
  }

  if (
    lowerMessage.includes(
      "could not save the analyzed lesson topics",
    )
  ) {
    return "Gemini returned a lesson map, but topics could not be saved to Supabase.";
  }

  if (
    lowerMessage.includes(
      "could not save the analyzed lesson checkpoints",
    )
  ) {
    return "Topics were generated, but checkpoints could not be saved to Supabase.";
  }

  if (
    lowerMessage.includes("json") ||
    lowerMessage.includes("lesson map")
  ) {
    return "Gemini returned lesson data that did not match the required lesson-map structure.";
  }

  return "The lesson could not be analyzed. Please retry the analysis.";
}

const topicSchema = z
  .object({
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    startTime: z.number().finite().min(0),
    endTime: z.number().finite().min(0),
    concepts: z.array(z.string().trim().min(1)).max(30),
    definitions: z.array(z.string().trim().min(1)).max(30),
    examples: z.array(z.string().trim().min(1)).max(30),
    misconceptions: z
      .array(z.string().trim().min(1))
      .max(30),

    checkpoint: z.object({
      question: z.string().trim().min(1),
      expectedAnswer: z.string().trim().min(1),
      remediation: z.string().trim().min(1),
      miniQuizQuestion: z.string().trim().optional(),
    }),
  })
  .refine(
    (topic) => topic.endTime >= topic.startTime,
    {
      message: "endTime must be greater than or equal to startTime",
      path: ["endTime"],
    },
  );

const knowledgeMapSchema = z.object({
  lessonTitle: z.string().trim().min(1),
  summary: z.string().trim().min(1),

  keyLearningPoints: z
    .array(z.string().trim().min(1))
    .max(40),

  topics: z
    .array(topicSchema)
    .min(1)
    .max(40)
    .refine(
      (topics) =>
        topics.every(
          (topic, index) => {
            const previousTopic = topics[index - 1];

            return (
              previousTopic === undefined ||
              topic.startTime >= previousTopic.endTime
            );
          },
        ),
      {
        message:
          "Topics must be chronological and non-overlapping",
        path: ["topics"],
      },
    ),

  transcriptSegments: z
    .array(
      z.object({
        startTime: z.number().finite().min(0),
        endTime: z.number().finite().min(0),
        text: z.string().trim().min(1),
      }),
    )
    .min(1)
    .max(500),
});

const transcriptSegmentSchema = z.object({
  startTime: z.number().finite().min(0),
  endTime: z.number().finite().min(0),
  text: z.string().trim().min(1),
});

/** Translate the complete timestamped transcript in one Gemini request. */
async function translateVoiceSegments(
  transcript: VideoClassroomTranscriptSegment[],
  from: string,
  to: string,
): Promise<string[]> {
  if (from === to) {
    return transcript.map((segment) => segment.text);
  }

  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    throw new Error(
      "Gemini is not configured on the server.",
    );
  }

  const sourceLanguage =
    LANGUAGE_NAMES[from] ?? from;

  const targetLanguage =
    LANGUAGE_NAMES[to] ?? to;

  const client = new GoogleGenAI({
    apiKey,
  });

  console.info(
    `[Video Classroom Voice] Translating ${transcript.length} segments from ${sourceLanguage} to ${targetLanguage}.`,
  );

  let response: Awaited<ReturnType<typeof client.models.generateContent>>;
  try {
    response = await generateContentWithRetry(() =>
      client.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Translate every teacher transcript segment from ${sourceLanguage} to ${targetLanguage}.

Return JSON only in exactly this format:
{
  "translatedSegments": [
    {
      "segmentIndex": 0,
      "startTime": 0,
      "endTime": 5,
      "translatedText": "translated lesson segment"
    }
  ]
}

Translation requirements:
- Preserve every segment in the same order.
- Do not summarize, merge, split, add, or remove segments.
- Preserve each segmentIndex, startTime, and endTime exactly.
- Preserve complete meaning, numbers, mathematical expressions, scientific terminology, names, and technical terms.
- Use natural ${targetLanguage} suitable for a school student.
- Return a non-empty translatedText for every input segment.

Transcript segments:
${JSON.stringify(
  transcript.map((segment, segmentIndex) => ({
    segmentIndex,
    startTime: segment.startTime,
    endTime: segment.endTime,
    text: segment.text,
  })),
  null,
  2,
)}`,
              },
            ],
          },
        ],
        config: { responseMimeType: "application/json" },
      }),
    );
  } catch (error) {
    throw new Error(
      `Gemini translation failed after retries: ${
        error instanceof Error ? error.message : "unknown provider error"
      }`,
    );
  }

  const result = GeminiTranslationBatchResponseSchema.parse(
    parseJsonResponse(response.text ?? ""),
  );

  if (result.translatedSegments.length !== transcript.length) {
    throw new Error(
      `Gemini returned ${result.translatedSegments.length} translated segments for ${transcript.length} transcript segments.`,
    );
  }

  const translatedByIndex = new Map(
    result.translatedSegments.map((segment) => [segment.segmentIndex, segment]),
  );

  return transcript.map((segment, segmentIndex) => {
    const translated = translatedByIndex.get(segmentIndex);
    if (
      !translated ||
      translated.startTime !== segment.startTime ||
      translated.endTime !== segment.endTime ||
      translated.segmentIndex !== segmentIndex
    ) {
      throw new Error(
        `Gemini returned invalid ordering or timestamps for transcript segment ${segmentIndex}.`,
      );
    }
    return translated.translatedText;
  });
}

async function transcriptVersion(
  transcript: VideoClassroomTranscriptSegment[],
): Promise<string> {
  const bytes = new TextEncoder().encode(
    JSON.stringify(transcript),
  );

  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes,
  );

  return Array.from(
    new Uint8Array(digest),
    (byte) =>
      byte.toString(16).padStart(2, "0"),
  ).join("");
}

export const createVideoClassroom =
  createServerFn({ method: "POST" })
    .validator((input: unknown) =>
      createClassroomSchema.parse(input),
    )
    .handler(async ({ data }) => {
      const user = await getUser(
        data.accessToken,
      );

      const code =
        await uniqueClassroomCode();

      const {
        data: classroom,
        error,
      } = await db
        .from("ai_video_classrooms")
        .insert({
          teacher_id: user.id,
          code,
          title: data.title,
          class_level: data.classLevel,
          subject: data.subject,
          topic: data.topic,
          chapter: data.chapter || null,
          teacher_language: data.teacherLanguage,
          difficulty: data.difficulty,
          learning_objectives:
            data.learningObjectives,
          teaching_instructions:
            data.teachingInstructions || null,
          status: "draft",
          published: false,
        })
        .select("*")
        .single();

      if (error || !classroom) {
        throw new Error(
          "Could not create the AI classroom.",
        );
      }

      return classroom;
    });

export const attachVideoToClassroom =
  createServerFn({ method: "POST" })
    .validator((input: unknown) =>
      videoSchema.parse(input),
    )
    .handler(async ({ data }) => {
      const user = await getUser(
        data.accessToken,
      );

      const {
        data: classroom,
        error,
      } = await db
        .from("ai_video_classrooms")
        .update({
          video_path: data.videoPath,
          video_name: data.videoName,
          video_mime_type:
            data.videoMimeType,
          video_size: data.videoSize,
          status: "uploading",
          status_message:
            "Video uploaded. Ready for lesson analysis.",
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", data.classroomId)
        .eq("teacher_id", user.id)
        .select("*")
        .single();

      if (error || !classroom) {
        throw new Error(
          "Could not attach the uploaded lesson video.",
        );
      }

      return classroom;
    });

export const processVideoClassroom =
  createServerFn({ method: "POST" })
    .validator((input: unknown) =>
      classroomIdSchema.parse(input),
    )
    .handler(async ({ data }) => {
      const user = await getUser(
        data.accessToken,
      );

      const {
        data: classroom,
        error: classroomError,
      } = await db
        .from("ai_video_classrooms")
        .select("*")
        .eq("id", data.classroomId)
        .eq("teacher_id", user.id)
        .single();

      if (
        classroomError ||
        !classroom?.video_path ||
        !classroom.video_mime_type
      ) {
        throw new Error(
          "Upload a valid classroom video before starting analysis.",
        );
      }

      await db
        .from("ai_video_classrooms")
        .update({
          status: "analyzing",
          status_message:
            "Analyzing the lesson with Gemini.",
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", classroom.id);

      try {
        const apiKey =
          getGeminiApiKey();

        if (!apiKey) {
          throw new Error(
            "Gemini is not configured on the server.",
          );
        }

        const {
          data: videoBlob,
          error: downloadError,
        } =
          await supabaseAdmin.storage
            .from(STORAGE_BUCKET)
            .download(
              classroom.video_path,
            );

        if (
          downloadError ||
          !videoBlob
        ) {
          throw new Error(
            "The uploaded lesson video could not be read.",
          );
        }

        const client =
          new GoogleGenAI({
            apiKey,
          });

        const uploaded =
          await client.files.upload({
            file: videoBlob,
            config: {
              mimeType:
                classroom.video_mime_type,
              displayName:
                classroom.video_name ??
                classroom.title,
            },
          });

        if (
          !uploaded.uri ||
          !uploaded.mimeType
        ) {
          throw new Error(
            "Gemini did not accept the lesson video.",
          );
        }

        let videoFile = uploaded;

        const maxAttempts = 60;

        for (
          let attempt = 0;
          attempt < maxAttempts;
          attempt += 1
        ) {
          const state =
            videoFile.state?.toString();

          console.log(
            `[Gemini Video] Processing attempt ${
              attempt + 1
            }/${maxAttempts}: ${state}`,
          );

          if (state === "ACTIVE") {
            break;
          }

          if (state === "FAILED") {
            throw new Error(
              "Gemini failed to process the uploaded lesson video.",
            );
          }

          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                5000,
              ),
          );

          videoFile =
            await client.files.get({
              name: videoFile.name!,
            });
        }

        if (
          videoFile.state?.toString() !==
          "ACTIVE"
        ) {
          throw new Error(
            "Gemini video processing timed out. Please try the analysis again.",
          );
        }

        if (
          !videoFile.uri ||
          !videoFile.mimeType
        ) {
          throw new Error(
            "Gemini did not return a valid processed video reference.",
          );
        }

        console.log(
          "[Gemini Video] Starting generateContent...",
        );

        let response: Awaited<
          ReturnType<
            typeof client.models.generateContent
          >
        >;

        try {
          response =
            await generateContentWithRetry(
              () =>
                client.models.generateContent(
                  {
                    model:
                      "gemini-3.6-flash",

                    contents: [
                      {
                        fileData: {
                          fileUri:
                            videoFile.uri!,
                          mimeType:
                            videoFile.mimeType!,
                        },
                      },

                      {
                        text: `Analyze the complete uploaded teaching video and return only valid JSON. Do not use Markdown fences or add commentary. Build a classroom knowledge map for ${classroom.class_level} ${classroom.subject} about ${classroom.topic}. The original teaching language is ${classroom.teacher_language}; difficulty is ${classroom.difficulty}. Learning objectives: ${classroom.learning_objectives}. Additional teaching instructions: ${classroom.teaching_instructions ?? "None"}. Use timestamps from the actual video in seconds. Transcribe the teacher's spoken instruction into ordered, short timestamped segments; do not use topic timestamps as transcript timestamps. Include meaningful, non-overlapping topics covering the lesson and exactly one checkpoint for every topic. Every topic must have non-empty arrays for concepts, definitions, examples, and misconceptions. Return exactly this shape: {"lessonTitle":"string","summary":"string","keyLearningPoints":["string"],"transcriptSegments":[{"startTime":0,"endTime":6.5,"text":"spoken words from the video"}],"topics":[{"title":"string","summary":"string","startTime":0,"endTime":0,"concepts":["string"],"definitions":["string"],"examples":["string"],"misconceptions":["string"],"checkpoint":{"question":"string","expectedAnswer":"string","remediation":"string","miniQuizQuestion":"string"}}]}. Ensure transcript segments are in chronological order, have non-empty text, and each endTime is greater than or equal to its startTime. Ensure all required strings are non-empty.`,
                      },
                    ],

                    config: {
                      responseMimeType:
                        "application/json",
                    },
                  },
                ),
            );

          console.log(
            "[Gemini Video] generateContent completed.",
          );
        } catch (error) {
          console.error(
            `[Gemini Video] GENERATE CONTENT ERROR: ${safeErrorDetailsForLog(
              error,
            )}`,
          );

          throw error;
        }

        console.log(
          "[Gemini Video] Reading response text...",
        );

        console.log(
          "[Gemini Video] Response text received:",
          Boolean(response.text),
        );

        let parsedResponse: unknown;

        try {
          parsedResponse =
            parseJsonResponse(
              response.text ?? "",
            );

          console.log(
            "[Gemini Video] Gemini JSON parsed successfully.",
          );
        } catch (error) {
          console.error(
            `[Gemini Video] RESPONSE/PARSE ERROR: ${safeErrorDetailsForLog(
              error,
            )}`,
          );

          throw new Error(
            "Gemini returned an invalid JSON lesson analysis.",
          );
        }

        let parsedKnowledgeMap: z.infer<
          typeof knowledgeMapSchema
        >;

        try {
          console.log(
            "[Gemini Video] Validating knowledge map...",
          );

          parsedKnowledgeMap =
            knowledgeMapSchema.parse(
              parsedResponse,
            );

          console.log(
            "[Gemini Video] Knowledge map validation succeeded.",
          );
        } catch (error) {
          console.error(
            `[Gemini Video] SCHEMA VALIDATION ERROR: ${safeErrorDetailsForLog(
              error,
            )}`,
          );

          throw new Error(
            "Gemini returned a lesson map that did not match the required structure.",
          );
        }

        try {
          console.log(
            "[Gemini Video] Validating transcript segments...",
          );

          const transcript =
            parsedKnowledgeMap.transcriptSegments.map(
              (
                segment,
                index,
                segments,
              ) => {
                const parsed =
                  transcriptSegmentSchema.parse(
                    segment,
                  );

                const next =
                  segments[index + 1];

                if (
                  parsed.endTime <
                  parsed.startTime
                ) {
                  throw new Error(
                    `Transcript segment ${index} ends before it starts.`,
                  );
                }

                if (
                  next &&
                  parsed.endTime >
                    next.startTime
                ) {
                  throw new Error(
                    `Transcript segment ${index} overlaps the next segment.`,
                  );
                }

                return parsed;
              },
            );

          console.log(
            `[Gemini Video] Transcript validation succeeded: ${transcript.length} segments.`,
          );

          const knowledgeMap:
            VideoClassroomKnowledgeMap =
            {
              ...parsedKnowledgeMap,

              topics:
                parsedKnowledgeMap.topics.map(
                  (topic) => ({
                    ...topic,

                    checkpoint: {
                      ...topic.checkpoint,
                      miniQuizQuestion:
                        topic.checkpoint
                          .miniQuizQuestion,
                    },
                  }),
                ),
            };

          console.log(
            "[Gemini Video] Saving transcript...",
          );

          const {
            error: transcriptError,
          } = await db
            .from(
              "ai_video_classrooms",
            )
            .update({
              transcript,
            })
            .eq("id", classroom.id);

          if (transcriptError) {
            console.error(
              `[Gemini Video] TRANSCRIPT DATABASE ERROR: ${safeErrorDetailsForLog(
                transcriptError,
              )}`,
            );

            throw new Error(
              `Could not save the lesson transcript: ${transcriptError.message}`,
            );
          }

          console.log(
            "[Gemini Video] Transcript saved.",
          );

          console.log(
            "[Gemini Video] Saving topics and checkpoints...",
          );

          const {
            error: deleteTopicsError,
          } = await db
            .from(
              "ai_video_classroom_topics",
            )
            .delete()
            .eq(
              "classroom_id",
              classroom.id,
            );

          if (deleteTopicsError) {
            console.error(
              `[Gemini Video] TOPIC DELETE DATABASE ERROR: ${safeErrorDetailsForLog(
                deleteTopicsError,
              )}`,
            );

            throw new Error(
              `Could not replace the classroom lesson map: ${deleteTopicsError.message}`,
            );
          }

          for (
            const [
              index,
              topic,
            ] of knowledgeMap.topics.entries()
          ) {
            const {
              data: topicRow,
              error: topicError,
            } = await db
              .from(
                "ai_video_classroom_topics",
              )
              .insert({
                classroom_id:
                  classroom.id,
                topic_index:
                  index,
                title: topic.title,
                summary:
                  topic.summary,
                start_time:
                  topic.startTime,
                end_time:
                  topic.endTime,
                concepts:
                  topic.concepts,
                definitions:
                  topic.definitions,
                examples:
                  topic.examples,
                misconceptions:
                  topic.misconceptions,
              })
              .select("*")
              .single();

            if (
              topicError ||
              !topicRow
            ) {
              console.error(
                `[Gemini Video] TOPIC DATABASE ERROR: ${safeErrorDetailsForLog(
                  topicError,
                )}`,
              );

              throw new Error(
                `Could not save the analyzed lesson topics${
                  topicError
                    ? `: ${topicError.message}`
                    : "."
                }`,
              );
            }

            const {
              error: checkpointError,
            } = await db
              .from(
                "ai_video_classroom_checkpoints",
              )
              .insert({
                classroom_id:
                  classroom.id,
                topic_id:
                  topicRow.id,
                checkpoint_index:
                  index,
                timestamp_seconds:
                  topic.startTime,
                question:
                  topic.checkpoint
                    .question,
                expected_answer:
                  topic.checkpoint
                    .expectedAnswer,
                remediation:
                  topic.checkpoint
                    .remediation,
                mini_quiz_question:
                  topic.checkpoint
                    .miniQuizQuestion ??
                  null,
              });

            if (checkpointError) {
              console.error(
                `[Gemini Video] CHECKPOINT DATABASE ERROR: ${safeErrorDetailsForLog(
                  checkpointError,
                )}`,
              );

              throw new Error(
                `Could not save the analyzed lesson checkpoints: ${checkpointError.message}`,
              );
            }
          }

          console.log(
            "[Gemini Video] Topics saved.",
          );

          console.log(
            "[Gemini Video] Updating classroom status to ready...",
          );

          const {
            data: updated,
            error: updateError,
          } = await db
            .from(
              "ai_video_classrooms",
            )
            .update({
              knowledge_map:
                knowledgeMap,
              status: "ready",
              status_message:
                "Lesson analysis is ready for teacher review.",
              updated_at:
                new Date().toISOString(),
            })
            .eq(
              "id",
              classroom.id,
            )
            .select("*")
            .single();

          if (
            updateError ||
            !updated
          ) {
            console.error(
              `[Gemini Video] READY STATUS DATABASE ERROR: ${safeErrorDetailsForLog(
                updateError,
              )}`,
            );

            throw new Error(
              `Could not mark the classroom ready${
                updateError
                  ? `: ${updateError.message}`
                  : "."
              }`,
            );
          }

          console.log(
            "[Gemini Video] Classroom status updated to ready.",
          );

          return updated;
        } catch (error) {
          console.error(
            `[Gemini Video] DATABASE/PERSISTENCE ERROR: ${safeErrorDetailsForLog(
              error,
            )}`,
          );

          throw error;
        }
      } catch (error) {
        console.error(
          `[Gemini Video] POST-GENERATE ERROR: ${safeErrorDetailsForLog(
            error,
          )}`,
        );

        const statusMessage =
          describeProcessingError(
            error,
          );

        const {
          error: statusUpdateError,
        } = await db
          .from("ai_video_classrooms")
          .update({
            status: "failed",
            status_message:
              statusMessage,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            classroom.id,
          );

        if (statusUpdateError) {
          console.error(
            `[Gemini Video] FAILED STATUS DATABASE ERROR: ${safeErrorDetailsForLog(
              statusUpdateError,
            )}`,
          );
        }

        throw new Error(
          statusMessage,
        );
      }
    });

export const publishVideoClassroom =
  createServerFn({ method: "POST" })
    .validator((input: unknown) =>
      classroomIdSchema.parse(input),
    )
    .handler(async ({ data }) => {
      const user = await getUser(
        data.accessToken,
      );

      const {
        data: classroom,
        error,
      } = await db
        .from("ai_video_classrooms")
        .update({
          published: true,
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", data.classroomId)
        .eq("teacher_id", user.id)
        .eq("status", "ready")
        .select("*")
        .single();

      if (error || !classroom) {
        throw new Error(
          "Only a ready classroom can be published.",
        );
      }

      return classroom;
    });

export const listMyVideoClassrooms =
  createServerFn({ method: "POST" })
    .validator((input: unknown) =>
      z
        .object({
          accessToken:
            accessTokenSchema,
        })
        .parse(input),
    )
    .handler(async ({ data }) => {
      const user = await getUser(
        data.accessToken,
      );

      const {
        data: classrooms,
        error,
      } = await db
        .from("ai_video_classrooms")
        .select("*")
        .eq("teacher_id", user.id)
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        throw new Error(
          "Could not load your AI classrooms.",
        );
      }

      return classrooms ?? [];
    });

export const joinVideoClassroom =
  createServerFn({ method: "POST" })
    .validator((input: unknown) =>
      joinSchema.parse(input),
    )
    .handler(async ({ data }) => {
      const user = await getUser(
        data.accessToken,
      );

      const {
        data: classroom,
        error: classroomError,
      } = await db
        .from("ai_video_classrooms")
        .select("*")
        .eq("code", data.code)
        .eq("published", true)
        .eq("status", "ready")
        .maybeSingle();

      if (
        classroomError ||
        !classroom
      ) {
        throw new Error(
          "That classroom code is invalid or the classroom is not published.",
        );
      }

      const {
        error: memberError,
      } = await db
        .from(
          "ai_video_classroom_members",
        )
        .upsert(
          {
            classroom_id:
              classroom.id,
            student_id: user.id,
            language:
              data.language,
            learning_style:
              data.learningStyle ??
              null,
            learning_preference:
              data.learningPreference ??
              null,
          },
          {
            onConflict:
              "classroom_id,student_id",
          },
        );

      if (memberError) {
        throw new Error(
          "Could not join the classroom.",
        );
      }

      await db
        .from(
          "ai_video_classroom_progress",
        )
        .upsert(
          {
            classroom_id:
              classroom.id,
            student_id: user.id,
            last_position_seconds: 0,
            completed: false,
            time_spent_seconds: 0,
          },
          {
            onConflict:
              "classroom_id,student_id",
          },
        );

      return classroom;
    });

export const getVideoClassroom =
  createServerFn({ method: "POST" })
    .validator((input: unknown) =>
      classroomIdSchema.parse(input),
    )
    .handler(async ({ data }) => {
      const user = await getUser(
        data.accessToken,
      );

      const {
        data: classroom,
        error: classroomError,
      } = await db
        .from("ai_video_classrooms")
        .select("*")
        .eq("id", data.classroomId)
        .maybeSingle();

      if (
        classroomError ||
        !classroom
      ) {
        throw new Error(
          "AI classroom not found.",
        );
      }

      const isTeacher =
        classroom.teacher_id ===
        user.id;

      if (!isTeacher) {
        const {
          data: member,
        } = await db
          .from(
            "ai_video_classroom_members",
          )
          .select("*")
          .eq(
            "classroom_id",
            classroom.id,
          )
          .eq(
            "student_id",
            user.id,
          )
          .maybeSingle();

        if (
          !member ||
          !classroom.published
        ) {
          throw new Error(
            "You are not a member of this classroom.",
          );
        }
      }

      const [
        { data: topics },
        { data: checkpoints },
        { data: progress },
        { data: signed },
      ] = await Promise.all([
        db
          .from(
            "ai_video_classroom_topics",
          )
          .select("*")
          .eq(
            "classroom_id",
            classroom.id,
          )
          .order("topic_index"),

        db
          .from(
            "ai_video_classroom_checkpoints",
          )
          .select("*")
          .eq(
            "classroom_id",
            classroom.id,
          )
          .order("checkpoint_index"),

        db
          .from(
            "ai_video_classroom_progress",
          )
          .select("*")
          .eq(
            "classroom_id",
            classroom.id,
          )
          .eq(
            "student_id",
            user.id,
          )
          .maybeSingle(),

        classroom.video_path
          ? supabaseAdmin.storage
              .from(
                STORAGE_BUCKET,
              )
              .createSignedUrl(
                classroom.video_path,
                3600,
              )
          : Promise.resolve({
              data: null,
            }),
      ]);

      return {
        classroom:
          classroom as VideoClassroom,

        topics:
          (topics ??
            []) as VideoClassroomTopic[],

        checkpoints:
          (checkpoints ??
            []) as VideoClassroomCheckpoint[],

        progress:
          progress ?? null,

        videoUrl:
          signed?.signedUrl ??
          null,
      };
    });

export const prepareVideoClassroomVoice =
  createServerFn({ method: "POST" })
    .validator((input: unknown) =>
      voiceSchema.parse(input),
    )
    .handler(async ({ data }) => {
      console.info("[Video Classroom Voice] START", {
        classroomId: data.classroomId,
        targetLanguage: data.language,
      });

      const user = await getUser(data.accessToken);

      const { data: classroom, error: classroomError } = await db
        .from("ai_video_classrooms")
        .select("*")
        .eq("id", data.classroomId)
        .maybeSingle();

      if (classroomError) {
        console.error("[Video Classroom Voice] classroom load failed:", safeErrorDetailsForLog(classroomError));
      }
      if (classroomError || !classroom || (!classroom.published && classroom.teacher_id !== user.id)) {
        throw new Error("This classroom is not available for translated audio.");
      }
      console.info("[Video Classroom Voice] classroom loaded");

      const { data: member, error: memberError } = await db
        .from("ai_video_classroom_members")
        .select("id")
        .eq("classroom_id", classroom.id)
        .eq("student_id", user.id)
        .maybeSingle();

      if (memberError) {
        console.error("[Video Classroom Voice] membership lookup failed:", safeErrorDetailsForLog(memberError));
        throw new Error(`Could not verify classroom membership: ${memberError.message}`);
      }
      if (!member && classroom.teacher_id !== user.id) {
        throw new Error("Join this classroom before preparing translated audio.");
      }

      const transcript = z.array(transcriptSegmentSchema).parse(classroom.transcript ?? []);
      if (transcript.length === 0) {
        throw new Error("This lesson does not contain a timestamped teacher transcript.");
      }
      console.info("[Video Classroom Voice] transcript loaded", { segmentCount: transcript.length });

      const version = await transcriptVersion(transcript);
      console.info("[Video Classroom Voice] transcript version:", version);

      const sourceLanguage = classroom.teacher_language.split("-")[0]?.toLowerCase() ?? "en";
      console.info("[Video Classroom Voice] target language:", data.language);
      console.info("[Video Classroom Voice] cache lookup started");

      const { data: existing, error: existingError } = await db
        .from("ai_video_classroom_translations")
        .select("*")
        .eq("classroom_id", classroom.id)
        .eq("target_language", data.language)
        .eq("transcript_version", version)
        .maybeSingle();

      if (existingError) {
        console.error("[Video Classroom Voice] cache lookup failed:", safeErrorDetailsForLog(existingError));
        throw new Error(`Could not check translated voice cache: ${existingError.message}`);
      }
      console.info("[Video Classroom Voice] cache result:", {
        status: existing?.status ?? "miss",
        translationId: existing?.id ?? null,
      });

      const readReadyTranslation = async (translationId: string) => {
        const { data: rows, error: rowsError } = await db
          .from("ai_video_classroom_translation_segments")
          .select("*")
          .eq("translation_id", translationId)
          .order("segment_index");

        if (rowsError || !rows || rows.length !== transcript.length) {
          console.error("[Video Classroom Voice] cached segment load failed:", safeErrorDetailsForLog(rowsError));
          throw new Error(
            `Cached translated voice segments could not be loaded${rowsError ? `: ${rowsError.message}` : "."}`,
          );
        }

        const segments = await Promise.all(
          rows.map(async (row) => {
            const { data: signed, error: signedError } = await supabaseAdmin.storage
              .from(STORAGE_BUCKET)
              .createSignedUrl(row.audio_path, 3600);

            if (signedError || !signed?.signedUrl) {
              console.error("[Video Classroom Voice] signed URL generation failed:", safeErrorDetailsForLog(signedError));
              throw new Error(
                `Cached translated voice audio could not be loaded${signedError ? `: ${signedError.message}` : "."}`,
              );
            }

            return {
              startTime: row.start_time,
              endTime: row.end_time,
              text: row.source_text,
              sourceText: row.source_text,
              translatedText: row.translated_text,
              audioUrl: signed.signedUrl,
            };
          }),
        );

        console.info("[Video Classroom Voice] signed URLs generated", {
          segmentCount: segments.length,
        });

        return {
          language: data.language,
          status: "ready",
          segments,
        } satisfies VideoClassroomVoiceTranslation;
      };

      if (existing?.status === "ready") {
        console.info("[Video Classroom Voice] cache hit: ready", {
          translationId: existing.id,
          classroomId: classroom.id,
          targetLanguage: data.language,
        });
        return readReadyTranslation(existing.id);
      }

      if (existing?.status === "preparing") {
        console.info("[Video Classroom Voice] cache hit: preparing", {
          translationId: existing.id,
          classroomId: classroom.id,
          targetLanguage: data.language,
        });
        const { data: preparingSegments, error: preparingSegmentsError } = await db
          .from("ai_video_classroom_translation_segments")
          .select("*")
          .eq("translation_id", existing.id)
          .order("segment_index");

        if (!preparingSegmentsError && preparingSegments && preparingSegments.length === transcript.length) {
          return readReadyTranslation(existing.id);
        }

        throw new Error("Translated voice is already being prepared. Please wait a moment and retry.");
      }

      const { data: cachedSegments, error: cachedSegmentsError } = existing
        ? await db
            .from("ai_video_classroom_translation_segments")
            .select("*")
            .eq("translation_id", existing.id)
            .order("segment_index")
        : { data: [], error: null };

      if (cachedSegmentsError) {
        console.error("[Video Classroom Voice] cached segment lookup failed:", safeErrorDetailsForLog(cachedSegmentsError));
        throw new Error(`Cached translated voice segments could not be checked: ${cachedSegmentsError.message}`);
      }

      const cachedByIndex = new Map((cachedSegments ?? []).map((segment) => [segment.segment_index, segment]));

      const singleFlightKey = `${classroom.id}:${version}:${data.language}`;
      const inFlight = voicePreparationLocks.get(singleFlightKey);
      if (inFlight) {
        console.info("[Video Classroom Voice] reusing in-flight preparation", {
          singleFlightKey,
          targetLanguage: data.language,
        });
        return inFlight;
      }

      const translationPromise = (async (): Promise<VideoClassroomVoiceTranslation> => {
        const { data: translation, error: translationError } = await db
          .from("ai_video_classroom_translations")
          .upsert(
            {
              classroom_id: classroom.id,
              source_language: sourceLanguage,
              target_language: data.language,
              transcript_version: version,
              status: "preparing",
              error_message: null,
            },
            { onConflict: "classroom_id,target_language,transcript_version" },
          )
          .select("*")
          .single();

        if (translationError || !translation) {
          console.error("[Video Classroom Voice] preparation row insert failed:", safeErrorDetailsForLog(translationError));
          throw new Error(
            `Could not start translated voice preparation${translationError ? `: ${translationError.message}` : "."}`,
          );
        }
        console.info("[Video Classroom Voice] status: preparing", { translationId: translation.id });

        try {
          const missingSegments: Array<{
            segmentIndex: number;
            startTime: number;
            endTime: number;
            sourceText: string;
            translatedText: string;
            audioPath: string;
          }> = [];

          const provider = createIndicTtsProvider();

          console.info(`[Video Classroom Voice] batch translation started: ${transcript.length} segments.`);
          const translatedTexts = await translateVoiceSegments(transcript, sourceLanguage, data.language);
          console.info(`[Video Classroom Voice] batch translation completed: ${translatedTexts.length} segments.`);
          console.info("[Video Classroom Voice] translated segment count:", translatedTexts.length);

          for (const [segmentIndex, segment] of transcript.entries()) {
            const cached = cachedByIndex.get(segmentIndex);

            if (cached?.source_text === segment.text && cached.audio_path) {
              console.info(`[Video Classroom Voice] cached segment ${segmentIndex} reused.`);
              continue;
            }

            const translatedText = translatedTexts[segmentIndex];
            if (!translatedText) {
              throw new Error(`Translated text is missing for transcript segment ${segmentIndex}.`);
            }

            console.info(`[Video Classroom Voice] TTS started segment ${segmentIndex}`);
            console.info(`[Video Classroom Voice] Calling Indic-TTS for segment ${segmentIndex}`);
            const audio = await provider.synthesize({
              text: translatedText,
              language: data.language,
              segmentId: `${classroom.id}-${version}-${segmentIndex}`,
            });
            console.info(`[Video Classroom Voice] TTS completed segment ${segmentIndex}`);
            console.info(`[Video Classroom Voice] Indic-TTS returned bytes: ${audio.audio.byteLength}`);

            const audioBuffer = new ArrayBuffer(audio.audio.byteLength);
            new Uint8Array(audioBuffer).set(audio.audio);

            const audioPath = `${classroom.teacher_id}/${classroom.id}/translations/${version}/${data.language}/${segmentIndex}.wav`;

            console.info(`[Video Classroom Voice] Uploading WAV segment ${segmentIndex}`);
            const wavBlob = new Blob([audioBuffer], { type: audio.mimeType });
            await uploadWavSegmentWithRetry(audioPath, wavBlob, audio.mimeType);
            console.info(`[Video Classroom Voice] Upload complete segment ${segmentIndex}`);

            missingSegments.push({
              segmentIndex,
              startTime: segment.startTime,
              endTime: segment.endTime,
              sourceText: segment.text,
              translatedText,
              audioPath,
            });
          }

          if (missingSegments.length > 0) {
            const { error: segmentInsertError } = await db
              .from("ai_video_classroom_translation_segments")
              .upsert(
                missingSegments.map((segment) => ({
                  translation_id: translation.id,
                  segment_index: segment.segmentIndex,
                  start_time: segment.startTime,
                  end_time: segment.endTime,
                  source_text: segment.sourceText,
                  translated_text: segment.translatedText,
                  audio_path: segment.audioPath,
                })),
                { onConflict: "translation_id,segment_index" },
              );

            if (segmentInsertError) {
              console.error("[Video Classroom Voice] segment database update failed:", safeErrorDetailsForLog(segmentInsertError));
              throw new Error(`Translated voice metadata could not be saved: ${segmentInsertError.message}`);
            }
          }

          console.info("[Video Classroom Voice] database status update started");
          const { error: readyError } = await db
            .from("ai_video_classroom_translations")
            .update({
              status: "ready",
              error_message: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", translation.id);

          if (readyError) {
            console.error("[Video Classroom Voice] database status update failed:", safeErrorDetailsForLog(readyError));
            throw new Error(`Translated voice status could not be saved: ${readyError.message}`);
          }
          console.info("[Video Classroom Voice] database status update completed");

          const readyTranslation = await readReadyTranslation(translation.id);
          console.info("[Video Classroom Voice] READY");
          return readyTranslation;
        } catch (error) {
          console.error(`[Video Classroom Voice] FAILED: ${safeErrorDetailsForLog(error)}`);

          const { error: failureUpdateError } = await db
            .from("ai_video_classroom_translations")
            .update({
              status: "failed",
              error_message: error instanceof Error ? error.message : "Voice preparation failed.",
              updated_at: new Date().toISOString(),
            })
            .eq("id", translation.id);

          if (failureUpdateError) {
            console.error("[Video Classroom Voice] failed-status update failed:", safeErrorDetailsForLog(failureUpdateError));
          } else {
            console.info("[Video Classroom Voice] status: failed");
          }

          const failureMessage = error instanceof Error ? error.message : "Voice preparation failed.";
          throw new Error(
            failureUpdateError
              ? `${failureMessage}; additionally failed to save failed status: ${failureUpdateError.message}`
              : failureMessage,
          );
        }
      })();

      voicePreparationLocks.set(singleFlightKey, translationPromise);

      try {
        return await translationPromise;
      } finally {
        voicePreparationLocks.delete(singleFlightKey);
      }
    });

export const saveVideoClassroomProgress =
  createServerFn({ method: "POST" })
    .validator((input: unknown) =>
      progressSchema.parse(input),
    )
    .handler(async ({ data }) => {
      const user = await getUser(
        data.accessToken,
      );

      const {
        data: progress,
        error,
      } = await db
        .from(
          "ai_video_classroom_progress",
        )
        .upsert(
          {
            classroom_id:
              data.classroomId,
            student_id: user.id,
            current_checkpoint_id:
              data.checkpointId,
            last_position_seconds:
              data.lastPositionSeconds,
            completed:
              data.completed ??
              false,
            time_spent_seconds:
              data.timeSpentSeconds ??
              0,
          },
          {
            onConflict:
              "classroom_id,student_id",
          },
        )
        .select("*")
        .single();

      if (error || !progress) {
        throw new Error(
          "Could not save your classroom progress.",
        );
      }

      return progress;
    });

export const evaluateVideoClassroomAnswer =
  createServerFn({ method: "POST" })
    .validator((input: unknown) =>
      evaluateSchema.parse(input),
    )
    .handler(async ({ data }) => {
      const user = await getUser(
        data.accessToken,
      );

      const {
        data: member,
      } = await db
        .from(
          "ai_video_classroom_members",
        )
        .select("*")
        .eq(
          "classroom_id",
          data.classroomId,
        )
        .eq(
          "student_id",
          user.id,
        )
        .maybeSingle();

      if (!member) {
        throw new Error(
          "Join this classroom before answering checkpoints.",
        );
      }

      const [
        { data: classroom },
        { data: checkpoint },
      ] = await Promise.all([
        db
          .from(
            "ai_video_classrooms",
          )
          .select(
            "title, class_level, subject, topic, learning_objectives",
          )
          .eq(
            "id",
            data.classroomId,
          )
          .single(),

        db
          .from(
            "ai_video_classroom_checkpoints",
          )
          .select(
            "question, expected_answer, remediation",
          )
          .eq(
            "id",
            data.checkpointId,
          )
          .eq(
            "classroom_id",
            data.classroomId,
          )
          .single(),
      ]);

      if (
        !classroom ||
        !checkpoint
      ) {
        throw new Error(
          "Checkpoint data is unavailable.",
        );
      }

      const {
        data: profile,
      } = await supabaseAdmin
        .from("profiles")
        .select(
          "name, language, learning_style, goals",
        )
        .eq("id", user.id)
        .maybeSingle();

      const apiKey =
        getGeminiApiKey();

      if (!apiKey) {
        throw new Error(
          "Gemini is not configured on the server.",
        );
      }

      const client =
        new GoogleGenAI({
          apiKey,
        });

      const response =
        await client.models.generateContent(
          {
            model:
              "gemini-3.6-flash",

            contents: [
              {
                role: "user",

                parts: [
                  {
                    text: `Evaluate the student's answer to a lesson checkpoint. Return JSON only with result (correct, partial, incorrect), feedback, missingConcept (string or null), and nextAction (continue, remediate, escalate). Do not expose hidden reasoning. Classroom: ${classroom.title}; grade: ${classroom.class_level}; subject: ${classroom.subject}; topic: ${classroom.topic}; student language: ${data.language}; learning style: ${profile?.learning_style ?? "not specified"}; question: ${checkpoint.question}; expected answer: ${checkpoint.expected_answer}; remediation: ${checkpoint.remediation}; student answer: ${data.answer}`,
                  },
                ],
              },
            ],

            config: {
              responseMimeType:
                "application/json",
            },
          },
        );

      const evaluation =
        evaluationSchema.parse(
          parseJsonResponse(
            response.text ?? "",
          ),
        );

      const {
        data: attempt,
        error: attemptError,
      } = await db
        .from(
          "ai_video_classroom_attempts",
        )
        .insert({
          classroom_id:
            data.classroomId,
          checkpoint_id:
            data.checkpointId,
          student_id: user.id,
          answer: data.answer,
          result:
            evaluation.result,
          feedback:
            evaluation.feedback,
          missing_concept:
            evaluation.missingConcept,
          next_action:
            evaluation.nextAction,
        })
        .select("*")
        .single();

      if (
        attemptError ||
        !attempt
      ) {
        throw new Error(
          "The answer was evaluated but could not be saved.",
        );
      }

      return attempt;
    });
