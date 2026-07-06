// backend/index.js
import dotenv from "dotenv";
dotenv.config(); // load .env immediately

import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import fs from "node:fs";
import prisma from "./src/prisma.js";
import requestLogger from "./src/middleware/requestLogger.js";
import { UPLOADS_DIR } from "./src/utils/storage.js";

// Import routes
import festsRouter from "./src/routes/fests.js";
import eventsRouter from "./src/routes/events.js";
import bookingsRouter, { expireStalePendingBookings } from "./src/routes/bookings.js";
import authRoutes from "./src/routes/auth.js";
import userRoutes from "./src/routes/user.js";
import roleRequestsRouter from "./src/routes/roleRequests.js";
import adminRequestsRouter from "./src/routes/adminRequests.js";
import sponsorLeadsRouter from "./src/routes/sponsorLeads.js";

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
    console.error("❌ Invalid environment configuration; refusing to start:");
    for (const e of errors) console.error("   - " + e);
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

// Body size limit. Event creation accepts base64 image data URLs, so allow up to
// 1mb; anything larger is rejected with 413 before hitting route handlers.
app.use(express.json({ limit: "1mb" }));

app.use(express.urlencoded({
  limit: "1mb",
  extended: true
}));

// Request-id + structured access logging. Mounted after body parsers so parse
// failures (413/400) are still logged with a request id, and before routes so
// every handler and the error handler can read `req.id`.
app.use(requestLogger);

// Uploaded files (expense proofs/bills, sponsor agreements) are NO LONGER served
// via a public static mount — that made any leaked /uploads/<uuid> URL world-
// readable across tenants (L3). They are streamed through the authenticated,
// fest-scoped route GET /api/events/marketing/files/:filename instead. We still
// ensure the directory exists for storage.js to write into.
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Auth API (login, signup, refresh, sessions, forgot/reset password, verify email)
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/role-requests", roleRequestsRouter);
app.use("/api/admin-requests", adminRequestsRouter);
app.use("/api/sponsor-leads", sponsorLeadsRouter);

// App API Routes
app.use("/api/fests", festsRouter);
app.use("/api/events", eventsRouter);
app.use("/api/bookings", bookingsRouter);

// simple health route
app.get("/api/hello", (req, res) => {
  res.json({ message: "full stack dev" });
});

// Liveness: is the process up and serving? Always 200; never touches the DB, so
// an orchestrator won't restart the app just because the database is briefly
// unreachable.
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), requestId: req.id });
});

// Readiness: can the app actually serve traffic (DB reachable)? Runs a cheap
// `SELECT 1`; 503 when the DB is down so load balancers stop routing to it.
app.get("/api/ready", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ready", requestId: req.id });
  } catch (err) {
    console.error(`[${req.id}] readiness check failed:`, err?.message || err);
    res.status(503).json({ status: "not-ready", requestId: req.id });
  }
});

// Try connecting at startup (non-blocking)
(async () => {
  try {
    await prisma.$connect();
    console.log("✅ Prisma connected to database");
  } catch (err) {
    console.error("❌ Prisma failed to connect at startup:", err?.message || err);
  }
})();

app.use((err, req, res, next) => {

  console.error(`[${req.id}] Unhandled Express Error:`, err);

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
const server = app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

// Background job: release inventory held by PENDING bookings that were never paid
// (sold is incremented at booking creation). Runs every 5 min; unref'd so it never
// blocks graceful shutdown. Skipped under NODE_ENV=test.
if (process.env.NODE_ENV !== "test") {
  const STALE_SWEEP_MS = 5 * 60 * 1000;
  const staleSweep = setInterval(() => {
    expireStalePendingBookings().catch((e) =>
      console.error("expireStalePendingBookings failed:", e?.message || e)
    );
  }, STALE_SWEEP_MS);
  staleSweep.unref();
}

// Graceful shutdown (important with Prisma)
const shutdown = async () => {
  console.log("Shutting down server...");
  server.close(async () => {
    try {
      await prisma.$disconnect();
      console.log("Prisma disconnected, exiting.");
      process.exit(0);
    } catch (e) {
      console.error("Error during Prisma disconnect:", e);
      process.exit(1);
    }
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  shutdown();
});
