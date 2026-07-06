// backend/src/middleware/requestLogger.js
import { randomUUID } from "node:crypto";

/**
 * Request-id + structured access logging middleware.
 *
 * - Assigns each request a request id: reuses an incoming `X-Request-Id` header
 *   when present (so ids propagate across a proxy/load balancer), otherwise
 *   generates one with crypto.randomUUID().
 * - Exposes it as `req.id` and echoes it back on the `X-Request-Id` response
 *   header so clients/log aggregators can correlate a call end-to-end.
 * - Logs exactly one structured line per completed response (on the `finish`
 *   event) with method, url, status, duration in ms and the request id.
 *
 * Dependency-free by design (no morgan/pino). Logging is skipped under
 * NODE_ENV=test to keep test output clean; the request id is still assigned so
 * downstream code and the error handler can rely on it.
 */
export default function requestLogger(req, res, next) {
  const incoming = req.headers["x-request-id"];
  const requestId =
    typeof incoming === "string" && incoming.trim() !== ""
      ? incoming.trim()
      : randomUUID();

  req.id = requestId;
  res.setHeader("X-Request-Id", requestId);

  // Skip logging entirely under test, but keep the id/header behavior above.
  if (process.env.NODE_ENV === "test") return next();

  // Reduce noise from static uploads; ids/headers are still set above.
  if (req.originalUrl && req.originalUrl.startsWith("/uploads")) return next();

  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs =
      Number(process.hrtime.bigint() - start) / 1e6;
    const line = {
      requestId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 1000) / 1000,
    };
    console.log(JSON.stringify(line));
  });

  next();
}
