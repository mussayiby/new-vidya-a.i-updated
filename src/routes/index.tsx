import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bot,
  BookOpen,
  Languages,
  LineChart,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  MessageCircle,
  Headphones,
  Zap,
  Shield,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { languages } from "@/data/catalog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vidya A.I. — Learn in your language" },
      {
        name: "description",
        content:
          "AI-powered multilingual learning for students. Study in 13 Indian languages, get instant help from an AI tutor, track progress and reach your goals.",
      },
      { property: "og:title", content: "Vidya A.I. — Learn in your language" },
      {
        property: "og:description",
        content:
          "AI-powered multilingual learning for students. Study in 13 Indian languages, get instant help from an AI tutor, track progress and reach your goals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const features = [
  {
    icon: Languages,
    title: "Learn in your language",
    description:
      "Switch seamlessly between English, Hindi, Tamil, Telugu, Marathi, Bengali, Kannada, Malayalam, Gujarati, Punjabi, Odia, Assamese and Urdu.",
  },
  {
    icon: Bot,
    title: "AI tutor, always ready",
    description:
      "Ask doubts, get explanations, and explore concepts deeper with a tutor that adapts to your level and pace.",
  },
  {
    icon: Sparkles,
    title: "Personalized lessons",
    description:
      "Vidya A.I. tailizes content based on your class, goals, difficulty preference and learning style.",
  },
  {
    icon: LineChart,
    title: "Progress you can see",
    description:
      "Track weekly study time, completed lessons, quiz scores and streaks in a clear, visual dashboard.",
  },
  {
    icon: Headphones,
    title: "Voice-friendly learning",
    description:
      "Practice questions, listen to explanations and study hands-free with a voice-ready interface.",
  },
  {
    icon: Shield,
    title: "Safe student environment",
    description:
      "Built for students with a focused, distraction-free experience and no unnecessary data collection.",
  },
];

