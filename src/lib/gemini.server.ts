import { GoogleGenAI } from "@google/genai";

type ServerProcess = {
  env?: {
    GEMINI_API_KEY?: string;
    AI_API_KEY?: string;
    GEMINI_VIDEO_PRIMARY_MODEL?: string;
    GEMINI_VIDEO_FALLBACK_MODEL?: string;
    GEMINI_VIDEO_FALLBACK_MODEL_2?: string;
    GEMINI_VIDEO_MODEL?: string;
  };
};

function serverProcess(): ServerProcess | undefined {
  return (globalThis as typeof globalThis & { process?: ServerProcess }).process;
}

function readEnvList(
  env: Record<string, string | undefined> | undefined = serverProcess()?.env,
  ...names: string[]
): string[] {
  const values = names.flatMap((name) => {
    const rawValue = env?.[name];

    return (rawValue ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  });

  return [...new Set(values)];
}

export function getGeminiApiKey(): string | undefined {
  return (
    serverProcess()?.env?.GEMINI_API_KEY?.trim() ||
    serverProcess()?.env?.AI_API_KEY?.trim() ||
    undefined
  );
}

export function getGeminiVideoModelCandidates(
  env: Record<string, string | undefined> | undefined = serverProcess()?.env,
): string[] {
  const configured = readEnvList(
    env,
    "GEMINI_VIDEO_PRIMARY_MODEL",
    "GEMINI_VIDEO_FALLBACK_MODEL",
    "GEMINI_VIDEO_FALLBACK_MODEL_2",
    "GEMINI_VIDEO_MODEL",
  );

  if (configured.length > 0) {
    return configured.filter(
      (model) =>
        model === "gemini-3.5-flash-lite" ||
        model === "gemini-3.5-flash",
    );
  }

  return [
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
  ];
}

export async function getAvailableGeminiVideoModels(
  client: GoogleGenAI = createGeminiClient(),
  requestedCandidates: string[] = getGeminiVideoModelCandidates(),
): Promise<string[]> {
  console.info("[Gemini Models] Checking available video models...");

  try {
    const response = await client.models.list({ config: { pageSize: 200 } });
    const availableNames = new Set<string>();

    for await (const model of response) {
      const name = String(model.name ?? "")
        .replace(/^models\//, "")
        .replace(/^publishers\/google\/models\//, "")
        .replace(/^google\//, "");

      if (name) {
        availableNames.add(name);
      }
    }

    const resolved = requestedCandidates.filter((candidate) => availableNames.has(candidate));

    for (const candidate of requestedCandidates) {
      const status = availableNames.has(candidate) ? "AVAILABLE" : "NOT AVAILABLE";
      console.info(`[Gemini Models] ${candidate}: ${status}`);
    }

    return resolved.length > 0 ? resolved : requestedCandidates;
  } catch (error) {
    console.warn("[Gemini Models] model listing failed", {
      error: error instanceof Error ? error.message : "unknown error",
    });

    for (const candidate of requestedCandidates) {
      console.info(`[Gemini Models] ${candidate}: ERROR`);
    }

    return requestedCandidates;
  }
}

export function createGeminiClient(): GoogleGenAI {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    throw new Error("Gemini is not configured on the server.");
  }

  return new GoogleGenAI({ apiKey });
}