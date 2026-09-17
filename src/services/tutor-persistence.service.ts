import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  toTutorConversation,
  toTutorMessage,
  type TutorConversation,
  type TutorDatabase,
  type TutorMessage,
  type TutorMessageRole,
} from "@/services/tutor-persistence.types";

const tutorClient = supabase as unknown as SupabaseClient<TutorDatabase>;

async function requireSession(): Promise<void> {
  const {
    data: { session },
    error,
  } = await tutorClient.auth.getSession();

  if (error) throw error;
  if (!session?.user) {
    throw new Error("Authentication required. Please sign in again.");
  }
}

export const tutorPersistenceService = {
  async listConversations(): Promise<TutorConversation[]> {
    await requireSession();
    const { data, error } = await tutorClient
      .from("tutor_conversations")
      .select("id, user_id, created_at, updated_at")
      .order("updated_at", { ascending: false });

    if (error) throw new Error(`Could not load tutor conversations: ${error.message}`);
    return (data ?? []).map(toTutorConversation);
  },

  async createConversation(): Promise<TutorConversation> {
    await requireSession();
    const { data, error } = await tutorClient
      .from("tutor_conversations")
      .insert({})
      .select("id, user_id, created_at, updated_at")
      .single();

    if (error || !data) {
      throw new Error(
        `Could not create tutor conversation: ${error?.message ?? "No conversation returned."}`,
      );
    }

    return toTutorConversation(data);
  },

  async listMessages(conversationId: string): Promise<TutorMessage[]> {
    await requireSession();
    const { data, error } = await tutorClient
      .from("tutor_messages")
      .select("id, conversation_id, user_id, role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(`Could not load tutor messages: ${error.message}`);
    return (data ?? []).map(toTutorMessage);
  },

  async addMessage(
    conversationId: string,
    role: TutorMessageRole,
    content: string,
  ): Promise<TutorMessage> {
    await requireSession();
    const { data, error } = await tutorClient
      .from("tutor_messages")
      .insert({ conversation_id: conversationId, role, content })
      .select("id, conversation_id, user_id, role, content, created_at")
      .single();

    if (error || !data) {
      throw new Error(`Could not save tutor message: ${error?.message ?? "No message returned."}`);
    }

    return toTutorMessage(data);
  },

  async deleteConversation(conversationId: string): Promise<void> {
    await requireSession();
    const { error } = await tutorClient
      .from("tutor_conversations")
      .delete()
      .eq("id", conversationId);

    if (error) throw new Error(`Could not delete tutor conversation: ${error.message}`);
  },
};
