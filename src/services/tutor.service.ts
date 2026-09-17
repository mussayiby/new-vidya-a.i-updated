import { askTutor } from "@/lib/tutor-chat.functions";
import { supabase } from "@/integrations/supabase/client";

export type AskOptions = {
  message: string;
  conversationId: string;
  subjectId?: string;
  language?: string;
};

export const tutorService = {
  isLive: true,

  async ask({ message, conversationId, language }: AskOptions): Promise<string> {
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
      },
    });

    return response.text;
  },
};
