import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleGenAI } from "@google/genai";
import { createRealtimeTranslationToken } from "@/lib/realtime-translation.functions";

type Options = {
  sourceStream: MediaStream | null;
  targetLanguage: string | null;
  enabled: boolean;
  onTranslatedAudioStart?: () => void;
};

const LANG_NAMES: Record<string, string> = {
  en: "English",
  kn: "Kannada",
  hi: "Hindi",
  te: "Telugu",
  ta: "Tamil",
  ml: "Malayalam",
  mr: "Marathi",
  bn: "Bengali",
  ur: "Urdu",
};

export function useRealtimeTranslation({
  sourceStream,
  targetLanguage,
  enabled,
  onTranslatedAudioStart,
}: Options) {
  const sessionRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const nextTimeRef = useRef(0);
  const startedRef = useRef(false);

  const [status, setStatus] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState("");

  const stop = useCallback(() => {
    try { sessionRef.current?.close(); } catch {}
    sessionRef.current = null;
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch {} audioCtxRef.current = null; }
    if (micCtxRef.current) { try { micCtxRef.current.close(); } catch {} micCtxRef.current = null; }
    nextTimeRef.current = 0;
    startedRef.current = false;
    setStatus("idle");
  }, []);

  useEffect(() => {
    if (!enabled ||!sourceStream ||!targetLanguage) {
      stop();
      return;
    }

    let cancelled = false;

    const start = async () => {
      setStatus("connecting");
      setError(null);
      setCaption("");

      try {
        const result = await createRealtimeTranslationToken({
          data: targetLanguage as any,
        });

        const token = result?.token;
        if (!token || cancelled) return;

        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 24000,
        });
        audioCtxRef.current = audioCtx;
        await audioCtx.resume();

        const ai = new GoogleGenAI({
          apiKey: token,
          httpOptions: { apiVersion: "v1alpha" },
        });

        const targetName = LANG_NAMES[targetLanguage] || targetLanguage;

        const session = await (ai as any).live.connect({
          model: "gemini-2.5-flash-native-audio-preview-09-2025",
          config: {
            responseModalities: ["AUDIO"],
            systemInstruction: {
              parts: [
                {
                  text: `You are Vidya A.I. live translator. Translate EVERYTHING you hear to ${targetName} (${targetLanguage}). Only output translated speech in ${targetName}. Keep emotion.`,
                },
              ],
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: "Aoede" },
              },
            },
          },
          callbacks: {
            onopen: () => {
              if (!cancelled) setStatus("live");
            },
            onclose: (e: any) => {
              if (!cancelled && e?.code!== 1000) {
                setStatus("error");
                setError(`Disconnected (${e.code}): ${e.reason || ""}`);
              }
            },
            onerror: (e: any) => {
              if (!cancelled) {
                setStatus("error");
                setError(e?.message || "Connection failed");
              }
            },
            onmessage: (msg: any) => {
              if (cancelled) return;

              if (msg.serverContent?.outputTranscription?.text) {
                const txt = msg.serverContent.outputTranscription.text as string;
                setCaption((c) => `${c}${txt}`.slice(-1000));
              }

              const parts = msg.serverContent?.modelTurn?.parts || msg.serverContent?.parts || [];

              for (const p of parts) {
                const data = p.inlineData?.data;
                if (!data) continue;

                try {
                  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
                  const samples = Math.floor(bytes.length / 2);
                  if (samples === 0) continue;

                  const buffer = audioCtx.createBuffer(1, samples, 24000);
                  const ch = buffer.getChannelData(0) as Float32Array;
                  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

                  for (let i = 0; i < samples; i++) {
                    const val = view.getInt16(i * 2, true);
                    ch[i] = val / 0x8000;
                  }

                  const src = audioCtx.createBufferSource();
                  src.buffer = buffer;
                  src.connect(audioCtx.destination);

                  const startAt = Math.max(audioCtx.currentTime + 0.05, nextTimeRef.current);
                  src.start(startAt);
                  nextTimeRef.current = startAt + buffer.duration;

                  if (!startedRef.current) {
                    startedRef.current = true;
                    onTranslatedAudioStart?.();
                  }
                } catch {}
              }
            },
          },
        });

        sessionRef.current = session;

        // Mic -> Gemini
        const micCtx = new AudioContext({ sampleRate: 16000 });
        micCtxRef.current = micCtx;
        await micCtx.audioWorklet.addModule("/worklets/audio-processor.js");
        const micSrc = micCtx.createMediaStreamSource(sourceStream);
        const processor = new AudioWorkletNode(micCtx, "vidya-audio-processor", {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: 1,
          outputChannelCount: [1],
        });
        micSrc.connect(processor);
        processor.connect(micCtx.destination);

        processor.port.onmessage = (event: MessageEvent<Float32Array>) => {
          if (cancelled ||!sessionRef.current) return;

          const input = event.data;
          if (!input) return;

          const pcm = new Uint8Array(input.length * 2);
          const view = new DataView(pcm.buffer);

          for (let i = 0; i < input.length; i++) {
            const raw = input[i]?? 0;
            const s = Math.max(-1, Math.min(1, raw));
            view.setInt16(i * 2, s < 0? s * 0x8000 : s * 0x7fff, true);
          }

          let binary = "";
          for (let i = 0; i < pcm.length; i++) {
            binary += String.fromCharCode(pcm[i] as number);
          }
          const base64 = btoa(binary);

          try {
            session.sendRealtimeInput({
              audio: { data: base64, mimeType: "audio/pcm;rate=16000" },
            });
          } catch {}
        };
      } catch (e: any) {
        if (!cancelled) {
          setStatus("error");
          setError(e?.message || "Could not start");
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled, targetLanguage, sourceStream, stop, onTranslatedAudioStart]);

  return { status, error, caption, stop };
}