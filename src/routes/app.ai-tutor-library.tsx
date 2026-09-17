import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Loader2, Eye, FileAudio } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { listMyAILessons } from "@/lib/ai-tutor.functions";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/app/ai-tutor-library")({
  head: () => ({
    meta: [
      { title: "My AI Tutor Lessons — Vidya A.I." },
      {
        name: "description",
        content: "Manage your AI-powered tutor lessons.",
      },
    ],
  }),
  component: AITutorLibraryPage,
});

interface Lesson {
  id: string;
  title: string;
  subject_id: string;
  topic: string;
  status: string;
  published: boolean;
  estimated_duration_minutes: number | null;
  created_at: string;
  class_level: string;
}

const STATUS_COLORS: Record<string, string> = {
  uploaded: "bg-primary-soft text-primary",
  queued: "bg-warning/15 text-warning-foreground",
  processing: "bg-warning/15 text-warning-foreground",
  transcribing: "bg-primary-soft text-primary",
  segmenting: "bg-primary-soft text-primary",
  translating: "bg-primary-soft text-primary",
  generating_narration: "bg-primary-soft text-primary",
  generating_questions: "bg-accent-soft text-accent",
  ready: "bg-success/15 text-success",
  published: "bg-success/15 text-success",
  failed: "bg-destructive/10 text-destructive",
};

const STATUS_LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  queued: "Queued",
  processing: "Processing",
  transcribing: "Transcribing",
  segmenting: "Segmenting",
  translating: "Translating",
  generating_narration: "Generating Narration",
  generating_questions: "Generating Questions",
  ready: "Ready",
  published: "Published",
  failed: "Failed",
};

function AITutorLibraryPage() {
  const navigate = useNavigate();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLessons();
  }, []);

  const loadLessons = async () => {
    try {
      setLoading(true);
      const data = await listMyAILessons();
      setLessons(data || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load lessons");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusColor = (status: string) => {
    return STATUS_COLORS[status] || "bg-muted text-muted-foreground";
  };

  const getStatusLabel = (status: string) => {
    return STATUS_LABELS[status] || status;
  };

  const isProcessing = (status: string) => {
    return ["queued", "processing", "transcribing", "segmenting", "translating", "generating_narration", "generating_questions"].includes(
      status
    );
  };

  return (
    <AppShell>
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">My AI Tutor Lessons</h1>
            <p className="text-muted-foreground mt-1">
              Create, manage, and publish AI-powered lessons
            </p>
          </div>
          <Button
            onClick={() => navigate({ to: "/app/ai-tutor-create" })}
            className="gap-2"
          >
            <Plus className="size-4" />
            Create Lesson
          </Button>
        </div>

        {/* Content */}
        {loading ? (
          <Card className="p-12">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="size-5 animate-spin" />
              <span>Loading your lessons...</span>
            </div>
          </Card>
        ) : lessons.length === 0 ? (
          <Card className="p-12">
            <div className="text-center">
              <FileAudio className="size-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No lessons yet</h3>
              <p className="text-muted-foreground mb-6">
                Create your first AI tutor lesson and start teaching with AI assistance
              </p>
              <Button
                onClick={() => navigate({ to: "/app/ai-tutor-create" })}
                className="gap-2"
              >
                <Plus className="size-4" />
                Create First Lesson
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {lessons.map((lesson) => (
              <Card key={lesson.id} className="p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold">{lesson.title}</h3>
                      <Badge
                        className={getStatusColor(lesson.status)}
                        variant="secondary"
                      >
                        {getStatusLabel(lesson.status)}
                      </Badge>
                      {lesson.published && (
                        <Badge variant="default">Published</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mb-3">
                      <span>{lesson.class_level}</span>
                      <span className="mx-2">•</span>
                      <span>{lesson.topic}</span>
                      {lesson.estimated_duration_minutes && (
                        <>
                          <span className="mx-2">•</span>
                          <span>{lesson.estimated_duration_minutes} min</span>
                        </>
                      )}
                      <span className="mx-2">•</span>
                      <span>Created {formatDate(lesson.created_at)}</span>
                    </div>

                    {/* Processing Status */}
                    {isProcessing(lesson.status) && (
                      <div className="mt-3 rounded border border-primary/15 bg-primary-soft p-3 text-sm text-primary">
                        Processing in progress... This may take a few minutes depending on media length.
                      </div>
                    )}

                    {lesson.status === "failed" && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                        Processing failed. Please try uploading the media again.
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        navigate({
                          to: `/app/ai-tutor/$lessonId`,
                          params: { lessonId: lesson.id },
                        })
                      }
                    >
                      <Eye className="size-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
