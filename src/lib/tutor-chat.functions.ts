import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createGeminiClient, getGeminiApiKey } from "@/lib/gemini.server";
import type { TutorDatabase } from "@/services/tutor-persistence.types";
import { createIndicTtsProvider } from "@/lib/tts/indic-tts.provider";

export const TutorRequestSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  conversationId: z.string().uuid(),
  accessToken: z.string().trim().min(20).max(4_096),
  language: z.string().trim().max(20).optional(),
  learningContext: z
    .object({
      subject: z.string().trim().max(160).optional(),
      lesson: z.string().trim().max(200).optional(),
      topic: z.string().trim().max(200).optional(),
      activity: z.string().trim().max(80).optional(),
    })
    .optional(),
});

export type TutorRequest = z.infer<typeof TutorRequestSchema>;
export type TutorResponse = {
  text: string;
  messageId: string;
};

const TutorVisualSpecSchema = z.object({
  shouldGenerate: z.boolean(),
  purpose: z.string().trim().min(1).max(300),
  visualType: z.string().trim().min(1).max(80),
  subject: z.string().trim().min(1).max(160),
  elements: z.array(z.string().trim().min(1).max(120)).max(12),
  relationships: z.array(z.string().trim().min(1).max(200)).max(12),
  style: z.string().trim().min(1).max(160),
  audience: z.string().trim().min(1).max(120),
  labels: z.boolean(),
});

export type TutorVisualResult =
  | { status: "ready"; image: { data: string; mimeType: string }; purpose: string }
  | { status: "not-needed" }
  | { status: "unavailable"; reason: TutorVisualUnavailableReason };

type TutorVisualUnavailableReason =
  | "rate_limited"
  | "temporary_failure"
  | "invalid_response"
  | "blocked"
  | "unknown";

const tutorVisualCache = new Map<string, TutorVisualResult>();
const TUTOR_VISUAL_CACHE_LIMIT = 20;

function cacheTutorVisual(key: string, result: TutorVisualResult): TutorVisualResult {
  tutorVisualCache.delete(key);
  tutorVisualCache.set(key, result);
  while (tutorVisualCache.size > TUTOR_VISUAL_CACHE_LIMIT) {
    const oldestKey = tutorVisualCache.keys().next().value;
    if (!oldestKey) break;
    tutorVisualCache.delete(oldestKey);
  }
  return result;
}

function extractTextFromResponse(response: unknown): string {
  if (!response || typeof response !== "object") {
    return "";
  }

  const candidateText = (response as { text?: unknown }).text;

  if (typeof candidateText === "string" && candidateText.trim()) {
    return candidateText.trim();
  }

  const parts =
    (
      response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    )?.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];

  const joined = parts
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  if (joined) {
    return joined;
  }

  return "";
}

function extractJsonFromResponse(response: unknown): string {
  return extractTextFromResponse(response)
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function extractInlineImage(response: unknown): { data: string; mimeType: string } | null {
  if (!response || typeof response !== "object") return null;
  const parts = (
    response as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
      }>;
    }
  ).candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];
  const inlineData = parts.find(
    (part) => typeof part.inlineData?.data === "string" && part.inlineData.data.length > 0,
  )?.inlineData;
  if (!inlineData?.data) return null;
  return { data: inlineData.data, mimeType: inlineData.mimeType || "image/png" };
}

function visualErrorReason(error: unknown): TutorVisualUnavailableReason {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (
    [
      "429",
      "resource_exhausted",
      "rate_limit",
      "rate limit",
      "quota_exceeded",
      "quota",
      "daily limit",
    ].some((marker) => message.includes(marker))
  ) {
    return "rate_limited";
  }
  if (["safety", "blocked", "prohibited"].some((marker) => message.includes(marker))) {
    return "blocked";
  }
  if (["no image", "invalid", "malformed", "parse"].some((marker) => message.includes(marker))) {
    return "invalid_response";
  }
  if (["500", "502", "503", "504", "unavailable", "temporarily", "timeout", "timed out"].some((marker) => message.includes(marker))) {
    return "temporary_failure";
  }
  return "unknown";
}

