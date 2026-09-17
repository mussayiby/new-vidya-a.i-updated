import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Clapperboard,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  MessageSquareText,
  Radio,
  UserRound,
  X,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useApp } from "@/hooks/useApp";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/subjects", label: "Subjects", icon: BookOpen },
  { to: "/app/tutor", label: "AI Tutor", icon: MessageSquareText },
  { to: "/app/video-classroom", label: "AI Video Classroom", icon: Clapperboard },
  { to: "/app/live/join", label: "Live Class", icon: Radio },
  { to: "/app/progress", label: "Progress", icon: LineChart },
  { to: "/app/profile", label: "Profile", icon: UserRound },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, profile, signOut } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const initials =
    (profile.name || user?.name || "Student")
      .split(" ")
      .map((p) => p.charAt(0))
      .slice(0, 2)
      .join("")
      .toUpperCase() || "S";

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  const navList = (
    <nav className="flex flex-col gap-1.5">
      {nav.map((item) => {
        const active = pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5",
              active
                ? "border-primary/10 bg-primary-soft text-primary shadow-sm"
                : "text-muted-foreground hover:border-border hover:bg-card hover:text-foreground hover:shadow-sm",
            )}
          >
            <item.icon className="size-4.5 transition-transform duration-200 group-hover:scale-110" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo to="/app/dashboard" />
          <Button
            variant="ghost"
            size="icon"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
        {open && (
          <div className="animate-fade-up border-t border-border px-4 py-3">
            {navList}
            <Button variant="outline" className="mt-3 w-full rounded-xl" onClick={handleSignOut}>
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
        )}
      </header>

      <div className="mx-auto flex w-full max-w-[1480px]">
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-border/80 bg-background/70 px-5 py-6 lg:flex">
          <div className="flex items-center justify-between">
            <Logo to="/app/dashboard" />
            <span
              className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <span className="size-2 rounded-full bg-primary animate-pulse-red" />
            </span>
          </div>
          <p className="mt-10 px-3 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            Learning space
          </p>
          <div className="mt-3 flex-1">{navList}</div>
          <div className="rounded-2xl border border-border/80 bg-card p-3 shadow-card transition-shadow hover:shadow-float">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-brand text-sm font-bold text-primary-foreground shadow-sm">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {profile.name || user?.name || "Student"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {profile.email || user?.email || "Guest session"}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              className="mt-2 w-full justify-start rounded-xl text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary"
              onClick={handleSignOut}
            >
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
