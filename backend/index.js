// backend/index.js
import dotenv from "dotenv";
dotenv.config(); // load .env immediately

import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import fs from "node:fs";
import prisma from "./src/prisma.js";
import logger from "./src/utils/logger.js";
import { initSentry, captureException as sentryCapture } from "./src/utils/sentry.js";
import requestLogger from "./src/middleware/requestLogger.js";
import respond from "./src/middleware/respond.js";
import AppError from "./src/utils/AppError.js";
import { UPLOADS_DIR } from "./src/utils/storage.js";

// Import routes
import festsRouter from "./src/routes/fests.js";
import eventsRouter from "./src/routes/events.js";
import bookingsRouter, {
  expireStalePendingBookings,
  reconcileStalePaidOrders,
  sendAbandonedCheckoutReminders,
  sendEventReminders,
  sendDailySalesDigests,
  razorpayWebhookHandler,
} from "./src/routes/bookings.js";
import authRoutes from "./src/routes/auth.js";
import userRoutes from "./src/routes/user.js";
import roleRequestsRouter from "./src/routes/roleRequests.js";
import notificationsRouter, { unsubscribeRouter } from "./src/routes/notifications.js";
import waitlistRouter from "./src/routes/waitlist.js";
import { expireStaleWaitlistClaims } from "./src/utils/waitlist.js";
import adminRequestsRouter from "./src/routes/adminRequests.js";
import sponsorLeadsRouter from "./src/routes/sponsorLeads.js";
import swaggerUi from "swagger-ui-express";
import { buildOpenApiDocument } from "./src/openapi.js";

// OPS-02: initialise Sentry as early as possible (reads SENTRY_DSN at call time,
// so this runs after dotenv.config() has populated process.env). No-op — no init,
// no network — when SENTRY_DSN is unset, and a bad DSN can never block boot.
initSentry();

// Fail fast: validate required environment before doing anything else.
(function validateEnv() {
  const errors = [];
  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL is required (PostgreSQL/Neon connection string).");
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    errors.push("JWT_SECRET is required (used to sign/verify auth tokens).");
  } else if (secret.length < 32) {
    errors.push("JWT_SECRET must be at least 32 characters for adequate security.");
  }
  if (errors.length) {
    logger.error("❌ Invalid environment configuration; refusing to start:");
    for (const e of errors) logger.error("   - " + e);
    process.exit(1);
  }
})();

const app = express();

// Trust proxy: controls how X-Forwarded-For is interpreted (affects rate limiting
// and req.ip). Trusting arbitrary XFF lets clients spoof their IP and bypass the
// IP-based rate limiter, so default to loopback-only for local dev. In production
// set TRUST_PROXY to the number of trusted proxy hops in front of this app.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy === undefined || trustProxy.trim() === "") {
  app.set("trust proxy", "loopback");
} else if (/^\d+$/.test(trustProxy.trim())) {
  app.set("trust proxy", Number(trustProxy.trim()));
} else {
  // Allow named presets ("loopback") or a comma-separated IP/subnet allowlist.
  app.set("trust proxy", trustProxy.trim());
}

app.use(helmet());
app.use(cookieParser());

