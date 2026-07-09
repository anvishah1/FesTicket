// backend/src/utils/metrics.js
// OPS-03: Prometheus instrumentation. A single module-scope registry + metric
// singletons (mirrors the prisma.js singleton pattern) so re-importing returns
// the SAME objects and values accumulate for the whole process lifetime. Exposed
// at GET /api/metrics (wired in index.js).
import client from "prom-client";
import crypto from "node:crypto";

export const registry = new client.Registry();

// Default process/runtime metrics: CPU, resident memory, event-loop lag, GC,
// active handles/requests.
client.collectDefaultMetrics({ register: registry });

// HTTP request-duration histogram, labelled by method, matched ROUTE TEMPLATE
// (never the raw URL) and status code, so label cardinality stays bounded.
export const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds by method, route template and status code",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

// Business counters (Prometheus-conventional _total suffix).
export const bookingsCreated = new client.Counter({
  name: "bookings_created_total",
  help: "Bookings created via POST /bookings (PENDING inserted, or free auto-completed)",
  registers: [registry],
});
export const paymentSuccess = new client.Counter({
  name: "payment_success_total",
  help: "Bookings settled PENDING->COMPLETED after a real (or demo) payment",
  registers: [registry],
});
export const paymentFailed = new client.Counter({
  name: "payment_failed_total",
  help: "Payment verifications rejected (VERIFY_FAILED branches)",
  registers: [registry],
});
export const staleExpired = new client.Counter({
  name: "stale_expired_total",
  help: "PENDING bookings expired by the stale-hold sweep (inventory released)",
  registers: [registry],
});

// Bounded route label: the matched Express route template including the router
// mount (e.g. /api/bookings/:id/complete). Unmatched requests (404) collapse to a
// single "unmatched" bucket so arbitrary ids/emails in the URL never explode
// label cardinality.
export function routeLabel(req) {
  if (req.route && req.route.path) return (req.baseUrl || "") + req.route.path;
  return "unmatched";
}

// Express middleware: time each request and observe on response finish (req.route
// is populated by then). Mounted right after requestLogger in index.js.
export function metricsMiddleware(req, res, next) {
  const end = httpRequestDuration.startTimer();
  res.on("finish", () => {
    end({ method: req.method, route: routeLabel(req), status_code: res.statusCode });
  });
  next();
}

// GET /api/metrics handler. Open in dev; in production requires a Bearer
// METRICS_TOKEN and FAILS CLOSED when it is unset, so the internal route
// inventory + business figures are never world-readable. Timing-safe compare.
export async function metricsHandler(req, res) {
  if (process.env.NODE_ENV === "production") {
    const token = process.env.METRICS_TOKEN;
    if (!token) {
      return res.status(403).json({
        success: false,
        requestId: req.id,
        error: { code: "FORBIDDEN", message: "metrics disabled (set METRICS_TOKEN to enable scraping)" },
      });
    }
    const header = req.headers.authorization || "";
    const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
    const a = Buffer.from(provided);
    const b = Buffer.from(token);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).json({
        success: false,
        requestId: req.id,
        error: { code: "FORBIDDEN", message: "metrics access denied" },
      });
    }
  }
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
}
