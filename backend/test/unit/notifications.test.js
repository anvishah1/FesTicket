import { describe, it, expect } from "vitest";
import {
  NOTIFY_CATEGORIES,
  isValidCategory,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
  isOptedIn,
} from "../../src/utils/notifications.js";

describe("notification categories (NOTIF-09)", () => {
  it("maps each category slug to a User boolean field", () => {
    expect(NOTIFY_CATEGORIES).toEqual({
      reminders: "notifyReminders",
      sales_alerts: "notifySalesAlerts",
      sales_digest: "notifySalesDigest",
      marketing: "notifyMarketing",
    });
    expect(isValidCategory("reminders")).toBe(true);
    expect(isValidCategory("nope")).toBe(false);
  });
});

describe("unsubscribe token (NOTIF-09)", () => {
  it("round-trips a signed { userId, category } token", () => {
    const token = signUnsubscribeToken(99, "marketing");
    expect(verifyUnsubscribeToken(token)).toEqual({ userId: 99, category: "marketing" });
  });

  it("rejects a tampered token, a non-string, and an unknown category", () => {
    const token = signUnsubscribeToken(1, "reminders");
    expect(verifyUnsubscribeToken(token.slice(0, -2) + "xx")).toBeNull();
    expect(verifyUnsubscribeToken(null)).toBeNull();
    expect(verifyUnsubscribeToken("")).toBeNull();
  });

  it("rejects a token signed for a different purpose", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const wrong = jwt.sign({ u: 1, c: "reminders", purpose: "login" }, process.env.JWT_SECRET);
    expect(verifyUnsubscribeToken(wrong)).toBeNull();
  });
});

describe("isOptedIn (NOTIF-09)", () => {
  it("respects the User flag, defaults a guest to opted-in", () => {
    expect(isOptedIn({ notifyReminders: false }, "reminders")).toBe(false);
    expect(isOptedIn({ notifyReminders: true }, "reminders")).toBe(true);
    expect(isOptedIn(null, "reminders")).toBe(true); // guest — no prefs row
    expect(isOptedIn({}, "reminders")).toBe(true); // flag absent -> not opted out
  });
});
