import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clipboard,
  FileVideo,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  Play,
  Plus,
  Radio,
  Send,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/hooks/useApp";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { supabase } from "@/integrations/supabase/client";
import {
  attachVideoToClassroom,
  createVideoClassroom,
  evaluateVideoClassroomAnswer,
  getVideoClassroom,
  joinVideoClassroom,
  listMyVideoClassrooms,
  processVideoClassroom,
  publishVideoClassroom,
  saveVideoClassroomProgress,
} from "@/lib/video-classroom.functions";
import type {
  VideoClassroom,
  VideoClassroomAttempt,
  VideoClassroomCheckpoint,
  VideoClassroomDatabase,
} from "@/lib/video-classroom.types";
import { classLevels, languages, learningStyles } from "@/data/catalog";

export const Route = createFileRoute("/app/video-classroom")({
  head: () => ({
    meta: [
      { title: "AI Video Classroom — Vidya A.I." },
      { name: "description", content: "Create and join real multilingual AI video classrooms." },
    ],
  }),
  component: VideoClassroomPage,
});

const classroomDb =
  supabase as unknown as import("@supabase/supabase-js").SupabaseClient<VideoClassroomDatabase>;
const STORAGE_BUCKET = "ai-video-classrooms";
const MAX_VIDEO_SIZE = 500 * 1024 * 1024;
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;

type Mode = "home" | "create" | "join" | "manage" | "learn";

type ClassroomPayload = {
  classroom: VideoClassroom;
  topics: import("@/lib/video-classroom.types").VideoClassroomTopic[];
  checkpoints: VideoClassroomCheckpoint[];
  progress: import("@/lib/video-classroom.types").VideoClassroomProgress | null;
  videoUrl: string | null;
};

function VideoClassroomPage() {
  const { user, profile } = useApp();
  const [mode, setMode] = useState<Mode>("home");
  const [selectedClassroom, setSelectedClassroom] = useState<ClassroomPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!user) {
    return (
      <AppShell>
        <main className="mx-auto max-w-2xl px-4 py-12">
          <Card className="p-8 text-center">
            <LockKeyhole className="mx-auto size-10 text-primary" />
            <h1 className="mt-4 text-2xl font-bold">Sign in to use AI Video Classroom</h1>
            <p className="mt-2 text-muted-foreground">
              Classrooms, videos, and learning progress belong to authenticated accounts.
            </p>
          </Card>
        </main>
      </AppShell>
    );
  }

  const openClassroom = async (classroom: VideoClassroom) => {
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) throw new Error("Your session expired. Please sign in again.");
      setSelectedClassroom(
        await getVideoClassroom({ data: { accessToken, classroomId: classroom.id } }),
      );
      setMode("learn");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open the classroom.");
    }
  };

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {mode === "home" ? <ClassroomHome onModeChange={setMode} /> : null}
        {mode === "create" ? (
          <CreateClassroom
            onBack={() => setMode("home")}
            onCreated={(classroom) => void openClassroom(classroom)}
            setMessage={setMessage}
          />
        ) : null}
        {mode === "join" ? (
          <JoinClassroom
            onBack={() => setMode("home")}
            onJoined={(classroom) => void openClassroom(classroom)}
            setMessage={setMessage}
          />
        ) : null}
        {mode === "manage" ? (
          <ManageClassrooms
            onBack={() => setMode("home")}
            onOpen={(classroom) => void openClassroom(classroom)}
            setMessage={setMessage}
          />
        ) : null}
        {mode === "learn" && selectedClassroom ? (
          <ClassroomPlayer
            data={selectedClassroom}
            userId={user.id}
            profile={profile}
            onBack={() => setMode("home")}
            setMessage={setMessage}
          />
        ) : null}
        {message ? (
          <div
            className="fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-destructive/20 bg-card p-4 text-sm text-destructive shadow-float"
            role="alert"
          >
            <span className="flex-1">{message}</span>
            <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message">
              ×
            </button>
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}

function ClassroomHome({ onModeChange }: { onModeChange: (mode: Mode) => void }) {
  return (
    <div className="animate-fade-up">
      <div className="max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
          AI-powered digital classroom
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
          Teach once. Help every learner understand.
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Keep the original lesson as the source, then let Gemini build a multilingual teaching
          layer around real concepts and checkpoints.
        </p>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <ActionCard
          icon={Video}
          title="Create a classroom"
          description="Turn your lesson into an interactive multilingual AI classroom."
          action="Create Classroom"
          onClick={() => onModeChange("create")}
        />
        <ActionCard
          icon={Play}
          title="Join a classroom"
          description="Learn from your teacher in your own language."
          action="Join Classroom"
          onClick={() => onModeChange("join")}
        />
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => onModeChange("manage")} className="gap-2">
          <Radio className="size-4" /> My AI classrooms
        </Button>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
          <Sparkles className="size-4 text-primary" /> Real lesson analysis, not video translation
        </span>
      </div>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  description,
  action,
  onClick,
}: {
  icon: typeof Video;
  title: string;
  description: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <Card className="group border-border/80 p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/25 hover:shadow-float">
      <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary transition-transform group-hover:scale-110">
        <Icon className="size-6" />
      </span>
      <h2 className="mt-5 text-xl font-semibold">{title}</h2>
      <p className="mt-2 min-h-12 text-sm leading-relaxed text-muted-foreground">{description}</p>
      <Button className="mt-6 gap-2" onClick={onClick}>
        {action}
        <ArrowRight className="size-4" />
      </Button>
    </Card>
  );
}

