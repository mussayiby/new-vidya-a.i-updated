import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Check, Download, HardDriveDownload, Lightbulb, MessageCircleQuestion, NotebookPen, Wifi, WifiOff, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { getLesson, lessons, lessonsBySubject, subjects } from "@/data/subjects";
import { questionsForLesson } from "@/data/offline-quizzes";
import { learningQuestChallenges } from "@/data/learning-quest";
import { useApp } from "@/hooks/useApp";
import { useLearningCompanion } from "@/context/LearningCompanionContext";
import { dashboardAnalyticsService } from "@/services/dashboard-analytics.service";
import { offlineLearningService, type OfflineGameSession, type OfflinePackage, type OfflineProgress } from "@/services/offline-learning.service";

export const Route = createFileRoute("/app/subjects/")({
  head: () => ({ meta: [{ title: "Learning Hub — Vidya A.I." }, { name: "description", content: "Learn online or continue with lessons downloaded to this device." }] }),
  component: LearningHubPage,
});

function LearningHubPage() {
  const { user, profile, completedLessons } = useApp();
  const { setLearningContext } = useLearningCompanion();
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [packages, setPackages] = useState<OfflinePackage[]>([]);
  const [progress, setProgress] = useState<OfflineProgress[]>([]);
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [gameReady, setGameReady] = useState(false);
  const [gameSessions, setGameSessions] = useState<OfflineGameSession[]>([]);

  const refreshLocal = async () => {
    if (!offlineLearningService.isAvailable()) return;
    try {
      const [nextPackages, nextProgress, gamePackage, nextGameSessions] = await Promise.all([offlineLearningService.listPackages(), offlineLearningService.listProgress(), offlineLearningService.getGamePackage(), offlineLearningService.listGameSessions()]);
      setPackages(nextPackages);
      setProgress(nextProgress);
      setGameReady(Boolean(gamePackage));
      setGameSessions(nextGameSessions);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Local learning storage is unavailable.");
    }
  };

  useEffect(() => {
    setLearningContext({ subjectId: "all-subjects", subject: "your subjects", activity: "subject exploration" });
    void refreshLocal();
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, [setLearningContext]);

  const lastEvent = user?.id ? dashboardAnalyticsService.getCompletionEvents(user.id)[0] : undefined;
  const activeProgress = progress.find((item) => !item.completed) ?? progress[0];
  const continueLesson = getLesson(activeProgress?.lessonId ?? lastEvent?.lessonId ?? "") ?? lessons.find((lesson) => !completedLessons.includes(lesson.id)) ?? lessons[0]!;
  const downloadedIds = useMemo(() => new Set(packages.map((item) => item.lesson.id)), [packages]);
  const completedCount = lessons.filter((lesson) => completedLessons.includes(lesson.id)).length;
  const revisionCount = progress.filter((item) => !item.completed).length + new Set(gameSessions.flatMap((session) => session.mistakes)).size;

  const downloadLesson = async (lessonId: string) => {
    const lesson = getLesson(lessonId);
    if (!lesson) return;
    setDownloadBusy(lessonId);
    try {
      await offlineLearningService.savePackage(lesson, questionsForLesson(lesson.id));
      await refreshLocal();
      setMessage(`${lesson.title} is available offline on this device.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The lesson could not be downloaded.");
    } finally { setDownloadBusy(null); }
  };

  const removeDownload = async (lessonId: string) => { await offlineLearningService.removePackage(lessonId); await refreshLocal(); };
  const prepareGame = async () => {
    try { await offlineLearningService.saveGamePackage(learningQuestChallenges); setGameReady(true); setMessage("Learning Quest is ready to play offline."); } catch (error) { setMessage(error instanceof Error ? error.message : "The game package could not be saved."); }
  };

  return (
    <AppShell>
      <main className="min-h-screen overflow-hidden bg-[#fffaf2] px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-9">
        <div className="mx-auto max-w-[1280px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${online ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}{online ? "Online — sync available" : "Offline — learning continues"}</span>
            <Link to="/app/progress" className="text-sm font-bold text-slate-600 hover:text-primary">View real progress <ArrowRight className="ml-1 inline size-4" /></Link>
          </div>

          <section className="relative mt-6 overflow-hidden rounded-[2rem] bg-[#f4c66d] px-6 py-8 shadow-[0_22px_60px_rgba(123,80,22,0.14)] sm:px-10 sm:py-11">
            <div className="relative z-10 max-w-2xl"><p className="text-sm font-bold uppercase tracking-[0.18em] text-[#77501d]">Vidya A.I. Learning Hub</p><h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Hello, {profile.name || "Student"}.</h1><p className="mt-4 max-w-lg text-lg leading-relaxed text-[#69491e]">Learn online, or keep going with the lessons you have downloaded to this device.</p><div className="mt-7 flex flex-wrap gap-3"><Button asChild className="gap-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800"><Link to="/app/lessons/$lessonId" params={{ lessonId: continueLesson.id }}>Continue learning <ArrowRight className="size-4" /></Link></Button><Button asChild variant="outline" className="gap-2 rounded-xl border-[#9b722c]/40 bg-white/50"><Link to="/app/practice">Quiz &amp; practice <NotebookPen className="size-4" /></Link></Button></div></div><div className="pointer-events-none absolute -right-8 -bottom-20 size-64 rounded-full bg-[#ffe9a9]/70 sm:size-80" /><div className="pointer-events-none absolute right-12 top-8 size-24 rounded-full bg-white/40 blur-2xl" />
          </section>

          <section className="mt-6 flex flex-col justify-between gap-5 rounded-3xl border border-[#d9b14e] bg-[#fff1c9] p-6 shadow-sm sm:flex-row sm:items-center sm:p-7"><div className="flex items-start gap-4"><span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#1f493e] text-[#f4c66d] shadow-sm"><NotebookPen className="size-7" /></span><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8a611e]">Play &amp; learn</p><h2 className="mt-1 text-2xl font-black">Learning Quest</h2><p className="mt-1 max-w-xl text-sm leading-relaxed text-[#62491f]">Learn through challenges, earn rewards, and master real lesson concepts with hints and feedback.</p>{gameReady ? <span className="mt-3 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">Works Offline</span> : <span className="mt-3 inline-flex rounded-full bg-white/70 px-2.5 py-1 text-xs font-bold text-[#79531c]">Prepare once for offline play</span>}</div></div><div className="flex shrink-0 flex-wrap gap-2"><Button asChild className="gap-2 rounded-xl bg-[#1f493e] hover:bg-[#17382f]"><Link to="/app/learning-quest">Play &amp; learn <ArrowRight className="size-4" /></Link></Button>{!gameReady ? <Button variant="outline" onClick={() => void prepareGame()} className="gap-2 rounded-xl border-[#a77b2a]/40"><Download className="size-4" /> Save offline</Button> : null}</div></section>

          <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><HubAction icon={MessageCircleQuestion} title="Clear my doubt" body={online ? "Ask the existing AI Tutor." : "AI answers need internet. Search downloaded lessons instead."} href={online ? "/app/tutor" : "#offline-library"} /><HubAction icon={HardDriveDownload} title="Offline lessons" body={`${packages.length} lesson package${packages.length === 1 ? "" : "s"} stored on this device.`} href="#offline-library" /><HubAction icon={Lightbulb} title="Revision" body={revisionCount ? `${revisionCount} incomplete lesson${revisionCount === 1 ? "" : "s"} to revisit.` : "Complete a lesson to build your revision list."} href={revisionCount ? "#subjects" : "/app/practice"} /><HubAction icon={BookOpen} title="Listen & learn" body="No audio lessons are downloaded yet." href="#offline-library" /></section>

          <section className="mt-10 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]"><div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Your next step</p><h2 className="mt-2 text-2xl font-black">Continue learning</h2><p className="mt-1 text-sm text-slate-500">{activeProgress ? "Picked from your saved local progress." : lastEvent ? "Picked from your recent completion." : "Start your first lesson."}</p></div><span className="rounded-2xl bg-primary/10 p-3 text-primary"><BookOpen className="size-5" /></span></div><div className="mt-6 rounded-2xl bg-[#fff5dc] p-5"><p className="text-xs font-bold uppercase tracking-wider text-[#8a611e]">{subjects.find((subject) => subject.id === continueLesson.subjectId)?.name}</p><h3 className="mt-2 text-xl font-bold">{continueLesson.title}</h3><p className="mt-2 text-sm leading-relaxed text-slate-600">{continueLesson.summary}</p><div className="mt-5 flex flex-wrap items-center gap-3"><Button asChild className="gap-2 rounded-xl"><Link to="/app/lessons/$lessonId" params={{ lessonId: continueLesson.id }}>Open lesson <ArrowRight className="size-4" /></Link></Button><span className="text-xs font-semibold text-slate-500">{activeProgress?.completed ? "Completed" : `${continueLesson.duration} min lesson`}</span></div></div></div><div className="rounded-3xl border border-slate-200 bg-[#203b35] p-6 text-white shadow-sm sm:p-7"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#f4c66d]">Practice</p><h2 className="mt-2 text-2xl font-black">Build confidence one answer at a time.</h2><p className="mt-3 text-sm leading-relaxed text-white/70">The practice set uses real questions tied to the lessons in this app. Answers and attempts are saved locally.</p><div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4 text-sm"><span>{completedCount} lessons completed</span><Link to="/app/practice" className="font-bold text-[#f4c66d]">Start practice <ArrowRight className="ml-1 inline size-4" /></Link></div></div></section>

          <section id="subjects" className="mt-10"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Explore</p><h2 className="mt-2 text-3xl font-black">Your subjects</h2></div><span className="text-sm text-slate-500">{completedCount} of {lessons.length} lessons completed</span></div><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{subjects.map((subject) => { const subjectLessons = lessonsBySubject(subject.id); const completed = subjectLessons.filter((lesson) => completedLessons.includes(lesson.id)).length; return <div key={subject.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{subject.name}</h3><p className="mt-1 text-sm leading-relaxed text-slate-500">{subject.description}</p></div><span className="rounded-xl bg-primary/10 p-2 text-primary"><BookOpen className="size-4" /></span></div><div className="mt-5 flex items-center justify-between text-xs font-bold text-slate-500"><span>{completed}/{subjectLessons.length} complete</span><Link to="/app/subjects/$subjectId" params={{ subjectId: subject.id }} className="text-primary">Open <ArrowRight className="ml-1 inline size-3.5" /></Link></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${subjectLessons.length ? (completed / subjectLessons.length) * 100 : 0}%` }} /></div></div>; })}</div></section>

          <section id="offline-library" className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Device storage</p><h2 className="mt-2 text-3xl font-black">Your Offline Library</h2><p className="mt-1 text-sm text-slate-500">Only content actually stored in IndexedDB appears here.</p></div><span className="text-sm font-bold text-slate-500">{packages.length} downloaded</span></div>{packages.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-7 text-center"><p className="font-bold">No offline lessons downloaded yet</p><p className="mt-1 text-sm text-slate-500">Download a lesson package below to learn without internet.</p></div> : <div className="mt-6 grid gap-3 md:grid-cols-2">{packages.map((item) => <div key={item.lesson.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4"><span className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><Check className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate font-bold">{item.lesson.title}</p><p className="text-xs text-slate-500">{item.questions.length} quiz question{item.questions.length === 1 ? "" : "s"} · downloaded {new Date(item.downloadedAt).toLocaleDateString()}</p></div><Button variant="ghost" size="icon" aria-label={`Remove ${item.lesson.title}`} onClick={() => void removeDownload(item.lesson.id)}><X className="size-4" /></Button></div>)}</div>}</section>

          <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Download manager</p><h2 className="mt-2 text-2xl font-black">Make a lesson yours</h2></div><HardDriveDownload className="size-5 text-slate-400" /></div><div className="mt-5 grid gap-3 md:grid-cols-2">{lessons.slice(0, 6).map((lesson) => <div key={lesson.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-4"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{lesson.title}</p><p className="text-xs text-slate-500">{lesson.duration} min · {questionsForLesson(lesson.id).length} quiz questions</p></div>{downloadedIds.has(lesson.id) ? <span className="text-xs font-bold text-emerald-700">Downloaded</span> : <Button size="sm" variant="outline" disabled={downloadBusy === lesson.id || !offlineLearningService.isAvailable()} onClick={() => void downloadLesson(lesson.id)} className="gap-1.5">{downloadBusy === lesson.id ? "Saving" : <><Download className="size-3.5" /> Download</>}</Button>}</div>)}</div></section>
          {message ? <div className="fixed right-4 bottom-4 z-50 flex max-w-sm items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold shadow-xl"><span className="flex-1">{message}</span><button type="button" onClick={() => setMessage(null)} aria-label="Dismiss"><X className="size-4" /></button></div> : null}
        </div>
      </main>
    </AppShell>
  );
}

function HubAction({ icon: Icon, title, body, href }: { icon: typeof BookOpen; title: string; body: string; href: string }) {
  return <a href={href} className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><span className="grid size-11 place-items-center rounded-2xl bg-[#fff0cf] text-[#9a681c] transition group-hover:scale-105"><Icon className="size-5" /></span><h3 className="mt-4 font-bold">{title}</h3><p className="mt-1 text-sm leading-relaxed text-slate-500">{body}</p><span className="mt-4 inline-flex items-center text-xs font-bold text-primary">Open <ArrowRight className="ml-1 size-3.5" /></span></a>;
}
