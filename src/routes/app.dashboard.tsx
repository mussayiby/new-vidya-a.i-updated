import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Flame, GraduationCap, LogIn, Radio, Target, Timer } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatCard } from "@/components/ui-kit/StatCard";
import { ProgressBar } from "@/components/ui-kit/ProgressBar";
import { LessonCard } from "@/components/ui-kit/LessonCard";
import { upcomingTasks } from "@/data/dashboard";
import { getSubject, lessons } from "@/data/subjects";
import { useApp } from "@/hooks/useApp";
import { dashboardAnalyticsService } from "@/services/dashboard-analytics.service";
import { useMemo } from "react";

function getTimeAgoString(date: Date): string {
  const now = new Date();
  const secondsAgo = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (secondsAgo < 60) return "just now";
  const minutesAgo = Math.floor(secondsAgo / 60);
  if (minutesAgo < 60) return `${minutesAgo}m ago`;
  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24) return `${hoursAgo}h ago`;
  const daysAgo = Math.floor(hoursAgo / 24);
  return `${daysAgo}d ago`;
}

export const Route = createFileRoute("/app/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Vidya A.I." },
      {
        name: "description",
        content:
          "See your streak, daily goal, upcoming tasks and recommended lessons in your Vidya A.I. dashboard.",
      },
      { property: "og:title", content: "Dashboard — Vidya A.I." },
      {
        property: "og:description",
        content: "Your streak, daily goal, tasks and recommended lessons.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { profile, user, completedLessons } = useApp();
  
  // Compute real metrics from completion activity
  const analytics = useMemo(() => {
    if (!user?.id) return null;
    
    return {
      streak: dashboardAnalyticsService.getCurrentStreak(user.id),
      minutesToday: dashboardAnalyticsService.getMinutesToday(user.id),
      hoursThisWeek: dashboardAnalyticsService.getHoursThisWeek(user.id),
      recentEvents: dashboardAnalyticsService.getCompletionEvents(user.id).slice(0, 4),
    };
  }, [user?.id]);

  const recommended = lessons
    .filter((l) => !completedLessons.includes(l.id))
    .slice(0, 4);
  const hasProgress = completedLessons.length > 0;
  const dailyGoalMinutes = parseInt(profile.dailyMinutes, 10) || 30;
  const goalPercent =
    dailyGoalMinutes > 0 && analytics
      ? (analytics.minutesToday / dailyGoalMinutes) * 100
      : 0;

  return (
    <AppShell>
      <main className="animate-fade-up px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Your learning space</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Welcome back, {profile.name || user?.name || "Student"}
            </h1>
          </div>
          <Link to="/app/tutor" className="group inline-flex items-center gap-2 text-sm font-semibold text-primary">
            Ask your AI tutor <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {hasProgress
            ? "Your progress is being tracked from your actual activity."
            : "No learning activity has been recorded yet."}
        </p>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link to="/app/live/create" className="group rounded-2xl border border-primary/20 bg-gradient-to-br from-primary-soft to-card p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-float">
            <Radio className="size-5 text-primary transition-transform group-hover:scale-110" />
            <h2 className="mt-4 font-semibold">Create a live class</h2>
            <p className="mt-1 text-sm text-muted-foreground">Teach students in their own language.</p>
            <span className="mt-4 flex items-center gap-2 text-sm font-semibold text-primary">Start creating <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span>
          </Link>
          <Link to="/app/live/join" className="group rounded-2xl border border-border/80 bg-card p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-float">
            <LogIn className="size-5 text-primary transition-transform group-hover:scale-110" />
            <h2 className="mt-4 font-semibold">Join a live class</h2>
            <p className="mt-1 text-sm text-muted-foreground">Follow your teacher in your mother tongue.</p>
            <span className="mt-4 flex items-center gap-2 text-sm font-semibold text-primary">Enter class code <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span>
          </Link>
        </section>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Flame}
            label="Current streak"
            value={`${analytics?.streak ?? 0} days`}
            hint={analytics?.streak ?? 0 > 0 ? "Keep the streak alive" : "No streak recorded yet"}
            accent="warning"
          />
          <StatCard
            icon={Timer}
            label="Minutes today"
            value={`${analytics?.minutesToday ?? 0} / ${dailyGoalMinutes}`}
            hint={dailyGoalMinutes > 0 ? "Daily goal" : "Set a daily goal to begin tracking"}
          />
          <StatCard
            icon={GraduationCap}
            label="Lessons completed"
            value={`${completedLessons.length}`}
            hint={
              lessons.length > 0
                ? `out of ${lessons.length} lessons`
                : "No lessons completed yet"
            }
            accent="success"
          />
          <StatCard
            icon={Target}
            label="Hours this week"
            value={`${analytics?.hoursThisWeek ?? 0}h`}
            hint={analytics?.hoursThisWeek ?? 0 > 0 ? "Across all subjects" : "No study time recorded yet"}
            accent="accent"
          />
        </div>

        <section className="mt-6 rounded-2xl border border-border/80 bg-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Today's goal</h2>
            <span className="text-sm text-muted-foreground">
              {dailyGoalMinutes > 0
                ? `${analytics?.minutesToday ?? 0} of ${dailyGoalMinutes} min`
                : "No goal set yet"}
            </span>
          </div>
          <ProgressBar className="mt-3" value={Math.min(goalPercent, 100)} />
        </section>

        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-3">
          <section className="min-w-0 lg:col-span-2">
            <h2 className="font-semibold">Recommended lessons</h2>
            <div className="mt-3 space-y-3">
              {recommended.length > 0 ? (
                recommended.map((lesson) => (
                  <LessonCard
                    key={lesson.id}
                    lesson={lesson}
                    subjectName={getSubject(lesson.subjectId)?.name}
                    completed={completedLessons.includes(lesson.id)}
                  />
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-primary/20 bg-primary-soft/40 p-6 text-sm text-muted-foreground">
                  No lessons are available for recommendation yet.
                </div>
              )}
            </div>
          </section>

          <div className="space-y-6">
            <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-card">
              <h2 className="font-semibold">Upcoming</h2>
              {upcomingTasks.length > 0 ? (
                <ul className="mt-3 space-y-3">
                  {upcomingTasks.map((task) => (
                    <li key={task.id}>
                      <p className="text-sm font-medium">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.subject} · {task.due}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No upcoming tasks yet.</p>
              )}
            </section>

            <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-card">
              <h2 className="font-semibold">Recent activity</h2>
              {analytics?.recentEvents && analytics.recentEvents.length > 0 ? (
                <ul className="mt-3 space-y-3">
                  {analytics.recentEvents.map((event) => {
                    const lesson = lessons.find((l) => l.id === event.lessonId);
                    if (!lesson) return null;
                    const timeAgo = getTimeAgoString(new Date(event.completedAt));
                    return (
                      <li key={event.lessonId}>
                        <p className="text-sm font-medium">{lesson.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Completed · {timeAgo}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No study activity has been recorded yet.</p>
              )}
            </section>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