function CreateClassroom({
  onBack,
  onCreated,
  setMessage,
}: {
  onBack: () => void;
  onCreated: (classroom: VideoClassroom) => void;
  setMessage: (message: string | null) => void;
}) {
  const [form, setForm] = useState({
    title: "",
    classLevel: "",
    subject: "",
    topic: "",
    chapter: "",
    teacherLanguage: "en",
    difficulty: "intermediate" as "beginner" | "intermediate" | "advanced",
    learningObjectives: "",
    teachingInstructions: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [stage, setStage] = useState("Preparing classroom");

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    if (!file) {
      setMessage("Choose a lesson video before creating the classroom.");
      return;
    }
    if (!VIDEO_TYPES.includes(file.type as (typeof VIDEO_TYPES)[number])) {
      setMessage("Upload an MP4, WebM, or MOV video.");
      return;
    }
    if (file.size > MAX_VIDEO_SIZE) {
      setMessage("The lesson video must be 500 MB or smaller.");
      return;
    }
    setWorking(true);
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      const user = session.data.session?.user;
      if (!accessToken || !user) throw new Error("Your session expired. Please sign in again.");
      const classroom = await createVideoClassroom({ data: { accessToken, ...form } });
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
      const videoPath = `${user.id}/${classroom.id}/${crypto.randomUUID()}-${safeName}`;
      setStage("Uploading lesson video");
      const { error: uploadError } = await classroomDb.storage
        .from(STORAGE_BUCKET)
        .upload(videoPath, file, { upsert: false, contentType: file.type, cacheControl: "3600" });
      if (uploadError) throw new Error(`Video upload failed: ${uploadError.message}`);
      setStage("Saving uploaded lesson");
      const attached = await attachVideoToClassroom({
        data: {
          accessToken,
          classroomId: classroom.id,
          videoPath,
          videoName: file.name,
          videoMimeType: file.type as (typeof VIDEO_TYPES)[number],
          videoSize: file.size,
        },
      });
      setStage("Analyzing lesson with Gemini");
      const processed = await processVideoClassroom({
        data: { accessToken, classroomId: attached.id },
      });
      setStage("Lesson analysis ready");
      onCreated(processed);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The classroom could not be created.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="animate-fade-up">
      <BackButton onClick={onBack} />
      <div className="mt-5 max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Teacher flow</p>
        <h1 className="mt-2 text-3xl font-bold">Create an AI Video Classroom</h1>
        <p className="mt-2 text-muted-foreground">
          The uploaded lesson becomes the source for a real Gemini-generated knowledge map.
        </p>
      </div>
      <Card className="mt-8 p-5 sm:p-8">
        <form className="grid gap-5 md:grid-cols-2" onSubmit={submit}>
          <Field
            label="Lesson title"
            value={form.title}
            onChange={(value) => update("title", value)}
            placeholder="Photosynthesis: how plants make food"
            required
          />
          <SelectField
            label="Class / Grade"
            value={form.classLevel}
            onChange={(value) => update("classLevel", value)}
            options={classLevels.map((item) => ({ value: item.id, label: item.label }))}
          />
          <Field
            label="Subject"
            value={form.subject}
            onChange={(value) => update("subject", value)}
            placeholder="Science"
            required
          />
          <Field
            label="Topic"
            value={form.topic}
            onChange={(value) => update("topic", value)}
            placeholder="Photosynthesis"
            required
          />
          <Field
            label="Chapter (optional)"
            value={form.chapter}
            onChange={(value) => update("chapter", value)}
            placeholder="Plant life"
          />
          <SelectField
            label="Original teaching language"
            value={form.teacherLanguage}
            onChange={(value) => update("teacherLanguage", value)}
            options={languages.map((item) => ({
              value: item.id,
              label: `${item.label} · ${item.native}`,
            }))}
          />
          <SelectField
            label="Difficulty"
            value={form.difficulty}
            onChange={(value) => update("difficulty", value as typeof form.difficulty)}
            options={[
              { value: "beginner", label: "Beginner" },
              { value: "intermediate", label: "Intermediate" },
              { value: "advanced", label: "Advanced" },
            ]}
          />
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="learning-objectives">Learning objectives</Label>
            <Textarea
              id="learning-objectives"
              value={form.learningObjectives}
              onChange={(event) => update("learningObjectives", event.target.value)}
              placeholder="Students should understand how plants make food."
              required
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="teaching-instructions">
              Additional teaching instructions (optional)
            </Label>
            <Textarea
              id="teaching-instructions"
              value={form.teachingInstructions}
              onChange={(event) => update("teachingInstructions", event.target.value)}
              placeholder="Use simple real-life examples and check common misconceptions."
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="classroom-video">Lesson video</Label>
            <label
              htmlFor="classroom-video"
              className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-primary-soft/40 px-5 py-8 text-center transition hover:border-primary hover:bg-primary-soft"
            >
              <Upload className="size-7 text-primary" />
              <span className="mt-3 font-semibold">Choose a video</span>
              <span className="mt-1 text-xs text-muted-foreground">
                MP4, WebM, or MOV · up to 500 MB
              </span>
              <input
                id="classroom-video"
                type="file"
                accept={VIDEO_TYPES.join(",")}
                className="sr-only"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            {file ? (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm">
                <FileVideo className="size-5 text-primary" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </span>
              </div>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3 md:col-span-2">
            <span className="text-sm text-muted-foreground">
              {working ? stage : "Nothing is processed until you submit."}
            </span>
            <Button type="submit" disabled={working} className="gap-2">
              {working ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {working ? stage : "Create Classroom"}
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}

function ManageClassrooms({
  onBack,
  onOpen,
  setMessage,
}: {
  onBack: () => void;
  onOpen: (classroom: VideoClassroom) => void;
  setMessage: (message: string | null) => void;
}) {
  const [classrooms, setClassrooms] = useState<VideoClassroom[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) throw new Error("Your session expired. Please sign in again.");
      setClassrooms(await listMyVideoClassrooms({ data: { accessToken } }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load classrooms.");
    } finally {
      setLoading(false);
    }
  }, [setMessage]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="animate-fade-up">
      <BackButton onClick={onBack} />
      <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
            Teacher dashboard
          </p>
          <h1 className="mt-2 text-3xl font-bold">My AI classrooms</h1>
        </div>
        <Button className="gap-2" onClick={onBack}>
          <Plus className="size-4" /> Create classroom
        </Button>
      </div>
      {loading ? (
        <LoadingState label="Loading your classrooms" />
      ) : classrooms.length === 0 ? (
        <EmptyState label="No classrooms yet. Create a real lesson classroom to begin." />
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {classrooms.map((classroom) => (
            <Card
              key={classroom.id}
              className="p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-float"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                    {classroom.status}
                  </p>
                  <h2 className="mt-2 text-lg font-semibold">{classroom.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {classroom.class_level} · {classroom.subject} · {classroom.topic}
                  </p>
                </div>
                <span
                  className={
                    classroom.published
                      ? "rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary"
                      : "rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground"
                  }
                >
                  {classroom.published ? "Published" : "Private"}
                </span>
              </div>
              <div className="mt-5 flex items-center justify-between">
                <span className="font-mono text-sm text-primary">{classroom.code}</span>
                <Button variant="outline" size="sm" onClick={() => onOpen(classroom)}>
                  Open
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function JoinClassroom({
  onBack,
  onJoined,
  setMessage,
}: {
  onBack: () => void;
  onJoined: (classroom: VideoClassroom) => void;
  setMessage: (message: string | null) => void;
}) {
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("en");
  const [learningStyle, setLearningStyle] = useState("visual");
  const [preference, setPreference] = useState("");
  const [working, setWorking] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorking(true);
    setMessage(null);
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) throw new Error("Your session expired. Please sign in again.");
      const classroom = await joinVideoClassroom({
        data: { accessToken, code, language, learningStyle, learningPreference: preference },
      });
      onJoined(classroom);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not join this classroom.");
    } finally {
      setWorking(false);
    }
  };
  return (
    <section className="mx-auto max-w-xl animate-fade-up">
      <BackButton onClick={onBack} />
      <Card className="mt-8 p-6 sm:p-8">
        <div className="text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
            <Play className="size-6" />
          </span>
          <h1 className="mt-4 text-2xl font-bold">Join AI Classroom</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter a real code shared by your teacher, then choose how you learn.
          </p>
        </div>
        <form className="mt-8 space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="classroom-code">Classroom code</Label>
            <Input
              id="classroom-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="VIDYA-XXXXXX"
              pattern="VIDYA-[A-Z0-9]{6}"
              required
            />
          </div>
          <SelectField
            label="Learning language"
            value={language}
            onChange={setLanguage}
            options={languages.map((item) => ({
              value: item.id,
              label: `${item.label} · ${item.native}`,
            }))}
          />
          <SelectField
            label="Learning style"
            value={learningStyle}
            onChange={setLearningStyle}
            options={learningStyles.map((item) => ({ value: item.id, label: item.label }))}
          />
          <div className="space-y-2">
            <Label htmlFor="learning-preference">Learning preference (optional)</Label>
            <Input
              id="learning-preference"
              value={preference}
              onChange={(event) => setPreference(event.target.value)}
              placeholder="Anything your AI teacher should know"
            />
          </div>
          <Button className="w-full gap-2" disabled={working}>
            {working ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <ArrowRight className="size-4" />
            )}
            Join Classroom
          </Button>
        </form>
      </Card>
    </section>
  );
}

function ClassroomPlayer({
  data,
  userId,
  profile,
  onBack,
  setMessage,
}: {
  data: ClassroomPayload;
  userId: string;
  profile: ReturnType<typeof import("@/hooks/useApp").useApp>["profile"];
  onBack: () => void;
  setMessage: (message: string | null) => void;
}) {
  const [classroomData, setClassroomData] = useState(data);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [activeCheckpoint, setActiveCheckpoint] = useState<VideoClassroomCheckpoint | null>(null);
  const [answer, setAnswer] = useState("");
  const [attempt, setAttempt] = useState<VideoClassroomAttempt | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const handledCheckpoints = useRef(new Set<string>());
  const lastSavedAt = useRef(0);
  const checkpoints = useMemo(
    () => [...classroomData.checkpoints].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds),
    [classroomData.checkpoints],
  );

  const speech = useSpeechRecognition({
    lang: profile.language === "en" ? "en-US" : `${profile.language}-IN`,
    onFinal: (text) => setAnswer((current) => `${current} ${text}`.trim()),
  });

  useEffect(() => {
    if (classroomData.progress?.last_position_seconds && videoRef.current)
      videoRef.current.currentTime = classroomData.progress.last_position_seconds;
  }, [classroomData.progress?.last_position_seconds]);

  const persistPosition = async (position: number, completed = false) => {
    const now = Date.now();
    if (!completed && now - lastSavedAt.current < 5000) return;
    lastSavedAt.current = now;
    const session = await supabase.auth.getSession();
    const accessToken = session.data.session?.access_token;
    if (!accessToken) return;
    try {
      await saveVideoClassroomProgress({
        data: {
          accessToken,
          classroomId: data.classroom.id,
          checkpointId: activeCheckpoint?.id ?? null,
          lastPositionSeconds: position,
          completed,
          timeSpentSeconds: 0,
        },
      });
    } catch {
      /* playback should remain usable if a background save fails */
    }
  };

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const next = checkpoints.find(
      (checkpoint) =>
        !handledCheckpoints.current.has(checkpoint.id) &&
        video.currentTime >= checkpoint.timestamp_seconds,
    );
    if (next) {
      handledCheckpoints.current.add(next.id);
      video.pause();
      setActiveCheckpoint(next);
      setAttempt(null);
      setAnswer("");
      void persistPosition(video.currentTime);
    } else void persistPosition(video.currentTime);
  };

  const evaluate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCheckpoint || !answer.trim()) return;
    setEvaluating(true);
    setMessage(null);
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) throw new Error("Your session expired. Please sign in again.");
      const result = await evaluateVideoClassroomAnswer({
        data: {
          accessToken,
          classroomId: data.classroom.id,
          checkpointId: activeCheckpoint.id,
          answer,
          language: profile.language,
        },
      });
      setAttempt(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not evaluate the answer.");
    } finally {
      setEvaluating(false);
    }
  };

  const continueLesson = () => {
    setActiveCheckpoint(null);
    setAttempt(null);
    setAnswer("");
    videoRef.current?.play().catch(() => undefined);
  };

  const refreshClassroom = async () => {
    const session = await supabase.auth.getSession();
    const accessToken = session.data.session?.access_token;
    if (!accessToken) throw new Error("Your session expired. Please sign in again.");
    setClassroomData(
      await getVideoClassroom({ data: { accessToken, classroomId: data.classroom.id } }),
    );
  };

  const startProcessing = async () => {
    setProcessing(true);
    setMessage(null);
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) throw new Error("Your session expired. Please sign in again.");
      await processVideoClassroom({ data: { accessToken, classroomId: data.classroom.id } });
      await refreshClassroom();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The lesson analysis failed.");
      await refreshClassroom().catch(() => undefined);
    } finally {
      setProcessing(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    setMessage(null);
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) throw new Error("Your session expired. Please sign in again.");
      await publishVideoClassroom({ data: { accessToken, classroomId: data.classroom.id } });
      await refreshClassroom();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The classroom could not be published.");
    } finally {
      setPublishing(false);
    }
  };

  const isTeacher = data.classroom.teacher_id === userId;

  return (
    <section className="animate-fade-up">
      <BackButton onClick={onBack} />
      <div className="mt-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
            AI Video Classroom
          </p>
          <h1 className="mt-2 text-3xl font-bold">{classroomData.classroom.title}</h1>
          <p className="mt-2 text-muted-foreground">
            {classroomData.classroom.class_level} · {classroomData.classroom.subject} ·{" "}
            {classroomData.classroom.topic}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-full bg-primary-soft px-4 py-2 text-sm font-semibold text-primary">
            {classroomData.classroom.code}
          </span>
          {isTeacher && classroomData.classroom.status !== "ready" ? (
            <Button
              onClick={() => void startProcessing()}
              disabled={processing || !classroomData.classroom.video_path}
              className="gap-2"
            >
              {processing ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {processing ? "Analyzing lesson" : "Generate AI Classroom"}
            </Button>
          ) : null}
          {isTeacher &&
          classroomData.classroom.status === "ready" &&
          !classroomData.classroom.published ? (
            <Button onClick={() => void publish()} disabled={publishing} className="gap-2">
              {publishing ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              {publishing ? "Publishing" : "Publish Classroom"}
            </Button>
          ) : null}
        </div>
      </div>
      {isTeacher && classroomData.classroom.status !== "ready" ? (
        <Card className="mt-6 border-primary/15 bg-primary-soft/40 p-5">
          <p className="text-sm font-semibold text-primary">
            {classroomData.classroom.status_message ??
              "Upload a lesson and generate its knowledge map."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Processing uses the real uploaded video and Gemini analysis. Exact progress is not shown
            because the backend reports stages, not fabricated percentages.
          </p>
        </Card>
      ) : null}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <Card className="overflow-hidden p-0 shadow-card">
          <div className="aspect-video bg-black">
            {classroomData.videoUrl ? (
              <video
                ref={videoRef}
                className="h-full w-full"
                controls
                playsInline
                onTimeUpdate={onTimeUpdate}
                onPause={() => void persistPosition(videoRef.current?.currentTime ?? 0)}
                onEnded={() => void persistPosition(videoRef.current?.currentTime ?? 0, true)}
                src={classroomData.videoUrl}
              />
            ) : (
              <div className="grid h-full place-items-center text-white">
                Lesson video is not available.
              </div>
            )}
          </div>
          <div className="border-t p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">
                {activeCheckpoint ? "Checkpoint reached" : "Lesson in progress"}
              </span>
              <span className="text-muted-foreground">{checkpoints.length} checkpoints</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-primary/10">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${classroomData.progress?.completed ? 100 : activeCheckpoint ? Math.min(95, ((activeCheckpoint.checkpoint_index + 1) / Math.max(checkpoints.length, 1)) * 100) : 8}%`,
                }}
              />
            </div>
          </div>
        </Card>
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquareText className="size-4 text-primary" /> Learning map
            </div>
            <div className="mt-4 space-y-3">
              {classroomData.topics.map((topic) => (
                <div key={topic.id} className="rounded-xl border border-border p-3">
                  <p className="text-sm font-semibold">{topic.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {Math.floor(topic.start_time / 60)}:
                    {String(Math.floor(topic.start_time % 60)).padStart(2, "0")} · {topic.summary}
                  </p>
                </div>
              ))}
            </div>
          </Card>
          <Card className="border-primary/15 bg-primary-soft/40 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">AI Teacher</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Gemini can explain this lesson in {profile.language}. A photorealistic avatar provider
              is not configured in this project, so no fake avatar is shown.
            </p>
          </Card>
        </div>
      </div>
      {activeCheckpoint ? (
        <Card className="mt-6 border-primary/20 p-5 shadow-float sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            Check your understanding
          </p>
          <h2 className="mt-2 text-2xl font-bold">{activeCheckpoint.question}</h2>
          {attempt ? (
            <div className="mt-5 rounded-xl border border-primary/15 bg-primary-soft p-4">
              <p className="font-semibold capitalize text-primary">{attempt.result}</p>
              <p className="mt-2 text-sm leading-relaxed">{attempt.feedback}</p>
              {attempt.missing_concept ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Missing concept: {attempt.missing_concept}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={continueLesson} className="gap-2">
                  <Play className="size-4" /> Continue lesson
                </Button>
                {attempt.next_action === "remediate" ? (
                  <p className="flex items-center text-sm text-muted-foreground">
                    Review the explanation above, then continue when ready.
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <form className="mt-5" onSubmit={evaluate}>
              <Textarea
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Explain your answer in your own words..."
                required
              />
              <div className="mt-3 flex flex-wrap gap-3">
                <Button type="submit" disabled={evaluating || !answer.trim()} className="gap-2">
                  {evaluating ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  {evaluating ? "Evaluating" : "Submit answer"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => (speech.listening ? speech.stop() : void speech.start())}
                  disabled={!speech.supported}
                  className="gap-2"
                >
                  <MessageSquareText className="size-4" />
                  {speech.listening ? "Stop voice" : "Answer by voice"}
                </Button>
              </div>
              {speech.error ? (
                <p className="mt-3 text-sm text-destructive">{speech.error}</p>
              ) : null}
            </form>
          )}
        </Card>
      ) : null}
    </section>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" onClick={onClick} className="gap-2">
      <ArrowLeft className="size-4" /> Back
    </Button>
  );
}
function LoadingState({ label }: { label: string }) {
  return (
    <div className="mt-8 flex items-center justify-center gap-3 rounded-2xl border border-border bg-card p-10 text-muted-foreground">
      <LoaderCircle className="size-5 animate-spin text-primary" />
      {label}
    </div>
  );
}
function EmptyState({ label }: { label: string }) {
  return (
    <div className="mt-8 rounded-2xl border border-dashed border-primary/20 bg-primary-soft/30 p-10 text-center text-muted-foreground">
      {label}
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}
function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
