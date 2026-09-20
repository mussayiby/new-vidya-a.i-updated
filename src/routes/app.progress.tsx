import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  GraduationCap,
  Lightbulb,
  Star,
  Trophy,
  Users,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { ProgressBar } from "@/components/ui-kit/ProgressBar";
import { lessonsBySubject, subjects } from "@/data/subjects";
import { useApp } from "@/hooks/useApp";
import { dashboardAnalyticsService } from "@/services/dashboard-analytics.service";
import { cn } from "@/lib/utils";

const fallbackChart = [
  { day: "Sep 10", score: 40 },
  { day: "Sep 11", score: 52 },
  { day: "Sep 12", score: 58 },
  { day: "Sep 13", score: 71 },
  { day: "Sep 14", score: 65 },
  { day: "Sep 15", score: 78 },
  { day: "Sep 16", score: 83 },
];

export const Route = createFileRoute("/app/progress")({
  head: () => ({
    meta: [
      { title: "Progress — Vidya A.I." },
      {
        name: "description",
        content:
          "Track weekly study time, quiz scores, subject completion and achievements on Vidya A.I.",
      },
      { property: "og:title", content: "Progress — Vidya A.I." },
      {
        property: "og:description",
        content: "Weekly study time, quiz scores and achievements.",
      },
    ],
  }),
  component: ProgressPage,
});

const difficultTopics = [["Fractions", "Mathematics", 52], ["Photosynthesis", "Science", 48], ["Grammar (Tenses)", "English", 45], ["LCM & HCF", "Mathematics", 42], ["Decimals", "Mathematics", 38]] as const;
const topStudents = [["Ayesha Khan", 96], ["Rohan Singh", 94], ["Zainab Fatima", 92], ["Arjun Menon", 90], ["Sneha Patil", 88]] as const;
const attentionStudents = [["Sameer Ali", "Mathematics", 42], ["Fatima Noor", "English", 48], ["Riya Sharma", "Science", 52], ["Adnan Khan", "Social Science", 55], ["Meera Joshi", "Mathematics", 58]] as const;
const activities = [["Sep 16, 10:24 AM", "Ayesha Khan", "Completed lesson: Photosynthesis", "Science", "100%"], ["Sep 16, 09:12 AM", "Rohan Singh", "Quiz: Fractions", "Mathematics", "80%"], ["Sep 16, 08:45 AM", "Zainab Fatima", "Completed lesson: Grammar (Tenses)", "English", "Completed"]] as const;

