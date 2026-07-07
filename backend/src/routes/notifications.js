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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe · tiqr</title></head>
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
