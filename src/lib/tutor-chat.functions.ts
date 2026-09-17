import { createServerFn } from "@tanstack/react-start";
import { GoogleGenAI } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TutorDatabase } from "@/services/tutor-persistence.types";

export const TutorRequestSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  conversationId: z.string().uuid(),
  accessToken: z.string().trim().min(20).max(4_096),
  language: z.string().trim().max(20).optional(),
});

export type TutorRequest = z.infer<typeof TutorRequestSchema>;
export type TutorResponse = {
  text: string;
  messageId: string;
};

function getGeminiApiKey(): string | undefined {
  const processLike = globalThis as typeof globalThis & {
    process?: {
      env?: {
        GEMINI_API_KEY?: string;
        AI_API_KEY?: string;
      };
    };
  };

  return (
    processLike.process?.env?.GEMINI_API_KEY?.trim() || processLike.process?.env?.AI_API_KEY?.trim()
  );
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
        "AI provider configuration is required: GEMINI_API_KEY or AI_API_KEY. Add it to .env and restart the server.",
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

    const systemPrompt =
      "You are Vidya A.I., a supportive, expert tutor for a student. Adapt to the student's profile and emphasize clear understanding with age-appropriate, encouraging explanations. Keep answers concise, useful, and supportive, and avoid markdown tables.";

    const profileContext = [
      `Student name: ${resolvedName}`,
      `Class / grade: ${resolvedClass}`,
      `Preferred language: ${resolvedLanguage}`,
      `Subjects: ${resolvedSubjects.length ? resolvedSubjects.join(", ") : "Not set"}`,
      `Learning goals: ${resolvedGoals.length ? resolvedGoals.join(", ") : "Not set"}`,
      `Daily learning time: ${resolvedDailyMinutes} minutes`,
      `Difficulty: ${resolvedDifficulty}`,
      `Learning style: ${resolvedLearningStyle}`,
    ].join("\n");

    const modelContents = contextMessages.slice(-12).map((message) => ({
      role: message.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: message.content }],
    }));

    try {
      const client = new GoogleGenAI({ apiKey });
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
