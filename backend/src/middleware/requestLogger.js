// backend/src/middleware/requestLogger.js
import { randomUUID } from "node:crypto";
import logger from "../utils/logger.js";

/**
 * Request-id + structured access logging middleware.
 *
 * - Assigns each request a request id: reuses an incoming `X-Request-Id` header
 *   when present (so ids propagate across a proxy/load balancer), otherwise
 *   generates one with crypto.randomUUID().
 * - Exposes it as `req.id` and echoes it back on the `X-Request-Id` response
 *   header so clients/log aggregators can correlate a call end-to-end.
 * - Attaches a per-request child logger `req.log` (bound to requestId) so every
 *   handler log line is correlated, and emits exactly one access line per
 *   completed response (on the `finish` event).
 *
 * Uses the shared pino logger (ARCH-09). The logger is silent under
 * NODE_ENV=test, so no output is produced in tests while the request id + child
 * logger are still assigned for downstream code and the error handler.
 */
export default function requestLogger(req, res, next) {
  const incoming = req.headers["x-request-id"];
  const requestId =
    typeof incoming === "string" && incoming.trim() !== ""
      ? incoming.trim()
      : randomUUID();

  req.id = requestId;
  req.log = logger.child({ requestId });
  res.setHeader("X-Request-Id", requestId);

  // Reduce noise from static uploads; ids/headers/child logger are still set.
  if (req.originalUrl && req.originalUrl.startsWith("/uploads")) return next();

  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs =
      Math.round((Number(process.hrtime.bigint() - start) / 1e6) * 1000) / 1000;
    req.log.info(
      {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs,
      },
      "request"
    );
  });

  next();
}
