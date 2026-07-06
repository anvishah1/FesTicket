import { PrismaClient } from "@prisma/client";
import logger from "./utils/logger.js";

/**
 * Single shared Prisma client for the whole app.
 *
 * The previous pattern instantiated `new PrismaClient()` in every route file,
 * which opens a separate connection pool per module and can exhaust the
 * database's connection limit (especially on serverless Postgres like Neon).
 * Import this one instance everywhere instead.
 *
 * ARCH-06: in development we emit query events and warn on slow queries; in
 * production we log only warnings/errors (no per-query logging, and never bound
 * params, which may contain PII). The connection URL is the pooled DATABASE_URL
 * (pgbouncer); prisma migrate/db push use the unpooled DIRECT_URL (schema.prisma).
 */
const isDev =
  process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";
const SLOW_QUERY_MS = parseInt(process.env.SLOW_QUERY_MS || "200", 10);

const prisma = new PrismaClient({
  log: isDev
    ? [{ emit: "event", level: "query" }, "warn", "error"]
    : ["warn", "error"],
});

if (isDev) {
  // Surface slow queries with statement + duration only (never params).
  prisma.$on("query", (e) => {
    if (e.duration >= SLOW_QUERY_MS) {
      logger.warn({ ms: e.duration, query: e.query }, "slow query");
    }
  });
}

export default prisma;