function isRetryableVisualError(error: unknown): boolean {
  return visualErrorReason(error) === "temporary_failure";
}

async function generateTutorVisualWithRetry(
  client: ReturnType<typeof createGeminiClient>,
  prompt: string,
): Promise<{ data: string; mimeType: string }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await client.models.generateContent({
        model: "gemini-3.1-flash-image",
        contents: prompt,
        config: { responseModalities: ["TEXT", "IMAGE"] },
      });
      const image = extractInlineImage(response);
      if (!image) throw new Error("Gemini returned no image data.");
      return image;
    } catch (error) {
      if (!isRetryableVisualError(error) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw new Error("Gemini visual generation failed.");
}

function hasExplicitVisualIntent(question: string): boolean {
  return /\b(show|draw|create|generate|make|visuali[sz]e|diagram|image|picture|illustrat)\w*\b/i.test(
    question,
  );
}

function createExplicitVisualSpec(question: string, answer: string) {
  return TutorVisualSpecSchema.parse({
    shouldGenerate: true,
    purpose: "Make the tutor explanation easier to understand visually.",
    visualType: "educational_diagram",
    subject: answer.slice(0, 160),
    elements: ["the main concept", "the important parts described in the answer"],
    relationships: ["show the relationships and process described in the tutor answer"],
    style: "simple classroom educational diagram",
    audience: "school student",
    labels: answer.length < 4_000,
  });
}

export const askTutor = createServerFn({ method: "POST" })
  .validator((input: unknown) => TutorRequestSchema.parse(input))
  .handler(async ({ data }) => {
    const tutorAdmin = supabaseAdmin as unknown as SupabaseClient<TutorDatabase>;
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(data.accessToken);

    if (authError || !user) {
      throw new Error("Authentication required. Please sign in again.");
    }
    const { data: conversation, error: conversationError } = await tutorAdmin
      .from("tutor_conversations")
      .select("id, user_id")
      .eq("id", data.conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (conversationError || !conversation) {
      throw new Error("Tutor conversation was not found or is not accessible.");
    }
    const { data: storedMessages, error: messagesError } = await tutorAdmin
      .from("tutor_messages")
      .select("role, content")
      .eq("conversation_id", conversation.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (messagesError) {
      throw new Error(`Could not load tutor context: ${messagesError.message}`);
    }

    const contextMessages = [...(storedMessages ?? [])].reverse();
    const latestMessage = contextMessages.at(-1);
    if (latestMessage?.role !== "user" || latestMessage.content !== data.message) {
      throw new Error("The latest tutor message was not persisted. Please try again.");
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select(
        "name, email, class_level, language, subjects, goals, daily_minutes, difficulty, learning_style, onboarding_complete",
      )
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      throw new Error("Could not load your tutor profile. Please try again.");
    }

    if (!profile) {
      throw new Error("Your tutor profile is not available yet. Complete setup and try again.");
    }
    const apiKey = getGeminiApiKey();

    if (!apiKey) {
      throw new Error(
        "AI provider configuration is required: GEMINI_API_KEY. Add it to .env and restart the server.",
      );
    }

    const resolvedName =
      (typeof profile?.name === "string" && profile.name.trim()) ||
      (typeof user.user_metadata?.["full_name"] === "string" &&
        user.user_metadata["full_name"].trim()) ||
      user.email?.split("@")[0] ||
      "Student";
    const resolvedLanguage =
      typeof profile.language === "string" && profile.language.trim() ? profile.language : "en";
    const resolvedClass = typeof profile.class_level === "string" ? profile.class_level : "Not set";
    const resolvedSubjects = Array.isArray(profile.subjects)
      ? profile.subjects.filter(
          (subject): subject is string => typeof subject === "string" && subject.trim().length > 0,
        )
      : [];
    const resolvedGoals = Array.isArray(profile.goals)
      ? profile.goals.filter(
          (goal): goal is string => typeof goal === "string" && goal.trim().length > 0,
        )
      : [];
    const resolvedDailyMinutes =
      typeof profile.daily_minutes === "string" && profile.daily_minutes.trim()
        ? profile.daily_minutes
        : "30";
    const resolvedDifficulty =
      typeof profile.difficulty === "string" && profile.difficulty.trim()
        ? profile.difficulty
        : "intermediate";
    const resolvedLearningStyle =
      typeof profile.learning_style === "string" && profile.learning_style.trim()
        ? profile.learning_style
        : "visual";

    const context = data.learningContext ?? {};
    const systemPrompt =
      "You are Vidya A.I., the student's persistent AI Teacher and learning companion. You are not limited to one subject: answer legitimate educational questions across subjects, while using the current lesson context when relevant. Teach instead of only defining: explain simply, give a relatable example, suggest a useful visual when appropriate, and ask a short check question when the student is learning a concept. When the student answers a check or teach-back, evaluate meaning rather than exact wording, identify missing ideas, reteach those ideas, and ask again. Never claim to have evaluated an answer unless the student actually provided one. Be warm, concise, age-appropriate, and avoid markdown tables.";

    const profileContext = [
      `Student name: ${resolvedName}`,
      `Class / grade: ${resolvedClass}`,
      `Preferred language: ${resolvedLanguage}`,
      `Subjects: ${resolvedSubjects.length ? resolvedSubjects.join(", ") : "Not set"}`,
      `Learning goals: ${resolvedGoals.length ? resolvedGoals.join(", ") : "Not set"}`,
      `Daily learning time: ${resolvedDailyMinutes} minutes`,
      `Difficulty: ${resolvedDifficulty}`,
      `Learning style: ${resolvedLearningStyle}`,
      `Current subject: ${context.subject || "Not set"}`,
      `Current lesson: ${context.lesson || "Not set"}`,
      `Current topic: ${context.topic || "Not set"}`,
      `Current activity: ${context.activity || "general learning"}`,
    ].join("\n");

    const modelContents = contextMessages.slice(-12).map((message) => ({
      role: message.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: message.content }],
    }));

    try {
      const client = createGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.6-flash",
        contents: modelContents,
        config: {
          systemInstruction: `${systemPrompt}\n\n${profileContext}`,
        },
      });
      const text = extractTextFromResponse(response).trim();

      if (!text) {
        throw new Error("The AI provider returned an empty response.");
      }

      const { data: assistantMessage, error: saveError } = await tutorAdmin
        .from("tutor_messages")
        .insert({
          conversation_id: conversation.id,
          role: "assistant",
          content: text,
          user_id: user.id,
        })
        .select("id")
        .single();

      if (saveError || !assistantMessage) {
        throw new Error(
          `AI answered, but the response could not be saved: ${saveError?.message ?? "No message returned."}`,
        );
      }
      return {
        text,
        messageId: assistantMessage.id,
      } satisfies TutorResponse;
    } catch (error) {
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (
          message.includes("api key") ||
          message.includes("forbidden") ||
          message.includes("unauthorized")
        ) {
          throw new Error(
            "The AI provider rejected the request. Check the server-side Gemini API key configuration.",
          );
        }
        if (
          message.includes("quota") ||
          message.includes("rate limit") ||
          message.includes("unavailable")
        ) {
          throw new Error(
            "The AI provider is temporarily rate-limited. Please try again in a few moments.",
          );
        }
        throw new Error("AI tutor request failed. Please try again.");
      }

      throw new Error("AI tutor request failed due to an unexpected server error.");
    }
  });

