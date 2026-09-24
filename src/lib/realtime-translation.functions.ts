import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getGeminiApiKey } from "@/lib/gemini.server";

const languageIds = z.enum([
  "en",
  "kn",
  "hi",
  "te",
  "ta",
  "ml",
  "mr",
  "bn",
  "ur",
]);

type GeminiTokenResponse = {
  name?: string;
  error?: {
    message?: string;
  };
};

/**
 * Gives one browser a short-lived Gemini token.
 */
export const createRealtimeTranslationToken = createServerFn({
  method: "POST",
})
  .validator((input: unknown) => languageIds.parse(input))
  .handler(async () => {
    const apiKey = getGeminiApiKey();

    if (!apiKey) {
      throw new Error(
        "Live translation is not configured. Add GEMINI_API_KEY to .env and restart the server.",
      );
    }

    const now = Date.now();

    // Gemini Live API browser sessions require an ephemeral token so the API key stays server-side.
    // The SDK warning about ephemeral token support is informational until the API is stabilized.
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/auth_tokens",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uses: 1,
          expireTime: new Date(now + 30 * 60_000).toISOString(),
          newSessionExpireTime: new Date(
            now + 60_000,
          ).toISOString(),
        }),
      },
    );

    const payload =
      (await response.json().catch(() => ({}))) as GeminiTokenResponse;

    if (!response.ok || !payload.name) {
      throw new Error(
        `Could not start live translation (HTTP ${response.status})${
          payload.error?.message
            ? `: ${payload.error.message}`
            : "."
        }`,
      );
    }

    return {
      token: payload.name,
    };
  });