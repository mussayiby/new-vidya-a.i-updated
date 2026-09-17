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
  VideoClassroomTopic,
} from "@/lib/video-classroom.types";

const db = supabaseAdmin as unknown as SupabaseClient<VideoClassroomDatabase>;
const STORAGE_BUCKET = "ai-video-classrooms";

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
  videoMimeType: z.enum(["video/mp4", "video/webm", "video/quicktime"]),
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

const evaluationSchema = z.object({
  result: z.enum(["correct", "partial", "incorrect"]),
  feedback: z.string().trim().min(1).max(1200),
  missingConcept: z.string().trim().max(300).nullable(),
  nextAction: z.enum(["continue", "remediate", "escalate"]),
});

function getGeminiApiKey(): string | undefined {
  return process.env["GEMINI_API_KEY"]?.trim() || process.env["AI_API_KEY"]?.trim();
}

async function getUser(accessToken: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("Authentication required. Please sign in again.");
  return data.user;
}

function makeClassroomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `VIDYA-${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")}`;
}

async function uniqueClassroomCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = makeClassroomCode();
    const { data, error } = await db
      .from("ai_video_classrooms")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (error) throw new Error("Could not verify classroom code availability.");
    if (!data) return code;
  }
  throw new Error("Could not generate a unique classroom code. Please try again.");
}

function parseJsonResponse(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

function describeProcessingError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown processing error";
  const details =
    error && typeof error === "object" ? (error as { status?: unknown; statusCode?: unknown }) : {};
  const status =
    typeof details.status === "number"
      ? details.status
      : typeof details.statusCode === "number"
        ? details.statusCode
        : null;
  const lowerMessage = message.toLowerCase();

  if (status === 429 || lowerMessage.includes("quota") || lowerMessage.includes("rate limit")) {
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
    return "Gemini is temporarily unavailable. Please retry the analysis.";
  }
  if (lowerMessage.includes("could not save the analyzed lesson topics")) {
    return "Gemini returned a lesson map, but topics could not be saved to Supabase.";
  }
  if (lowerMessage.includes("could not save the analyzed lesson checkpoints")) {
    return "Topics were generated, but checkpoints could not be saved to Supabase.";
  }
  if (lowerMessage.includes("json") || lowerMessage.includes("lesson map")) {
    return "Gemini returned lesson data that did not match the required lesson-map structure.";
  }
  return "The lesson could not be analyzed. Please retry the analysis.";
}

const topicSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  startTime: z.number().finite().min(0),
  endTime: z.number().finite().min(0),
  concepts: z.array(z.string().trim().min(1)).max(30),
  definitions: z.array(z.string().trim().min(1)).max(30),
  examples: z.array(z.string().trim().min(1)).max(30),
  misconceptions: z.array(z.string().trim().min(1)).max(30),
  checkpoint: z.object({
    question: z.string().trim().min(1),
    expectedAnswer: z.string().trim().min(1),
    remediation: z.string().trim().min(1),
    miniQuizQuestion: z.string().trim().optional(),
  }),
});

const knowledgeMapSchema = z.object({
  lessonTitle: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  keyLearningPoints: z.array(z.string().trim().min(1)).max(40),
  topics: z.array(topicSchema).min(1).max(40),
});

export const createVideoClassroom = createServerFn({ method: "POST" })
  .validator((input: unknown) => createClassroomSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await getUser(data.accessToken);
    const code = await uniqueClassroomCode();
    const { data: classroom, error } = await db
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
        learning_objectives: data.learningObjectives,
        teaching_instructions: data.teachingInstructions || null,
        status: "draft",
        published: false,
      })
      .select("*")
      .single();
    if (error || !classroom) throw new Error("Could not create the AI classroom.");
    return classroom;
  });

