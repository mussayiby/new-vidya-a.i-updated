import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/ai-tutor-create")({
  component: CreateAITutorLesson,
});

const TEACHER_LANGUAGES = [
  { code: "en-IN", label: "English" },
  { code: "hi-IN", label: "Hindi" },
  { code: "kn-IN", label: "Kannada" },
  { code: "te-IN", label: "Telugu" },
  { code: "ta-IN", label: "Tamil" },
  { code: "ml-IN", label: "Malayalam" },
  { code: "mr-IN", label: "Marathi" },
  { code: "bn-IN", label: "Bengali" },
  { code: "gu-IN", label: "Gujarati" },
  { code: "pa-IN", label: "Punjabi" },
  { code: "od-IN", label: "Odia" },
];

const CLASSES = [
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
  "Class 7",
  "Class 8",
  "Class 9",
  "Class 10",
  "Class 11",
  "Class 12",
];

const SUBJECTS = [
  "Mathematics",
  "Science",
  "Physics",
  "Chemistry",
  "Biology",
  "English",
  "Social Science",
  "Computer Science",
];

const STORAGE_BUCKET = "ai-tutor-lessons";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const ALLOWED_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/aac",
];

function CreateAITutorLesson() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classLevel, setClassLevel] = useState("");
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [topic, setTopic] = useState("");
  const [teacherLanguage, setTeacherLanguage] = useState("en-IN");

  const [mediaFile, setMediaFile] = useState<File | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  function handleMediaChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      setMediaFile(null);
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(
        "Unsupported file type. Please upload MP4, WebM, MOV, MP3, WAV, OGG, AAC, or WebM audio.",
      );
      setMediaFile(null);
      event.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError(
        "File is too large. Your current Supabase storage bucket allows files up to 50 MB.",
      );
      setMediaFile(null);
      event.target.value = "";
      return;
    }

    setError("");
    setSuccess("");
    setMediaFile(file);
  }

  function removeMedia() {
    setMediaFile(null);
    setError("");
    setSuccess("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");
    setUploadProgress("");

    if (!title.trim()) {
      setError("Please enter the lesson title.");
      return;
    }

    if (!classLevel) {
      setError("Please select the class.");
      return;
    }

    if (!subject) {
      setError("Please select the subject.");
      return;
    }

    if (!topic.trim()) {
      setError("Please enter the main topic.");
      return;
    }

    if (!teacherLanguage) {
      setError("Please select the teacher's language.");
      return;
    }

    if (!mediaFile) {
      setError(
        "Please upload the teacher's recorded video or audio lesson.",
      );
      return;
    }

    setIsSubmitting(true);

    let storagePath: string | null = null;

    try {
      // ---------------------------------------------------------
      // 1. CHECK AUTHENTICATION
      // ---------------------------------------------------------

      setUploadProgress("Checking your account...");

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw new Error(authError.message);
      }

      if (!user) {
        throw new Error(
          "You must be logged in to create an AI Tutor lesson.",
        );
      }

      // ---------------------------------------------------------
      // 2. CREATE UNIQUE STORAGE PATH
      // ---------------------------------------------------------

      setUploadProgress("Preparing your lesson...");

      const safeFileName =
        mediaFile.name
          .replace(/[^a-zA-Z0-9._-]/g, "-")
          .replace(/-+/g, "-")
          .toLowerCase();

      const uniqueId = crypto.randomUUID();

      storagePath = `${user.id}/${uniqueId}-${safeFileName}`;

      // ---------------------------------------------------------
      // 3. UPLOAD ORIGINAL MEDIA
      // ---------------------------------------------------------

      setUploadProgress("Uploading teacher recording...");

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, mediaFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: mediaFile.type,
        });

      if (uploadError) {
        throw new Error(
          `Media upload failed: ${uploadError.message}`,
        );
      }

      // ---------------------------------------------------------
      // 4. CREATE DATABASE RECORD
      // ---------------------------------------------------------

      setUploadProgress("Saving lesson information...");

      const lessonPayload = {
        teacher_id: user.id,
        title: title.trim(),
        description: description.trim() || null,

        class_level: classLevel,

        // IMPORTANT:
        // Your database column is subject_id.
        subject_id: subject,

        chapter: chapter.trim() || null,

        topic: topic.trim(),

        teacher_language: teacherLanguage,

        // Student languages are selected dynamically by students
        target_languages: [],

        // Original uploaded media.
        storage_path: storagePath,
        original_media_name: mediaFile.name,
        original_media_type: mediaFile.type,
        original_media_size: mediaFile.size,

        // Database column is status, NOT processing_status.
        status: "uploaded",

        published: false,
      };

      const {
        data: lesson,
        error: lessonError,
      } = await supabase
        .from("ai_lessons")
        .insert(lessonPayload as never)
        .select("*")
        .single();

      if (lessonError) {
        // Remove uploaded file if DB insert fails.
        if (storagePath) {
          await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([storagePath]);
        }

        throw new Error(
          `Lesson record could not be created: ${lessonError.message}`,
        );
      }

      if (!lesson) {
        if (storagePath) {
          await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([storagePath]);
        }

        throw new Error(
          "The lesson record could not be created.",
        );
      }

      // ---------------------------------------------------------
      // 5. SUCCESS
      // ---------------------------------------------------------

      console.log("AI Tutor lesson created:", lesson);

      setUploadProgress("");

      setSuccess(
        "Lesson uploaded successfully. AI processing can now begin.",
      );

      setTimeout(() => {
        navigate({
          to: "/app/ai-tutor-library",
        });
      }, 1200);
    } catch (submissionError) {
      console.error(
        "AI Tutor lesson creation error:",
        submissionError,
      );

      // Cleanup uploaded media if something failed.
      if (storagePath) {
        try {
          await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([storagePath]);
        } catch (cleanupError) {
          console.error(
            "Failed to clean up uploaded media:",
            cleanupError,
          );
        }
      }

      setUploadProgress("");

      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Failed to upload the lesson.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const isVideo = mediaFile?.type.startsWith("video/");
  const isAudio = mediaFile?.type.startsWith("audio/");

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">

        {/* Header */}
        <div className="mb-8">
          <button
            type="button"
            onClick={() => window.history.back()}
            disabled={isSubmitting}
            className="mb-5 flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
          >
            ← Back
          </button>

          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            Create AI Tutor Lesson
          </h1>

          <p className="mt-2 max-w-3xl text-slate-600">
            Upload the teacher's original recorded explanation.
            Vidya A.I. will process the actual lesson and create
            an interactive AI-powered learning experience for
            each student.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          {/* Lesson Information */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-950">
              Lesson Information
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Provide the basic information about the lesson.
            </p>

            <div className="mt-6 space-y-5">

              {/* Title */}
              <div>
                <label
                  htmlFor="lesson-title"
                  className="mb-2 block text-sm font-medium text-slate-800"
                >
                  Lesson Title *
                </label>

                <input
                  id="lesson-title"
                  type="text"
                  value={title}
                  onChange={(event) =>
                    setTitle(event.target.value)
                  }
                  placeholder="e.g. Introduction to Linear Equations"
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-muted"
                />
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="lesson-description"
                  className="mb-2 block text-sm font-medium text-slate-800"
                >
                  Description
                </label>

                <textarea
                  id="lesson-description"
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value)
                  }
                  rows={4}
                  placeholder="Brief description of the lesson"
                  disabled={isSubmitting}
                  className="w-full resize-y rounded-xl border border-input bg-background px-4 py-3 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-muted"
                />
              </div>

              {/* Class + Subject */}
              <div className="grid gap-5 md:grid-cols-2">

                <div>
                  <label
                    htmlFor="class-level"
                    className="mb-2 block text-sm font-medium text-slate-800"
                  >
                    Class *
                  </label>

                  <select
                    id="class-level"
                    value={classLevel}
                    onChange={(event) =>
                      setClassLevel(event.target.value)
                    }
                    disabled={isSubmitting}
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-muted"
                  >
                    <option value="">
                      Select class
                    </option>

                    {CLASSES.map((item) => (
                      <option
                        key={item}
                        value={item}
                      >
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="subject"
                    className="mb-2 block text-sm font-medium text-slate-800"
                  >
                    Subject *
                  </label>

                  <select
                    id="subject"
                    value={subject}
                    onChange={(event) =>
                      setSubject(event.target.value)
                    }
                    disabled={isSubmitting}
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-muted"
                  >
                    <option value="">
                      Select subject
                    </option>

                    {SUBJECTS.map((item) => (
                      <option
                        key={item}
                        value={item}
                      >
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Chapter */}
              <div>
                <label
                  htmlFor="chapter"
                  className="mb-2 block text-sm font-medium text-slate-800"
                >
                  Chapter
                </label>

                <input
                  id="chapter"
                  type="text"
                  value={chapter}
                  onChange={(event) =>
                    setChapter(event.target.value)
                  }
                  placeholder="e.g. Algebra"
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-muted"
                />
              </div>

              {/* Topic */}
              <div>
                <label
                  htmlFor="topic"
                  className="mb-2 block text-sm font-medium text-slate-800"
                >
                  Main Topic *
                </label>

                <input
                  id="topic"
                  type="text"
                  value={topic}
                  onChange={(event) =>
                    setTopic(event.target.value)
                  }
                  placeholder="e.g. Solving Linear Equations"
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-muted"
                />
              </div>
            </div>
          </section>

          {/* Teacher Language */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-950">
              Teacher Language
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Select the language actually spoken by the teacher
              in the uploaded recording.
            </p>

            <div className="mt-5">
              <label
                htmlFor="teacher-language"
                className="mb-2 block text-sm font-medium text-slate-800"
              >
                Teacher's language *
              </label>

              <select
                id="teacher-language"
                value={teacherLanguage}
                onChange={(event) =>
                  setTeacherLanguage(event.target.value)
                }
                disabled={isSubmitting}
                className="w-full rounded-xl border border-input bg-background px-4 py-3 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-muted"
              >
                {TEACHER_LANGUAGES.map((language) => (
                  <option
                    key={language.code}
                    value={language.code}
                  >
                    {language.label}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* Recorded Media */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-950">
              Teacher's Recorded Lesson
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Upload the original video or audio recording of
              the teacher explaining the lesson.
            </p>

            <label
              htmlFor="lesson-media"
              className={`mt-6 flex min-h-64 flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition ${
                isSubmitting
                  ? "cursor-not-allowed border-slate-200 bg-slate-100"
                    : "cursor-pointer border-border bg-muted/30 hover:border-primary/40 hover:bg-primary-soft"
              }`}
            >
              <div className="text-5xl">
                {isVideo
                  ? "🎥"
                  : isAudio
                    ? "🎙️"
                    : "🎬"}
              </div>

              <div className="mt-4 text-lg font-semibold text-slate-900">
                {mediaFile
                  ? mediaFile.name
                  : "Upload teacher video or audio"}
              </div>

              <div className="mt-2 text-sm text-slate-500">
                Video: MP4, WebM, MOV
              </div>

              <div className="text-sm text-slate-500">
                Audio: MP3, WAV, OGG, AAC, WebM
              </div>

              <div className="mt-2 text-xs text-slate-400">
                Maximum file size: 50 MB
              </div>

              {mediaFile && (
                <div className="mt-3 text-sm font-medium text-primary">
                  {(mediaFile.size / 1024 / 1024).toFixed(2)} MB selected
                </div>
              )}

              <input
                id="lesson-media"
                type="file"
                accept="video/*,audio/*"
                onChange={handleMediaChange}
                disabled={isSubmitting}
                className="hidden"
              />
            </label>

            {mediaFile && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-4">

                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {mediaFile.name}
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      {isVideo
                        ? "Video"
                        : isAudio
                          ? "Audio"
                          : "Media"}{" "}
                      · {mediaFile.type || "Unknown type"} ·{" "}
                      {(mediaFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={removeMedia}
                    disabled={isSubmitting}
                    className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Student Language */}
          <section className="rounded-2xl border border-primary/15 bg-primary-soft/50 p-6">
            <h2 className="text-xl font-semibold text-slate-950">
              Student Language
            </h2>

            <div className="mt-4 rounded-xl border border-primary/15 bg-card p-5">
              <div className="flex gap-3">
                <span className="text-xl">🌐</span>

                <div>
                  <p className="font-semibold text-slate-900">
                    Students choose their own mother tongue.
                  </p>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    The teacher does not select student languages
                    while creating the lesson. When a student opens
                    this lesson, the student will choose their
                    preferred mother tongue.
                  </p>

                  <div className="mt-4 rounded-lg bg-primary-soft px-4 py-3 text-sm text-primary">
                    <strong>Example:</strong> One student can choose
                    Hindi, another can choose Kannada, and another
                    can choose Telugu for the same lesson.
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* AI Behaviour */}
          <section className="rounded-2xl border border-primary/15 bg-primary-soft/50 p-6">
            <h2 className="text-xl font-semibold text-slate-950">
              AI Tutor Behaviour
            </h2>

            <div className="mt-5 space-y-4">
              {[
                [
                  "Understand the actual recording",
                  "AI processes the actual teacher recording rather than using hardcoded lesson text.",
                ],
                [
                  "Automatic topic detection",
                  "AI will identify topics actually explained by the teacher.",
                ],
                [
                  "Student-selected language",
                  "Every student can independently choose their mother tongue.",
                ],
                [
                  "Dynamic AI translation",
                  "The lesson will be dynamically translated according to the student's selected language.",
                ],
                [
                  "Natural AI female voice",
                  "The translated explanation can use a consistent natural AI female voice.",
                ],
                [
                  "Topic-based assessment",
                  "AI can generate questions and MCQs from the actual content taught.",
                ],
                [
                  "Remedial teaching",
                  "If a student struggles with a topic, AI can provide targeted additional teaching.",
                ],
              ].map(([heading, text]) => (
                <div
                  className="flex gap-3"
                  key={heading}
                >
                  <span className="mt-0.5">✓</span>

                  <div>
                    <p className="font-medium text-slate-900">
                      {heading}
                    </p>

                    <p className="text-sm text-slate-600">
                      {text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Architecture */}
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-lg font-semibold text-amber-950">
              How student language works
            </h2>

            <div className="mt-3 space-y-2 text-sm leading-6 text-amber-900">
              <p>
                <strong>Teacher:</strong> uploads one original
                lesson and selects the language spoken in that
                recording.
              </p>

              <p>
                <strong>Student:</strong> opens the lesson and
                chooses their own mother tongue.
              </p>

              <p>
                <strong>Vidya A.I.:</strong> uses the student's
                selected language for translation, explanation,
                questions, and AI narration.
              </p>

              <p>
                Therefore, the teacher does not need to upload
                separate videos for Hindi, Kannada, Telugu, etc.
              </p>
            </div>
          </section>

          {/* Upload status */}
          {uploadProgress && (
            <div className="rounded-xl border border-primary/15 bg-primary-soft px-4 py-3 text-sm font-medium text-primary">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                {uploadProgress}
              </div>
            </div>
          )}

          {/* Success */}
          {success && (
            <div
              role="status"
              className="rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm font-medium text-success"
            >
              ✓ {success}
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">

            <button
              type="button"
              onClick={() =>
                navigate({
                  to: "/app/ai-tutor-library",
                })
              }
              disabled={isSubmitting}
              className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-primary px-7 py-3 font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? "Uploading..."
                : "Upload & Process Lesson"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}