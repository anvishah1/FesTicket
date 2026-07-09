// OPS-02: Sentry browser init (Next 16 client instrumentation hook). No-op unless
// NEXT_PUBLIC_SENTRY_DSN is set, so the client bundle behaves identically without it.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0),
    sendDefaultPii: false,
  });
}

// Instrument client-side App Router navigations. No-op until Sentry.init runs.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
