// backend/src/utils/waitlist.js
//
// PAY-08: when inventory is released for a ticket type (cancel / sweep-expire /
// refund, or a claim window expiring), notify the OLDEST WAITING waiter with a
// time-boxed claim link. Soft hold — they book normally within the window; a
// walk-in could still take the seat first (acceptable per spec). The
// WAITING->NOTIFIED updateMany guard makes concurrent releases idempotent so the
// same waiter is never notified twice.
//
// MUST be called AFTER the release transaction commits (never inside it — email
// I/O would hold the tx open). Best-effort: never throws out of the caller.

import crypto from "node:crypto";
import prisma from "../prisma.js";
import { sendWaitlistClaim } from "./email.js";

const CLAIM_WINDOW_MS = 30 * 60 * 1000;

// Notify ONE waiter (the oldest WAITING). Returns the notified row or null when
// there is no waiter / the atomic claim was lost to a concurrent release.
async function notifyOneWaiter(ticketTypeId, log) {
  try {
    const next = await prisma.waitlist.findFirst({
      where: { ticketTypeId, status: "WAITING" },
      orderBy: { createdAt: "asc" },
    });
    if (!next) return null;

    const claimToken = crypto.randomUUID();
    const claimExpiresAt = new Date(Date.now() + CLAIM_WINDOW_MS);
    const claim = await prisma.waitlist.updateMany({
      where: { id: next.id, status: "WAITING" },
      data: { status: "NOTIFIED", claimToken, claimExpiresAt, notifiedAt: new Date() },
    });
    if (claim.count !== 1) return null; // another release won the race

    const full = await prisma.waitlist.findUnique({
      where: { id: next.id },
      include: { ticketType: { include: { event: { select: { id: true, name: true } } } } },
    });
    const base = process.env.FRONTEND_URL || "http://localhost:3000";
    const claimUrl = `${base}/waitlist/claim/${claimToken}`;
    await sendWaitlistClaim(full, full.ticketType?.event, full.ticketType, claimUrl).catch(() => {});
    return full;
  } catch (e) {
    log?.error?.({ err: e, ticketTypeId }, "[waitlist] release failed");
    return null;
  }
}

// Offer `seats` freed seats of a ticket type to the oldest WAITING waiters — ONE
// per seat (Phase-5 review P2: a released BookingItem can free N seats, so we
// must notify up to N distinct waiters, not just the first). Each notified waiter
// is flipped WAITING->NOTIFIED atomically, so the next iteration picks a different
// waiter and concurrent releases never double-notify. Returns the count notified.
export async function releaseToWaitlist(ticketTypeId, seats = 1, log) {
  const n = Number.isInteger(seats) && seats > 0 ? seats : 1;
  let notified = 0;
  for (let i = 0; i < n; i++) {
    const row = await notifyOneWaiter(ticketTypeId, log);
    if (!row) break; // no more waiters (or lost the race — stop)
    notified += 1;
  }
  return notified;
}

// Background sweep: flip NOTIFIED entries whose 30-min claim window has passed to
// EXPIRED and re-offer each freed seat to the next WAITING waiter. Without this,
// a notified waiter who ignores the email keeps the entry NOTIFIED forever and
// the next waiter is never offered the seat (Phase-5 review P3). Called from the
// scheduled sweep; best-effort.
export async function expireStaleWaitlistClaims(log) {
  const stale = await prisma.waitlist.findMany({
    where: { status: "NOTIFIED", claimExpiresAt: { lt: new Date() } },
    select: { id: true, ticketTypeId: true },
  });
  let expired = 0;
  for (const w of stale) {
    // Atomically claim the NOTIFIED->EXPIRED transition so a just-in-time claim
    // isn't clobbered.
    const flip = await prisma.waitlist.updateMany({
      where: { id: w.id, status: "NOTIFIED" },
      data: { status: "EXPIRED" },
    });
    if (flip.count !== 1) continue; // claimed / expired concurrently
    expired += 1;
    await releaseToWaitlist(w.ticketTypeId, 1, log); // offer to the next waiter
  }
  return { expired };
}
