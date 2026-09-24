import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  Camera,
  Headphones,
  LogOut,
  MicOff,
  Radio,
  Volume2,
  Volume,
} from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { liveLanguages } from "@/data/live-languages";
import { liveService, type LiveClass, type LiveMessage } from "@/lib/live.service";
import { supabase } from "@/integrations/supabase/client";
import { useLiveWebRTC } from "@/hooks/useLiveWebRTC";

const searchSchema = z.object({ lang: z.string().optional() });

export const Route = createFileRoute("/app/live/watch/$code")({
  validateSearch: searchSchema,
  loader: async ({ params }) => {
    try {
      const liveClass = await liveService.getByCode(params.code);
      return { liveClass, lookupError: null };
    } catch {
      return { liveClass: null, lookupError: "Could not load this class. Please try again." };
    }
  },
  component: StudentClassRoutePage,
});

function StudentClassRoutePage() {
  const { liveClass, lookupError } = Route.useLoaderData();
  const navigate = useNavigate();

  if (!liveClass) {
    return (
      <ClassAccessError
        message={lookupError ?? "Class not found. Please check your joining code."}
        onBack={() => void navigate({ to: "/app/live/join" })}
      />
    );
  }
  if (liveClass.status === "ended" || !liveClass.is_live) {
    return (
      <ClassAccessError
        message="This class is not currently live."
        onBack={() => void navigate({ to: "/app/live/join" })}
      />
    );
  }
  return <WatchClassPage liveClass={liveClass} />;
}

function ClassAccessError({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <AppShell>
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-lg rounded-2xl border border-border bg-card p-6 text-center shadow-card">
          <div className="flex items-center justify-center gap-2 text-destructive">
            <AlertCircle className="size-5" />
            <h1 className="font-semibold">Unable to join class</h1>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{message}</p>
          <Button variant="outline" className="mt-6 rounded-xl" onClick={onBack}>
            Return to join class
          </Button>
        </div>
      </main>
    </AppShell>
  );
}

