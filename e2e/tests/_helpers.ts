// e2e/tests/_helpers.ts
// Shared constants + small utilities for the FesTicket E2E suite.
// NOTE: this file intentionally does NOT match Playwright's testMatch
// (*.spec.ts / *.test.ts), so it is imported by specs but never run as a test.

import { APIRequestContext, Page, request } from "@playwright/test";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const helpersDir = path.dirname(fileURLToPath(import.meta.url));
// e2e/tests/_helpers.ts -> repo root -> backend/
const backendDir = path.resolve(helpersDir, "..", "..", "backend");

/** Canonical public/auth routes exercised by the smoke suite. */
export const ROUTES = {
  home: "/",
  fests: "/fests",
  signin: "/signin",
  signup: "/signup",
  sponsor: "/sponsor",
  adminSignin: "/admin/signin",
} as const;

/** Backend base URL (kept in sync with playwright.config.ts webServer env). */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/**
 * A collision-free email for seeding/journey specs. Smoke specs don't need
 * real accounts, but journeys (and re-runs) do, so keep this here for reuse.
 */
export function uniqueEmail(prefix = "e2e"): string {
  const rand = Math.floor(Math.random() * 1e6)
    .toString()
    .padStart(6, "0");
  return `${prefix}.${Date.now()}.${rand}@example.com`;
}

// ===========================================================================
// Journey helpers — used only by tests/journeys/* (which self-skip without a
// database). These seed data through the REAL backend API and prime the
// frontend's localStorage-based auth. Smoke specs never import these.
// ===========================================================================

// localStorage keys — must match frontend/lib/auth.ts exactly.
export const ACCESS_TOKEN_KEY = "auth_accessToken";
export const REFRESH_TOKEN_KEY = "auth_refreshToken";
export const USER_KEY = "auth_user";

// A password that satisfies the backend zod signup schema:
// >=8 chars, an uppercase, a lowercase, a number, and a special character.
export const STRONG_PASSWORD = "Password1!";

/** Standalone API request context pointed at the backend (usable in beforeAll). */
export async function apiContext(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: API_BASE });
}

export interface SeededUser {
  id: number;
  email: string;
  name?: string | null;
  role: string;
  profileCompleted?: boolean;
  editorFestId?: number | null;
  managedFestId?: number | null;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: SeededUser;
}

/**
 * Sign up a fresh user and sign them in via the backend API. Returns the tokens
 * + user object exactly as the frontend stores them after a real sign-in.
 */
export async function signupAndSignin(
  api: APIRequestContext,
  opts: { email?: string; password?: string; name?: string } = {}
): Promise<Session> {
  const email = opts.email || uniqueEmail();
  const password = opts.password || STRONG_PASSWORD;
  const name = opts.name || "E2E User";

  const signup = await api.post("/api/auth/signup", { data: { email, password, name } });
  // 201 = created, 409 = already exists (fine — we can still sign in).
  if (![201, 409].includes(signup.status())) {
    throw new Error(`Signup failed (${signup.status()}): ${await signup.text()}`);
  }

  const signin = await api.post("/api/auth/signin", { data: { email, password } });

  // The backend rate-limits /api/auth/signin to 5 requests/min per IP
  // (src/middleware/rateLimiter.js). Re-running the whole suite several times
  // inside a single minute can therefore trip a 429 here. The only consumer of
  // this helper (the privileged-dashboard journey) just needs localStorage to
  // hold *a* token + an (over-)primed role — the client route guards check for
  // token *presence*, not validity (frontend/lib/auth.ts `isAuthenticated`),
  // and the dashboards' data fetches degrade gracefully. So on a rate-limit (or
  // any non-OK signin) we fall back to a synthetic session rather than throwing,
  // keeping the suite deterministic across rapid re-runs. When signin succeeds
  // (the normal case) we return the real tokens.
  if (signin.ok()) {
    // Unified API envelope (ARCH-01): tokens + user live under `data`.
    // Tolerate a bare body too, for resilience across transitional backends.
    const body = await signin.json();
    const payload = body.data ?? body;
    return {
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      user: payload.user,
    };
  }

  if (signin.status() !== 429) {
    // A non-429 failure is a genuine problem worth surfacing.
    throw new Error(`Signin failed (${signin.status()}): ${await signin.text()}`);
  }

  return {
    accessToken: `e2e.synthetic.${Date.now()}`,
    refreshToken: `e2e.synthetic.${Date.now()}`,
    user: { id: -1, email, name, role: "VIEWER" },
  };
}

