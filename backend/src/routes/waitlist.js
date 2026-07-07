// backend/src/routes/waitlist.js
//
// PAY-08: public claim-link endpoint. The join (POST) + host queue (GET) live on
// the events router (/api/events/:eventId/waitlist); this router is mounted at
// /api/waitlist and only serves the claim page.

import express from "express";
import prisma from "../prisma.js";
import { releaseToWaitlist } from "../utils/waitlist.js";

const router = express.Router();

// GET /api/waitlist/claim/:claimToken — validate a claim token (must be NOTIFIED
// and not expired) and return the event + ticket type so the claim page can deep
// link into the booking flow. An expired token is rejected AND re-releases the
// seat to the next waiter.
router.get("/claim/:claimToken", async (req, res) => {
  const { claimToken } = req.params;
  const entry = await prisma.waitlist.findUnique({
    where: { claimToken },
    include: {
      ticketType: {
        select: {
          id: true,
          name: true,
          price: true,
          event: { select: { id: true, name: true, venue: true, startDate: true } },
        },
      },
    },
  });

  if (!entry || entry.status !== "NOTIFIED") {
    return res.fail(404, "NOT_FOUND", "This claim link is invalid or has already been used");
  }

  if (!entry.claimExpiresAt || entry.claimExpiresAt < new Date()) {
    // Expire it, then offer the seat to the next waiter (best-effort).
    const flip = await prisma.waitlist.updateMany({
      where: { id: entry.id, status: "NOTIFIED" },
      data: { status: "EXPIRED" },
    });
    if (flip.count === 1) releaseToWaitlist(entry.ticketTypeId, req.log).catch(() => {});
    return res.fail(410, "CLAIM_EXPIRED", "This claim link has expired");
  }

  return res.ok({
    ticketTypeId: entry.ticketTypeId,
    eventId: entry.ticketType?.event?.id,
    event: entry.ticketType?.event,
    ticketType: { id: entry.ticketType?.id, name: entry.ticketType?.name, price: entry.ticketType?.price },
    claimExpiresAt: entry.claimExpiresAt,
  });
});

export default router;
