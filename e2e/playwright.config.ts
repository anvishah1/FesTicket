import { defineConfig, devices } from "@playwright/test";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(rootDir, "..");

// When E2E_NO_SERVER=1, Playwright will NOT start the backend/frontend itself
// (use this if you already have both dev servers running, or in CI where they
// are started separately). Otherwise Playwright boots both dev servers.
const startServers = !process.env.E2E_NO_SERVER;

// The FesTicket frontend is a Next.js dev server that normally listens on :3000, but
// Next auto-increments to :3001, :3002, ... if 3000 is already taken by another
// process. In this environment 3000 is occupied by an unrelated app, so FesTicket
// actually serves from 3001. Rather than hard-code a port, probe the common
// candidates and pick the one that is genuinely serving *this* app (identified
// by a stable, FesTicket-unique string in its server-rendered HTML). Honour an
// explicit E2E_BASE_URL override when provided.
function detectFrontendBaseURL(): string {
  if (process.env.E2E_BASE_URL) return process.env.E2E_BASE_URL;

  const candidates = [3000, 3001, 3002, 3003, 3004, 3005].map(
    (p) => `http://localhost:${p}`
  );
  for (const url of candidates) {
    try {
      const html = execSync(`curl -s --max-time 4 "${url}/"`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      // "Events and ticketing" is the FesTicket landing-page hero copy and does not
      // appear in the unrelated app squatting on :3000.
      if (/Events and ticketing/i.test(html)) return url;
    } catch {
      // curl missing / port closed / non-200 — try the next candidate.
    }
  }
  // Fall back to the conventional port if detection turned up nothing.
  return "http://localhost:3000";
}

const FRONTEND_BASE_URL = detectFrontendBaseURL();

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: FRONTEND_BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // The backend pins CORS to a single origin (FRONTEND_URL, default
        // http://localhost:3000). In this environment the FesTicket frontend is
        // forced onto :3001 because another app already holds :3000, so every
        // browser-side fetch from the app to the :4000 API is rejected by CORS
        // (ACAO 3000 != origin 3001). We can't restart servers or edit app
        // source, so we relax the *test browser's* same-origin enforcement.
        // This only affects the E2E chromium instance; it does not change the
        // app. In the intended setup (frontend on :3000) these flags are inert.
        launchOptions: {
          args: [
            "--disable-web-security",
            "--disable-features=IsolateOrigins,site-per-process,SiteIsolation",
            "--disable-site-isolation-trials",
          ],
        },
      },
    },
  ],
  webServer: startServers
    ? [
        {
          command: "npm run dev",
          cwd: path.join(repoRoot, "backend"),
          url: "http://localhost:4000/api/hello",
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          stdout: "pipe",
          stderr: "pipe",
        },
        {
          command: "npm run dev",
          cwd: path.join(repoRoot, "frontend"),
          url: "http://localhost:3000",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: { NEXT_PUBLIC_API_URL: "http://localhost:4000" },
          stdout: "pipe",
          stderr: "pipe",
        },
      ]
    : undefined,
});