// CORS allowlist. Auth is Bearer-token (not cookies), so credentials are not
// needed; we validate the Origin against an explicit allowlist instead of
// blindly reflecting whatever the request sends.
const allowedOrigins = new Set([
  process.env.FRONTEND_URL || "http://localhost:3000",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
// In non-production, accept any localhost/127.0.0.1 origin regardless of port, so
// dev port drift (e.g. Next falling back to :3001 when :3000 is taken) doesn't
// break the app. Production stays strict: only the explicit allowlist above.
const isProduction = process.env.NODE_ENV === "production";
const localhostOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
app.use(cors({
  origin(origin, callback) {
    // Allow non-browser / same-origin requests (no Origin header) and allowlisted origins.
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    if (!isProduction && localhostOrigin.test(origin)) return callback(null, true);
    return callback(null, false);
  },
}));

// Request-id + structured access logging. Mounted BEFORE the body parsers so a
// parse failure (malformed JSON -> 400, oversized body -> 413) is already tagged
// with a request id by the time the error handler logs/returns it, and before
// routes so every handler and the error handler can read `req.id`.
app.use(requestLogger);

// ARCH-04: every API path is served under BOTH /api/v1 (preferred) and /api
// (the unversioned deprecation alias), so define the prefixes once and reuse
// them for the webhook, routers, docs and health routes below.
const API_PREFIXES = ["/api/v1", "/api"];

// PAY-01: the Razorpay webhook must verify an HMAC over the EXACT bytes it was
// sent, so it needs the raw body. Mount it with express.raw for THIS path only,
// BEFORE the global express.json below (which would otherwise consume the body
// and break the signature). req.log is already set (requestLogger, above).
for (const prefix of API_PREFIXES) {
  app.post(`${prefix}/bookings/webhook/razorpay`, express.raw({ type: "application/json" }), razorpayWebhookHandler);
}

// Body size limit. Event creation accepts base64 image data URLs, so allow up to
// 1mb; anything larger is rejected with 413 before hitting route handlers.
app.use(express.json({ limit: "1mb" }));

app.use(express.urlencoded({
  limit: "1mb",
  extended: true
}));

// Uploaded files (expense proofs/bills, sponsor agreements) are NO LONGER served
// via a public static mount — that made any leaked /uploads/<uuid> URL world-
// readable across tenants (L3). They are streamed through the authenticated,
// fest-scoped route GET /api/events/marketing/files/:filename instead. We still
// ensure the directory exists for storage.js to write into.
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Response-shape helpers (res.ok / res.fail) so every route can emit one
// enveloped body with a requestId. Needs req.id (requestLogger, above).
app.use(respond);

// Every router is mounted under both prefixes (ARCH-04). The SAME router
// instance is reused, so all middleware (auth, rate limiters, zod validation)
// applies identically to /api/* and /api/v1/*.
const ROUTERS = [
  ["/auth", authRoutes],
  ["/user", userRoutes],
  ["/role-requests", roleRequestsRouter],
  ["/notifications", notificationsRouter],
  ["/unsubscribe", unsubscribeRouter],
  ["/waitlist", waitlistRouter],
  ["/admin-requests", adminRequestsRouter],
  ["/sponsor-leads", sponsorLeadsRouter],
  ["/fests", festsRouter],
  ["/events", eventsRouter],
  ["/bookings", bookingsRouter],
];

// OpenAPI document built once from the live zod validators (ARCH-04). Served as
// raw JSON and behind Swagger UI. Both are public and un-rate-limited.
const openApiDoc = buildOpenApiDocument();

// Readiness handler shared by both prefixes: cheap `SELECT 1`; 503 when the DB
// is down so load balancers stop routing to this instance.
const readyHandler = async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ready", requestId: req.id });
  } catch (err) {
    req.log.error({ err }, "readiness check failed");
    res.status(503).json({ status: "not-ready", requestId: req.id });
  }
};

for (const prefix of API_PREFIXES) {
  for (const [path, router] of ROUTERS) {
    app.use(`${prefix}${path}`, router);
  }

  // API contract: machine-readable spec + interactive docs (no auth).
  app.get(`${prefix}/openapi.json`, (req, res) => res.json(openApiDoc));
  app.use(`${prefix}/docs`, swaggerUi.serveFiles(openApiDoc), swaggerUi.setup(openApiDoc));

  // Health/liveness/readiness.
  app.get(`${prefix}/hello`, (req, res) => res.json({ message: "full stack dev" }));
  app.get(`${prefix}/health`, (req, res) =>
    res.json({ status: "ok", uptime: process.uptime(), requestId: req.id })
  );
  app.get(`${prefix}/ready`, readyHandler);
}

// Try connecting at startup (non-blocking)
(async () => {
  try {
    await prisma.$connect();
    logger.info("✅ Prisma connected to database");
  } catch (err) {
    logger.error({ err }, "Prisma failed to connect at startup");
  }
})();

