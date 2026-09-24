import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createGeminiClient } from "@/lib/gemini.server";

const LiveMessageInput = z.object({
  accessToken: z.string().trim().min(20).max(4_096),
  classId: z.string().uuid(),
  sourceText: z.string().trim().min(1).max(2_000),
  sourceLang: z.string().trim().min(2).max(20),
});

const TranslateLiveMessageInput = LiveMessageInput.extend({
  targetLang: z.enum(["en", "bn", "hi", "kn", "ml", "mr", "ta", "te", "ur"]),
});

const translationCache = new Map<string, string>();

async function requireUser(accessToken: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("Authentication required. Please sign in again.");
  return data.user;
}

async function requireClassMember(classId: string, userId: string) {
  const { data: classroom, error: classroomError } = await supabaseAdmin
    .from("live_classes")
    .select("id, teacher_id, is_live, status")
    .eq("id", classId)
    .maybeSingle();
  if (classroomError || !classroom) throw new Error("Live classroom was not found.");

  const isTeacher = classroom.teacher_id === userId;
  if (!isTeacher) {
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("classroom_members")
      .select("id")
      .eq("classroom_id", classId)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError || !membership) throw new Error("You are not a member of this classroom.");
  }
  return { classroom, isTeacher };
}

export const postLiveMessage = createServerFn({ method: "POST" })
  .validator((input: unknown) => LiveMessageInput.parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser(data.accessToken);
    const { classroom, isTeacher } = await requireClassMember(data.classId, user.id);
    if (!isTeacher || !classroom.is_live || classroom.status !== "live") {
      throw new Error("Only the teacher can post messages to an active classroom.");
    }

    const { data: message, error } = await supabaseAdmin
      .from("live_messages")
      .insert({
        class_id: data.classId,
        source_text: data.sourceText,
        source_lang: data.sourceLang,
      })
      .select("id, class_id, source_text, source_lang, created_at")
      .single();
    if (error || !message) throw new Error(error?.message ?? "Could not publish the live message.");
    return message;
  });

export const translateLiveMessage = createServerFn({ method: "POST" })
  .validator((input: unknown) => TranslateLiveMessageInput.parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser(data.accessToken);
    await requireClassMember(data.classId, user.id);
    if (data.sourceLang === data.targetLang) return { text: data.sourceText };

    const cacheKey = `${data.sourceLang}:${data.targetLang}:${data.sourceText}`;
    const cached = translationCache.get(cacheKey);
    if (cached) return { text: cached };

    const response = await createGeminiClient().models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Translate ONLY this one finalized teacher utterance from ${data.sourceLang} to ${data.targetLang}.
Do not answer the teacher. Do not explain, summarize, add information, repeat previous utterances, or merge this utterance with any other text. Preserve names, numbers, technical terms, and meaning. Return ONLY the translated text.

Teacher utterance:
${data.sourceText}`,
    });
    const translated = typeof response.text === "string" ? response.text.trim() : "";
    if (!translated) throw new Error("Translation returned an empty response.");
    translationCache.set(cacheKey, translated);
    return { text: translated };
  });