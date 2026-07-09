// OPS-02: Sentry server/edge init (Next 16 instrumentation hook). Fully no-op
// unless a DSN is configured, so builds and runtime without Sentry are unchanged.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    // The App Router streams RSC/route errors here; PII is minimised by default.
    sendDefaultPii: false,
  });
}

// Capture errors thrown in nested React Server Components / route handlers. A
// no-op until Sentry.init runs (i.e. no-op without a DSN).
export const onRequestError = Sentry.captureRequestError;
