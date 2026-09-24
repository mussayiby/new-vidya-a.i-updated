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

function normalizeIndicTtsText(text: string, language: string, aggressive = false): string {
  if (language !== "hi") return text.trim();

  const digitWords = [
    "शून्य",
    "एक",
    "दो",
    "तीन",
    "चार",
    "पाँच",
    "छह",
    "सात",
    "आठ",
    "नौ",
  ];
  const digitMap: Record<string, string> = {
    "०": "शून्य",
    "१": "एक",
    "२": "दो",
    "३": "तीन",
    "४": "चार",
    "५": "पाँच",
    "६": "छह",
    "७": "सात",
    "८": "आठ",
    "९": "नौ",
  };

  let normalized = text.normalize("NFKC").trim();
  normalized = normalized.replace(/\.\s*\.+\s*।?/g, "।");
  normalized = normalized.replace(/(?:।\s*){2,}/g, "।");
  normalized = normalized.replace(/\.{2,}/g, "।");
  normalized = normalized.replace(/\.(?=\s|$)/g, "।");
  normalized = normalized.replace(/\bA\s*\/\s*B\b/gi, "ए और बी");
  normalized = normalized.replace(/[०-९]/g, (digit) => digitMap[digit] ?? digit);
  normalized = normalized.replace(/[0-9]/g, (digit) => digitWords[Number(digit)] ?? digit);
  normalized = normalized.replace(/[\[\]{}<>|~^*_+=\\]/g, " ");
  if (aggressive) normalized = normalized.replace(/[A-Za-z]+/g, " ");
  return normalized.replace(/\s+/g, " ").trim();
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
      try {
        let lastError: unknown;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const normalizedText = normalizeIndicTtsText(text, language, attempt === 1);
          if (normalizedText !== text || attempt > 0) {
            console.info("[Indic-TTS] normalized text before synthesis", {
              language,
              segmentId,
              attempt: attempt + 1,
              normalizedText,
            });
          }
          try {
            const response = await fetch(`${getIndicTtsUrl().replace(/\/$/, "")}/synthesize`, {
              method: "POST",
              headers: { "Content-Type": "application/json; charset=utf-8" },
              body: JSON.stringify({ text: normalizedText, language, speakerName: "female" }),
              signal: controller.signal,
            });
            if (!response.ok) {
              const payload = await response.json().catch(() => null);
              throw new Error(providerError(payload, response.status));
            }
            const audio = new Uint8Array(await response.arrayBuffer());
            if (audio.byteLength === 0) throw new Error("Indic-TTS returned empty audio.");
            validateWav(audio);
            return {
              audio,
              mimeType: "audio/wav",
              provider: "ai4bharat-indic-tts-v1",
              language,
              cacheKey: `indic-tts-v1/${language}/${segmentId}`,
            };
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
              throw new Error("Indic-TTS service timed out while generating audio.");
            }
            lastError = error;
            if (attempt === 0) {
              console.warn("[Indic-TTS] retrying segment with aggressive local normalization", {
                language,
                segmentId,
                error: error instanceof Error ? error.message : String(error),
              });
              continue;
            }
            throw new Error(
              `Indic-TTS service is unavailable: ${lastError instanceof Error ? lastError.message : "network error"}`,
            );
          }
        }
        throw lastError instanceof Error ? lastError : new Error("Indic-TTS synthesis failed.");
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}
