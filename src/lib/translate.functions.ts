import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const languageIds = ["en", "bn", "hi", "kn", "ml", "mr", "ta", "te"] as const;

const TranslateInput = z.object({
  text: z.string().trim().min(1).max(2_000),
  from: z.enum(languageIds),
  to: z.enum(languageIds),
});

export const translateText = createServerFn({ method: "POST" })
  .validator((input: unknown) => TranslateInput.parse(input))
  .handler(async ({ data }) => {
    if (data.from === data.to) {
      return { text: data.text };
    }

    throw new Error(
      "This project uses the Gemini classroom translation pipeline. The legacy tertiary translation provider is not enabled.",
    );
  });
