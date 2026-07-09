// OPS-02: Sentry util — the no-op-without-DSN contract and the PII scrubber.
import { describe, it, expect } from "vitest";
import {
  initSentry,
  captureException,
  isSentryEnabled,
  scrubEvent,
} from "../../src/utils/sentry.js";

describe("sentry util", () => {
  it("is disabled by default (no SENTRY_DSN in the test env)", () => {
    // The vitest env never sets SENTRY_DSN, so init is skipped entirely.
    initSentry();
    expect(isSentryEnabled()).toBe(false);
  });

  it("captureException is a safe no-op when disabled", () => {
    // Must never throw regardless of what it's handed, or it would corrupt the
    // 500 branch / process error handlers that call it.
    expect(() => captureException(new Error("boom"), { requestId: "r1", userId: 7 })).not.toThrow();
    expect(() => captureException(undefined)).not.toThrow();
    expect(() => captureException("not-an-error")).not.toThrow();
  });

  describe("scrubEvent (beforeSend)", () => {
    it("redacts auth headers, cookies, tokens and guest PII", () => {
      const event = {
        request: {
          headers: {
            authorization: "Bearer secret.jwt.token",
            "content-type": "application/json",
          },
          cookies: "session=abc",
          data: {
            guestEmail: "buyer@example.com",
            guestName: "Jane Buyer",
            guestPhone: "+919876543210",
            eventId: 42,
            nested: { refreshToken: "r3fr3sh", accessToken: "acc3ss" },
          },
        },
        extra: { password: "hunter2", note: "keep me" },
      };

      const out = scrubEvent(event);

      expect(out.request.headers.authorization).toBe("[Redacted]");
      // Non-sensitive fields survive untouched.
      expect(out.request.headers["content-type"]).toBe("application/json");
      expect(out.request.cookies).toBe("[Redacted]");
      expect(out.request.data.guestEmail).toBe("[Redacted]");
      expect(out.request.data.guestName).toBe("[Redacted]");
      expect(out.request.data.guestPhone).toBe("[Redacted]");
      expect(out.request.data.eventId).toBe(42);
      expect(out.request.data.nested.refreshToken).toBe("[Redacted]");
      expect(out.request.data.nested.accessToken).toBe("[Redacted]");
      expect(out.extra.password).toBe("[Redacted]");
      expect(out.extra.note).toBe("keep me");
    });

    it("never throws on a malformed/empty event", () => {
      expect(() => scrubEvent({})).not.toThrow();
      expect(scrubEvent({}).request).toBeUndefined();
    });
  });
});
