import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileAudio,
  FileVideo,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/ai-tutor/$lessonId/upload")({
  head: () => ({
    meta: [
      {
        title: "Upload Lesson Media — Vidya A.I.",
      },
      {
        name: "description",
        content: "Upload audio or video for your AI lesson.",
      },
    ],
  }),
  component: UploadLessonMediaPage,
});

type MediaType = "audio" | "video";

type UploadedFile = {
  name: string;
  size: number;
  type: string;
};

function UploadLessonMediaPage() {
  const { lessonId } = Route.useParams();
  const navigate = useNavigate();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedFile, setUploadedFile] =
    useState<UploadedFile | null>(null);

  const ALLOWED_TYPES: Record<MediaType, readonly string[]> = {
    audio: [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/x-wav",
      "audio/ogg",
      "audio/webm",
      "audio/m4a",
      "audio/mp4",
    ],
    video: [
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "video/x-msvideo",
    ],
  };

  const MAX_FILE_SIZE = 500 * 1024 * 1024;

  const getMediaType = useCallback(
    (mimeType: string): MediaType | null => {
      if (ALLOWED_TYPES.audio.includes(mimeType)) {
        return "audio";
      }

      if (ALLOWED_TYPES.video.includes(mimeType)) {
        return "video";
      }

      return null;
    },
    [],
  );

  const handleFileSelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (!file) {
        return;
      }

      const mediaType = getMediaType(file.type);

      if (!mediaType) {
        toast.error(
          "Invalid file type. Please upload MP3, WAV, OGG, WebM, M4A, MP4, MOV, or AVI.",
        );

        event.target.value = "";
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        toast.error("File is too large. Maximum size is 500MB.");

        event.target.value = "";
        return;
      }

      setSelectedFile(file);
      setUploadedFile(null);
      setUploadProgress(0);
    },
    [getMediaType],
  );

  const handleUpload = async () => {
    if (!selectedFile || !lessonId || uploading) {
      return;
    }

    setUploading(true);
    setUploadProgress(5);

    let storagePath: string | null = null;

    try {
      const mediaType = getMediaType(selectedFile.type);

      if (!mediaType) {
        throw new Error("Invalid media type.");
      }

      /*
       * Make sure the lesson ID is valid before uploading.
       */
      const { data: lesson, error: lessonError } = await supabase
        .from("ai_lessons")
        .select("id")
        .eq("id", lessonId)
        .maybeSingle();

      if (lessonError) {
        throw lessonError;
      }

      if (!lesson) {
        throw new Error(
          "The lesson could not be found. Please return to the AI Tutor and try again.",
        );
      }

      setUploadProgress(10);

      /*
       * Generate a unique storage filename.
       */
      const timestamp = Date.now();
      const randomId = crypto.randomUUID();

      const safeFileName = selectedFile.name
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .replace(/-+/g, "-");

      const fileName = `${timestamp}-${randomId}-${safeFileName}`;

      storagePath = `ai-lessons/${lessonId}/${fileName}`;

      /*
       * Upload media to Supabase Storage.
       */
      const { error: uploadError } = await supabase.storage
        .from("lesson-media")
        .upload(storagePath, selectedFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: selectedFile.type,
        });

      if (uploadError) {
        throw uploadError;
      }

      setUploadProgress(75);

      /*
       * Insert the uploaded media record.
       *
       * The current generated Supabase TypeScript definitions
       * appear to be out of sync with the ai_lesson_media table.
       *
       * The database schema itself contains lesson_id, media_type,
       * storage_path, mime_type, file_size_bytes, duration_seconds,
       * and processing_status.
       *
       * The cast below keeps this frontend working until the
       * Supabase generated Database types are regenerated.
       */
      const mediaRecord = {
        lesson_id: lessonId,
        media_type: mediaType,
        storage_path: storagePath,
        mime_type: selectedFile.type,
        file_size_bytes: selectedFile.size,
        duration_seconds: null,
        processing_status: "uploaded",
      };

      const { error: dbError } = await supabase
        .from("ai_lesson_media")
        .insert(mediaRecord as never);

      if (dbError) {
        throw dbError;
      }

      setUploadProgress(100);

      setUploadedFile({
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type,
      });

      toast.success("Media uploaded successfully.");

      /*
       * Give the user a moment to see the success state.
       */
      window.setTimeout(() => {
        navigate({
          to: "/app/ai-tutor/$lessonId",
          params: {
            lessonId,
          },
        });
      }, 2000);
    } catch (error) {
      console.error("Lesson media upload error:", error);

      /*
       * If the database insert failed after the storage upload,
       * remove the orphaned storage file.
       */
      if (storagePath) {
        try {
          await supabase.storage
            .from("lesson-media")
            .remove([storagePath]);
        } catch (cleanupError) {
          console.error(
            "Failed to clean up uploaded file:",
            cleanupError,
          );
        }
      }

      const message =
        error instanceof Error
          ? error.message
          : "Upload failed. Please try again.";

      toast.error(message);
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (uploading) {
      return;
    }

    const file = event.dataTransfer.files?.[0];

    if (!file) {
      return;
    }

    const mediaType = getMediaType(file.type);

    if (!mediaType) {
      toast.error(
        "Invalid file type. Please upload MP3, WAV, OGG, WebM, M4A, MP4, MOV, or AVI.",
      );
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error("File is too large. Maximum size is 500MB.");
      return;
    }

    setSelectedFile(file);
    setUploadedFile(null);
    setUploadProgress(0);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) {
      return "0 Bytes";
    }

    const units = ["Bytes", "KB", "MB", "GB"];
    const index = Math.floor(
      Math.log(bytes) / Math.log(1024),
    );

    return (
      Math.round(
        (bytes / Math.pow(1024, index)) * 100,
      ) /
        100 +
      " " +
      units[index]
    );
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setUploadedFile(null);
    setUploadProgress(0);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <AppShell>
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate({
                to: "/app/dashboard",
              })
            }
            disabled={uploading}
          >
            <ArrowLeft className="size-4" />
          </Button>

          <div>
            <h1 className="text-2xl font-bold">
              Upload Lesson Media
            </h1>

            <p className="mt-1 text-muted-foreground">
              Upload your audio or video file. AI will
              automatically transcribe, segment, translate,
              and generate questions.
            </p>
          </div>
        </div>

        <div className="max-w-2xl space-y-6">
          {/* Upload Area */}
          <Card
            className={`cursor-pointer border-2 border-dashed p-8 transition-colors ${
              uploading
                ? "cursor-not-allowed opacity-70"
                : "hover:border-primary/50"
            }`}
            onClick={() => {
              if (!uploading) {
                fileInputRef.current?.click();
              }
            }}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*"
              onChange={handleFileSelect}
              disabled={uploading}
              className="hidden"
            />

            <div className="text-center">
              <div className="mb-4 flex justify-center">
                <Upload className="size-12 text-muted-foreground" />
              </div>

              <h3 className="mb-2 text-lg font-semibold">
                Upload Media File
              </h3>

              <p className="mb-4 text-muted-foreground">
                Drag and drop your audio or video file,
                or click to browse
              </p>

              <div className="inline-block rounded bg-muted p-3 text-sm text-muted-foreground">
                Supported formats: MP3, WAV, OGG, WebM,
                M4A, MP4, MOV, AVI
                <br />
                Maximum size: 500MB
              </div>
            </div>
          </Card>

          {/* Selected File */}
          {selectedFile && !uploadedFile && (
            <Card className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    {getMediaType(selectedFile.type) ===
                    "audio" ? (
                      <FileAudio className="size-6 text-primary" />
                    ) : (
                      <FileVideo className="size-6 text-primary" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <h4 className="break-all font-semibold">
                      {selectedFile.name}
                    </h4>

                    <p className="text-sm text-muted-foreground">
                      {formatFileSize(selectedFile.size)}
                      {" • "}
                      {getMediaType(selectedFile.type) ===
                      "audio"
                        ? "Audio"
                        : "Video"}
                    </p>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    clearSelectedFile();
                  }}
                  disabled={uploading}
                >
                  Change
                </Button>
              </div>
            </Card>
          )}

          {/* Upload Progress */}
          {uploading && (
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Uploading...
                  </span>

                  <span className="text-sm text-muted-foreground">
                    {uploadProgress}%
                  </span>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary transition-all duration-300"
                    style={{
                      width: `${uploadProgress}%`,
                    }}
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  Please keep this page open while the
                  media is uploading.
                </p>
              </div>
            </Card>
          )}

          {/* Uploaded Success */}
          {uploadedFile && (
            <Card className="border-success/20 bg-success/10 p-6">
              <div className="flex items-start gap-4">
                <CheckCircle2 className="mt-1 size-6 text-success" />

                <div>
                  <h4 className="font-semibold text-success">
                    Upload Complete!
                  </h4>

                  <p className="mt-1 text-sm text-success">
                    Your media has been uploaded and
                    processing has started. AI will
                    transcribe, segment, translate, and
                    generate questions for your lesson.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Information Notice */}
          {selectedFile && !uploading && !uploadedFile && (
            <Card className="border-primary/15 bg-primary-soft p-4">
              <div className="flex gap-3">
                <AlertCircle className="mt-0.5 size-5 shrink-0 text-primary" />

                <p className="text-sm text-primary">
                  Click the upload button below to start
                  processing. This may take several minutes
                  depending on your media length.
                </p>
              </div>
            </Card>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            {selectedFile && !uploadedFile && (
              <Button
                onClick={handleUpload}
                disabled={uploading}
                className="gap-2"
              >
                {uploading && (
                  <Loader2 className="size-4 animate-spin" />
                )}

                {uploading
                  ? "Uploading..."
                  : "Upload & Process"}
              </Button>
            )}

            <Button
              variant="outline"
              onClick={() => {
                navigate({
                  to: "/app/dashboard",
                });
              }}
              disabled={uploading}
            >
              {uploadedFile
                ? "Go to Dashboard"
                : "Cancel"}
            </Button>
          </div>

          {/* Help Section */}
          <Card className="bg-muted p-6">
            <h4 className="mb-3 font-semibold">
              What happens next?
            </h4>

            <ol className="space-y-2 text-sm">
              <li className="flex gap-2">
                <span className="font-semibold text-muted-foreground">
                  1.
                </span>
                <span>
                  AI transcribes your audio/video into text
                </span>
              </li>

              <li className="flex gap-2">
                <span className="font-semibold text-muted-foreground">
                  2.
                </span>
                <span>
                  Content is segmented into topics and
                  sub-topics
                </span>
              </li>

              <li className="flex gap-2">
                <span className="font-semibold text-muted-foreground">
                  3.
                </span>
                <span>
                  Translations are generated for each
                  target language
                </span>
              </li>

              <li className="flex gap-2">
                <span className="font-semibold text-muted-foreground">
                  4.
                </span>
                <span>
                  AI generates comprehension questions for
                  each topic
                </span>
              </li>

              <li className="flex gap-2">
                <span className="font-semibold text-muted-foreground">
                  5.
                </span>
                <span>
                  Lesson is ready for student
                  interactions
                </span>
              </li>
            </ol>
          </Card>
        </div>
      </main>
    </AppShell>
  );
}