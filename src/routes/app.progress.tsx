import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, CheckCircle2, ClipboardCheck, Clock3, CloudOff, Target, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { lessons, lessonsBySubject, subjects } from "@/data/subjects";
import { useApp } from "@/hooks/useApp";
import { dashboardAnalyticsService } from "@/services/dashboard-analytics.service";
import { offlineLearningService, type OfflineGameSession, type OfflineQuizAttempt, type OfflineProgress } from "@/services/offline-learning.service";

export const Route = createFileRoute("/app/progress")({
  head: () => ({ meta: [{ title: "My Progress — Vidya A.I." }, { name: "description", content: "See your real lesson and practice progress." }] }),
  component: ProgressPage,
});

function ProgressPage() {
  const { user, completedLessons } = useApp();
  const [attempts, setAttempts] = useState<OfflineQuizAttempt[]>([]);
  const [localProgress, setLocalProgress] = useState<OfflineProgress[]>([]);
  const [gameSessions, setGameSessions] = useState<OfflineGameSession[]>([]);

  useEffect(() => {
    void Promise.all([offlineLearningService.listAttempts(), offlineLearningService.listProgress(), offlineLearningService.listGameSessions()]).then(([savedAttempts, savedProgress, savedSessions]) => { setAttempts(savedAttempts); setLocalProgress(savedProgress); setGameSessions(savedSessions); });
  }, []);

  const completionEvents = user?.id ? dashboardAnalyticsService.getCompletionEvents(user.id) : [];
  const accuracy = attempts.length ? Math.round((attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.reduce((sum, attempt) => sum + attempt.total, 0)) * 100) : null;
  const pendingSync = localProgress.filter((item) => !item.synced).length + attempts.filter((item) => !item.synced).length + gameSessions.filter((item) => !item.synced).length;
  const completedBySubject = useMemo(() => subjects.map((subject) => { const subjectLessons = lessonsBySubject(subject.id); const completed = subjectLessons.filter((lesson) => completedLessons.includes(lesson.id)).length; return { subject, completed, total: subjectLessons.length }; }), [completedLessons]);

  return <AppShell><main className="min-h-screen bg-[#fffaf2] px-4 py-8 sm:px-6 lg:px-10"><div className="mx-auto max-w-6xl"><Button variant="ghost" asChild className="gap-2"><Link to="/app/subjects"><ArrowLeft className="size-4" /> Learning Hub</Link></Button><header className="mt-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Your learning record</p><h1 className="mt-2 text-4xl font-black text-slate-900">My Progress</h1><p className="mt-2 text-slate-600">These numbers come from your completed lessons, practice attempts, and Learning Quest sessions on this device.</p></header><section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><Metric icon={BookOpen} label="Lessons completed" value={`${completedLessons.length}/${lessons.length}`} /><Metric icon={ClipboardCheck} label="Quiz attempts" value={`${attempts.length}`} /><Metric icon={Target} label="Quiz accuracy" value={accuracy === null ? "No attempts" : `${accuracy}%`} /><Metric icon={TrophyIcon} label="Quest sessions" value={`${gameSessions.length}`} /><Metric icon={CloudOff} label="Waiting to sync" value={`${pendingSync}`} /></section><section className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]"><div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><span className="rounded-xl bg-primary/10 p-2 text-primary"><BookOpen className="size-5" /></span><h2 className="text-xl font-black">Subject progress</h2></div><div className="mt-6 space-y-5">{completedBySubject.map(({ subject, completed, total }) => <div key={subject.id}><div className="flex items-center justify-between text-sm"><span className="font-bold">{subject.name}</span><span className="text-slate-500">{completed}/{total}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-primary" style={{ width: `${total ? (completed / total) * 100 : 0}%` }} /></div></div>)}</div></div><div className="rounded-3xl border border-slate-200 bg-[#203b35] p-6 text-white shadow-sm"><Clock3 className="size-6 text-[#f4c66d]" /><h2 className="mt-4 text-xl font-black">Recent activity</h2>{completionEvents.length === 0 && attempts.length === 0 && gameSessions.length === 0 ? <p className="mt-3 text-sm text-white/70">Complete a lesson, quiz, or quest to start building your progress record.</p> : <div className="mt-4 space-y-3 text-sm text-white/80">{completionEvents.slice(0, 3).map((event) => <p key={`${event.lessonId}-${event.completedAt}`}>Completed {lessons.find((lesson) => lesson.id === event.lessonId)?.title ?? event.lessonId}</p>)}{attempts.slice(0, 3).map((attempt) => <p key={attempt.id}>Practice score: {attempt.score}/{attempt.total}</p>)}{gameSessions.slice(0, 3).map((session) => <p key={session.id}>Quest: {session.correct}/{session.completed} correct, {session.xp} XP</p>)}</div>}</div></section><section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><CheckCircle2 className="size-5 text-emerald-600" /><h2 className="text-xl font-black">Sync status</h2></div><p className="mt-3 text-sm text-slate-600">Local learning data is retained across refreshes. Supabase synchronization is not connected for the static catalog's local progress yet, so pending items remain safely on this device.</p></section></div></main></AppShell>;
}

function TrophyIcon({ className }: { className?: string }) { return <Trophy className={className} />; }
function Metric({ icon: Icon, label, value }: { icon: typeof BookOpen | typeof TrophyIcon; label: string; value: string }) { return <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><span className="grid size-10 place-items-center rounded-xl bg-[#fff0cf] text-[#9a681c]"><Icon className="size-5" /></span><p className="mt-4 text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-900">{value}</p></div>; }
