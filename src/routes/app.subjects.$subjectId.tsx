import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { getSubject, lessonsBySubject } from "@/data/subjects";
import { LessonCard } from "@/components/ui-kit/LessonCard";
import { useLearningCompanion } from "@/context/LearningCompanionContext";

export const Route = createFileRoute("/app/subjects/$subjectId")({
  head: () => ({
    meta: [
      { title: "Subject lessons — Vidya A.I." },
      {
        name: "description",
        content:
          "Browse lessons, track progress and continue learning in this subject with Vidya A.I.",
      },
      { property: "og:title", content: "Subject lessons — Vidya A.I." },
      {
        property: "og:description",
        content: "Browse lessons and continue learning with Vidya A.I.",
      },
    ],
  }),
  loader: ({ params }) => {
    const subject = getSubject(params.subjectId);
    if (!subject) throw notFound();
    return { subject, lessons: lessonsBySubject(subject.id) };
  },
  component: SubjectDetail,
});

function SubjectDetail() {
  const { subject, lessons } = Route.useLoaderData();
  const { setLearningContext } = useLearningCompanion();

  useEffect(() => {
    setLearningContext({ subjectId: subject.id, subject: subject.name, activity: "subject lessons" });
  }, [setLearningContext, subject.id, subject.name]);

  return (
    <AppShell>
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">{subject.name}</h1>
      <p className="mt-1 text-muted-foreground">{subject.description}</p>

      <div className="mt-6 space-y-3">
        {lessons.map((lesson) => (
          <LessonCard key={lesson.id} lesson={lesson} completed={false} />
        ))}
      </div>
    </main>
    </AppShell>
  );
}
