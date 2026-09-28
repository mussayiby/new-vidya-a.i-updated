import os from "node:os";
import path from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: {
      entry: "server",
    },
  },

  vite: {
    cacheDir: path.join(os.tmpdir(), "vidya-ai-vite-cache"),
    envPrefix: ["VITE_", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"],
    optimizeDeps: {
      noDiscovery: true,
    },
    server: {
      host: "0.0.0.0",
      port: 8080,
      strictPort: true,
    },
  },
});
