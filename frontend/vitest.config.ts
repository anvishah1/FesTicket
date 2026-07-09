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
    // OPS-01: gate coverage so it can't silently rot. Only our own source
    // (app/components/lib) counts — Next-generated output, .d.ts and the test
    // files themselves are excluded so they don't dilute the number. Thresholds
    // are a ratchet floor set at/just below the current measured coverage; raise
    // them over time, never lower them to make a red build pass.
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["app/**", "components/**", "lib/**"],
      exclude: ["**/*.test.{ts,tsx}", "**/*.spec.ts", ".next/**", "**/*.d.ts"],
      // Ratchet floors set just below the current measured coverage (Stmts 68 /
      // Branch 71 / Funcs 62 / Lines 68). A regression trips a non-zero exit in
      // CI. Raise these as coverage climbs — never lower them to green a build.
      thresholds: {
        statements: 66,
        branches: 68,
        functions: 60,
        lines: 66,
      },
    },
  },
});
