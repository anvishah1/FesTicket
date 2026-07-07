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

export async function releaseToWaitlist(ticketTypeId, log) {
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
