export type VideoClassroomStatus = "draft" | "uploading" | "analyzing" | "ready" | "failed";
export type VideoClassroomDifficulty = "beginner" | "intermediate" | "advanced";
export type VideoClassroomResult = "correct" | "partial" | "incorrect";
export type VideoClassroomNextAction = "continue" | "remediate" | "escalate";

export type VideoClassroom = {
  id: string;
  teacher_id: string;
  code: string;
  title: string;
  class_level: string;
  subject: string;
  topic: string;
  chapter: string | null;
  teacher_language: string;
  difficulty: VideoClassroomDifficulty;
  learning_objectives: string;
  teaching_instructions: string | null;
  video_path: string | null;
  video_name: string | null;
  video_mime_type: string | null;
  video_size: number | null;
  duration_seconds: number | null;
  status: VideoClassroomStatus;
  status_message: string | null;
  published: boolean;
  knowledge_map: VideoClassroomKnowledgeMap | null;
  created_at: string;
  updated_at: string;
};

export type VideoClassroomTopic = {
  id: string;
  classroom_id: string;
  topic_index: number;
  title: string;
  summary: string;
  start_time: number;
  end_time: number;
  concepts: string[];
  definitions: string[];
  examples: string[];
  misconceptions: string[];
  created_at: string;
};

export type VideoClassroomCheckpoint = {
  id: string;
  classroom_id: string;
  topic_id: string;
  checkpoint_index: number;
  timestamp_seconds: number;
  question: string;
  expected_answer: string;
  remediation: string;
  mini_quiz_question: string | null;
  created_at: string;
};

export type VideoClassroomMember = {
  id: string;
  classroom_id: string;
  student_id: string;
  language: string;
  learning_style: string | null;
  learning_preference: string | null;
  joined_at: string;
};

export type VideoClassroomProgress = {
  id: string;
  classroom_id: string;
  student_id: string;
  current_checkpoint_id: string | null;
  last_position_seconds: number;
  completed: boolean;
  time_spent_seconds: number;
  updated_at: string;
};

export type VideoClassroomAttempt = {
  id: string;
  classroom_id: string;
  checkpoint_id: string;
  student_id: string;
  answer: string;
  result: VideoClassroomResult;
  feedback: string;
  missing_concept: string | null;
  next_action: VideoClassroomNextAction;
  created_at: string;
};

export const videoClassroomKnowledgeMapSchema = {
  lessonTitle: "string",
  summary: "string",
  keyLearningPoints: "string[]",
  topics: "array",
} as const;

export type VideoClassroomKnowledgeMap = {
  lessonTitle: string;
  summary: string;
  keyLearningPoints: string[];
  topics: Array<{
    title: string;
    summary: string;
    startTime: number;
    endTime: number;
    concepts: string[];
    definitions: string[];
    examples: string[];
    misconceptions: string[];
    checkpoint: {
      question: string;
      expectedAnswer: string;
      remediation: string;
      miniQuizQuestion: string | undefined;
    };
  }>;
};

export type VideoClassroomDatabase = {
  public: {
    Tables: {
      ai_video_classrooms: {
        Row: VideoClassroom;
        Insert: Partial<VideoClassroom> &
          Pick<
            VideoClassroom,
            | "teacher_id"
            | "code"
            | "title"
            | "class_level"
            | "subject"
            | "topic"
            | "teacher_language"
            | "difficulty"
            | "learning_objectives"
          >;
        Update: Partial<VideoClassroom>;
        Relationships: [];
      };
      ai_video_classroom_topics: {
        Row: VideoClassroomTopic;
        Insert: Omit<VideoClassroomTopic, "id" | "created_at">;
        Update: Partial<VideoClassroomTopic>;
        Relationships: [];
      };
      ai_video_classroom_checkpoints: {
        Row: VideoClassroomCheckpoint;
        Insert: Omit<VideoClassroomCheckpoint, "id" | "created_at">;
        Update: Partial<VideoClassroomCheckpoint>;
        Relationships: [];
      };
      ai_video_classroom_members: {
        Row: VideoClassroomMember;
        Insert: Omit<VideoClassroomMember, "id" | "joined_at">;
        Update: Partial<VideoClassroomMember>;
        Relationships: [];
      };
      ai_video_classroom_progress: {
        Row: VideoClassroomProgress;
        Insert: Omit<
          VideoClassroomProgress,
          "id" | "updated_at" | "current_checkpoint_id" | "completed" | "time_spent_seconds"
        > & {
          current_checkpoint_id?: string | null;
          completed?: boolean;
          time_spent_seconds?: number;
        };
        Update: Partial<VideoClassroomProgress>;
        Relationships: [];
      };
      ai_video_classroom_attempts: {
        Row: VideoClassroomAttempt;
        Insert: Omit<VideoClassroomAttempt, "id" | "created_at">;
        Update: Partial<VideoClassroomAttempt>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