// Catch-all 404: any request that matched no route above returns the standard
// JSON error shape instead of Express's default HTML error page.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    requestId: req.id,
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.originalUrl} not found`
    }
  });
});

app.use((err, req, res, next) => {
  // Body-parser failures are CLIENT errors, not server faults. Map an oversized
  // body to 413 and malformed/unsupported JSON to 400 (previously both surfaced
  // as a generic 500).
  const status = err && (err.status || err.statusCode);
  if (err && (err.type === "entity.too.large" || status === 413)) {
    return res.status(413).json({
      success: false,
      requestId: req.id,
      error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large (max 1mb)" }
    });
  }
  if (
    err &&
    (err.type === "entity.parse.failed" ||
      err.type === "encoding.unsupported" ||
      err.type === "charset.unsupported" ||
      (status === 400 && "body" in err))
  ) {
    return res.status(400).json({
      success: false,
      requestId: req.id,
      error: { code: "INVALID_REQUEST_BODY", message: "Malformed request body" }
    });
  }

  // Typed application errors (AppError / bookingError) carry an explicit status,
  // stable code, and a safe user-facing message — map them straight through so a
  // handler can `throw` instead of hand-rolling res.status().json().
  if (err instanceof AppError) {
    return res.status(err.status).json({
      success: false,
      requestId: req.id,
      error: { code: err.code, message: err.expose ? err.message : "Unexpected error" },
    });
  }

  (req.log || logger).error({ err }, "Unhandled Express Error");
  // OPS-02: report ONLY genuine server faults (this 500 branch), never the 4xx
  // client-error branches above. Tagged with the request id + authenticated user.
  sentryCapture(err, { requestId: req.id, userId: req.user?.userId });

  res.status(500).json({
    success: false,
    requestId: req.id,
    error: {
      code: "SERVER_ERROR",
      message: "Internal server error"
    }
  });

});

const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => logger.info({ port: PORT }, "Server running on port"));

// Background job: release inventory held by PENDING bookings that were never paid
// (sold is incremented at booking creation). Runs every 5 min; unref'd so it never
// blocks graceful shutdown. Skipped under NODE_ENV=test.
//
// ARCH-05: guard each tick with a transaction-scoped Postgres advisory lock so
// that with >1 replica exactly one instance sweeps per tick (the lock
// auto-releases at transaction end, even on error, and is safe under pgbouncer).
async function runStaleSweepTick() {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtext('tiqr-stale-sweep')) AS locked`;
    const locked = rows?.[0]?.locked === true;
    if (!locked) {
      logger.info({ job: "stale-sweep", skipped: true }, "stale-sweep skipped (lock held by another instance)");
      return;
    }
    // NOTIF-02: nudge stalled checkouts (10-min threshold) BEFORE the 15-min
    // expiry sweep below cancels them, so a recoverable buyer gets the mail first.
    const { sent: recovered } = await sendAbandonedCheckoutReminders();
    if (recovered) logger.info({ job: "checkout-recovery", sent: recovered }, "checkout-recovery");

    const { expired, durationMs } = await expireStalePendingBookings();
    logger.info({ job: "stale-sweep", expired, durationMs, skipped: false }, "stale-sweep");

    // NOTIF-03: T-24h / T-1h event reminders (QR + .ics + directions), deduped per
    // (booking, kind). Runs on this 5-min tick; the 20-min window + ReminderLog
    // guard mean each reminder sends exactly once as its event crosses the mark.
    const { sent: reminded } = await sendEventReminders();
    if (reminded) logger.info({ job: "event-reminders", sent: reminded }, "event-reminders");

    // NOTIF-05: once-a-day (IST) organizer sales digest. A cheap early-out skips
    // the work on ticks where no organizer is due; the per-user claim guarantees
    // one send per calendar day even across restarts.
    const { sent: digested } = await sendDailySalesDigests();
    if (digested) logger.info({ job: "sales-digest", sent: digested }, "sales-digest");

    // PAY-08 (Phase-5 review P3): expire stale waitlist claims + re-offer the seat
    // to the next waiter, so an abandoned claim doesn't strand the queue.
    const { expired: wlExpired } = await expireStaleWaitlistClaims();
    if (wlExpired) logger.info({ job: "waitlist-expiry", expired: wlExpired }, "waitlist-expiry");
    // PAY-01: recover any stuck orderId-set bookings whose capture the webhook
    // missed (best-effort; no-op when Razorpay is unconfigured).
    const { settled, released, checked } = await reconcileStalePaidOrders();
    if (checked) logger.info({ job: "reconcile-orders", settled, released, checked }, "reconcile-orders");
  });
}

if (process.env.NODE_ENV !== "test") {
  const STALE_SWEEP_MS = 5 * 60 * 1000;
  const staleSweep = setInterval(() => {
    runStaleSweepTick().catch((e) => logger.error({ err: e }, "stale-sweep tick failed"));
  }, STALE_SWEEP_MS);
  staleSweep.unref();
}

// Graceful shutdown (important with Prisma)
const shutdown = async () => {
  logger.info("Shutting down server...");
  server.close(async () => {
    try {
      await prisma.$disconnect();
      logger.info("Prisma disconnected, exiting.");
      process.exit(0);
    } catch (e) {
      logger.error({ err: e }, "Error during Prisma disconnect");
      process.exit(1);
    }
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("unhandledRejection", (reason) => {
  sentryCapture(reason);
  logger.error({ err: reason }, "Unhandled Rejection");
});
process.on("uncaughtException", (err) => {
  sentryCapture(err);
  logger.error({ err }, "Uncaught Exception");
  shutdown();
});
