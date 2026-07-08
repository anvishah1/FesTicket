import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    // Run test files sequentially in isolated environments. With parallel workers,
    // a pending async fetch (e.g. an SWR revalidation) from one file could land in
    // another file's shared globalThis.fetch mock and pollute call-order assertions
    // (mock.calls[0]). Sequential + isolate keeps each file's fetch mock clean.
    fileParallelism: false,
    setupFiles: ["./test/setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e", "**/*.spec.ts"],
    css: false,
  },
});
