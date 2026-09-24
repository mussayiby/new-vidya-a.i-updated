import { createFileRoute, notFound } from "@tanstack/react-router";
import { CheckCircle2, Download, ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { getLesson, getSubject } from "@/data/subjects";
import { questionsForLesson } from "@/data/offline-quizzes";
import { useApp } from "@/hooks/useApp";
import { useLearningCompanion } from "@/context/LearningCompanionContext";
import { offlineLearningService } from "@/services/offline-learning.service";

export const Route = createFileRoute("/app/lessons/$lessonId")({
  head: () => ({
    meta: [
      { title: "Lesson — Vidya A.I." },
      {
        name: "description",
        content:
          "Read the explanation, worked examples and key points for this Vidya A.I. lesson.",
      },
      { property: "og:title", content: "Lesson — Vidya A.I." },
      {
        property: "og:description",
        content: "Explanations, examples and key points for this lesson.",
      },
    ],
  }),
  loader: ({ params }) => {
    const lesson = getLesson(params.lessonId);
    if (!lesson) throw notFound();
    return { lesson, subject: getSubject(lesson.subjectId) };
  },
  component: LessonDetail,
});

function LessonDetail() {
  const { lesson, subject } = Route.useLoaderData();
  const { completedLessons, toggleLessonComplete } = useApp();
  const { setLearningContext } = useLearningCompanion();
  const [downloaded, setDownloaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const completed = completedLessons.includes(lesson.id);

  useEffect(() => {
    setLearningContext({
      subjectId: lesson.subjectId,
      ...(subject?.name ? { subject: subject.name } : {}),
      lesson: lesson.title,
      topic: lesson.title,
      activity: "lesson",
    });
    void offlineLearningService.getPackage(lesson.id).then((item) => setDownloaded(Boolean(item)));
    void offlineLearningService.saveProgress({
      lessonId: lesson.id,
      position: 0,
      completed,
      updatedAt: new Date().toISOString(),
      synced: false,
    });
  }, [completed, lesson.id, lesson.subjectId, lesson.title, setLearningContext, subject?.name]);

  const markComplete = () => {
    toggleLessonComplete(lesson.id);
    void offlineLearningService.saveProgress({
      lessonId: lesson.id,
      position: lesson.duration * 60,
      completed: !completed,
      updatedAt: new Date().toISOString(),
      synced: false,
    });
  };

  const download = async () => {
    try {
      await offlineLearningService.savePackage(lesson, questionsForLesson(lesson.id));
      setDownloaded(true);
      setMessage("Lesson and available quiz content saved to this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This lesson could not be saved offline.");
    }
  };

  return (
    <AppShell>
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Button variant="ghost" asChild className="mb-5 gap-2"><a href="/app/subjects"><ArrowLeft className="size-4" /> Learning Hub</a></Button>
      <p className="text-sm text-muted-foreground">
        {subject?.name} · {lesson.duration} min
      </p>
      <h1 className="mt-1 text-2xl font-bold">{lesson.title}</h1>
      <p className="mt-2 text-muted-foreground">{lesson.summary}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={markComplete} variant={completed ? "outline" : "default"} className="gap-2">
          <CheckCircle2 className="size-4" /> {completed ? "Mark as incomplete" : "Mark lesson complete"}
        </Button>
        <Button onClick={() => void download()} variant="outline" className="gap-2" disabled={downloaded}>
          <Download className="size-4" /> {downloaded ? "Available offline" : "Download lesson"}
        </Button>
      </div>

      <section className="mt-6 space-y-3">
        {lesson.explanation.map((para) => (
          <p key={para} className="leading-relaxed">
            {para}
          </p>
        ))}
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold">Examples</h2>
        {lesson.examples.map((example) => (
          <div
            key={example.title}
            className="rounded-2xl border border-border bg-card p-4 shadow-card"
          >
            <h3 className="font-semibold">{example.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{example.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Key points</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {lesson.keyPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </section>
      {message ? <p className="mt-6 rounded-xl bg-primary-soft p-3 text-sm text-primary">{message}</p> : null}
    </main>
    </AppShell>
  );
}
