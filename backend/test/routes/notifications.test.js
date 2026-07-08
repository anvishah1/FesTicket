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

describe("GET /api/notifications (NOTIF-08)", () => {
  it("401 without a token", async () => {
    const res = await request(appNotif).get("/api/notifications");
    expect(res.status).toBe(401);
  });

  it("returns the caller's notifications + unreadCount, scoped to them", async () => {
    prismaMock.notification.findMany.mockResolvedValue([
      { id: 3, userId: 42, title: "New sale", read: false },
      { id: 2, userId: 42, title: "Confirmed", read: true },
    ]);
    prismaMock.notification.count.mockResolvedValue(1);
    const res = await request(appNotif).get("/api/notifications").set(...authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.notifications).toHaveLength(2);
    expect(res.body.data.unreadCount).toBe(1);
    expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 42 }, orderBy: { id: "desc" } })
    );
    expect(prismaMock.notification.count).toHaveBeenCalledWith({ where: { userId: 42, read: false } });
  });

  it("sets nextCursor when there are more than the limit", async () => {
    // limit=1 -> fetch take=2; two rows returned => hasMore.
    prismaMock.notification.findMany.mockResolvedValue([
      { id: 9, userId: 42, read: false },
      { id: 8, userId: 42, read: false },
    ]);
    prismaMock.notification.count.mockResolvedValue(2);
    const res = await request(appNotif).get("/api/notifications?limit=1").set(...authHeader);
    expect(res.body.data.notifications).toHaveLength(1);
    expect(res.body.data.nextCursor).toBe(9);
  });
});

describe("PATCH /api/notifications (NOTIF-08)", () => {
  it("marks one notification read (owner)", async () => {
    prismaMock.notification.findFirst.mockResolvedValue({ id: 5, userId: 42, read: false });
    prismaMock.notification.update.mockResolvedValue({ id: 5, read: true });
    const res = await request(appNotif).patch("/api/notifications/5").set(...authHeader);
    expect(res.status).toBe(200);
    expect(prismaMock.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5 }, data: expect.objectContaining({ read: true }) })
    );
  });

  it("404 (not 403) for another user's notification — no existence oracle (P3 fix)", async () => {
    // The owner-scoped findFirst returns nothing for a not-owned id, same as a
    // missing id, so both are indistinguishable 404s.
    prismaMock.notification.findFirst.mockResolvedValue(null);
    const res = await request(appNotif).patch("/api/notifications/5").set(...authHeader);
    expect(res.status).toBe(404);
    expect(prismaMock.notification.update).not.toHaveBeenCalled();
    // The lookup is scoped to the caller.
    expect(prismaMock.notification.findFirst).toHaveBeenCalledWith({ where: { id: 5, userId: 42 } });
  });

  it("404 when the notification does not exist", async () => {
    prismaMock.notification.findFirst.mockResolvedValue(null);
    const res = await request(appNotif).patch("/api/notifications/5").set(...authHeader);
    expect(res.status).toBe(404);
  });

  it("read-all marks all the caller's unread as read (not captured as an :id)", async () => {
    prismaMock.notification.updateMany.mockResolvedValue({ count: 3 });
    const res = await request(appNotif).patch("/api/notifications/read-all").set(...authHeader);
    expect(res.status).toBe(200);
    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 42, read: false },
      data: expect.objectContaining({ read: true }),
    });
    // The /read-all route must NOT have hit the single-id handler.
    expect(prismaMock.notification.findFirst).not.toHaveBeenCalled();
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
