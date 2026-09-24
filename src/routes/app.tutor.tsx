import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  LoaderCircle,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Sparkles,
  Volume2,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  classLevels,
  difficultyLevels,
  languages,
  learningStyles,
  studyTimes,
} from "@/data/catalog";
import { subjects } from "@/data/subjects";
import { useApp } from "@/hooks/useApp";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import type { TutorVisualResult } from "@/lib/tutor-chat.functions";
import { tutorPersistenceService } from "@/services/tutor-persistence.service";
import type { TutorMessage } from "@/services/tutor-persistence.types";
import { tutorService } from "@/services/tutor.service";

type TutorState = "ready" | "listening" | "thinking" | "speaking" | "error";
type TutorVisualState = TutorVisualResult | { status: "loading" };

const defaultTutorSetup = {
  name: "",
  classLevel: "",
  language: "en",
  subjects: [] as string[],
  goals: [] as string[],
  dailyMinutes: "30",
  difficulty: "intermediate",
  learningStyle: "visual",
};

function normalizeSpeechLanguage(language: string | undefined): string {
  const lang = (language ?? "en").toLowerCase();
  const map: Record<string, string> = {
    en: "en-US",
    hi: "hi-IN",
    bn: "bn-IN",
    mr: "mr-IN",
    te: "te-IN",
    ta: "ta-IN",
    gu: "gu-IN",
    kn: "kn-IN",
    ml: "ml-IN",
    pa: "pa-IN",
    or: "or-IN",
    as: "as-IN",
    ur: "ur-PK",
  };

  return map[lang] ?? "en-US";
}

export const Route = createFileRoute("/app/tutor")({
  head: () => ({
    meta: [
      { title: "AI Tutor — Vidya A.I." },
      {
        name: "description",
        content: "Ask your AI tutor in real time with voice input and spoken responses.",
      },
    ],
  }),
  component: TutorPage,
});

