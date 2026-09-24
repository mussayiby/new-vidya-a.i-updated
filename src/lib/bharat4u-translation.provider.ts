export type Bharat4uTranslationSegment = {
  segmentIndex: number;
  startTime: number;
  endTime: number;
  text: string;
};

function getBharat4UTranslationUrl(): string {
  const processLike = globalThis as typeof globalThis & {
    process?: {
      env?: {
        BHARAT4U_TRANSLATION_URL?: string;
        BHARAT4U_API_URL?: string;
        BHARAT4U_BASE_URL?: string;
      };
    };
  };

  const configured =
    processLike.process?.env?.BHARAT4U_TRANSLATION_URL?.trim() ||
    processLike.process?.env?.BHARAT4U_API_URL?.trim() ||
    processLike.process?.env?.BHARAT4U_BASE_URL?.trim() ||
    "http://127.0.0.1:8002";

  return configured.replace(/\/$/, "");
}

function normalizeTranslatedSegmentsPayload(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") {
    throw new Error("Bharat4U translation service returned an invalid payload.");
  }

  const candidate = payload as Record<string, unknown>;

  if (Array.isArray(candidate["translatedSegments"])) {
    const ids = candidate["translatedSegments"] as unknown[];
    const translated = ids
      .map((segment) => {
        if (!segment || typeof segment !== "object") return null;
        const item = segment as Record<string, unknown>;
        const text = typeof item["translatedText"] === "string" ? item["translatedText"].trim() : "";
        if (!text) return null;
        return text;
      })
      .filter((value): value is string => Boolean(value));

    if (translated.length > 0) return translated;
  }

  if (Array.isArray(candidate["translations"])) {
    const translated = (candidate["translations"] as unknown[])
      .map((segment) => {
        if (!segment || typeof segment !== "object") return null;
        const item = segment as Record<string, unknown>;
        const text = typeof item["text"] === "string" ? item["text"].trim() : "";
        return text || null;
      })
      .filter((value): value is string => Boolean(value));

    if (translated.length > 0) return translated;
  }

  if (typeof candidate.text === "string" && candidate.text.trim()) {
    return [candidate.text.trim()];
  }

  throw new Error("Bharat4U translation service returned no translated segments.");
}

export async function translateTranscriptWithBharat4U({
  transcript,
  from,
  to,
}: {
  transcript: Bharat4uTranslationSegment[];
  from: string;
  to: string;
}): Promise<string[]> {
  if (from === to) {
    return transcript.map((segment) => segment.text);
  }

  const endpointCandidates = [
    `${getBharat4UTranslationUrl()}/translate`,
    `${getBharat4UTranslationUrl()}/api/translate`,
    `${getBharat4UTranslationUrl()}/v1/translate`,
  ];

  let lastError: unknown;

  for (const endpoint of endpointCandidates) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          sourceLanguage: from,
          targetLanguage: to,
          segments: transcript.map((segment, segmentIndex) => ({
            segmentIndex,
            startTime: segment.startTime,
            endTime: segment.endTime,
            text: segment.text,
          })),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload && typeof payload === "object" && "detail" in payload && typeof payload.detail === "string"
            ? payload.detail
            : `Bharat4U translation failed (HTTP ${response.status}).`,
        );
      }

      const payload = await response.json().catch(() => null);
      const translatedSegments = normalizeTranslatedSegmentsPayload(payload);
      if (translatedSegments.length !== transcript.length) {
        throw new Error(
          `Bharat4U returned ${translatedSegments.length} translated segments for ${transcript.length} transcript segments.`,
        );
      }

      return translatedSegments;
    } catch (error) {
      lastError = error;
      console.warn("[Video Classroom Voice] Bharat4U translation request failed", {
        endpoint,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new Error(
    lastError instanceof Error
      ? `Bharat4U translation service is unavailable: ${lastError.message}`
      : "Bharat4U translation service is unavailable.",
  );
}