/**
 * Sign up a fresh user and return a session WITHOUT calling the rate-limited
 * /api/auth/signin endpoint. The token is synthetic — that is deliberate and
 * sufficient for the privileged-dashboard journey, whose only goal is that the
 * client-side route guards admit us and the dashboard *shell* renders. Those
 * guards check for the mere presence of a token in localStorage
 * (frontend/lib/auth.ts `isAuthenticated`) and read the (over-)primed role from
 * the stored user; the dashboards' own data fetches degrade gracefully when the
 * token isn't a real one. Avoiding the signin call keeps the whole suite well
 * under the backend's 5-signins/minute limit, so it stays deterministic no
 * matter how many times it is re-run in quick succession. (`signupAndSignin`
 * above is retained for flows that genuinely need real tokens.)
 */
export async function signupPrimedSession(
  api: APIRequestContext,
  opts: { email?: string; password?: string; name?: string } = {}
): Promise<Session> {
  const email = opts.email || uniqueEmail();
  const password = opts.password || STRONG_PASSWORD;
  const name = opts.name || "E2E User";

  const signup = await api.post("/api/auth/signup", { data: { email, password, name } });
  if (![201, 409].includes(signup.status())) {
    throw new Error(`Signup failed (${signup.status()}): ${await signup.text()}`);
  }
  let userId = -1;
  try {
    // Unified envelope (ARCH-01): userId may live under `data`; tolerate a bare body.
    const body = await signup.json();
    const uid = body?.data?.userId ?? body?.userId;
    if (typeof uid === "number") userId = uid;
  } catch {
    // signup body wasn't JSON (e.g. 409 path) — a synthetic id is fine.
  }

  const stamp = Date.now();
  return {
    accessToken: `e2e.synthetic.${stamp}`,
    refreshToken: `e2e.synthetic.${stamp}`,
    user: { id: userId, email, name, role: "VIEWER" },
  };
}

// --- E2E-only: mint a valid HOST token ---------------------------------------
// POST /api/events now requires a privileged role, and there is NO public API to
// promote a signed-up user (signup only creates a VIEWER). For seeding, we sign
// a real HS256 JWT for the freshly-created user with the local test secret
// (must match backend/.env JWT_SECRET). authMiddleware does jwt.verify(token, JWT_SECRET).
// Must equal the backend's JWT_SECRET or authMiddleware 401s every minted token.
// Prefer an explicit E2E_JWT_SECRET, then fall back to the JWT_SECRET the backend
// itself runs with (CI sets this at the job level), then the local-dev default.
const E2E_JWT_SECRET =
  process.env.E2E_JWT_SECRET ||
  process.env.JWT_SECRET ||
  "e2e-local-jwt-secret-at-least-32-characters-long!!";

// Optional `tokenVersion` is only embedded when provided: authMiddleware compares
// the token's tokenVersion (defaulting to 0) against the DB user's. A fresh user
// is at 0, so omitting it matches; after a role change bumps the DB to N, mint a
// fresh token with tokenVersion=N so it stays valid.
function signJwt(userId: number, role: string, tokenVersion?: number): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = enc({ alg: "HS256", typ: "JWT" });
  const payload: Record<string, unknown> = { userId, role, iat: now, exp: now + 3600 };
  if (tokenVersion !== undefined) payload.tokenVersion = tokenVersion;
  const body = enc(payload);
  const sig = crypto
    .createHmac("sha256", E2E_JWT_SECRET)
    .update(`${head}.${body}`)
    .digest("base64url");
  return `${head}.${body}.${sig}`;
}

