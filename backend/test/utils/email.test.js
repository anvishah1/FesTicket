// OPS-04: the deep-readiness mail probe. The full send path is exercised via the
// auth/bookings suites; here we pin the graceful "no provider configured" branch
// that the readiness check depends on.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verifyMailProvider, isMailConfigured } from "../../src/utils/email.js";

describe("verifyMailProvider (OPS-04 deep readiness)", () => {
  const saved = {};
  const KEYS = ["EMAIL_PROVIDER", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "RESEND_API_KEY", "POSTMARK_TOKEN"];
  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("reports not_configured (and never throws) when no provider is set up", async () => {
    expect(isMailConfigured()).toBe(false);
    const res = await verifyMailProvider({ timeoutMs: 100 });
    expect(res).toEqual({ ok: false, reason: "not_configured" });
  });

  it("treats a configured HTTP provider (resend) as ok without a network call", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_test_key";
    const res = await verifyMailProvider({ timeoutMs: 100 });
    expect(res).toEqual({ ok: true });
  });
});
