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
      reporter: ["text", "html"],
      include: ["src/**/*.js"],
      exclude: ["src/scripts/**", "src/db.js"],
    },
  },
});