/** Mint a valid HS256 access token for a seeded user (E2E infra). */
export function signSessionJwt(userId: number, role: string, tokenVersion?: number): string {
  return signJwt(userId, role, tokenVersion);
}

function signHostJwt(userId: number): string {
  return signJwt(userId, "HOST");
}

/** Sign up a fresh user and return a valid HOST bearer token for it (E2E infra). */
export async function signupHostToken(api: APIRequestContext): Promise<string> {
  const email = uniqueEmail("host");
  const signup = await api.post("/api/auth/signup", {
    data: { email, password: STRONG_PASSWORD, name: "E2E Host" },
  });
  if (![201, 409].includes(signup.status())) {
    throw new Error(`Host signup failed (${signup.status()}): ${await signup.text()}`);
  }
  const body = await signup.json().catch(() => ({}));
  // Unified envelope (ARCH-01): userId may live under `data`; tolerate a bare body.
  const uid = body?.data?.userId ?? body?.userId;
  const userId = typeof uid === "number" ? uid : 1;
  return signHostJwt(userId);
}

export interface SeededTicketType {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

export interface SeededEvent {
  id: number;
  name: string;
  ticketTypes: SeededTicketType[];
}

/**
 * Create a public, published event (with ticket types) via the API.
 *
 * POST /api/events now REQUIRES an authenticated EDITOR/HOST/ADMIN token, so we
 * first sign up + sign in a fresh user (via `signupAndSignin`) and send its
 * bearer token. The backend always sets `hostId` from the token and ignores any
 * body `hostId`, so the created event is owned by that host.
 *
 * `festId` is optional; the schema allows null and an event with no fest is
 * still reachable at /events/:id and fully bookable. Keeping fest optional
 * makes booking/discovery journeys deterministic without needing an ADMIN
 * (the only role allowed to create a Fest via the API). A freshly signed-up
 * user has no managed/editor fest, so callers should leave `festId` null.
 */
export async function createEvent(
  api: APIRequestContext,
  opts: {
    name?: string;
    festId?: number | null;
    ticketTypes?: Array<{ name: string; price: number; quantity: number; description?: string }>;
  } = {}
): Promise<SeededEvent> {
  const name = opts.name || `E2E Event ${Date.now()}`;
  const start = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // ~2 weeks out
  const end = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

  // POST /api/events requires an authenticated EDITOR/HOST/ADMIN.
  const token = await signupHostToken(api);

  const res = await api.post("/api/events", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      festId: opts.festId ?? null,
      name,
      shortDescription: "Seeded by the E2E suite.",
      description: "This event was created by the automated E2E test suite.",
      // Must be one of the curated categories (SEO-10); "Music" is no longer valid.
      category: "Concert",
      venue: "Main Auditorium",
      venueAddress: "Main Auditorium, Campus",
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      startTime: "18:00",
      visibility: "PUBLIC",
      status: "PUBLISHED",
      ticketTypes:
        opts.ticketTypes || [
          { name: "General", price: 100, quantity: 50, description: "General admission" },
        ],
    },
  });

  if (!res.ok()) {
    throw new Error(`Create event failed (${res.status()}): ${await res.text()}`);
  }
  const data = (await res.json()).data;
  return {
    id: data.id,
    name: data.name,
    ticketTypes: (data.ticketTypes || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      price: t.price,
      quantity: t.quantity,
    })),
  };
}

/**
 * Prime the frontend's localStorage auth BEFORE any page script runs, so the
 * client-side guards on /admin/* and /host/* see a logged-in privileged user.
 * Uses addInitScript (runs at document start on every navigation in this page).
 */