export const attachVideoToClassroom = createServerFn({ method: "POST" })
  .validator((input: unknown) => videoSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await getUser(data.accessToken);
    const { data: classroom, error } = await db
      .from("ai_video_classrooms")
      .update({
        video_path: data.videoPath,
        video_name: data.videoName,
        video_mime_type: data.videoMimeType,
        video_size: data.videoSize,
        status: "uploading",
        status_message: "Video uploaded. Ready for lesson analysis.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.classroomId)
      .eq("teacher_id", user.id)
      .select("*")
      .single();
    if (error || !classroom) throw new Error("Could not attach the uploaded lesson video.");
    return classroom;
  });

export const processVideoClassroom = createServerFn({ method: "POST" })
  .validator((input: unknown) => classroomIdSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await getUser(data.accessToken);
    const { data: classroom, error: classroomError } = await db
      .from("ai_video_classrooms")
      .select("*")
      .eq("id", data.classroomId)
      .eq("teacher_id", user.id)
      .single();
    if (classroomError || !classroom?.video_path || !classroom.video_mime_type) {
      throw new Error("Upload a valid classroom video before starting analysis.");
    }

    await db
      .from("ai_video_classrooms")
      .update({
        status: "analyzing",
        status_message: "Analyzing the lesson with Gemini.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", classroom.id);

    try {
      const apiKey = getGeminiApiKey();
      if (!apiKey) throw new Error("Gemini is not configured on the server.");
      const { data: videoBlob, error: downloadError } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .download(classroom.video_path);
      if (downloadError || !videoBlob)
        throw new Error("The uploaded lesson video could not be read.");

      const client = new GoogleGenAI({ apiKey });
      const uploaded = await client.files.upload({
        file: videoBlob,
        config: {
          mimeType: classroom.video_mime_type,
          displayName: classroom.video_name ?? classroom.title,
        },
      });
      if (!uploaded.uri || !uploaded.mimeType)
        throw new Error("Gemini did not accept the lesson video.");

      const response = await client.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [
          {
            role: "user",
            parts: [
              { fileData: { fileUri: uploaded.uri, mimeType: uploaded.mimeType } },
              {
                text: `Analyze this complete teaching lesson and return JSON only. Create an adaptive classroom knowledge map for ${classroom.class_level} ${classroom.subject} about ${classroom.topic}. Original teaching language: ${classroom.teacher_language}. Difficulty: ${classroom.difficulty}. Learning objectives: ${classroom.learning_objectives}. Additional instructions: ${classroom.teaching_instructions ?? "None"}. Use timestamps from the actual video. Include meaningful topics and one checkpoint per topic. JSON shape: {lessonTitle, summary, keyLearningPoints: string[], topics: [{title, summary, startTime, endTime, concepts: string[], definitions: string[], examples: string[], misconceptions: string[], checkpoint: {question, expectedAnswer, remediation, miniQuizQuestion}}]}.`,
              },
            ],
          },
        ],
        config: { responseMimeType: "application/json" },
      });

      const parsedKnowledgeMap = knowledgeMapSchema.parse(parseJsonResponse(response.text ?? ""));
      const knowledgeMap: VideoClassroomKnowledgeMap = {
        ...parsedKnowledgeMap,
        topics: parsedKnowledgeMap.topics.map((topic) => ({
          ...topic,
          checkpoint: {
            ...topic.checkpoint,
            miniQuizQuestion: topic.checkpoint.miniQuizQuestion,
          },
        })),
      };
      const { error: deleteTopicsError } = await db
        .from("ai_video_classroom_topics")
        .delete()
        .eq("classroom_id", classroom.id);
      if (deleteTopicsError) throw new Error("Could not replace the classroom lesson map.");

      for (const [index, topic] of knowledgeMap.topics.entries()) {
        const { data: topicRow, error: topicError } = await db
          .from("ai_video_classroom_topics")
          .insert({
            classroom_id: classroom.id,
            topic_index: index,
            title: topic.title,
            summary: topic.summary,
            start_time: topic.startTime,
            end_time: topic.endTime,
            concepts: topic.concepts,
            definitions: topic.definitions,
            examples: topic.examples,
            misconceptions: topic.misconceptions,
          })
          .select("*")
          .single();
        if (topicError || !topicRow) throw new Error("Could not save the analyzed lesson topics.");
        const { error: checkpointError } = await db.from("ai_video_classroom_checkpoints").insert({
          classroom_id: classroom.id,
          topic_id: topicRow.id,
          checkpoint_index: index,
          timestamp_seconds: topic.checkpoint ? topic.startTime : topic.startTime,
          question: topic.checkpoint.question,
          expected_answer: topic.checkpoint.expectedAnswer,
          remediation: topic.checkpoint.remediation,
          mini_quiz_question: topic.checkpoint.miniQuizQuestion ?? null,
        });
        if (checkpointError) throw new Error("Could not save the analyzed lesson checkpoints.");
      }

      const { data: updated, error: updateError } = await db
        .from("ai_video_classrooms")
        .update({
          knowledge_map: knowledgeMap,
          status: "ready",
          status_message: "Lesson analysis is ready for teacher review.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", classroom.id)
        .select("*")
        .single();
      if (updateError || !updated) throw new Error("Could not mark the classroom ready.");
      return updated;
    } catch (error) {
      const statusMessage = describeProcessingError(error);
      await db
        .from("ai_video_classrooms")
        .update({
          status: "failed",
          status_message: statusMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", classroom.id);
      throw new Error(statusMessage);
    }
  });

export const publishVideoClassroom = createServerFn({ method: "POST" })
  .validator((input: unknown) => classroomIdSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await getUser(data.accessToken);
    const { data: classroom, error } = await db
      .from("ai_video_classrooms")
      .update({ published: true, updated_at: new Date().toISOString() })
      .eq("id", data.classroomId)
      .eq("teacher_id", user.id)
      .eq("status", "ready")
      .select("*")
      .single();
    if (error || !classroom) throw new Error("Only a ready classroom can be published.");
    return classroom;
  });

export const listMyVideoClassrooms = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ accessToken: accessTokenSchema }).parse(input))
  .handler(async ({ data }) => {
    const user = await getUser(data.accessToken);
    const { data: classrooms, error } = await db
      .from("ai_video_classrooms")
      .select("*")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Could not load your AI classrooms.");
    return classrooms ?? [];
  });

