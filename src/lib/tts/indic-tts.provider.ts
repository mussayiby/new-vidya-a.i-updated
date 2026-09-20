import type {
  TextToSpeechProvider,
  TtsSynthesisRequest,
  TtsSynthesisResult,
} from "@/lib/tts/tts.provider";

const SUPPORTED_LANGUAGES = new Set(["bn", "gu", "hi", "kn", "ml", "mr", "ta", "te"]);
const REQUEST_TIMEOUT_MS = 120_000;

function getIndicTtsUrl(): string {
  const processLike = globalThis as typeof globalThis & {
    process?: { env?: { INDIC_TTS_URL?: string } };
  };
  return processLike.process?.env?.INDIC_TTS_URL?.trim() || "http://127.0.0.1:8001";
}

function providerError(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return `Indic-TTS service failed (HTTP ${status}).`;
}

function normalizeIndicTtsText(text: string, language: string): string {
  if (language !== "hi") return text.trim();

  const digitMap: Record<string, string> = {
    "0": "०",
    "1": "१",
    "2": "२",
    "3": "३",
    "4": "४",
    "5": "५",
    "6": "६",
    "7": "७",
    "8": "८",
    "9": "९",
  };

  let normalized = text.trim();
  normalized = normalized.replace(/[0-9]/g, (digit) => digitMap[digit] ?? digit);
  normalized = normalized.replace(/\.(?=\s|$)/g, "।");
  return normalized;
}

function validateWav(audio: Uint8Array): void {
  if (audio.byteLength < 12 || audio.byteLength < 44) {
    throw new Error("Indic-TTS returned an invalid WAV payload.");
  }

  const riff = String.fromCharCode(...audio.slice(0, 4));
  const wave = String.fromCharCode(...audio.slice(8, 12));
  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error("Indic-TTS returned a non-WAV payload.");
  }

  const chunkId = String.fromCharCode(...audio.slice(12, 16));
  if (chunkId !== "fmt ") {
    throw new Error("Indic-TTS WAV format chunk is missing.");
  }

  const audioFormat = new DataView(audio.buffer, audio.byteOffset, audio.byteLength).getUint16(20, true);
  if (audioFormat !== 1) {
    throw new Error(`Indic-TTS WAV uses unsupported audio format ${audioFormat}.`);
  }

  const sampleRate = new DataView(audio.buffer, audio.byteOffset, audio.byteLength).getUint32(24, true);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error("Indic-TTS WAV header has invalid sample-rate metadata.");
  }

  const chunkSize = new DataView(audio.buffer, audio.byteOffset, audio.byteLength).getUint32(4, true);
  if (chunkSize <= 0 || audio.byteLength < chunkSize + 8) {
    throw new Error("Indic-TTS WAV structure is truncated or corrupt.");
  }
}

export function createIndicTtsProvider(): TextToSpeechProvider {
  return {
    async synthesize({
      text,
      language,
      segmentId,
    }: TtsSynthesisRequest): Promise<TtsSynthesisResult> {
      if (!SUPPORTED_LANGUAGES.has(language)) {
        throw new Error("Translated teacher voice is not currently available for this language.");
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const normalizedText = normalizeIndicTtsText(text, language);
      if (normalizedText !== text) {
        console.info("[Indic-TTS] normalized text before synthesis", {
          language,
          originalText: text,
          normalizedText,
        });
      }

      console.info("[Indic-TTS] synthesize request", {
        language,
        segmentId,
        text: normalizedText,
      });
      console.info("[Indic-TTS] synthesize request JSON", JSON.stringify({ text: normalizedText, language }));
      console.info("[Indic-TTS] synthesize request codepoints", {
        language,
        segmentId,
        codepoints: [...normalizedText.slice(0, 100)].map((char) => {
          const code = char.codePointAt(0);
          return `U+${code?.toString(16).toUpperCase().padStart(4, "0") ?? "00"}`;
        }),
      });

      try {
        let response: Response;
        try {
          response = await fetch(`${getIndicTtsUrl().replace(/\/$/, "")}/synthesize`, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({ text: normalizedText, language, speakerName: "female" }),
            signal: controller.signal,
          });
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            throw new Error("Indic-TTS service timed out while generating audio.");
          }
          throw new Error(
            `Indic-TTS service is unavailable: ${error instanceof Error ? error.message : "network error"}`,
          );
        }

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(providerError(payload, response.status));
        }

        const audio = new Uint8Array(await response.arrayBuffer());
        console.info("[Indic-TTS] synthesize response", {
          status: response.status,
          contentType: response.headers.get("content-type"),
          byteLength: audio.byteLength,
          wavHeaderPreview: Array.from(audio.slice(0, 12)).map((byte) => byte.toString(16).padStart(2, "0")).join(" "),
        });

        if (audio.byteLength === 0) throw new Error("Indic-TTS returned empty audio.");
        validateWav(audio);
        return {
          audio,
          mimeType: "audio/wav",
          provider: "ai4bharat-indic-tts-v1",
          language,
          cacheKey: `indic-tts-v1/${language}/${segmentId}`,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}
