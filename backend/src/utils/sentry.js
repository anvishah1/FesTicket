// backend/src/utils/sentry.js
// OPS-02: optional Sentry error tracking. Fully no-op unless SENTRY_DSN is set,
// so dev / CI / test and any deployment without a DSN behave byte-for-byte as
// before (no init, no network calls). We only report *server faults* (the 500
// branch + uncaught/unhandled process errors), never the 4xx client-error
// branches, and every event is scrubbed of PII/secrets before it leaves here.
import * as Sentry from "@sentry/node";
import logger from "./logger.js";

let enabled = false;

// Keys scrubbed from every outgoing event. Booking payloads carry guest PII and
// auth headers carry bearer tokens — none of it should ever reach Sentry. Mirrors
// (and extends) the pino redaction list in logger.js. Compared case-insensitively.
const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "password",
  "newpassword",
  "currentpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "captchatoken",
  "guestemail",
  "guestname",
  "guestphone",
]);

// Recursively replace sensitive values with [Redacted]. Bounded depth so a
// cyclic/huge object can't wedge the send path. Mutates in place (the event is
// ours to modify inside beforeSend).
function scrub(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 6) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = scrub(value[i], depth + 1);
    return value;
  }
  for (const key of Object.keys(value)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      value[key] = "[Redacted]";
    } else {
      value[key] = scrub(value[key], depth + 1);
    }
  }
  return value;
}

// Strip PII/secrets from request headers/data/extra/contexts before the event is
// sent. Never throws (a scrub error must not drop the event handler). Exported so
// the redaction contract is unit-testable without a live DSN.
export function scrubEvent(event) {
  try {
    if (event.request) {
      if (event.request.headers) scrub(event.request.headers);
      if (event.request.cookies) event.request.cookies = "[Redacted]";
      if (event.request.data) scrub(event.request.data);
    }
    if (event.extra) scrub(event.extra);
    if (event.contexts) scrub(event.contexts);
  } catch {
    /* ignore scrub failures */
  }
  return event;
}

/**
 * Initialise Sentry iff SENTRY_DSN is configured. Safe to call once at boot.
 * A missing DSN → completely disabled (no init, no network). A bad DSN can
 * never block server boot (init is wrapped in try/catch).
 */
export function initSentry() {
  if (enabled) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    Sentry.init({
      dsn,
      environment:
        process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
      // We scrub explicitly in beforeSend; never let the SDK attach PII on its own.
      sendDefaultPii: false,
      beforeSend: scrubEvent,
    });
    enabled = true;
    logger.info("Sentry error tracking enabled");
  } catch (err) {
    logger.error({ err }, "Sentry init failed; continuing without it");
    enabled = false;
  }
}

/**
 * Report a server fault. No-op when Sentry is disabled. Tags the event with the
 * request id and (when authenticated) the user id so a report correlates with
 * the structured access log line. Never throws — capturing must not alter the
 * response contract.
 */
export function captureException(err, { requestId, userId } = {}) {
  if (!enabled) return;
  try {
    Sentry.withScope((scope) => {
      if (requestId) scope.setTag("request_id", requestId);
      if (userId != null) scope.setUser({ id: String(userId) });
      Sentry.captureException(err);
    });
  } catch {
    /* capture must never throw */
  }
}

export function isSentryEnabled() {
  return enabled;
}
