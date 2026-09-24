import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  Lightbulb,
  LockKeyhole,
  Map,
  RefreshCcw,
  Sparkles,
  Star,
  Target,
  Trophy,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { learningQuestChallenges } from "@/data/learning-quest";
import {
  offlineLearningService,
  type OfflineGameChallenge,
  type OfflineGamePackage,
  type OfflineGameSession,
} from "@/services/offline-learning.service";
import { useLearningCompanion } from "@/context/LearningCompanionContext";

export const Route = createFileRoute("/app/learning-quest")({
  head: () => ({
    meta: [
      { title: "Learning Quest — Vidya A.I." },
      { name: "description", content: "Practice real concepts through short learning challenges." },
    ],
  }),
  component: LearningQuestPage,
});

type Phase = "learn" | "challenge" | "feedback" | "complete";

function LearningQuestPage() {
  const [gamePackage, setGamePackage] = useState<OfflineGamePackage>();
  const [topic, setTopic] = useState("All topics");
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("learn");
  const [selected, setSelected] = useState<string | null>(null);
  const [retryUsed, setRetryUsed] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [xp, setXp] = useState(0);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [concepts, setConcepts] = useState<string[]>([]);
  const [startedAt, setStartedAt] = useState(new Date().toISOString());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setLearningContext } = useLearningCompanion();

  useEffect(() => {
    setLearningContext({ subjectId: "learning-quest", subject: topic, activity: "Learning Quest" });
    void offlineLearningService
      .getGamePackage()
      .then(setGamePackage)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Offline game storage is unavailable."));
  }, [setLearningContext, topic]);

  const challenges = useMemo(() => {
    const source = gamePackage?.challenges ?? [];
    return topic === "All topics" ? source : source.filter((challenge) => challenge.topic === topic);
  }, [gamePackage, topic]);
  const topics = useMemo(
    () => Array.from(new Set((gamePackage?.challenges ?? []).map((challenge) => challenge.topic))),
    [gamePackage],
  );
  const current = challenges[challengeIndex];
  const mastery = completed ? Math.round((correct / completed) * 100) : 0;

  const downloadPackage = async () => {
    try {
      const saved = await offlineLearningService.saveGamePackage(learningQuestChallenges);
      setGamePackage(saved);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The game package could not be saved.");
    }
  };

  const startChallenge = () => {
    setSelected(null);
    setPhase("challenge");
  };

  const checkAnswer = () => {
    if (!current || !selected) return;
    if (selected !== current.correctAnswer) {
      if (!mistakes.includes(current.id)) setMistakes((items) => [...items, current.id]);
      setPhase("feedback");
      return;
    }
    setCorrect((value) => value + 1);
    setXp((value) => value + (retryUsed ? 5 : 10));
    if (!concepts.includes(current.concept)) setConcepts((items) => [...items, current.concept]);
    setPhase("feedback");
  };

  const retry = () => {
    setRetryUsed(true);
    setSelected(null);
    setPhase("challenge");
  };

  const saveSession = async (finalCompleted: number, finalCorrect: number, finalXp: number) => {
    if (!gamePackage) return;
    setSaving(true);
    const session: OfflineGameSession = {
      id: crypto.randomUUID(),
      packageId: gamePackage.id,
      topic,
      challengeIds: challenges.map((challenge) => challenge.id),
      correct: finalCorrect,
      completed: finalCompleted,
      xp: finalXp,
      mistakes,
      concepts,
      startedAt,
      completedAt: new Date().toISOString(),
      synced: false,
    };
    try {
      await offlineLearningService.saveGameSession(session);
      setPhase("complete");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The game result could not be saved locally.");
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (!current) return;
    const nextCompleted = completed + 1;
    if (challengeIndex === challenges.length - 1) {
      void saveSession(nextCompleted, correct, xp);
      return;
    }
    setCompleted(nextCompleted);
    setChallengeIndex((value) => value + 1);
    setPhase("learn");
    setSelected(null);
    setRetryUsed(false);
  };

  const restart = () => {
    setChallengeIndex(0);
    setPhase("learn");
    setSelected(null);
    setRetryUsed(false);
    setCorrect(0);
    setCompleted(0);
    setXp(0);
    setMistakes([]);
    setConcepts([]);
    setStartedAt(new Date().toISOString());
  };

  return (
    <AppShell>
      <main className="min-h-screen bg-[#eaf5e9] px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-9">
        <div className="mx-auto max-w-6xl">
          <Link to="/app/subjects" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-primary"><ArrowLeft className="size-4" /> Learning Hub</Link>
          <section className="relative mt-5 overflow-hidden rounded-[2rem] bg-[#1f493e] p-6 text-white shadow-[0_22px_60px_rgba(31,73,62,0.22)] sm:p-10"><div className="relative z-10 max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#f4c66d]">VIDYA A.I. WORLD</p><h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Learning Quest</h1><p className="mt-4 text-lg leading-relaxed text-white/75">Learn a little, solve a challenge, understand the feedback, and earn progress you can keep.</p></div><Map className="absolute right-8 bottom-8 size-32 text-white/10" /></section>
          {error ? <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">{error}</p> : null}
          {!gamePackage ? <DownloadPrompt onDownload={() => void downloadPackage()} /> : phase === "complete" ? <CompletionCard correct={correct} completed={completed} xp={xp} topic={topic} concepts={concepts} mistakes={mistakes} onRestart={restart} /> : <GameBoard challenges={challenges} topics={topics} current={current} topic={topic} setTopic={(value) => { setTopic(value); setChallengeIndex(0); setPhase("learn"); setSelected(null); }} phase={phase} selected={selected} setSelected={setSelected} retryUsed={retryUsed} saving={saving} mastery={mastery} xp={xp} challengeIndex={challengeIndex} checkAnswer={checkAnswer} startChallenge={startChallenge} retry={retry} next={next} />}
        </div>
      </main>
    </AppShell>
  );
}

function DownloadPrompt({ onDownload }: { onDownload: () => void }) { return <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"><LockKeyhole className="size-8 text-primary" /><h2 className="mt-4 text-2xl font-black">Download the Quest world</h2><p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">Store the current lesson-linked challenges on this device. The core game then runs without Gemini, Supabase, or an internet request.</p><Button className="mt-6 gap-2" onClick={onDownload}><Download className="size-4" /> Prepare offline game</Button></section>; }

function GameBoard({ challenges, topics, current, topic, setTopic, phase, selected, setSelected, retryUsed, saving, mastery, xp, challengeIndex, checkAnswer, startChallenge, retry, next }: { challenges: OfflineGameChallenge[]; topics: string[]; current: OfflineGameChallenge | undefined; topic: string; setTopic: (value: string) => void; phase: Phase; selected: string | null; setSelected: (value: string) => void; retryUsed: boolean; saving: boolean; mastery: number; xp: number; challengeIndex: number; checkAnswer: () => void; startChallenge: () => void; retry: () => void; next: () => void }) {
  const isCorrect = Boolean(current && selected === current.correctAnswer);
  return <><section className="mt-6 grid gap-4 sm:grid-cols-3"><Stat icon={Star} label="Quest XP" value={`${xp}`} /><Stat icon={Target} label="Mastery this run" value={`${mastery}%`} /><Stat icon={Trophy} label="Challenge" value={`${Math.min(challengeIndex + 1, challenges.length)}/${challenges.length}`} /></section><section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Choose your trail</p><h2 className="mt-2 text-2xl font-black">One focused topic at a time</h2></div><select value={topic} onChange={(event) => setTopic(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"><option>All topics</option>{topics.map((item) => <option key={item}>{item}</option>)}</select></div></section>{current ? <section className="mt-6 grid gap-6 lg:grid-cols-[0.7fr_1.3fr]"><aside className="rounded-3xl border border-slate-200 bg-[#f4c66d] p-6 shadow-sm"><Sparkles className="size-7 text-[#79531c]" /><h2 className="mt-5 text-2xl font-black text-[#493318]">Village guide</h2><p className="mt-3 text-sm leading-relaxed text-[#62491f]">This challenge strengthens <strong>{current.concept}</strong>. A mistake opens a hint and a second chance.</p><p className="mt-8 rounded-2xl bg-white/50 p-4 text-sm text-[#62491f]"><strong>Difficulty {current.difficulty}/3</strong><br />Rewards come from understanding, not random clicks.</p></aside><div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">{phase === "learn" ? <><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Quick Learn · {current.topic}</p><h2 className="mt-4 text-3xl font-black">Before you answer...</h2><p className="mt-4 rounded-2xl bg-[#fff5dc] p-5 text-lg leading-relaxed text-slate-700">{current.quickLearn}</p><Button className="mt-7 gap-2" onClick={startChallenge}>Enter challenge <ArrowRight className="size-4" /></Button></> : <><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{current.topic}</p><h2 className="mt-3 text-2xl font-black leading-tight">{current.question}</h2></div>{phase === "feedback" ? isCorrect ? <CheckCircle2 className="size-8 shrink-0 text-emerald-600" /> : <XCircle className="size-8 shrink-0 text-amber-600" /> : null}</div><div className="mt-7 grid gap-3">{current.options.map((option) => <button key={option} type="button" disabled={phase === "feedback"} onClick={() => setSelected(option)} className={`rounded-2xl border p-4 text-left font-bold transition ${phase === "feedback" && option === current.correctAnswer ? "border-emerald-400 bg-emerald-50 text-emerald-800" : phase === "feedback" && selected === option ? "border-amber-400 bg-amber-50 text-amber-900" : selected === option ? "border-primary bg-primary/10 text-primary" : "border-slate-200 hover:border-primary/50 hover:bg-primary/5"}`}>{option}</button>)}</div>{phase === "feedback" ? <div className={`mt-6 rounded-2xl p-5 ${isCorrect ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-950"}`}><p className="font-black">{isCorrect ? `Correct. +${retryUsed ? 5 : 10} XP` : "Almost. Let’s learn from this."}</p>{!isCorrect && !retryUsed ? <p className="mt-2 text-sm font-semibold"><Lightbulb className="mr-1 inline size-4" /> Hint: {current.hint}</p> : null}<p className="mt-2 text-sm leading-relaxed">{current.explanation}</p></div> : null}<div className="mt-7 flex flex-wrap gap-3">{phase === "challenge" ? <Button disabled={!selected} onClick={checkAnswer}>Check answer</Button> : phase === "feedback" && !isCorrect && !retryUsed ? <Button onClick={retry} className="gap-2"><RefreshCcw className="size-4" /> Try once more</Button> : phase === "feedback" ? <Button disabled={saving} onClick={next}>{saving ? "Saving..." : challengeIndex === challenges.length - 1 ? "Finish quest" : "Next challenge"} <ArrowRight className="size-4" /></Button> : null}</div></>}</div></section> : <p className="mt-6 rounded-2xl bg-white p-6 text-slate-600">No challenges are available for this trail.</p>}</>;
}

function Stat({ icon: Icon, label, value }: { icon: typeof Star; label: string; value: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><Icon className="size-5 text-primary" /><p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>; }
function CompletionCard({ correct, completed, xp, topic, concepts, mistakes, onRestart }: { correct: number; completed: number; xp: number; topic: string; concepts: string[]; mistakes: string[]; onRestart: () => void }) { return <section className="mt-8 rounded-3xl border border-emerald-200 bg-white p-8 shadow-sm sm:p-10"><Trophy className="size-12 text-[#d79d2e]" /><h2 className="mt-5 text-3xl font-black">Learning Quest complete!</h2><p className="mt-2 text-slate-600">Your result is saved locally and can be revisited when you return to the game.</p><div className="mt-7 grid gap-3 sm:grid-cols-4"><Result label="Challenges" value={`${completed}`} /><Result label="Correct" value={`${correct}`} /><Result label="XP earned" value={`${xp}`} /><Result label="Topic" value={topic} /></div><div className="mt-7 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl bg-emerald-50 p-4"><p className="font-bold text-emerald-900">Concepts strengthened</p><p className="mt-2 text-sm text-emerald-800">{concepts.length ? concepts.join(" · ") : "Keep practicing to strengthen a concept."}</p></div><div className="rounded-2xl bg-amber-50 p-4"><p className="font-bold text-amber-900">Needs revision</p><p className="mt-2 text-sm text-amber-800">{mistakes.length ? `${mistakes.length} challenge${mistakes.length === 1 ? "" : "s"} to revisit in practice.` : "No missed challenges this run."}</p></div></div><div className="mt-7 flex flex-wrap gap-3"><Button onClick={onRestart}>Play another quest</Button><Button variant="outline" asChild><Link to="/app/subjects">Back to Learning Hub</Link></Button></div></section>; }
function Result({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 truncate text-xl font-black">{value}</p></div>; }