function WatchClassPage({ liveClass }: { liveClass: LiveClass }) {
  const { lang } = Route.useSearch();
  const navigate = useNavigate();
  const [status, setStatus] = useState("Connecting to the classroom...");
  const [error, setError] = useState<string | null>(null);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionStatus, setCaptionStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [captions, setCaptions] = useState<Array<{ id: string; text: string }>>([]);
  const selected = liveLanguages.find((item) => item.id === lang);
  const media = useLiveWebRTC({ classId: liveClass.id, role: "student" });

  const enableTranslation = useCallback(() => {
    if (!selected) {
      setError("Choose a valid mother tongue from the join page.");
      return;
    }
    setError(null);
    setCaptionsEnabled(true);
  }, [selected]);

  useEffect(() => {
    if (!captionsEnabled || !selected) {
      setCaptionStatus("idle");
      return;
    }

    let active = true;
    const processedIds = new Set<string>();
    let translationQueue = Promise.resolve();

    const publishCaption = (message: LiveMessage) => {
      if (!active || processedIds.has(message.id)) return;
      processedIds.add(message.id);
      translationQueue = translationQueue
        .then(async () => {
          const text = await liveService.translateMessage(message, selected.id);
          if (!active) return;
          setCaptions((current) => [...current, { id: message.id, text }]);
        })
        .catch((translationError) => {
          if (!active) return;
          console.warn("[live-translation] finalized message translation failed", translationError);
          setCaptionStatus("error");
        });
    };

    const channel = supabase
      .channel(`live-messages-${liveClass.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_messages",
          filter: `class_id=eq.${liveClass.id}`,
        },
        (payload) => publishCaption(payload.new as LiveMessage),
      );

    setCaptionStatus("connecting");
    void liveService
      .listMessages(liveClass.id)
      .then((messages) => messages.forEach(publishCaption))
      .catch((loadError) => {
        if (active) {
          console.warn("[live-translation] could not load existing messages", loadError);
          setCaptionStatus("error");
        }
      });

    channel.subscribe((subscriptionStatus) => {
      if (!active) return;
      if (subscriptionStatus === "SUBSCRIBED") setCaptionStatus("connected");
      if (subscriptionStatus === "CHANNEL_ERROR" || subscriptionStatus === "TIMED_OUT") {
        setCaptionStatus("error");
      }
    });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [captionsEnabled, liveClass.id, selected]);

  useEffect(() => {
    if (media.classEnded) {
      toast.info("Class has ended.");
      void navigate({ to: "/app/live/join" });
    }
  }, [media.classEnded, navigate]);

  useEffect(() => {
    if (!selected) setError("Choose a valid mother tongue from the join page.");
    else setStatus("Connected live");
  }, [selected]);

  return (
    <AppShell>
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Live classroom · {liveClass.code}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">{liveClass.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {liveClass.subject} · Hearing in {selected?.label ?? "unknown language"}
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-2 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary">
              <Radio className="size-3.5" /> {status}
            </span>
          </div>
          {error && (
            <div className="mt-6 flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" /> {error}
            </div>
          )}
          <section className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="overflow-hidden rounded-xl bg-slate-950">
              <video
                ref={media.remoteVideoRef}
                autoPlay
                playsInline
                className="aspect-video w-full object-cover"
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Headphones className="size-4" /> Teacher audio
              </span>
              <span className="font-medium text-primary">
                {media.status === "connected"
                  ? "Connected"
                  : media.status === "reconnecting"
                    ? "Reconnecting..."
                    : "Connecting..."}
              </span>
            </div>
            {import.meta.env.DEV && (
              <p className="mt-2 text-xs text-muted-foreground">
                [DEBUG] Audio: {media.audioEnabled ? "✓ Enabled" : "✗ Disabled"} | Status:{" "}
                {media.status}
              </p>
            )}

            {!media.audioEnabled && (
              <div className="mt-4 flex items-center justify-between rounded-lg bg-yellow-50 p-3">
                <span className="text-sm text-yellow-800">
                  Audio may be muted due to browser restrictions
                </span>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => media.enableAudio()}
                  className="ml-2"
                >
                  <Volume className="size-4" /> Enable Audio
                </Button>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between rounded-lg bg-primary-soft p-3">
              <span className="text-sm text-primary">
                {captionStatus === "connected"
                  ? "Live translated captions connected"
                  : captionStatus === "connecting"
                    ? "Connecting translated captions..."
                    : captionStatus === "error"
                      ? "Translated captions temporarily unavailable"
                      : "Receive translated captions from the teacher"}
              </span>
              <Button
                size="sm"
                variant="default"
                onClick={enableTranslation}
                disabled={captionsEnabled && captionStatus !== "error"}
              >
                <Volume2 className="size-4" />{" "}
                {captionStatus === "connected" ? "Captions connected" : "Enable live captions"}
              </Button>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
                <MicOff className="size-4" />
              </span>
              <p className="text-sm text-muted-foreground">Student microphone is muted</p>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
                <Camera className="size-4" />
              </span>
              <p className="text-sm text-muted-foreground">Teacher camera and audio are live</p>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-accent/10 text-accent">
                <Headphones className="size-5" />
              </span>
              <div>
                <h2 className="font-semibold">Live translated captions</h2>
                <p className="text-sm text-muted-foreground">
                  Streaming translated audio and captions arrive while the teacher speaks.
                </p>
              </div>
            </div>
            <div className="mt-5 space-y-4">
              <p className="text-base font-medium">
                {captions.length > 0
                  ? captions.map((caption) => <span key={caption.id} className="block">{caption.text}</span>)
                  : captionsEnabled
                    ? captionStatus === "error"
                      ? "Translated captions are unavailable. Teacher audio remains connected."
                      : "Listening for finalized teacher utterances..."
                    : "Enable live captions to receive translated teacher utterances."}
              </p>
            </div>
            <Button
              variant="outline"
              className="mt-6 rounded-xl"
              onClick={() => void navigate({ to: "/app/live/join" })}
            >
              <LogOut className="size-4" /> Leave class
            </Button>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