export const joinVideoClassroom = createServerFn({ method: "POST" })
  .validator((input: unknown) => joinSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await getUser(data.accessToken);
    const { data: classroom, error: classroomError } = await db
      .from("ai_video_classrooms")
      .select("*")
      .eq("code", data.code)
      .eq("published", true)
      .eq("status", "ready")
      .maybeSingle();
    if (classroomError || !classroom)
      throw new Error("That classroom code is invalid or the classroom is not published.");
    const { error: memberError } = await db.from("ai_video_classroom_members").upsert(
      {
        classroom_id: classroom.id,
        student_id: user.id,
        language: data.language,
        learning_style: data.learningStyle ?? null,
        learning_preference: data.learningPreference ?? null,
      },
      { onConflict: "classroom_id,student_id" },
    );
    if (memberError) throw new Error("Could not join the classroom.");
    await db.from("ai_video_classroom_progress").upsert(
      {
        classroom_id: classroom.id,
        student_id: user.id,
        last_position_seconds: 0,
        completed: false,
        time_spent_seconds: 0,
      },
      { onConflict: "classroom_id,student_id" },
    );
    return classroom;
  });

export const getVideoClassroom = createServerFn({ method: "POST" })
  .validator((input: unknown) => classroomIdSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await getUser(data.accessToken);
    const { data: classroom, error: classroomError } = await db
      .from("ai_video_classrooms")
      .select("*")
      .eq("id", data.classroomId)
      .maybeSingle();
    if (classroomError || !classroom) throw new Error("AI classroom not found.");
    const isTeacher = classroom.teacher_id === user.id;
    if (!isTeacher) {
      const { data: member } = await db
        .from("ai_video_classroom_members")
        .select("*")
        .eq("classroom_id", classroom.id)
        .eq("student_id", user.id)
        .maybeSingle();
      if (!member || !classroom.published)
        throw new Error("You are not a member of this classroom.");
    }
    const [{ data: topics }, { data: checkpoints }, { data: progress }, { data: signed }] =
      await Promise.all([
        db
          .from("ai_video_classroom_topics")
          .select("*")
          .eq("classroom_id", classroom.id)
          .order("topic_index"),
        db
          .from("ai_video_classroom_checkpoints")
          .select("*")
          .eq("classroom_id", classroom.id)
          .order("checkpoint_index"),
        db
          .from("ai_video_classroom_progress")
          .select("*")
          .eq("classroom_id", classroom.id)
          .eq("student_id", user.id)
          .maybeSingle(),
        classroom.video_path
          ? supabaseAdmin.storage.from(STORAGE_BUCKET).createSignedUrl(classroom.video_path, 3600)
          : Promise.resolve({ data: null }),
      ]);
    return {
      classroom: classroom as VideoClassroom,
      topics: (topics ?? []) as VideoClassroomTopic[],
      checkpoints: (checkpoints ?? []) as VideoClassroomCheckpoint[],
      progress: progress ?? null,
      videoUrl: signed?.signedUrl ?? null,
    };
  });

