import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./test/setup.js"],
    include: ["test/**/*.test.js"],
    // Clear call history between tests. Implementations for the Prisma mock are
    // re-established per-test via resetPrismaMock() (see __mocks__/@prisma/client.js).
    clearMocks: true,
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      // lcov feeds the CI artifact upload (OPS-01); text prints the table in the
      // job log; html is the browsable local report.
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.js"],
      exclude: ["src/scripts/**", "src/db.js"],
      // Ratchet floors set just below the current measured coverage (Stmts 90 /
      // Branch 77 / Funcs 93 / Lines 90). A regression trips a non-zero exit in
      // CI. Raise these as coverage climbs — never lower them to green a build.
      thresholds: {
        statements: 88,
        branches: 74,
        functions: 90,
        lines: 88,
      },
    },
  },
});
