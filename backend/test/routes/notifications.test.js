import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { prismaMock, resetPrismaMock } from "@prisma/client";
import { makeApp } from "../helpers/makeApp.js";
import { signToken } from "../helpers/auth.js";
import notificationsRouter, { unsubscribeRouter } from "../../src/routes/notifications.js";
import { signUnsubscribeToken } from "../../src/utils/notifications.js";

vi.mock("@prisma/client");

const appNotif = makeApp(notificationsRouter, "/api/notifications");
const appUnsub = makeApp(unsubscribeRouter, "/api/unsubscribe");
const authHeader = ["Authorization", `Bearer ${signToken({ userId: 42, role: "VIEWER" })}`];

const ALL_PREFS = { notifyReminders: true, notifySalesAlerts: true, notifySalesDigest: true, notifyMarketing: true };

beforeEach(() => resetPrismaMock());

describe("GET /api/notifications/preferences", () => {
  it("401 without a token", async () => {
    const res = await request(appNotif).get("/api/notifications/preferences");
    expect(res.status).toBe(401);
  });

  it("returns the caller's flags", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...ALL_PREFS, notifyMarketing: false });
    const res = await request(appNotif).get("/api/notifications/preferences").set(...authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ...ALL_PREFS, notifyMarketing: false });
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 42 } }));
  });
});

describe("PUT /api/notifications/preferences", () => {
  it("updates only the supplied boolean flags", async () => {
    prismaMock.user.update.mockResolvedValue({ ...ALL_PREFS, notifyReminders: false });
    const res = await request(appNotif)
      .put("/api/notifications/preferences")
      .set(...authHeader)
      .send({ notifyReminders: false, ignored: "x", notifyMarketing: "not-a-bool" });
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 42 }, data: { notifyReminders: false } })
    );
  });

  it("400 when no valid boolean flag is supplied", async () => {
    const res = await request(appNotif)
      .put("/api/notifications/preferences")
      .set(...authHeader)
      .send({ notifyReminders: "yes", foo: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe("GET/POST /api/unsubscribe", () => {
  it("flips exactly the named category off for a valid signed token (HTML)", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
    const token = signUnsubscribeToken(42, "reminders");
    const res = await request(appUnsub).get(`/api/unsubscribe?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toMatch(/unsubscribed/i);
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({ where: { id: 42 }, data: { notifyReminders: false } });
  });

  it("rejects a tampered/invalid token without any DB write (400)", async () => {
    const res = await request(appUnsub).get("/api/unsubscribe?token=not-a-real-token");
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/invalid/i);
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("one-click POST behaves identically (RFC 8058)", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
    const token = signUnsubscribeToken(7, "sales_digest");
    const res = await request(appUnsub).post(`/api/unsubscribe?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({ where: { id: 7 }, data: { notifySalesDigest: false } });
  });

  it("POST with a bad token returns 400 success:false", async () => {
    const res = await request(appUnsub).post("/api/unsubscribe?token=bad");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false });
  });
});
