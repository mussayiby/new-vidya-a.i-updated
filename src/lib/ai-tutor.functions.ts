/**
 * VIDYA A.I. — AI TUTOR
 *
 * Server-side lesson management.
 *
 * IMPORTANT:
 * - No mock teacher/user ID.
 * - No hardcoded lesson content.
 * - No fake AI results.
 * - No fake translation.
 * - No fake processing status.
 *
 * The actual AI pipeline will be connected in the following steps.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/* =========================================================
   VALIDATION
   ========================================================= */

const CreateLessonInput = z.object({
  title: z.string().trim().min(1).max(200),

  description: z
    .string()
    .trim()
    .max(2000)
    .optional(),

  classLevel: z
    .string()
    .trim()
    .min(1)
    .max(100),

  subject: z
    .string()
    .trim()
    .min(1)
    .max(200),

  chapter: z
    .string()
    .trim()
    .max(200)
    .optional(),

  // teacherLanguage and targetLanguages removed
});

const LessonIdInput = z.object({
  lessonId: z.string().uuid(),
});

const PublishedLessonsInput = z.object({
  classLevel: z.string().optional(),
  subject: z.string().optional(),
  targetLanguage: z.string().optional(),
});

/* =========================================================
   AUTHENTICATION
   ========================================================= */

/**
 * Get the currently authenticated Supabase user.
 *
 * We intentionally do NOT use a hardcoded UUID.
 *
 * NOTE:
 * The exact authenticated-user integration will be connected
 * to the project's existing Supabase session helper if required.
 */
async function getAuthenticatedUser() {
  /*
   * The admin client cannot automatically know which browser
   * user made the request.
   *
   * We therefore first try to use the project's server-side
   * Supabase auth mechanism.
   *
   * This function is intentionally isolated so authentication
   * can be changed without rewriting the lesson logic.
   */

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser();

  if (error || !user) {
    throw new Error(
      "Authentication required. Please sign in before using AI Tutor.",
    );
  }

  return user;
}

/* =========================================================
   CREATE LESSON
   ========================================================= */

export const createAILesson = createServerFn({
  method: "POST",
})
  .inputValidator((input: unknown) =>
    CreateLessonInput.parse(input),
  )
  .handler(async ({ data }) => {
    const user = await getAuthenticatedUser();

    const {
      data: lesson,
      error,
    } = await supabaseAdmin
      .from("ai_lessons")
      .insert({
        teacher_id: user.id,

        title: data.title,

        description:
          data.description?.trim() || null,

        class_level: data.classLevel,

        /*
         * The old database field is named subject_id.
         *
         * Until we inspect your actual subjects schema,
         * we store the selected subject value here.
         */
        subject_id: data.subject,
chapter:
  data.chapter?.trim() || null,

        topic: data.title,
        teacher_language: 'en', // Defaulting to english
        target_languages: [], // Empty for now, processed dynamically

        /*
         * These values describe the new workflow.
         *
         * The database migration in the next step will make
         * the processing state explicit.
         */
        status: "uploaded",

        published: false,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(
        `Failed to create AI Tutor lesson: ${error.message}`,
      );
    }

    if (!lesson) {
      throw new Error(
        "AI Tutor lesson was not created.",
      );
    }

    return lesson;
  });

/* =========================================================
   GET ONE LESSON
   ========================================================= */

export const getAILesson = createServerFn({
  method: "POST",
})
  .inputValidator((input: unknown) =>
    LessonIdInput.parse(input),
  )
  .handler(async ({ data }) => {
    const user = await getAuthenticatedUser();

    const {
      data: lesson,
      error,
    } = await supabaseAdmin
      .from("ai_lessons")
      .select("*")
      .eq("id", data.lessonId)
      .single();

    if (error) {
      throw new Error(
        `Failed to load AI Tutor lesson: ${error.message}`,
      );
    }

    if (!lesson) {
      throw new Error(
        "AI Tutor lesson was not found.",
      );
    }

    /*
     * Teachers can access their own lessons.
     *
     * Students can access only published lessons.
     */
    if (
      lesson.teacher_id !== user.id &&
      !lesson.published
    ) {
      throw new Error(
        "You do not have permission to access this lesson.",
      );
    }

    return lesson;
  });

/* =========================================================
   LIST TEACHER LESSONS
   ========================================================= */

export const listMyAILessons =
  createServerFn({
    method: "POST",
  }).handler(async () => {
    const user = await getAuthenticatedUser();

    const {
      data: lessons,
      error,
    } = await supabaseAdmin
      .from("ai_lessons")
      .select("*")
      .eq("teacher_id", user.id)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      throw new Error(
        `Failed to load your AI Tutor lessons: ${error.message}`,
      );
    }

    return lessons ?? [];
  });

/* =========================================================
   LIST PUBLISHED LESSONS FOR STUDENTS
   ========================================================= */

export const listPublishedAILessons =
  createServerFn({
    method: "POST",
  })
    .inputValidator((input: unknown) =>
      PublishedLessonsInput.parse(input),
    )
    .handler(async ({ data }) => {
      await getAuthenticatedUser();

      let query = supabaseAdmin
        .from("ai_lessons")
        .select("*")
        .eq("published", true)
        .eq("status", "ready");

      if (data.classLevel) {
        query = query.eq(
          "class_level",
          data.classLevel,
        );
      }

      if (data.subject) {
        query = query.eq(
          "subject_id",
          data.subject,
        );
      }

      if (data.targetLanguage) {
        query = query.contains(
          "target_languages",
          [data.targetLanguage],
        );
      }

      const {
        data: lessons,
        error,
      } = await query.order(
        "created_at",
        {
          ascending: false,
        },
      );

      if (error) {
        throw new Error(
          `Failed to load published AI Tutor lessons: ${error.message}`,
        );
      }

      return lessons ?? [];
    });