const steps = [
  {
    number: "01",
    title: "Create your profile",
    description:
      "Sign up in seconds, pick your class, preferred language and the subjects you want to master.",
  },
  {
    number: "02",
    title: "Start learning",
    description:
      "Choose a lesson, read clear explanations, view examples and complete bite-sized quizzes.",
  },
  {
    number: "03",
    title: "Ask the AI tutor",
    description:
      "Stuck on a concept? Get instant answers, simpler explanations or translations in your language.",
  },
  {
    number: "04",
    title: "Track and grow",
    description:
      "Watch your streak, weekly study time and subject progress grow as you keep learning.",
  },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6 lg:px-8">
          <Logo showTagline />
          <nav className="hidden items-center gap-6 text-sm font-semibold text-muted-foreground md:flex" aria-label="Primary">
            <a href="#features" className="transition-colors hover:text-primary">Platform</a>
            <a href="#how-it-works" className="transition-colors hover:text-primary">How it works</a>
            <Link to="/login" className="transition-colors hover:text-primary">Login</Link>
          </nav>
          <div className="flex items-center gap-2 md:gap-3">
            <Button variant="ghost" className="hidden sm:inline-flex" asChild>
              <Link to="/login">Login</Link>
            </Button>
            <Button asChild className="group">
              <Link to="/signup">Start learning <ArrowRight className="transition-transform group-hover:translate-x-1" /></Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-4 pt-16 pb-20 md:px-6 md:pt-24 md:pb-28 lg:px-8 lg:pt-32 lg:pb-36">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 right-[-8rem] h-[34rem] w-[34rem] rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute bottom-[-12rem] left-[-10rem] h-[28rem] w-[28rem] rounded-full bg-primary-soft blur-3xl" />
        </div>

        <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="animate-fade-up max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary-soft/60 px-4 py-1.5 text-sm font-semibold text-primary shadow-sm">
              <Sparkles className="size-4" />
              AI-powered learning for every student
            </div>

            <h1 className="mt-6 max-w-3xl text-5xl font-bold leading-[1.02] tracking-[-0.055em] text-foreground md:text-6xl lg:text-7xl">
              Every learner has a language that unlocks <span className="text-gradient-brand">understanding.</span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              Vidya A.I. brings lessons, voice support, progress, and a personal AI tutor into one calm learning space built around how you learn best.
            </p>

            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row">
              <Button size="lg" asChild className="group min-w-[180px]">
                <Link to="/signup">Start learning <ArrowRight className="transition-transform group-hover:translate-x-1" /></Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="min-w-[180px]">
                <Link to="/login">Meet your AI tutor</Link>
              </Button>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-primary" /> {languages.length} supported languages</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-primary" /> Voice-ready tutor</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-primary" /> Real progress tracking</span>
            </div>
          </div>

          <div className="relative mx-auto flex aspect-square w-full max-w-[30rem] items-center justify-center animate-fade-up [animation-delay:120ms]">
            <div className="absolute inset-[9%] rounded-full border border-primary/10 bg-white/70 shadow-float backdrop-blur-sm" />
            <div className="absolute inset-[17%] rounded-full border border-primary/15 animate-orbit" />
            <div className="absolute inset-[27%] rounded-full border border-dashed border-primary/20 animate-orbit [animation-direction:reverse] [animation-duration:12s]" />
            <div className="relative grid size-36 place-items-center rounded-[2rem] bg-gradient-brand text-primary-foreground shadow-float animate-breathe md:size-44">
              <div className="absolute inset-3 rounded-[1.4rem] border border-white/25" />
              <Sparkles className="size-14 md:size-16" />
            </div>
            <div className="absolute left-[8%] top-[23%] rounded-2xl border border-primary/10 bg-card px-3 py-2 text-xs font-semibold shadow-card">Learn at your pace</div>
            <div className="absolute bottom-[20%] right-[3%] rounded-2xl border border-primary/10 bg-card px-3 py-2 text-xs font-semibold shadow-card">Ask anything</div>
            <div className="absolute bottom-[8%] left-[20%] flex items-center gap-2 rounded-2xl border border-primary/10 bg-card px-3 py-2 text-xs font-semibold shadow-card"><span className="size-2 rounded-full bg-primary animate-pulse-red" /> AI is ready</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-secondary/40 px-4 py-20 md:px-6 md:py-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Everything you need to learn better
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              A complete learning toolkit built around how students actually study.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-2xl border border-border/80 bg-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/20 hover:shadow-float"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary transition-transform duration-300 group-hover:scale-110">
                  <feature.icon className="size-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="px-4 py-20 md:px-6 md:py-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              How Vidya A.I. works
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Go from signup to confident learning in four simple steps.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <div
                key={step.number}
                className="relative rounded-2xl border border-border/80 bg-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/20 hover:shadow-float"
              >
                <span className="text-4xl font-extrabold text-primary/20">
                  {step.number}
                </span>
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="px-4 pb-20 md:px-6 md:pb-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-brand px-6 py-12 text-center text-primary-foreground shadow-float md:px-12 md:py-16">
            <div className="relative z-10">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                Ready to start learning smarter?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg opacity-90">
                Join Vidya A.I. today and study any subject in the language you feel most comfortable with.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button
                  size="lg"
                  variant="secondary"
                  asChild
                  className="group min-w-[180px]"
                >
                  <Link to="/signup">
                    Create free account
                    <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 min-w-[180px]"
                >
                  <Link to="/login">Login</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card px-4 py-12 md:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <Logo />
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                AI-powered multilingual learning for students across India. Learn in the language you think in.
              </p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-foreground">Product</h4>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link to="/" className="hover:text-foreground">
                    Home
                  </Link>
                </li>
                <li>
                  <Link to="/app/dashboard" className="hover:text-foreground">
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link to="/app/tutor" className="hover:text-foreground">
                    AI Tutor
                  </Link>
                </li>
                <li>
                  <Link to="/app/subjects" className="hover:text-foreground">
                    Subjects
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-foreground">Account</h4>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link to="/login" className="hover:text-foreground">
                    Login
                  </Link>
                </li>
                <li>
                  <Link to="/signup" className="hover:text-foreground">
                    Sign up
                  </Link>
                </li>
                <li>
                  <Link to="/forgot-password" className="hover:text-foreground">
                    Forgot password
                  </Link>
                </li>
                <li>
                  <Link to="/app/profile" className="hover:text-foreground">
                    Settings
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-foreground">Contact</h4>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="inline-flex items-center gap-2">
                  <MessageCircle className="size-4" />
                  <span>help@vidyaai.example</span>
                </li>
                <li className="inline-flex items-center gap-2">
                  <Zap className="size-4" />
                  <span>Built for students, by students</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 text-sm text-muted-foreground md:flex-row">
            <p>© {new Date().getFullYear()} Vidya A.I. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <Link to="/" className="hover:text-foreground">
                Privacy Policy
              </Link>
              <Link to="/" className="hover:text-foreground">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