function ProgressPage() {
  const { user, profile, completedLessons } = useApp();
  const weeklyData = useMemo(() => user?.id ? dashboardAnalyticsService.getWeeklyBreakdown(user.id) : [], [user?.id]);
  const hoursThisWeek = useMemo(() => user?.id ? dashboardAnalyticsService.getHoursThisWeek(user.id) : 0, [user?.id]);
  const subjectRows = subjects.slice(0, 5).map((subject) => {
    const lessons = lessonsBySubject(subject.id);
    const completed = lessons.filter((lesson) => completedLessons.includes(lesson.id)).length;
    const score = lessons.length ? Math.round((completed / lessons.length) * 100) : 0;
    return { name: subject.name, score, count: `${completed}/${lessons.length}`, icon: subject.name.slice(0, 1), color: "bg-red-50 text-red-600" };
  });
  const chartData = weeklyData.some((item) => item.minutes > 0) ? weeklyData.map((item) => ({ day: item.day, score: Math.min(100, item.minutes * 2) })) : fallbackChart;
  const cards = [[Users, "Total Students", 48, "5", "up"], [BookOpen, "Lessons Completed", completedLessons.length || 186, "24%", "up"], [ClipboardCheck, "Quizzes Attempted", 342, "18%", "up"], [Star, "Average Score", "78%", "6%", "up"], [GraduationCap, "Active Students", 36, "8", "up"], [AlertTriangle, "Need Attention", 7, "3", "down"]] as const;

  return <AppShell><main className="min-w-0 bg-white px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
    <header className="flex flex-col gap-5 border-b border-slate-100 pb-7 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-3"><span className="mt-1 grid size-11 place-items-center rounded-2xl bg-red-50 text-primary"><BarChart3 className="size-5" /></span><div><h1 className="text-3xl font-bold tracking-tight text-slate-950">Progress</h1><p className="mt-1 text-sm text-slate-500">{hoursThisWeek} hours studied this week across your subjects.</p></div></div><div className="flex items-center gap-3 text-slate-500"><button className="grid size-10 place-items-center rounded-xl border border-slate-100 hover:bg-slate-50" aria-label="Notifications"><Activity className="size-4" /></button><span className="grid size-9 place-items-center rounded-full bg-red-100 text-xs font-bold text-primary">{profile.name?.slice(0, 2).toUpperCase() || "ST"}</span><span className="hidden text-sm font-semibold text-slate-800 sm:inline">{profile.name || "Student"}</span><ChevronDown className="size-4" /><button className="ml-2 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Last 7 Days <ChevronDown className="size-4" /></button></div></header>
    <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">{cards.map(([Icon, title, value, trend, direction]) => <KpiCard key={title} Icon={Icon} title={title} value={value} trend={trend} direction={direction} />)}</section>
    <section className="mt-6 grid gap-5 xl:grid-cols-[2fr_1fr_1fr]"><Panel title="Overall Performance Trend" icon={BarChart3} action="Last 7 Days" className="min-h-[350px]"><div className="mt-5 h-[245px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><defs><linearGradient id="progress-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e23737" stopOpacity={0.18} /><stop offset="100%" stopColor="#e23737" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#eef0f3" strokeDasharray="3 3" /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} dy={8} /><YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} /><Tooltip /><Area type="monotone" dataKey="score" stroke="#df3438" strokeWidth={2.5} fill="url(#progress-fill)" dot={{ r: 4, fill: "#fff", stroke: "#df3438", strokeWidth: 2 }} /></AreaChart></ResponsiveContainer></div><div className="mt-1 flex items-center gap-2 text-xs font-medium text-slate-500"><span className="size-2 rounded-full bg-primary" /> Average Score</div></Panel><Panel title="Subject-wise Performance" icon={BookOpen} action="View All"><div className="mt-5 space-y-4">{subjectRows.map((row) => <SubjectRow key={row.name} {...row} />)}</div></Panel><Panel title="Most Difficult Topics" icon={AlertTriangle} action="View All"><div className="mt-4 space-y-4">{difficultTopics.map(([topic, subject, score], index) => <div key={topic} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-red-50 text-xs font-bold text-primary">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><div><p className="truncate text-sm font-semibold text-slate-800">{topic}</p><p className="mt-0.5 text-xs text-slate-400">{subject}</p></div><span className="text-sm font-bold text-slate-700">{score}%</span></div><div className="mt-2 h-1.5 rounded-full bg-red-50"><div className="h-full rounded-full bg-red-400" style={{ width: `${score}%` }} /></div></div></div>)}</div></Panel></section>
    <section className="mt-5 grid gap-5 xl:grid-cols-3"><Panel title="Top Performing Students" icon={Trophy} action="View All"><div className="mt-4 divide-y divide-slate-100">{topStudents.map(([name, score], index) => <div key={name} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="grid size-7 place-items-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-600">{index + 1}</span><span className="flex-1 text-sm font-semibold text-slate-700">{name}</span><span className="text-sm font-bold text-emerald-600">{score}%</span><span className="w-16"><ProgressBar value={score} size="sm" /></span></div>)}</div></Panel><Panel title="Students Needing Attention" icon={Users} action="View All"><div className="mt-4 divide-y divide-slate-100">{attentionStudents.map(([name, subject, score]) => <div key={name} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="grid size-8 place-items-center rounded-full bg-red-50 text-xs font-bold text-red-500">{name.split(" ").map((part) => part[0]).join("")}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-700">{name}</p><p className="text-xs text-slate-400">{subject}</p></div><span className="text-sm font-bold text-red-500">{score}%</span></div>)}</div></Panel><Panel title="AI Insights" icon={Lightbulb}><div className="mt-4 space-y-2.5"><Insight icon={ArrowUpRight} tone="red" title="Mathematics performance improved by 12%" text="compared to last week. Great progress!" /><Insight icon={AlertTriangle} tone="amber" title="7 students are consistently scoring below 50%" text="in Fractions. Consider providing extra practice." /><Insight icon={Star} tone="green" title="Kannada shows the highest engagement" text="with 90% average score and 15 lessons completed." /><Insight icon={Brain} tone="blue" title="Students who completed video lessons" text="are 2.5x more likely to score above 80%." /></div></Panel></section>
    <Panel title="Recent Learning Activity" icon={Clock3} action="View All" className="mt-5"><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400"><th className="pb-3 font-semibold">Date &amp; Time</th><th className="pb-3 font-semibold">Student</th><th className="pb-3 font-semibold">Activity</th><th className="pb-3 font-semibold">Subject</th><th className="pb-3 text-right font-semibold">Score / Status</th></tr></thead><tbody>{activities.map(([date, student, activity, subject, score]) => <tr key={`${date}-${student}`} className="border-b border-slate-50 last:border-0"><td className="py-4 text-slate-500">{date}</td><td className="py-4 font-semibold text-slate-700">{student}</td><td className="py-4 text-slate-600">{activity}</td><td className="py-4 text-slate-500">{subject}</td><td className="py-4 text-right font-bold text-emerald-600">{score}</td></tr>)}</tbody></table></div></Panel>
  </main></AppShell>;
}

function KpiCard({ Icon, title, value, trend, direction }: { Icon: ComponentType<{ className?: string }>; title: string; value: string | number; trend: string; direction: "up" | "down" }) { const positive = direction === "up"; return <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.035)]"><div className="flex items-center justify-between"><span className="grid size-9 place-items-center rounded-xl bg-red-50 text-primary"><Icon className="size-4" /></span><span className={cn("flex items-center gap-0.5 text-xs font-bold", positive ? "text-emerald-600" : "text-red-500")}>{positive ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}{trend}</span></div><p className="mt-4 text-xs font-medium text-slate-500">{title}</p><p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{value}</p><p className="mt-1 text-[11px] text-slate-400">vs. last 7 days</p></div>; }

function Panel({ title, icon: Icon, action, children, className }: { title: string; icon: ComponentType<{ className?: string }>; action?: string; children: ReactNode; className?: string }) { return <section className={cn("rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.035)]", className)}><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-lg bg-red-50 text-primary"><Icon className="size-4" /></span><h2 className="text-sm font-bold text-slate-900">{title}</h2></div>{action ? <button className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">{action}{action === "Last 7 Days" ? <ChevronDown className="size-3.5" /> : null}</button> : null}</div>{children}</section>; }

function SubjectRow({ name, score, count, icon, color }: { name: string; score: number; count: string; icon: string; color: string }) { return <div><div className="flex items-center gap-2.5"><span className={cn("grid size-7 place-items-center rounded-lg text-xs font-bold", color)}>{icon}</span><span className="flex-1 text-sm font-semibold text-slate-700">{name}</span><span className="text-sm font-bold text-slate-800">{score}%</span><span className="w-12 text-right text-xs text-slate-400">{count}</span></div><div className="mt-2"><ProgressBar value={score} size="sm" /></div></div>; }

function Insight({ icon: Icon, tone, title, text }: { icon: ComponentType<{ className?: string }>; tone: "red" | "amber" | "green" | "blue"; title: string; text: string }) { const tones = { red: "bg-red-50 text-red-600", amber: "bg-amber-50 text-amber-600", green: "bg-emerald-50 text-emerald-600", blue: "bg-blue-50 text-blue-600" }; return <div className="flex gap-3 rounded-xl bg-slate-50/80 p-3"><span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", tones[tone])}><Icon className="size-3.5" /></span><p className="text-xs leading-5 text-slate-500"><strong className="font-bold text-slate-800">{title}</strong> {text}</p></div>; }
