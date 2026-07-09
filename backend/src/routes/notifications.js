// backend/src/routes/notifications.js
//
// NOTIF-09: notification preferences (authed) + public one-click unsubscribe.

import express from "express";
import prisma from "../prisma.js";
import { authenticateUser } from "../middleware/authMiddleware.js";
import { NOTIFY_CATEGORIES, verifyUnsubscribeToken } from "../utils/notifications.js";

const PREF_SELECT = {
  notifyReminders: true,
  notifySalesAlerts: true,
  notifySalesDigest: true,
  notifyMarketing: true,
};
const PREF_FIELDS = Object.keys(PREF_SELECT);

// ==================== /api/notifications ====================
const router = express.Router();

// GET /api/notifications/preferences — the caller's category flags.
router.get("/preferences", authenticateUser, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: PREF_SELECT,
  });
  if (!user) return res.fail(404, "NOT_FOUND", "User not found");
  return res.ok(user);
});

// PUT /api/notifications/preferences — update any subset of the boolean flags.
router.put("/preferences", authenticateUser, async (req, res) => {
  const data = {};
  for (const field of PREF_FIELDS) {
    if (typeof req.body?.[field] === "boolean") data[field] = req.body[field];
  }
  if (Object.keys(data).length === 0) {
    return res.fail(400, "VALIDATION_ERROR", "Provide at least one boolean preference flag");
  }
  const updated = await prisma.user.update({
    where: { id: req.user.userId },
    data,
    select: PREF_SELECT,
  });
  return res.ok(updated, { message: "Preferences updated" });
});

// ==================== NOTIF-08: in-app notification center ====================

// GET /api/notifications — the caller's notifications (newest first) + unreadCount.
// Cursor pagination via ?cursor=<id> & ?limit (default 20, max 50).
router.get("/", authenticateUser, async (req, res) => {
  const userId = req.user.userId;
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const cursor = parseInt(req.query.cursor);

  const items = await prisma.notification.findMany({
    where: { userId },
    orderBy: { id: "desc" },
    take: limit + 1, // fetch one extra to detect "hasMore"
    ...(Number.isInteger(cursor) ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = items.length > limit;
  const notifications = hasMore ? items.slice(0, limit) : items;
  const unreadCount = await prisma.notification.count({ where: { userId, read: false } });

  return res.ok({
    notifications,
    unreadCount,
    nextCursor: hasMore ? notifications[notifications.length - 1].id : null,
  });
});

// PATCH /api/notifications/read-all — mark all of the caller's unread as read.
// MUST be declared before "/:id" so it isn't captured as an id.
router.patch("/read-all", authenticateUser, async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.userId, read: false },
    data: { read: true, readAt: new Date() },
  });
  return res.ok({ ok: true });
});

// PATCH /api/notifications/:id — mark one read (owner-only; 403 on someone else's).
router.patch("/:id", authenticateUser, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.fail(400, "VALIDATION_ERROR", "Invalid notification id");
  // Scope the lookup to the caller so a MISSING id and ANOTHER USER's id are
  // indistinguishable (both 404) — no existence/enumeration oracle across the
  // sequential ids (Phase-5 review P3). Ownership is still enforced.
  const notif = await prisma.notification.findFirst({ where: { id, userId: req.user.userId } });
  if (!notif) return res.fail(404, "NOT_FOUND", "Notification not found");
  const updated = await prisma.notification.update({
    where: { id },
    data: { read: true, readAt: notif.readAt ?? new Date() },
  });
  return res.ok(updated);
});

export default router;

// ==================== /api/unsubscribe (public, RFC 8058) ====================
export const unsubscribeRouter = express.Router();

const CATEGORY_LABELS = {
  reminders: "event reminders",
  sales_alerts: "new-sale alerts",
  sales_digest: "the daily sales digest",
  marketing: "promotional emails",
};

// Verify the signed token and flip exactly the named category off. updateMany so
// a stale user id is a no-op rather than a throw. Returns { userId, category } or
// null for an invalid/tampered/expired token.
async function applyUnsubscribe(token) {
  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) return null;
  const field = NOTIFY_CATEGORIES[parsed.category];
  if (!field) return null;
  await prisma.user.updateMany({ where: { id: parsed.userId }, data: { [field]: false } });
  return parsed;
}

function confirmationPage(ok, category) {
  const label = (category && CATEGORY_LABELS[category]) || "these emails";
  const body = ok
    ? `<h1>You're unsubscribed</h1><p>You'll no longer receive ${label}. You can re-enable them any time from your notification settings.</p>`
    : `<h1>Link invalid</h1><p>This unsubscribe link is invalid or has already been used. Manage your preferences from your account settings instead.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe · FesTicket</title></head>
<body style="font-family:system-ui,sans-serif;background:#faf8fb;margin:0;padding:48px 16px;color:#29104A;">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:12px;padding:32px;text-align:center;">
${body}
</div></body></html>`;
}

// GET /api/unsubscribe?token=... — a human clicking the footer link. HTML page.
unsubscribeRouter.get("/", async (req, res) => {
  const parsed = await applyUnsubscribe(req.query.token);
  res.status(parsed ? 200 : 400).type("html").send(confirmationPage(!!parsed, parsed?.category));
});

// POST /api/unsubscribe?token=... — RFC 8058 one-click (mail client sends
// List-Unsubscribe=One-Click). Token travels in the query per the header URL. No
// auth/CSRF by design.
unsubscribeRouter.post("/", async (req, res) => {
  const token = req.query.token || req.body?.token;
  const parsed = await applyUnsubscribe(token);
  res.status(parsed ? 200 : 400).json({ success: !!parsed });
});