export const saveVideoClassroomProgress = createServerFn({ method: "POST" })
  .validator((input: unknown) => progressSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await getUser(data.accessToken);
    const { data: progress, error } = await db
      .from("ai_video_classroom_progress")
      .upsert(
        {
          classroom_id: data.classroomId,
          student_id: user.id,
          current_checkpoint_id: data.checkpointId,
          last_position_seconds: data.lastPositionSeconds,
          completed: data.completed ?? false,
          time_spent_seconds: data.timeSpentSeconds ?? 0,
        },
        { onConflict: "classroom_id,student_id" },
      )
      .select("*")
      .single();
    if (error || !progress) throw new Error("Could not save your classroom progress.");
    return progress;
  });

export const evaluateVideoClassroomAnswer = createServerFn({ method: "POST" })
  .validator((input: unknown) => evaluateSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await getUser(data.accessToken);
    const { data: member } = await db
      .from("ai_video_classroom_members")
      .select("*")
      .eq("classroom_id", data.classroomId)
      .eq("student_id", user.id)
      .maybeSingle();
    if (!member) throw new Error("Join this classroom before answering checkpoints.");
    const [{ data: classroom }, { data: checkpoint }] = await Promise.all([
      db
        .from("ai_video_classrooms")
        .select("title, class_level, subject, topic, learning_objectives")
        .eq("id", data.classroomId)
        .single(),
      db
        .from("ai_video_classroom_checkpoints")
        .select("question, expected_answer, remediation")
        .eq("id", data.checkpointId)
        .eq("classroom_id", data.classroomId)
        .single(),
    ]);
    if (!classroom || !checkpoint) throw new Error("Checkpoint data is unavailable.");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, language, learning_style, goals")
      .eq("id", user.id)
      .maybeSingle();
    const apiKey = getGeminiApiKey();
    if (!apiKey) throw new Error("Gemini is not configured on the server.");
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: "gemini-3.6-flash",
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
      config: { responseMimeType: "application/json" },
    });
    const evaluation = evaluationSchema.parse(parseJsonResponse(response.text ?? ""));
    const { data: attempt, error: attemptError } = await db
      .from("ai_video_classroom_attempts")
      .insert({
        classroom_id: data.classroomId,
        checkpoint_id: data.checkpointId,
        student_id: user.id,
        answer: data.answer,
        result: evaluation.result,
        feedback: evaluation.feedback,
        missing_concept: evaluation.missingConcept,
        next_action: evaluation.nextAction,
      })
      .select("*")
      .single();
    if (attemptError || !attempt)
      throw new Error("The answer was evaluated but could not be saved.");
    return attempt;
  });
