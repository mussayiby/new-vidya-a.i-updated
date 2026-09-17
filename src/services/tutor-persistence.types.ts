export type TutorMessageRole = "user" | "assistant";

export type TutorConversation = {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
};

export type TutorMessage = {
  id: string;
  conversationId: string;
  userId: string;
  role: TutorMessageRole;
  content: string;
  createdAt: string;
};

export type TutorConversationRow = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};

export type TutorMessageRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: TutorMessageRole;
  content: string;
  created_at: string;
};

export type TutorDatabase = {
  public: {
    Tables: {
      tutor_conversations: {
        Row: TutorConversationRow;
        Insert: {
          id?: string;
          user_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tutor_messages: {
        Row: TutorMessageRow;
        Insert: {
          id?: string;
          conversation_id: string;
          user_id?: string;
          role: TutorMessageRole;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          user_id?: string;
          role?: TutorMessageRole;
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export function toTutorConversation(row: TutorConversationRow): TutorConversation {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toTutorMessage(row: TutorMessageRow): TutorMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    userId: row.user_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}
