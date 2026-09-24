import { supabase } from "@/integrations/supabase/client";

export type LiveClass = {
  id: string;
  code: string;
  name: string;
  subject: string;
  grade: string;
  teacher_lang: string;
  teacher_name: string | null;
  teacher_id: string | null;
  status: "scheduled" | "live" | "ended";
  is_live: boolean;
  created_at: string;
};

export type LiveMessage = {
  id: string;
  class_id: string;
  source_text: string;
  source_lang: string;
  created_at: string;
};

export type ClassroomMember = {
  id: string;
  classroom_id: string;
  user_id: string;
  role: "student" | "teacher";
  joined_at: string;
};

function generateClassCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const randomPart = Array.from({ length: 6 }, () => {
    const index = Math.floor(Math.random() * alphabet.length);
    return alphabet[index];
  }).join("");
  return `VIDYA-${randomPart}`;
}

async function generateUniqueClassCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generateClassCode();
    const { data, error } = await supabase
      .from("live_classes")
      .select("id")
      .eq("code", candidate)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw new Error(error.message);
    }

    if (!data) return candidate;
  }

  throw new Error("Failed to generate a unique classroom code.");
}

async function getAuthenticatedUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw new Error(error.message);
  if (!user) throw new Error("Please sign in to continue.");

  return user;
}

export const liveService = {
  async createClass(input: {
    name: string;
    subject: string;
    grade: string;
    teacherLang: string;
    teacherName?: string | null;
  }): Promise<LiveClass> {
    const user = await getAuthenticatedUser();
    const code = await generateUniqueClassCode();

    const { data, error } = await supabase
      .from("live_classes")
      .insert({
        code,
        name: input.name.trim(),
        subject: input.subject,
        grade: input.grade,
        teacher_lang: input.teacherLang,
        teacher_name:
  input.teacherName ??
  (typeof user.user_metadata?.["full_name"] === "string"
    ? user.user_metadata["full_name"]
    : null) ??
  user.email?.split("@")[0] ??
  "Teacher",
        teacher_id: user.id,
        status: "scheduled",
        is_live: false,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("The classroom record could not be created.");

    return data as LiveClass;
  },

  async getByCode(code: string): Promise<LiveClass | null> {
    const normalized = code.trim().toUpperCase();
    const { data, error } = await supabase
      .from("live_classes")
      .select("*")
      .eq("code", normalized)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as LiveClass | null) ?? null;
  },

  async listForTeacher(teacherId: string): Promise<LiveClass[]> {
    const { data, error } = await supabase
      .from("live_classes")
      .select("*")
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []) as LiveClass[];
  },

  async listForStudent(userId: string): Promise<LiveClass[]> {
    const { data: memberships, error: membershipError } = await supabase
      .from("classroom_members")
      .select("classroom_id")
      .eq("user_id", userId);

    if (membershipError) throw new Error(membershipError.message);
    if (!memberships || memberships.length === 0) return [];

    const classroomIds = memberships.map((row) => row.classroom_id);
    const { data, error } = await supabase
      .from("live_classes")
      .select("*")
      .in("id", classroomIds)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []) as LiveClass[];
  },

  async getMemberCount(classroomId: string): Promise<number> {
    const { count, error } = await supabase
      .from("classroom_members")
      .select("id", { count: "exact", head: true })
      .eq("classroom_id", classroomId);

    if (error) throw new Error(error.message);
    return count ?? 0;
  },

  async joinClass(code: string, userId?: string): Promise<LiveClass> {
    const user = userId ? { id: userId } : await getAuthenticatedUser();
    const classroom = await this.getByCode(code);

    if (!classroom) {
      throw new Error("Class not found. Please check your class code.");
    }

    if (classroom.status === "ended") {
      throw new Error("This class has ended and cannot be joined.");
    }

    const { data, error } = await supabase
      .from("classroom_members")
      .insert({
        classroom_id: classroom.id,
        user_id: user.id,
        role: "student",
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new Error("You have already joined this class.");
      }
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error("Your join request could not be completed.");
    }

    return classroom;
  },

  async leaveClass(classroomId: string, userId?: string): Promise<void> {
    const user = userId ? { id: userId } : await getAuthenticatedUser();
    const { error } = await supabase
      .from("classroom_members")
      .delete()
      .eq("classroom_id", classroomId)
      .eq("user_id", user.id);

    if (error) throw new Error(error.message);
  },

  async setLive(id: string, isLive: boolean) {
    const { error } = await supabase
      .from("live_classes")
      .update({
        is_live: isLive,
        status: isLive ? "live" : "ended",
      })
      .eq("id", id);

    if (error) throw new Error(error.message);
  },

  async postMessage(classId: string, text: string, lang: string) {
    const { postLiveMessage } = await import("@/lib/live-message.functions");
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.access_token) throw new Error("Authentication required to share speech.");
    await postLiveMessage({
      data: { accessToken: session.access_token, classId, sourceText: text, sourceLang: lang },
    });
  },

  async listMessages(classId: string): Promise<LiveMessage[]> {
    const { data, error } = await supabase
      .from("live_messages")
      .select("*")
      .eq("class_id", classId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as LiveMessage[];
  },

  async translateMessage(message: LiveMessage, targetLang: string): Promise<string> {
    const { translateLiveMessage } = await import("@/lib/live-message.functions");
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.access_token) throw new Error("Authentication required for translation.");
    const response = await translateLiveMessage({
      data: {
        accessToken: session.access_token,
        classId: message.class_id,
        sourceText: message.source_text,
        sourceLang: message.source_lang,
        targetLang: targetLang as "en" | "bn" | "hi" | "kn" | "ml" | "mr" | "ta" | "te" | "ur",
      },
    });
    return response.text;
  },
};