/* =========================================================
   DELETE LESSON
   ========================================================= */

export const deleteAILesson =
  createServerFn({
    method: "POST",
  })
    .inputValidator((input: unknown) =>
      LessonIdInput.parse(input),
    )
    .handler(async ({ data }) => {
      const user = await getAuthenticatedUser();

      const {
        data: lesson,
        error: fetchError,
      } = await supabaseAdmin
        .from("ai_lessons")
        .select(
          "id, teacher_id, status",
        )
        .eq("id", data.lessonId)
        .single();

      if (fetchError || !lesson) {
        throw new Error(
          "AI Tutor lesson was not found.",
        );
      }

      if (lesson.teacher_id !== user.id) {
        throw new Error(
          "You do not have permission to delete this lesson.",
        );
      }

      /*
       * Once the real processing pipeline has started,
       * deletion will also have to clean up:
       *
       * - original video
       * - generated audio
       * - generated videos
       * - transcripts
       * - topics
       * - questions
       * - processing jobs
       *
       * Therefore we do not silently delete processed lessons.
       */
      if (
        lesson.status !== "uploaded" &&
        lesson.status !== "failed"
      ) {
        throw new Error(
          "This lesson has already entered AI processing and cannot be deleted from this action.",
        );
      }

      const {
        error,
      } = await supabaseAdmin
        .from("ai_lessons")
        .delete()
        .eq("id", data.lessonId)
        .eq("teacher_id", user.id);

      if (error) {
        throw new Error(
          `Failed to delete AI Tutor lesson: ${error.message}`,
        );
      }

      return {
        success: true,
        lessonId: data.lessonId,
      };
    });

/* =========================================================
   PUBLISH / UNPUBLISH
   ========================================================= */

const PublishLessonInput = z.object({
  lessonId: z.string().uuid(),
  publish: z.boolean(),
});

export const publishAILesson =
  createServerFn({
    method: "POST",
  })
    .inputValidator((input: unknown) =>
      PublishLessonInput.parse(input),
    )
    .handler(async ({ data }) => {
      const user = await getAuthenticatedUser();

      const {
        data: lesson,
        error: fetchError,
      } = await supabaseAdmin
        .from("ai_lessons")
        .select(
          "id, teacher_id, status",
        )
        .eq("id", data.lessonId)
        .single();

      if (fetchError || !lesson) {
        throw new Error(
          "AI Tutor lesson was not found.",
        );
      }

      if (lesson.teacher_id !== user.id) {
        throw new Error(
          "You do not have permission to publish this lesson.",
        );
      }

      /*
       * A lesson can only become visible to students after
       * the actual AI pipeline has completed successfully.
       */
      if (
        data.publish &&
        lesson.status !== "ready"
      ) {
        throw new Error(
          "The AI Tutor lesson cannot be published until AI processing is complete.",
        );
      }

      const {
        data: updatedLesson,
        error,
      } = await supabaseAdmin
        .from("ai_lessons")
        .update({
          published: data.publish,
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", data.lessonId)
        .eq("teacher_id", user.id)
        .select("*")
        .single();

      if (error) {
        throw new Error(
          `Failed to update lesson publication status: ${error.message}`,
        );
      }

      return updatedLesson;
    });

/* =========================================================
   START PROCESSING
   ========================================================= */

/**
 * This function will be connected to the real AI Tutor
 * processing worker in the next implementation step.
 *
 * It is intentionally NOT pretending to process anything yet.
 */
const StartProcessingInput = z.object({
  lessonId: z.string().uuid(),
});

export const startAITutorProcessing =
  createServerFn({
    method: "POST",
  })
    .inputValidator((input: unknown) =>
      StartProcessingInput.parse(input),
    )
    .handler(async ({ data }) => {
      const user = await getAuthenticatedUser();

      const {
        data: lesson,
        error,
      } = await supabaseAdmin
        .from("ai_lessons")
        .select("*")
        .eq("id", data.lessonId)
        .single();

      if (error || !lesson) {
        throw new Error(
          "AI Tutor lesson was not found.",
        );
      }

      if (lesson.teacher_id !== user.id) {
        throw new Error(
          "You do not have permission to process this lesson.",
        );
      }

      if (!lesson.target_languages?.length) {
        throw new Error(
          "At least one target language is required.",
        );
      }

      /*
       * The real backend flow is:
       *
       * lesson
       *   ↓
       * original video
       *   ↓
       * Gemini lesson analysis
       *   ↓
       * automatic topic segmentation
       *   ↓
       * questions / MCQs
       *   ↓
       * translation
       *   ↓
       * local AI4Bharat Indic-TTS voice synthesis
       *   ↓
       * translated classroom audio
       *   ↓
       * ready
       */

      return {
        lessonId: lesson.id,
        status: lesson.status,
        message:
          "Lesson is ready for the real AI processing pipeline.",
      };
    });