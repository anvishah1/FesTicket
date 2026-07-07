// backend/src/utils/notifications.js
//
// NOTIF-09: notification-preference categories + signed one-click unsubscribe.
//
// Only NON-transactional mail is gated by these. Transactional mail (booking
// confirmation / cancellation / payment receipt) is always sent and has NO
// unsubscribe. Keep this list explicit — misclassifying a receipt as marketing
// would unlawfully suppress required mail.

import jwt from "jsonwebtoken";

// category slug -> User boolean column (schema.prisma model User, NOTIF-09).
export const NOTIFY_CATEGORIES = {
  reminders: "notifyReminders",
  sales_alerts: "notifySalesAlerts",
  sales_digest: "notifySalesDigest",
  marketing: "notifyMarketing",
};

export function isValidCategory(category) {
  return Object.prototype.hasOwnProperty.call(NOTIFY_CATEGORIES, category);
}

// A long-lived HMAC-signed token (JWT_SECRET) over { userId, category }. NO
// expiry on purpose — unsubscribe links live in emails read months later. The
// `purpose` claim scopes it so it can never be used as a session/access token.
export function signUnsubscribeToken(userId, category) {
  return jwt.sign({ u: userId, c: category, purpose: "unsubscribe" }, process.env.JWT_SECRET);
}

// Returns { userId, category } for a valid token, else null. Rejects tampered
// tokens, wrong-purpose tokens, and unknown categories (HMAC via JWT_SECRET means
// a token can't be forged to unsubscribe another user).
export function verifyUnsubscribeToken(token) {
  if (typeof token !== "string" || !token) return null;
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    if (p?.purpose !== "unsubscribe" || !isValidCategory(p.c) || !Number.isInteger(p.u)) return null;
    return { userId: p.u, category: p.c };
  } catch {
    return null;
  }
}

// Is the recipient opted IN for this category? A guest (no User row) has no
// prefs, so is treated as opted-in (their opt-out is handled per-booking, or the
// send simply proceeds). A missing/unknown category never suppresses mail.
export function isOptedIn(user, category) {
  const field = NOTIFY_CATEGORIES[category];
  if (!field) return true;
  if (!user) return true;
  return user[field] !== false;
}
