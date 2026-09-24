import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, CircleAlert, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { lessons, getLesson } from "@/data/subjects";
import { offlineQuizQuestions } from "@/data/offline-quizzes";
import {
  offlineLearningService,
  type OfflineQuizAttempt,
  type OfflineQuizQuestion,
} from "@/services/offline-learning.service";
import { useLearningCompanion } from "@/context/LearningCompanionContext";

export const Route = createFileRoute("/app/practice")({
  head: () => ({
    meta: [
      { title: "Quiz & Practice — Vidya A.I." },
      { name: "description", content: "Practice real lesson questions and save your attempts locally." },
    ],
  }),
  component: PracticePage,
});

function PracticePage() {
  const [questions, setQuestions] = useState<OfflineQuizQuestion[]>(offlineQuizQuestions);
  const [attempts, setAttempts] = useState<OfflineQuizAttempt[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { setLearningContext } = useLearningCompanion();

  useEffect(() => {
    setLearningContext({ subjectId: "practice", subject: "all subjects", activity: "quiz practice" });
    void Promise.all([
      offlineLearningService.listPackages(),
      offlineLearningService.listAttempts(),
    ])
      .then(([packages, savedAttempts]) => {
        const downloadedQuestions = packages.flatMap((item) => item.questions);
        const byId = new Map([...offlineQuizQuestions, ...downloadedQuestions].map((item) => [item.id, item]));
        setQuestions(Array.from(byId.values()));
        setAttempts(savedAttempts);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Offline practice is unavailable."));
  }, [setLearningContext]);

  const question = questions[questionIndex];
  const lesson = question ? getLesson(question.lessonId) : undefined;
  const answered = checked && selected !== null;
  const currentCorrect = question && selected === question.correctAnswer;

  const submitAnswer = () => {
    if (!question || !selected) return;
    setAnswers((current) => ({ ...current, [question.id]: selected }));
    setChecked(true);
  };

  const nextQuestion = () => {
    if (!question || !selected || !checked) return;
    if (questionIndex === questions.length - 1) {
      const finalScore = score + (selected === question.correctAnswer ? 1 : 0);
      const finalAnswers = { ...answers, [question.id]: selected };
      setScore(finalScore);
      setFinished(true);
      const attempt: OfflineQuizAttempt = {
        id: crypto.randomUUID(),
        lessonId: "mixed-practice",
        answers: finalAnswers,
        score: finalScore,
        total: questions.length,
        completedAt: new Date().toISOString(),
        synced: false,
      };
      void offlineLearningService.saveAttempt(attempt).then(() => setAttempts((current) => [attempt, ...current]));
      return;
    }
    setScore((current) => current + (selected === question.correctAnswer ? 1 : 0));
    setQuestionIndex((current) => current + 1);
    setSelected(null);
    setChecked(false);
  };

  const reset = () => {
    setQuestionIndex(0);
    setSelected(null);
    setChecked(false);
    setAnswers({});
    setFinished(false);
    setScore(0);
  };

  return (
    <AppShell>
      <main className="min-h-screen bg-[#fffaf2] px-4 py-8 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-4xl">
          <Link to="/app/subjects" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-primary">
            <ArrowLeft className="size-4" /> Learning Hub
          </Link>
          <header className="mt-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Practice studio</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-900">Quiz & Practice</h1>
              <p className="mt-2 max-w-xl text-slate-600">Questions are available on this device. Your attempt is saved locally before any future sync is added.</p>
            </div>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">Offline-ready questions</span>
          </header>

          {error ? <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</p> : null}
          {questions.length === 0 ? (
            <section className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
              <h2 className="text-xl font-bold text-slate-900">No questions available yet</h2>
              <p className="mt-2 text-sm text-slate-600">Download a lesson package from the Learning Hub to add practice questions.</p>
            </section>
          ) : finished ? (
            <section className="mt-8 rounded-3xl border border-emerald-200 bg-white p-8 shadow-sm">
              <CheckCircle2 className="size-10 text-emerald-600" />
              <h2 className="mt-4 text-2xl font-black text-slate-900">Practice complete</h2>
              <p className="mt-2 text-slate-600">You scored {score} out of {questions.length}. The attempt is saved on this device.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button onClick={reset} className="gap-2"><RotateCcw className="size-4" /> Practice again</Button>
                <Button variant="outline" asChild><Link to="/app/subjects">Back to Learning Hub</Link></Button>
              </div>
            </section>
          ) : question ? (
            <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(86,61,33,0.08)] sm:p-8">
              <div className="flex items-center justify-between gap-4 text-sm text-slate-500">
                <span>Question {questionIndex + 1} of {questions.length}</span>
                <span>{lesson?.title ?? question.lessonId}</span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} /></div>
              <p className="mt-8 text-xs font-bold uppercase tracking-[0.16em] text-primary">{question.topic}</p>
              <h2 className="mt-3 text-2xl font-bold leading-tight text-slate-900">{question.question}</h2>
              <div className="mt-6 grid gap-3">
                {question.options.map((option) => {
                  const isSelected = selected === option;
                  const isCorrect = answered && option === question.correctAnswer;
                  const isWrong = answered && isSelected && !isCorrect;
                  return <button key={option} type="button" disabled={answered} onClick={() => setSelected(option)} className={`rounded-2xl border p-4 text-left text-sm font-semibold transition ${isCorrect ? "border-emerald-400 bg-emerald-50 text-emerald-800" : isWrong ? "border-red-300 bg-red-50 text-red-800" : isSelected ? "border-primary bg-primary/10 text-primary" : "border-slate-200 hover:border-primary/50 hover:bg-primary/5"}`}>{option}</button>;
                })}
              </div>
              {answered ? <div className={`mt-5 rounded-2xl p-4 text-sm ${currentCorrect ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}><div className="flex items-center gap-2 font-bold">{currentCorrect ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}{currentCorrect ? "Correct" : "Not quite"}</div><p className="mt-1">{question.explanation}</p></div> : null}
              <div className="mt-7 flex justify-end">{answered ? <Button onClick={nextQuestion}>{questionIndex === questions.length - 1 ? "Finish quiz" : "Next question"}</Button> : <Button disabled={!selected} onClick={submitAnswer}>Check answer</Button>}</div>
            </section>
          ) : null}

          <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-bold text-slate-900">Previous attempts</h2>
            {attempts.length === 0 ? <p className="mt-2 text-sm text-slate-500">No completed attempts yet.</p> : <div className="mt-3 space-y-2">{attempts.slice(0, 5).map((attempt) => <div key={attempt.id} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm"><span>{new Date(attempt.completedAt).toLocaleString()}</span><span className="font-bold">{attempt.score}/{attempt.total}</span></div>)}</div>}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
