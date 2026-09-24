import { askTutor, generateTutorVisual } from "@/lib/tutor-chat.functions";
import { speakTutor } from "@/lib/tutor-chat.functions";
import type { TutorVisualResult } from "@/lib/tutor-chat.functions";
import { supabase } from "@/integrations/supabase/client";

export type AskOptions = {
  message: string;
  conversationId: string;
  subjectId?: string;
  language?: string;
  learningContext?: {
    subject?: string;
    lesson?: string;
    topic?: string;
    activity?: string;
  };
};

export const tutorService = {
  isLive: true,

  async askWithMetadata({
    message,
    conversationId,
    language,
    learningContext,
  }: AskOptions): Promise<{ text: string; messageId: string }> {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
      throw new Error("Authentication required. Please sign in again.");
    }

    const response = await askTutor({
      data: {
        message,
        conversationId,
        accessToken: session.access_token,
        language,
        learningContext,
      },
    });

    return response;
  },

  async ask(options: AskOptions): Promise<string> {
    const response = await this.askWithMetadata(options);
    return response.text;
  },

  async generateVisual({
    question,
    answer,
    language,
  }: {
    question: string;
    answer: string;
    language: string;
  }): Promise<TutorVisualResult> {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error || !session?.access_token) {
      throw new Error("Authentication required. Please sign in again.");
    }
    return generateTutorVisual({
      data: {
        question,
        answer,
        language,
        accessToken: session.access_token,
      },
    });
  },

  async speak(text: string, language: string): Promise<string> {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error || !session?.access_token) throw new Error("Authentication required. Please sign in again.");
    const response = await speakTutor({
      data: {
        text,
        language: language as "bn" | "gu" | "hi" | "kn" | "ml" | "mr" | "ta" | "te",
        accessToken: session.access_token,
      },
    });
    return `data:${response.mimeType};base64,${response.audioBase64}`;
  },
};
