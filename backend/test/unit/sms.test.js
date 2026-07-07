import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toE164, isSmsConfigured, getSmsProvider, sendSms, sendWhatsApp } from "../../src/utils/sms.js";

const SMS_ENV = [
  "SMS_PROVIDER", "SMS_DEFAULT_COUNTRY",
  "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_SMS_FROM", "TWILIO_WHATSAPP_FROM",
  "MSG91_AUTHKEY", "MSG91_SENDER_ID", "GUPSHUP_USER_ID", "GUPSHUP_PASSWORD",
];
function clearSmsEnv() {
  for (const k of SMS_ENV) delete process.env[k];
}

beforeEach(clearSmsEnv);
afterEach(() => {
  clearSmsEnv();
  vi.restoreAllMocks();
});

describe("toE164 (NOTIF-07)", () => {
  it("prepends the default +91 to a bare 10-digit Indian number", () => {
    expect(toE164("9876543210")).toBe("+919876543210");
  });
  it("strips a national trunk 0 before prepending", () => {
    expect(toE164("09876543210")).toBe("+919876543210");
  });
  it("passes through an already-E.164 number and normalizes 00 prefixes", () => {
    expect(toE164("+14155550123")).toBe("+14155550123");
    expect(toE164("00919876543210")).toBe("+919876543210");
  });
  it("returns null for blank/garbage", () => {
    expect(toE164("")).toBeNull();
    expect(toE164("abc")).toBeNull();
    expect(toE164(null)).toBeNull();
  });
  it("honors SMS_DEFAULT_COUNTRY", () => {
    expect(toE164("5550123456", "+1")).toBe("+15550123456");
  });
});

describe("graceful gating (NOTIF-07)", () => {
  it("reports unconfigured + returns not_configured when SMS_PROVIDER is unset", async () => {
    expect(getSmsProvider()).toBe("");
    expect(isSmsConfigured()).toBe(false);
    expect(await sendSms({ to: "9876543210", body: "hi" })).toEqual({ sent: false, reason: "not_configured" });
    expect(await sendWhatsApp({ to: "9876543210", body: "hi" })).toEqual({ sent: false, reason: "not_configured" });
  });

  it("returns not_configured when the provider is named but its keys are missing", async () => {
    process.env.SMS_PROVIDER = "twilio";
    expect(isSmsConfigured()).toBe(false);
    expect(await sendSms({ to: "9876543210", body: "hi" })).toEqual({ sent: false, reason: "not_configured" });
  });

  it("returns invalid_number for an unusable phone even when configured", async () => {
    process.env.SMS_PROVIDER = "twilio";
    process.env.TWILIO_ACCOUNT_SID = "AC";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_SMS_FROM = "+10000000000";
    expect(await sendSms({ to: "xyz", body: "hi" })).toEqual({ sent: false, reason: "invalid_number" });
  });
});

describe("provider dispatch (NOTIF-07)", () => {
  it("POSTs to Twilio with basic auth + E.164 destination when configured", async () => {
    process.env.SMS_PROVIDER = "twilio";
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_SMS_FROM = "+10000000000";
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendSms({ to: "9876543210", body: "Ticket ABC" });
    expect(result).toEqual({ sent: true });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain("api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect(opts.headers.Authorization).toMatch(/^Basic /);
    expect(opts.body).toContain("To=%2B919876543210");
    vi.unstubAllGlobals();
  });

  it("never throws — a provider HTTP failure resolves to { sent:false, error }", async () => {
    process.env.SMS_PROVIDER = "twilio";
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_SMS_FROM = "+10000000000";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    const result = await sendSms({ to: "9876543210", body: "x" });
    expect(result.sent).toBe(false);
    expect(result.error).toMatch(/twilio 500/);
    vi.unstubAllGlobals();
  });
});
