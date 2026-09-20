import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Upload, AlertCircle, CheckCircle2, Clock, FileText, MessageSquare } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { getAILesson, publishAILesson } from "@/lib/ai-tutor.functions";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/app/ai-tutor/$lessonId")({
  head: () => ({
    meta: [
      { title: "Lesson Details — Vidya A.I." },
    ],
  }),
  component: LessonDetailPage,
});

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  subject_id: string;
  topic: string;
  subtopic: string | null;
  status: string;
  published: boolean;
  estimated_duration_minutes: number | null;
  difficulty: string;
  created_at: string;
  target_languages: string[];
  learning_objectives: string[] | null;
  error_message: string | null;
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

const STATUS_STEPS = [
  "uploaded",
  "queued",
  "processing",
  "transcribing",
  "segmenting",
  "translating",
  "generating_narration",
  "generating_questions",
  "ready",
];

function LessonDetailPage() {
  const { lessonId } = Route.useParams();
  const navigate = useNavigate();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    loadLesson();
    const interval = setInterval(loadLesson, 3000); // Poll every 3s for status updates
    return () => clearInterval(interval);
  }, [lessonId]);

  const loadLesson = async () => {
    try {
      const data = await getAILesson({ data: { lessonId } });
      setLesson({ ...data, error_message: null });
    } catch (error) {
      if (loading) {
        toast.error(error instanceof Error ? error.message : "Failed to load lesson");
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!lesson) return;

    setPublishing(true);
    try {
      await publishAILesson({ data: { lessonId, publish: !lesson.published } });
      await loadLesson();
      toast.success(lesson.published ? "Lesson unpublished" : "Lesson published!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to publish lesson");
    } finally {
      setPublishing(false);
    }
  };

  const getStatusProgress = (status: string) => {
    const index = STATUS_STEPS.indexOf(status);
    return index >= 0 ? ((index + 1) / STATUS_STEPS.length) * 100 : 0;
  };

  if (loading) {
    return (
      <AppShell>
        <main className="px-4 py-8 sm:px-6 lg:px-8">
          <Card className="p-12">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="size-5 animate-spin" />
              <span>Loading lesson details...</span>
            </div>
          </Card>
        </main>
      </AppShell>
    );
  }

  if (!lesson) {
    return (
      <AppShell>
        <main className="px-4 py-8 sm:px-6 lg:px-8">
          <Card className="p-12">
            <div className="text-center">
              <AlertCircle className="mx-auto mb-4 size-12 text-destructive" />
              <h3 className="text-lg font-semibold mb-2">Lesson not found</h3>
              <Button
                variant="outline"
                onClick={() => navigate({ to: "/app/ai-tutor-library" })}
              >
                Back to Library
              </Button>
            </div>
          </Card>
        </main>
      </AppShell>
    );
  }

  const isProcessing = STATUS_STEPS.includes(lesson.status) && lesson.status !== "ready" && lesson.status !== "published";
  const canPublish = lesson.status === "ready" && !lesson.published;

  return (
    <AppShell>
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: "/app/ai-tutor-library" })}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{lesson.title}</h1>
            <div className="flex items-center gap-3 mt-2">
              <Badge className={STATUS_COLORS[lesson.status] || "bg-gray-100 text-gray-800"}>
                {STATUS_LABELS[lesson.status] || lesson.status}
              </Badge>
              {lesson.published && <Badge variant="default">Published</Badge>}
            </div>
          </div>
        </div>

        <div className="space-y-6 max-w-4xl">
          {/* Processing Status */}
          {isProcessing ? (
            <Card className="border-primary/15 bg-primary-soft p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="size-5 animate-spin text-primary" />
                  <h3 className="font-semibold text-primary">
                    Processing Your Lesson ({STATUS_LABELS[lesson.status]})
                  </h3>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-primary">Progress</span>
                    <span className="text-primary">{Math.round(getStatusProgress(lesson.status))}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-primary/15">
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{ width: `${getStatusProgress(lesson.status)}%` }}
                    />
                  </div>
                </div>
                <p className="text-sm text-primary">
                  This process typically takes 5-15 minutes depending on media length. You can leave this page and come back later.
                </p>
              </div>
            </Card>
          ) : lesson.status === "failed" ? (
            <Card className="p-6 bg-red-50 border-red-200">
              <div className="flex gap-4">
                <AlertCircle className="size-6 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-900">Processing Failed</h3>
                  <p className="text-sm text-red-700 mt-1">
                    {lesson.error_message || "An error occurred during processing. Please try uploading the media again."}
                  </p>
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={() =>
                      navigate({
                        to: `/app/ai-tutor/$lessonId/upload`,
                        params: { lessonId },
                      })
                    }
                  >
                    Upload New Media
                  </Button>
                </div>
              </div>
            </Card>
          ) : lesson.status === "ready" || lesson.status === "published" ? (
            <Card className="border-success/20 bg-success/10 p-6">
              <div className="flex gap-4">
                <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" />
                <div>
                  <h3 className="font-semibold text-success">Ready for Students!</h3>
                  <p className="mt-1 text-sm text-success">
                    Your lesson has been fully processed and is ready. 
                    {!lesson.published && " Publish it to make it available to students."}
                  </p>
                </div>
              </div>
            </Card>
          ) : null}

          {/* Publish Action */}
          {canPublish && (
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Ready to Publish?</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Make this lesson available to students
                  </p>
                </div>
                <Button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="gap-2"
                >
                  {publishing && <Loader2 className="size-4 animate-spin" />}
                  {publishing ? "Publishing..." : "Publish Lesson"}
                </Button>
              </div>
            </Card>
          )}

          {/* Lesson Info */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Lesson Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Topic</p>
                <p className="font-medium">{lesson.topic}</p>
              </div>
              {lesson.subtopic && (
                <div>
                  <p className="text-sm text-muted-foreground">Sub-topic</p>
                  <p className="font-medium">{lesson.subtopic}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Difficulty</p>
                <p className="font-medium capitalize">{lesson.difficulty}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Duration</p>
                <p className="font-medium">
                  {lesson.estimated_duration_minutes ? `${lesson.estimated_duration_minutes} min` : "Not specified"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Target Languages</p>
                <div className="flex gap-1 mt-1">
                  {lesson.target_languages.map((lang) => (
                    <Badge key={lang} variant="secondary">
                      {lang.toUpperCase()}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Created</p>
                <p className="font-medium">
                  {new Date(lesson.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>

            {lesson.description && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="mt-1">{lesson.description}</p>
              </div>
            )}

            {lesson.learning_objectives && lesson.learning_objectives.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-2">Learning Objectives</p>
                <ul className="space-y-1">
                  {lesson.learning_objectives.map((obj, i) => (
                    <li key={i} className="text-sm flex gap-2">
                      <span className="text-muted-foreground">•</span>
                      <span>{obj}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {/* Content Tabs (when ready) */}
          {(lesson.status === "ready" || lesson.status === "published") && (
            <Card className="p-6">
              <Tabs defaultValue="topics">
                <TabsList>
                  <TabsTrigger value="topics" className="gap-2">
                    <FileText className="size-4" />
                    Topics
                  </TabsTrigger>
                  <TabsTrigger value="questions" className="gap-2">
                    <MessageSquare className="size-4" />
                    Questions
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="topics" className="mt-4">
                  <div className="text-center py-8 text-muted-foreground">
                    Topics will appear here once processing is complete
                  </div>
                </TabsContent>

                <TabsContent value="questions" className="mt-4">
                  <div className="text-center py-8 text-muted-foreground">
                    Generated questions will appear here once processing is complete
                  </div>
                </TabsContent>
              </Tabs>
            </Card>
          )}
        </div>
      </main>
    </AppShell>
  );
}