function TutorPage() {
  const { user, profile, ready, updateProfile } = useApp();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [lastAnswer, setLastAnswer] = useState<string | null>(null);
  const [visuals, setVisuals] = useState<Record<string, TutorVisualState>>({});
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [setupForm, setSetupForm] = useState(defaultTutorSetup);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ready) {
      setInitializing(true);
      return;
    }

    if (!user) {
      setInitializing(false);
      setShowSetup(false);
      return;
    }

    const profileReady = {
      name: profile.name || user.name || "",
      classLevel: profile.classLevel ?? "",
      language: profile.language || "en",
      subjects: profile.subjects ?? [],
      goals: profile.goals ?? [],
      dailyMinutes: profile.dailyMinutes || "30",
      difficulty: profile.difficulty || "intermediate",
      learningStyle: profile.learningStyle || "visual",
    };

    setSetupForm(profileReady);
    setShowSetup(!profile.onboardingComplete);
    setInitializing(false);
  }, [profile, ready, user]);

  const speech = useSpeechRecognition({
    lang: normalizeSpeechLanguage(profile.language || setupForm.language),
    onFinal: (text) => {
      const nextText = text.trim();
      if (!nextText) return;
      setDraft((current) => (current ? `${current} ${nextText}`.trim() : nextText));
      void handleSend(nextText);
    },
  });

  useEffect(() => {
    if (showSetup || !user?.id) {
      setConversationId(null);
      setMessages([]);
      return;
    }

    let active = true;

    async function loadConversation() {
      try {
        const conversations = await tutorPersistenceService.listConversations();
        const conversation =
          conversations[0] ?? (await tutorPersistenceService.createConversation());
        const loadedMessages = await tutorPersistenceService.listMessages(conversation.id);

        if (active) {
          setConversationId(conversation.id);
          setMessages(loadedMessages);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not load tutor conversation.");
        }
      }
    }

    void loadConversation();
    return () => {
      active = false;
    };
  }, [showSetup, user?.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, speech.interim, isSending]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  const state = useMemo<TutorState>(() => {
    if (error) return "error";
    if (speech.listening) return "listening";
    if (isSending) return "thinking";
    if (isSpeaking) return "speaking";
    return "ready";
  }, [error, isSending, isSpeaking, speech.listening]);

  const speakResponse = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setVoiceError("Voice playback is not supported in this browser. You can still read the answer.");
      return;
    }

    setVoiceError(null);
    setLastAnswer(text);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = normalizeSpeechLanguage(profile.language || setupForm.language);
    utterance.rate = 0.88;
    utterance.pitch = 1;
    utterance.volume = 1;

    const voices = window.speechSynthesis.getVoices();
    const languagePrefix =
      utterance.lang.toLowerCase().split("-")[0] ?? utterance.lang.toLowerCase();
    const preferredVoice = voices.find((voice) => {
      const voiceLang = voice.lang.toLowerCase();
      return voiceLang.startsWith(languagePrefix);
    });

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    window.speechSynthesis.cancel();
    utterance.onstart = () => {
      console.info("[Tutor TTS] playback started");
      setIsSpeaking(true);
    };
    utterance.onend = () => {
      console.info("[Tutor TTS] playback completed");
      setIsSpeaking(false);
    };
    utterance.onerror = (event) => {
      setIsSpeaking(false);
      if (event.error === "canceled" || event.error === "interrupted") return;
      console.error("[Tutor TTS] playback error", event.error);
      setVoiceError("Speech playback failed. You can still read the answer in the chat.");
    };
    console.info("[Tutor TTS] request started", {
      characters: text.length,
      language: utterance.lang,
    });
    try {
      window.speechSynthesis.speak(utterance);
    } catch (speechError) {
      console.error("[Tutor TTS] playback error", speechError);
      setIsSpeaking(false);
      setVoiceError("Speech playback failed. You can still read the answer in the chat.");
    }
  };

  const handleSend = async (textOverride?: string) => {
    if (!user) {
      setError("Please sign in before using the tutor.");
      return;
    }

    const nextPrompt = (textOverride ?? draft).trim();
    if (!nextPrompt) return;

    try {
      if (!conversationId) {
        throw new Error("Tutor conversation is not ready. Please try again.");
      }

      setDraft("");
      setIsSending(true);
      setError(null);
      setVoiceError(null);
      speech.stop();
      window.speechSynthesis?.cancel();
      setIsSpeaking(false);

      await tutorPersistenceService.addMessage(conversationId, "user", nextPrompt);
      const response = await tutorService.askWithMetadata({
        message: nextPrompt,
        conversationId,
        language: profile.language || setupForm.language,
      });

      const refreshedMessages = await tutorPersistenceService.listMessages(conversationId);
      setMessages(refreshedMessages);
      speakResponse(response.text);
      void loadTutorVisual(response.messageId, nextPrompt, response.text);
    } catch (err) {
      const message = err instanceof Error ? err.message : "The AI tutor request failed.";
      setError(message);
      if (conversationId) {
        try {
          setMessages(await tutorPersistenceService.listMessages(conversationId));
        } catch {
          // preserve the current state when a persistence refresh fails
        }
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleNewConversation = async () => {
    if (!user) return;
    try {
      const conversation = await tutorPersistenceService.createConversation();
      setConversationId(conversation.id);
      setMessages([]);
      setDraft("");
      setError(null);
      setVoiceError(null);
      setLastAnswer(null);
      setVisuals({});
      speech.stop();
      window.speechSynthesis?.cancel();
      setIsSpeaking(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a new conversation.");
    }
  };

  const toggleSpeechInput = async () => {
    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
      setIsSpeaking(false);
    }

    if (speech.listening) {
      speech.stop();
      return;
    }

    await speech.start();
  };

  const replayAnswer = () => {
    if (lastAnswer) speakResponse(lastAnswer);
  };

  const loadTutorVisual = async (messageId: string, question: string, answer: string) => {
    setVisuals((current) => ({ ...current, [messageId]: { status: "loading" } }));
    try {
      const result = await tutorService.generateVisual({
        question,
        answer,
        language: profile.language || setupForm.language,
      });
      setVisuals((current) => ({ ...current, [messageId]: result }));
    } catch (visualError) {
      console.warn("[Tutor Visual] client request failed", visualError);
      setVisuals((current) => ({
        ...current,
        [messageId]: { status: "unavailable", reason: "unknown" },
      }));
    }
  };

  const handleSetupSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const cleanName = setupForm.name.trim();
    const cleanSubjects = setupForm.subjects.filter(Boolean);
    const cleanGoals = setupForm.goals.filter(Boolean).map((goal) => goal.trim());

    if (!cleanName) {
      setSetupMessage("Please enter your name.");
      return;
    }
    if (!setupForm.classLevel) {
      setSetupMessage("Please select your class or grade.");
      return;
    }
    if (!setupForm.language) {
      setSetupMessage("Please choose your preferred language.");
      return;
    }
    if (cleanSubjects.length === 0) {
      setSetupMessage("Please select at least one subject.");
      return;
    }
    if (cleanGoals.length === 0) {
      setSetupMessage("Please tell us your learning goal.");
      return;
    }
    if (!setupForm.dailyMinutes) {
      setSetupMessage("Please choose your daily learning time.");
      return;
    }
    if (!setupForm.difficulty) {
      setSetupMessage("Please choose your difficulty level.");
      return;
    }
    if (!setupForm.learningStyle) {
      setSetupMessage("Please choose your learning style.");
      return;
    }

    try {
      setSetupMessage(null);
      await updateProfile({
        name: cleanName,
        email: profile.email || user?.email || "",
        classLevel: setupForm.classLevel,
        language: setupForm.language,
        subjects: cleanSubjects,
        goals: cleanGoals,
        dailyMinutes: setupForm.dailyMinutes,
        difficulty: setupForm.difficulty,
        learningStyle: setupForm.learningStyle,
        onboardingComplete: true,
      });
      setShowSetup(false);
    } catch (submitError) {
      setSetupMessage(
        submitError instanceof Error
          ? submitError.message
          : "Your tutor profile could not be saved.",
      );
    }
  };

  const stateLabel = {
    ready: "Ready",
    listening: "Listening",
    thinking: "Thinking",
    speaking: "Speaking",
    error: "Error",
  }[state];

  if (!ready || initializing) {
    return (
      <AppShell>
        <main className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3 text-sm text-muted-foreground shadow-card">
            <LoaderCircle className="size-4 animate-spin text-primary" />
            Loading your tutor profile...
          </div>
        </main>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell>
        <main className="mx-auto max-w-2xl px-4 py-10 text-center">
          <Card className="p-8">
            <h1 className="text-2xl font-bold">Sign in to access your tutor</h1>
            <p className="mt-2 text-muted-foreground">
              Your tutor profile and conversation are connected to your authenticated Supabase
              account.
            </p>
          </Card>
        </main>
      </AppShell>
    );
  }

  if (showSetup) {
    return (
      <AppShell>
        <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex items-center justify-center rounded-full bg-primary/10 p-3 text-primary">
              <Sparkles className="size-6" />
            </div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">VIDYA AI</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Meet Your AI Tutor
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              Let&apos;s personalize your learning experience before we open your AI tutor.
            </p>
          </div>

          <Card className="p-5 sm:p-8">
            <form className="space-y-6" onSubmit={handleSetupSubmit}>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="student-name">Student name</Label>
                  <Input
                    id="student-name"
                    value={setupForm.name}
                    onChange={(event) =>
                      setSetupForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Enter your full name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="class-level">Class / Grade</Label>
                  <select
                    id="class-level"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                    value={setupForm.classLevel}
                    onChange={(event) =>
                      setSetupForm((current) => ({ ...current, classLevel: event.target.value }))
                    }
                  >
                    <option value="">Select your class</option>
                    {classLevels.map((level) => (
                      <option key={level.id} value={level.id}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="preferred-language">Preferred language</Label>
                  <select
                    id="preferred-language"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                    value={setupForm.language}
                    onChange={(event) =>
                      setSetupForm((current) => ({ ...current, language: event.target.value }))
                    }
                  >
                    {languages.map((language) => (
                      <option key={language.id} value={language.id}>
                        {language.label} · {language.native}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="daily-minutes">Daily learning time</Label>
                  <select
                    id="daily-minutes"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                    value={setupForm.dailyMinutes}
                    onChange={(event) =>
                      setSetupForm((current) => ({ ...current, dailyMinutes: event.target.value }))
                    }
                  >
                    {studyTimes.map((time) => (
                      <option key={time.id} value={time.id}>
                        {time.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="subjects">Subjects</Label>
                  <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-muted/30 p-3">
                    {subjects.map((subject) => {
                      const active = setupForm.subjects.includes(subject.id);
                      return (
                        <button
                          key={subject.id}
                          type="button"
                          onClick={() => {
                            setSetupForm((current) => ({
                              ...current,
                              subjects: current.subjects.includes(subject.id)
                                ? current.subjects.filter((item) => item !== subject.id)
                                : [...current.subjects, subject.id],
                            }));
                          }}
                          className={[
                            "rounded-full border px-3 py-1.5 text-sm transition-colors",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-foreground hover:bg-muted",
                          ].join(" ")}
                          aria-pressed={active}
                        >
                          {subject.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="learning-goal">Learning goal</Label>
                  <Input
                    id="learning-goal"
                    value={setupForm.goals[0] ?? ""}
                    onChange={(event) =>
                      setSetupForm((current) => ({
                        ...current,
                        goals: event.target.value.trim() ? [event.target.value.trim()] : [],
                      }))
                    }
                    placeholder="For example: Understand photosynthesis deeply and score well in my next test"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="difficulty-level">Difficulty level</Label>
                  <select
                    id="difficulty-level"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                    value={setupForm.difficulty}
                    onChange={(event) =>
                      setSetupForm((current) => ({ ...current, difficulty: event.target.value }))
                    }
                  >
                    {difficultyLevels.map((level) => (
                      <option key={level.id} value={level.id}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="learning-style">Learning style</Label>
                  <select
                    id="learning-style"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                    value={setupForm.learningStyle}
                    onChange={(event) =>
                      setSetupForm((current) => ({ ...current, learningStyle: event.target.value }))
                    }
                  >
                    {learningStyles.map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {setupMessage ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {setupMessage}
                </div>
              ) : null}

              <Button type="submit" className="w-full gap-2 text-base" size="lg">
                Start My AI Tutor
                <ArrowRight className="size-4" />
              </Button>
            </form>
          </Card>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
              AI Assistant Tutor
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Your personal tutor</h1>
          </div>
          <Button variant="outline" onClick={() => void handleNewConversation()} className="gap-2">
            <RotateCcw className="size-4" /> New conversation
          </Button>
        </div>

        <Card className="overflow-hidden border border-primary/10 bg-gradient-to-br from-primary/5 via-background to-primary-soft/40 p-4 shadow-card sm:p-6">
          <div className="flex flex-col items-center gap-5 text-center">
            <div
              className={[
                "relative grid size-28 place-items-center rounded-full border-4 shadow-2xl transition-all duration-300 sm:size-32",
                state === "listening" && "border-primary bg-primary/10 scale-105",
                state === "thinking" && "border-primary bg-primary/10 scale-105 animate-orbit",
                state === "speaking" && "border-primary bg-primary/10 scale-105 animate-pulse-red",
                state === "error" && "border-red-500 bg-red-500/10",
                state === "ready" && "border-primary/50 bg-primary/10 animate-breathe",
              ].join(" ")}
              aria-live="polite"
              aria-label={`Tutor status: ${stateLabel}`}
            >
              <div className="rounded-full bg-background p-5 shadow-inner">
                {state === "listening" ? (
                  <Mic className="size-8 text-primary" />
                ) : state === "speaking" ? (
                  <Volume2 className="size-8 text-primary" />
                ) : state === "thinking" ? (
                  <LoaderCircle className="size-8 animate-spin text-primary" />
                ) : state === "error" ? (
                  <AlertTriangle className="size-8 text-red-600" />
                ) : (
                  <Sparkles className="size-8 text-primary" />
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Status
              </p>
              <h2 className="mt-2 text-2xl font-semibold">{stateLabel}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {state === "listening"
                  ? "Listening for your question..."
                  : state === "thinking"
                    ? "Processing your question with the AI tutor..."
                    : state === "speaking"
                      ? "The tutor is speaking the answer aloud."
                      : state === "error"
                        ? "The tutor hit an issue. Review the message and try again."
                        : `Hi ${profile.name || user.name || "Student"}! Ask anything.`}
              </p>
            </div>
          </div>
        </Card>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <Card className="min-h-[500px] p-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Conversation</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={speech.listening ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={() => void toggleSpeechInput()}
                  aria-label={speech.listening ? "Stop voice input" : "Start voice input"}
                  disabled={!speech.supported}
                >
                  {speech.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                  {speech.listening ? "Stop voice input" : "Start voice input"}
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[420px] px-4 py-4" ref={scrollRef}>
              <div className="space-y-3">
                {messages.length === 0 ? (
                  <div className="flex h-full min-h-[260px] items-center justify-center text-center text-sm text-muted-foreground">
                    No conversation yet. Ask the tutor a question to begin.
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div>
                        <div
                          className={[
                            "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm",
                            message.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground",
                          ].join(" ")}
                        >
                          {message.content}
                        </div>
                        {message.role === "assistant" ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-1 gap-2 px-2 text-xs text-muted-foreground"
                              onClick={() => speakResponse(message.content)}
                            >
                              <Volume2 className="size-3.5" /> Play answer
                            </Button>
                            {(() => {
                              const visual = visuals[message.id];
                              if (visual?.status === "loading") {
                                return (
                                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                    <LoaderCircle className="size-3.5 animate-spin" /> Creating a visual explanation...
                                  </div>
                                );
                              }
                              if (visual?.status === "unavailable") {
                                return (
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    Visual temporarily unavailable. Your answer and voice are still ready.
                                  </p>
                                );
                              }
                              if (visual?.status !== "ready") return null;
                              return (
                                <figure className="mt-2 max-w-xl overflow-hidden rounded-xl border bg-background">
                                  <img
                                    src={`data:${visual.image.mimeType};base64,${visual.image.data}`}
                                    alt={visual.purpose}
                                    className="h-auto w-full"
                                  />
                                  <figcaption className="border-t px-3 py-2 text-xs text-muted-foreground">
                                    {visual.purpose}
                                  </figcaption>
                                </figure>
                              );
                            })()}
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}

                {speech.interim ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
                      {speech.interim}
                    </div>
                  </div>
                ) : null}
              </div>
            </ScrollArea>

            <div className="border-t p-4">
              <div className="flex items-center gap-2">
                <Input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder="Ask a question..."
                  aria-label="Type a message to the tutor"
                />
                <Button
                  onClick={() => void handleSend()}
                  disabled={isSending || !draft.trim()}
                  className="gap-2"
                >
                  <Send className="size-4" /> Send
                </Button>
              </div>
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Voice
              </h3>
              <div className="mt-4 flex items-center justify-between rounded-2xl border bg-muted/30 p-3">
                <div>
                  <p className="text-sm font-medium">Microphone</p>
                  <p className="text-xs text-muted-foreground">
                    {speech.supported ? (speech.listening ? "Active" : "Ready") : "Not supported"}
                  </p>
                </div>
                <Button
                  variant={speech.listening ? "destructive" : "outline"}
                  size="icon"
                  className="rounded-full"
                  onClick={() => void toggleSpeechInput()}
                  aria-label={speech.listening ? "Stop microphone" : "Start microphone"}
                >
                  {speech.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                </Button>
              </div>
              {speech.supported ? (
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <div
                    className={[
                      "size-2.5 rounded-full",
                      speech.listening ? "bg-primary animate-pulse-red" : "bg-border",
                    ].join(" ")}
                  />
                  {speech.listening ? "Listening live" : "Ready to listen"}
                </div>
              ) : null}
            </Card>

            <Card className="p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Status details
              </h3>
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Tutor:</span> {stateLabel}
                </p>
                <p>
                  <span className="font-medium text-foreground">Voice:</span>{" "}
                  {isSpeaking ? "Playing" : voiceError ? "Playback unavailable" : "Ready"}
                </p>
                {lastAnswer && !isSpeaking ? (
                  <Button variant="outline" size="sm" className="gap-2" onClick={replayAnswer}>
                    <RotateCcw className="size-3.5" /> Play answer
                  </Button>
                ) : null}
                {error ? (
                  <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">
                    {error}
                  </p>
                ) : null}
                {voiceError ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-700">
                    {voiceError}
                  </p>
                ) : null}
                {speech.error ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-700">
                    {speech.error}
                  </p>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