export async function primeAuth(
  page: Page,
  session: Session,
  overrides: Partial<SeededUser> = {}
): Promise<void> {
  const user = { ...session.user, ...overrides };
  // Prime a REAL (verifiable) JWT for the seeded user + primed role. authMiddleware
  // now rejects unverifiable tokens with 401, which — with the client's token-refresh
  // interceptor — would refresh-then-redirect to /signin. A valid token means the
  // dashboards' authed fetches resolve to 200/403 (never 401), so the shell loads and
  // data degrades gracefully as intended. Falls back to the synthetic token only when
  // there is no real user id (e.g. a 409 signup path).
  const accessToken =
    typeof user.id === "number" && user.id > 0
      ? signJwt(user.id, user.role || "VIEWER")
      : session.accessToken;
  await page.addInitScript(
    (payload: { keys: string[]; values: string[] }) => {
      window.localStorage.setItem(payload.keys[0], payload.values[0]);
      window.localStorage.setItem(payload.keys[1], payload.values[1]);
      window.localStorage.setItem(payload.keys[2], payload.values[2]);
    },
    {
      keys: [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY],
      values: [accessToken, session.refreshToken, JSON.stringify(user)],
    }
  );
}

// ===========================================================================
// OPS-05: money-path journey seeding
// ===========================================================================

export interface SignedUpUser {
  userId: number;
  email: string;
  token: string; // valid HS256 access token for the given role
}

/**
 * Sign up a fresh user (unique email so it's always a 201, never the rate-limited
 * signin) and return its real id + a valid access token minted for `role`. Used
 * by journeys that need an authenticated, ownership-bearing caller (e.g. a buyer
 * who can then cancel their own booking).
 */
export async function signupUser(
  api: APIRequestContext,
  opts: { role?: string; email?: string; name?: string } = {}
): Promise<SignedUpUser> {
  const email = opts.email || uniqueEmail("user");
  const signup = await api.post("/api/auth/signup", {
    data: { email, password: STRONG_PASSWORD, name: opts.name || "E2E User" },
  });
  if (![201, 409].includes(signup.status())) {
    throw new Error(`signupUser failed (${signup.status()}): ${await signup.text()}`);
  }
  const body = await signup.json().catch(() => ({}));
  const uid = body?.data?.userId ?? body?.userId;
  if (typeof uid !== "number") {
    throw new Error(`signupUser: no userId in signup response for ${email}`);
  }
  return { userId: uid, email, token: signSessionJwt(uid, opts.role || "VIEWER") };
}

export interface SeededFestAdmin {
  festId: number;
  adminKey: string;
  adminUserId: number;
  adminEmail: string;
}

/**
 * Seed a Fest (with a known adminKey) + an ADMIN who manages it. There is no
 * public API for either (both are DB-level onboarding steps), so this shells out
 * to a backend script that talks to the same Postgres the API uses. Requires the
 * backend env (DATABASE_URL) to be present — which it is whenever E2E_HAS_DB is.
 */
export function seedFestAdmin(): SeededFestAdmin {
  const out = execFileSync("node", ["src/scripts/e2eSeedFestAdmin.js"], {
    cwd: backendDir,
    encoding: "utf8",
    env: process.env,
  });
  const line = out.trim().split(/\r?\n/).pop() as string;
  return JSON.parse(line) as SeededFestAdmin;
}

/** Build a POST /api/bookings body for one ticket line. */
export function bookingBody(
  event: SeededEvent,
  opts: { quantity?: number; guestEmail?: string; ticketTypeIndex?: number } = {}
) {
  const tt = event.ticketTypes[opts.ticketTypeIndex ?? 0];
  const quantity = opts.quantity ?? 1;
  return {
    eventId: event.id,
    guestEmail: opts.guestEmail,
    tickets: [{ ticketTypeId: tt.id, quantity }],
    attendees: Array.from({ length: quantity }, (_, i) => ({
      ticketTypeId: tt.id,
      name: `Attendee ${i + 1}`,
      email: uniqueEmail("attendee"),
    })),
  };
}