export const generateTutorVisual = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        question: z.string().trim().min(1).max(2_000),
        answer: z.string().trim().min(1).max(8_000),
        language: z.string().trim().max(20).default("en"),
        accessToken: z.string().trim().min(20).max(4_096),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<TutorVisualResult> => {
    const { data: user, error } = await supabaseAdmin.auth.getUser(data.accessToken);
    if (error || !user.user) throw new Error("Authentication required. Please sign in again.");

    const cacheKey = `${data.language}:${data.question}:${data.answer}`;
    const cached = tutorVisualCache.get(cacheKey);
    if (cached) return cached;

    try {
      const client = createGeminiClient();
      let spec: z.infer<typeof TutorVisualSpecSchema>;
      if (hasExplicitVisualIntent(data.question)) {
        console.info("[Tutor Visual] explicit visual request; skipping usefulness decision");
        spec = createExplicitVisualSpec(data.question, data.answer);
      } else {
        console.info("[Tutor Visual] deciding whether a visual improves learning");
        const decisionResponse = await client.models.generateContent({
          model: "gemini-3.6-flash",
          contents: `Decide whether an educational visual would materially improve a student's understanding of this tutor exchange. Do not choose a visual for simple arithmetic, a basic fact, or a question where a diagram adds little value. Choose one for processes, structures, systems, spatial relationships, experiments, anatomy, physics mechanisms, geography, or concepts that benefit from seeing relationships.

Student question:
${data.question}

Tutor answer:
${data.answer}

Return JSON only with this exact shape:
{
  "shouldGenerate": true,
  "purpose": "specific learning purpose",
  "visualType": "educational_diagram",
  "subject": "the subject shown",
  "elements": ["important labeled elements"],
  "relationships": ["specific relationships the visual must show"],
  "style": "simple classroom educational diagram",
  "audience": "school student",
  "labels": true
}
Use the student's language (${data.language}) for labels only when reliable; otherwise set labels to false. Even when shouldGenerate is false, fill the remaining fields with concise values.`,
          config: { responseMimeType: "application/json" },
        });
        spec = TutorVisualSpecSchema.parse(JSON.parse(extractJsonFromResponse(decisionResponse)));
      }
      if (!spec.shouldGenerate) return cacheTutorVisual(cacheKey, { status: "not-needed" });

      const imagePrompt = `Create one clear educational ${spec.visualType} for a school student.
Purpose: ${spec.purpose}
Subject: ${spec.subject}
    Tutor explanation to visualize: ${data.answer}
Elements to show: ${spec.elements.join(", ")}
Relationships and directions to show: ${spec.relationships.join("; ")}
Style: ${spec.style}
Audience: ${spec.audience}
${spec.labels ? `Use accurate, legible labels in ${data.language} where reliable.` : "Prefer an uncluttered diagram without potentially incorrect text labels."}
Use a clean classroom composition, high contrast, simple shapes, and no decorative or unrelated background. The visual must teach the stated relationships and must not invent unrelated facts. Do not include a title card, watermark, or photorealistic scene.`;

      console.info("[Tutor Visual] generating educational image", { visualType: spec.visualType });
      const image = await generateTutorVisualWithRetry(client, imagePrompt);
      console.info("[Tutor Visual] image received", { mimeType: image.mimeType });
      return cacheTutorVisual(cacheKey, {
        status: "ready",
        image,
        purpose: spec.purpose,
      });
    } catch (visualError) {
      console.warn("[Tutor Visual] image generation unavailable", {
        error: visualError instanceof Error ? visualError.message : "unknown error",
      });
      return cacheTutorVisual(cacheKey, {
        status: "unavailable",
        reason: visualErrorReason(visualError),
      });
    }
  });

export const speakTutor = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({
      text: z.string().trim().min(1).max(4_000),
      language: z.enum(["bn", "gu", "hi", "kn", "ml", "mr", "ta", "te"]),
      accessToken: z.string().trim().min(20).max(4_096),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: user, error } = await supabaseAdmin.auth.getUser(data.accessToken);
    if (error || !user.user) throw new Error("Authentication required. Please sign in again.");
    const audio = await createIndicTtsProvider().synthesize({
      text: data.text,
      language: data.language,
      segmentId: `tutor-${user.user.id}-${crypto.randomUUID()}`,
    });
    return {
      mimeType: audio.mimeType,
      audioBase64: Buffer.from(audio.audio).toString("base64"),
      provider: audio.provider,
    };
  });
