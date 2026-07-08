// backend/src/routes/bookings.js
import { Router } from "express";
import crypto from "crypto";
import prisma from "../prisma.js";
import Razorpay from "razorpay";
import {
  sendBookingConfirmation,
  sendBookingCancelled,
  sendPaymentFailed,
  sendBookingExpired,
  sendAbandonedCheckout,
  sendEventReminder,
  sendNewSaleAlert,
  sendSalesDigest,
} from "../utils/email.js";
import { sendSms } from "../utils/sms.js";
import { createNotification } from "../utils/notify.js";
import { releaseToWaitlist } from "../utils/waitlist.js";
import { authenticateUser, optionalAuthenticate, authorizeRoles } from "../middleware/authMiddleware.js";
import { bookingLimiter, writeLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import { createBookingSchema } from "../validators/bookingValidator.js";
import { bookingError } from "../utils/AppError.js";
import { parsePagination, buildPagination } from "../utils/pagination.js";
import { streamInvoicePdf } from "../utils/invoice.js";
import {
  getAppleWalletConfig,
  getGoogleWalletConfig,
  walletAvailability,
  buildApplePkpass,
  buildGoogleSaveUrl,
} from "../utils/wallet.js";

const router = Router();

// Resolve the caller's fest ids — the JWT only carries { userId, role }, so
// fest-scoped ownership checks must look the user up. ADMIN owns managedFestId;
// EDITOR/HOST owns editorFestId.
async function callerFests(req) {
  const u = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { managedFestId: true, editorFestId: true },
  });
  return { managedFestId: u?.managedFestId ?? null, editorFestId: u?.editorFestId ?? null };
}

const forbid = (res, message = "You do not have access to this booking") =>
  res.status(403).json({ success: false, error: { code: "FORBIDDEN", message } });

// Guest-safe booking access for the payment-flow endpoints (complete /
// create-order / verify-payment). These must work for a logged-out guest but
// must NOT be callable against an arbitrary numeric booking id. Access is granted
// to: the authenticated buyer, the event's host, an ADMIN of the event's fest,
// OR anyone who presents THIS booking's unguessable `bookingCode` (proving they
// created it). `booking` must include bookingCode + event { hostId, festId }.
async function callerOwnsBooking(req, booking) {
  if (!booking) return false;
  // TIX-06: the bookingCode may be proven via the request body OR a :bookingCode
  // path param (guest-safe, e.g. the transfer endpoint).
  const providedCode = req.body?.bookingCode || req.params?.bookingCode;
  if (providedCode && booking.bookingCode && providedCode === booking.bookingCode) return true;
  if (!req.user) return false;
  if (booking.userId != null && booking.userId === req.user.userId) return true;
  if (booking.event?.hostId != null && booking.event.hostId === req.user.userId) return true;
  if (req.user.role === "ADMIN") {
    const { managedFestId } = await callerFests(req);
    if (booking.event?.festId != null && booking.event.festId === managedFestId) return true;
  }
  return false;
}

// Business/client errors are tagged with an explicit HTTP status + stable code +
// safe message via bookingError (now an AppError factory imported above). The
// POST catch maps these to their status/message; ANY untagged error is an
// unexpected fault -> GENERIC 500 (raw message never leaked). AppError instances
// are also recognized by the central error handler (index.js).

const getRazorpay = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

const mapRazorpayMethod = (m) => {
  if (!m) return "UPI";
  const s = String(m).toUpperCase();
  if (["UPI", "CARD", "NETBANKING", "WALLET"].includes(s)) return s;
  if (s.includes("NETBANKING") || s.includes("BANK")) return "NETBANKING";
  if (s.includes("CARD")) return "CARD";
  if (s.includes("WALLET")) return "WALLET";
  return "UPI";
};

// Sum of ticket quantities across a booking's items
const sumTicketQuantity = (items) => items.reduce((s, i) => s + i.quantity, 0);

// PAY-07: stable GST-invoice number assigned once at completion. bookingId is
// unique, so TIQR-<year>-<id> is unique and reproducible on every PDF render.
const invoiceNumberFor = (bookingId) => `TIQR-${new Date().getFullYear()}-${bookingId}`;

// PAY-03: all money is INTEGER PAISE. Fees are computed with integer arithmetic
// (Math.round yields whole paise), so there is no binary-float drift and the
// stored total is exactly reproducible by the frontend from the same subtotal.
// The Razorpay amount IS booking.total (already paise) — no *100.
//
// Compute { platformFee, tax, total } (all paise) from a subtotal (paise):
// platformFee = round(2% of subtotal); tax = round(18% GST of subtotal+fee);
// total = subtotal + platformFee + tax.
const computeFees = (subtotal) => {
  const platformFee = Math.round(subtotal * 0.02); // 2% platform fee (paise)
  const tax = Math.round((subtotal + platformFee) * 0.18); // 18% GST on (subtotal + fee)
  const total = subtotal + platformFee + tax; // integers -> exact
  return { platformFee, tax, total };
};

// Shared event select used by single-booking lookups
const bookingEventSelect = {
  id: true,
  name: true,
  venue: true,
  venueAddress: true,
  startDate: true,
  endDate: true,
  startTime: true,
  image: true,
  fest: { select: { name: true, college: true } },
};

// PAY-05: inventory is held from booking creation until the stale-sweep releases
// it. This is the SINGLE source of truth for that window — the sweep default and
// the payment-page countdown both derive from it.
export const BOOKING_HOLD_MS = 15 * 60 * 1000;

// Attach a derived expiresAt/holdMs to a booking for the guest/lookup responses.
// A PENDING booking's hold expires at createdAt + BOOKING_HOLD_MS; anything else
// has no active hold (expiresAt null).
const withHoldExpiry = (booking) => {
  if (!booking) return booking;
  const expiresAt =
    booking.status === "PENDING" && booking.createdAt
      ? new Date(new Date(booking.createdAt).getTime() + BOOKING_HOLD_MS).toISOString()
      : null;
  return { ...booking, expiresAt, holdMs: BOOKING_HOLD_MS };
};

// Idempotently settle a PENDING booking as paid (PAY-01). The status-guarded
// updateMany means a webhook and the browser verify-payment racing each other
// settle it exactly once; returns the full updated booking, or null if it was
// not PENDING (already settled / cancelled) so the caller treats it as a no-op.
async function settleBookingAsPaid(bookingId, { transactionId, method }) {
  const won = await prisma.$transaction(async (tx) => {
    const flip = await tx.booking.updateMany({
      where: { id: bookingId, status: "PENDING" },
      data: { status: "COMPLETED", purchaseDate: new Date(), invoiceNumber: invoiceNumberFor(bookingId) },
    });
    if (flip.count === 0) return false;
    await tx.payment.updateMany({
      where: { bookingId },
      data: { status: "SUCCESS", transactionId, paymentDate: new Date(), method },
    });
    return true;
  });
  if (!won) return null;
  return prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      event: true,
      items: { include: { ticketType: true } },
      attendees: true,
      user: { select: { email: true, name: true } },
    },
  });
}

// NOTIF-06: mark a still-PENDING booking's payment FAILED (once) and email the
// buyer. The status-guarded updateMany makes the transition idempotent so a buyer
// retrying verify-payment isn't spammed; the email only fires on the first flip
// and only while the booking itself is still PENDING (never after it settled).
async function markPaymentFailedAndNotify(bookingId, log) {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        event: { select: { id: true, name: true } },
        user: { select: { email: true, name: true } },
        payment: true,
      },
    });
    if (!booking || booking.status !== "PENDING") return;

    let firstFailure;
    if (booking.payment) {
      const flip = await prisma.payment.updateMany({
        where: { bookingId, status: "PENDING" },
        data: { status: "FAILED" },
      });
      firstFailure = flip.count === 1;
    } else {
      // No payment row yet — treat as the first observed failure.
      firstFailure = true;
    }
    if (!firstFailure) return;

    sendPaymentFailed(booking).catch((e) =>
      log?.error?.({ err: e, bookingId }, "[email] Payment-failed email failed")
    );
  } catch (e) {
    log?.error?.({ err: e, bookingId }, "[email] markPaymentFailedAndNotify error");
  }
}

// NOTIF-05: on a booking completion, email the event's host + the fest ADMIN a
// "new sale" alert (fire-and-forget, opt-out respected). `booking.event` must
// carry hostId + festId. De-dupes the two recipients when host === admin.
async function notifyNewSale(booking, log) {
  try {
    const event = booking?.event;
    if (!event) return;
    const recipients = [];
    if (event.hostId != null) {
      const host = await prisma.user.findUnique({
        where: { id: event.hostId },
        select: { id: true, email: true, name: true, notifySalesAlerts: true },
      });
      if (host?.email) recipients.push(host);
    }
    if (event.festId != null) {
      const admin = await prisma.user.findFirst({
        where: { managedFestId: event.festId },
        select: { id: true, email: true, name: true, notifySalesAlerts: true },
      });
      if (admin?.email && !recipients.some((r) => r.id === admin.id)) recipients.push(admin);
    }
    // NOTIF-09: drop opted-out recipients.
    const optedIn = recipients.filter((r) => r.notifySalesAlerts !== false);
    if (optedIn.length === 0) return;
    await sendNewSaleAlert(booking, optedIn);
  } catch (e) {
    log?.error?.({ err: e, bookingId: booking?.id }, "[email] new-sale alert failed");
  }
}

// NOTIF-07: text the buyer their booking code + a link to view/download tickets
// on completion. Graceful — a no-op when SMS is unconfigured or no phone resolves.
async function notifyTicketSms(booking, log) {
  try {
    let phone = booking?.guestPhone || booking?.user?.phone || null;
    if (!phone && booking?.userId) {
      const u = await prisma.user.findUnique({ where: { id: booking.userId }, select: { phone: true } });
      phone = u?.phone || null;
    }
    if (!phone) return; // no number — skip cleanly
    const base = process.env.FRONTEND_URL || "http://localhost:3000";
    const link = `${base}/booking-confirmation?bookingCode=${encodeURIComponent(booking.bookingCode)}`;
    const eventName = booking.event?.name || "your event";
    const body = `Your ${eventName} booking is confirmed. Code: ${booking.bookingCode}. View tickets: ${link}`;
    await sendSms({ to: phone, body });
  } catch (e) {
    log?.error?.({ err: e, bookingId: booking?.id }, "[sms] ticket text failed");
  }
}

// NOTIF-08: in-app notifications on a booking completion — the buyer (if
// registered) gets a "confirmed" notice, the event host a "new sale" notice.
async function notifyInAppSale(booking) {
  const event = booking?.event || {};
  const eventName = event.name || "your event";
  if (booking?.userId) {
    await createNotification({
      userId: booking.userId,
      type: "booking_confirmed",
      title: "Booking confirmed",
      body: `Your booking for ${eventName} is confirmed.`,
      linkUrl: "/bookings",
    });
  }
  if (event?.hostId) {
    await createNotification({
      userId: event.hostId,
      type: "new_sale",
      title: "New ticket sale",
      body: `A ticket for ${eventName} just sold.`,
      linkUrl: "/host/dashboard",
    });
  }
}

// PAY-04: return a redemption to a promo code when its booking is released
// (manual cancel / stale-sweep / full refund), floored at 0, so an abandoned or
// refunded booking doesn't permanently burn a capped code.
async function releasePromoRedemption(tx, promoCodeId) {
  if (promoCodeId == null) return;
  await tx.promoCode.updateMany({
    where: { id: promoCodeId, redeemedCount: { gt: 0 } },
    data: { redeemedCount: { decrement: 1 } },
  });
}

// PAY-02: restore held inventory + release the promo for a fully-refunded booking.
// Called inside a $transaction ONLY by the caller that won the COMPLETED->REFUNDED
// flip, so it runs exactly once even under concurrent refunds.
async function restoreInventoryAndPromo(tx, booking) {
  for (const item of booking.items) {
    await tx.ticketType.updateMany({
      where: { id: item.ticketTypeId, sold: { gte: item.quantity } },
      data: { sold: { decrement: item.quantity } },
    });
  }
  await releasePromoRedemption(tx, booking.promoCodeId);
}

// ==================== CREATE BOOKING ====================

// POST /api/bookings - Create a new booking (buy tickets)
router.post("/", bookingLimiter, optionalAuthenticate, validate(createBookingSchema), async (req, res) => {
  try {
    const {
      eventId,
      guestEmail,
      guestName,
      guestPhone,
      tickets, // Array of { ticketTypeId, quantity }
      attendees, // Array of { ticketTypeId, name, email }
      answers, // Optional array of { questionId, value } — per-booking question answers
      promoCode, // Optional promo code string (PAY-04) — discount derived server-side
      ref, // SEO-09: optional referral code (a referring booking's bookingCode)
    } = req.body;

    // L2: the owning user comes ONLY from a verified token, never from the body.
    // A guest (no token) can never attribute a booking to someone else's account.
    const userId = req.user ? req.user.userId : null;

    // SEO-09: sanitize the referral code to the bookingCode charset and ignore an
    // authenticated user referring themselves. Attribution only — never money.
    let referredByCode = typeof ref === "string" ? ref.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) : "";
    if (referredByCode && userId) {
      const referrer = await prisma.booking.findUnique({
        where: { bookingCode: referredByCode },
        select: { userId: true },
      });
      if (referrer?.userId && referrer.userId === userId) referredByCode = ""; // self-referral
    }
    referredByCode = referredByCode || null;

    // Validation
    if (!eventId || !tickets || tickets.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Event ID and tickets are required" },
      });
    }

    // Must have either an authenticated user or guest info
    if (!userId && !guestEmail) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "User ID or guest email is required" },
      });
    }

    // H10(a): validate every requested quantity is a positive integer BEFORE any
    // pricing/inventory math. Guards against 0/negative/fractional/NaN payloads
    // that would otherwise corrupt totals or the sold counter.
    for (const item of tickets) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Each ticket quantity must be an integer >= 1" },
        });
      }
    }

    // ATTENDEE-COUNT: when an attendees array is supplied, it must contain exactly
    // one attendee per ticket (length === sum of requested quantities). An omitted
    // or empty attendees array stays allowed — attendee capture is optional — so
    // this only fires on a genuine mismatch, never on "no attendees".
    const totalRequestedQty = tickets.reduce((s, t) => s + t.quantity, 0);
    if (Array.isArray(attendees) && attendees.length > 0 && attendees.length !== totalRequestedQty) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `Number of attendees (${attendees.length}) must match the total ticket quantity (${totalRequestedQty})`,
        },
      });
    }

    // Create booking in a transaction
    const booking = await prisma.$transaction(async (tx) => {
      // 1. Verify event exists (+ its ticket types and question set)
      const event = await tx.event.findUnique({
        where: { id: parseInt(eventId) },
        include: { ticketTypes: true, questions: true, fest: { select: { isDeleted: true } } },
      });

      // A missing event is a client error (bad id), not a server fault -> 404.
      if (!event) {
        throw bookingError(404, "NOT_FOUND", "Event not found");
      }

      // A soft-deleted (archived) fest is not bookable — its events are hidden
      // from the public listing/detail, so accept no new bookings for them either.
      if (event.fest?.isDeleted) {
        throw bookingError(409, "EVENT_NOT_BOOKABLE", "This event is not available for booking");
      }

      // BOOK-STATUS: only a PUBLISHED + PUBLIC event that has not already ended
      // is bookable. This blocks DRAFT/PRIVATE/CANCELLED and past events from
      // being sold. Events with null dates are allowed (no end constraint).
      // Tagged EVENT_NOT_BOOKABLE -> 409 (a conflict with the resource state).
      if (event.status !== "PUBLISHED" || event.visibility !== "PUBLIC") {
        throw bookingError(409, "EVENT_NOT_BOOKABLE", "This event is not available for booking");
      }
      if (event.endDate && new Date(event.endDate) < new Date()) {
        throw bookingError(409, "EVENT_NOT_BOOKABLE", "This event has already ended");
      }

      // TIX-10: per-order ticket cap (null = no cap). Enforced server-side so a
      // bypassed client cannot exceed it.
      if (event.maxTicketsPerOrder != null && totalRequestedQty > event.maxTicketsPerOrder) {
        throw bookingError(
          400,
          "VALIDATION_ERROR",
          `You can book at most ${event.maxTicketsPerOrder} ticket${event.maxTicketsPerOrder === 1 ? "" : "s"} per order`
        );
      }

      // ATTENDEE-TICKET: every attendee.ticketTypeId (when provided) must be one
      // of THIS event's ticket types. A foreign/invalid id is a 400 — it must NOT
      // reach the raw Prisma insert (which would surface as an opaque 500 on the
      // FK), nor be silently accepted.
      const validTicketTypeIds = new Set(event.ticketTypes.map((t) => t.id));
      if (Array.isArray(attendees)) {
        for (const att of attendees) {
          if (att && att.ticketTypeId != null && !validTicketTypeIds.has(parseInt(att.ticketTypeId))) {
            throw bookingError(
              400,
              "VALIDATION_ERROR",
              `Attendee ticket type ${att.ticketTypeId} is not part of this event`
            );
          }
        }
      }

      // REQUIRED-QUESTIONS: every event question flagged `required` must have a
      // non-empty answer in the submitted `answers` array, else 400.
      const answerList = Array.isArray(answers)
        ? answers.filter((a) => a && a.questionId != null)
        : [];
      const answeredById = new Map(answerList.map((a) => [parseInt(a.questionId), a.value]));
      for (const q of event.questions || []) {
        if (q.required) {
          const v = answeredById.get(q.id);
          if (v == null || String(v).trim() === "") {
            throw bookingError(400, "VALIDATION_ERROR", `An answer is required for "${q.label}"`);
          }
        }
      }

      // H10(b): aggregate requested quantity per ticket type so duplicate line
      // items for the same type are summed BEFORE the availability check (two
      // lines of 3 must be treated as 6, not checked as 3 twice).
      const requestedByType = new Map();
      for (const item of tickets) {
        const ttId = parseInt(item.ticketTypeId);
        requestedByType.set(ttId, (requestedByType.get(ttId) || 0) + item.quantity);
      }

      // ATTENDEE-DISTRIBUTION: when a fully-typed attendee list is supplied (every
      // attendee carries a ticketTypeId), the number of attendees for each type
      // must equal the quantity purchased for that type — otherwise the per-type
      // attendee assignment is meaningless. Only enforced when all attendees are
      // typed, so the "no attendees" / untyped-capture flows stay allowed.
      if (Array.isArray(attendees) && attendees.length > 0 && attendees.every((a) => a && a.ticketTypeId != null)) {
        const attByType = new Map();
        for (const att of attendees) {
          const ttId = parseInt(att.ticketTypeId);
          attByType.set(ttId, (attByType.get(ttId) || 0) + 1);
        }
        for (const [ttId, qty] of requestedByType) {
          if ((attByType.get(ttId) || 0) !== qty) {
            throw bookingError(
              400,
              "VALIDATION_ERROR",
              "The number of attendees for each ticket type must match the quantity purchased"
            );
          }
        }
        for (const ttId of attByType.keys()) {
          if (!requestedByType.has(ttId)) {
            throw bookingError(400, "VALIDATION_ERROR", "An attendee is assigned to a ticket type not in this booking");
          }
        }
      }

      // 2. Verify ticket availability and calculate totals
      let subtotal = 0;
      const bookingItems = [];
      const perType = []; // { ticketType, qty } — reused for the guarded sold write

      for (const [ttId, qty] of requestedByType) {
        const ticketType = event.ticketTypes.find((t) => t.id === ttId);

        if (!ticketType) {
          // Requested a ticket type that isn't part of this event -> client 400.
          throw bookingError(400, "VALIDATION_ERROR", `Ticket type ${ttId} not found`);
        }

        const available = ticketType.quantity - ticketType.sold;
        if (qty > available) {
          // Insufficient inventory is a conflict, not a server fault -> 409.
          throw bookingError(
            409,
            "SOLD_OUT",
            `Not enough tickets available for ${ticketType.name}. Only ${available} left.`
          );
        }

        const itemTotal = ticketType.price * qty;
        subtotal += itemTotal;

        bookingItems.push({
          ticketTypeId: ticketType.id,
          quantity: qty,
          unitPrice: ticketType.price,
          totalPrice: itemTotal,
        });
        perType.push({ ticketType, qty });
      }

      // 3. Apply the EVENT-level discount (a percentage, never taken from the
      // client body — see CONTRACT DISCOUNT / M8), then compute fees on the
      // discounted base with INTEGER PAISE math (PAY-03). subtotal is already
      // paise; with no discount (pct 0) discountedBase === subtotal.
      const pct = event.discount || 0; // percentage 0..100 from the event
      const discount = Math.round(subtotal * (pct / 100)); // paise

      // PAY-04: apply an optional PROMO CODE. Validated + atomically redeemed
      // INSIDE this transaction so a capped code can never be over-redeemed under
      // concurrency and a rolled-back booking never burns a redemption. The
      // discount is derived from the stored PromoCode — a client-supplied amount
      // is never trusted.
      let promoDiscount = 0; // paise
      let promoCodeId = null;
      if (promoCode && String(promoCode).trim()) {
        const codeStr = String(promoCode).trim();
        const promo = await tx.promoCode.findFirst({
          where: {
            code: { equals: codeStr, mode: "insensitive" },
            active: true,
            OR: [{ eventId: parseInt(eventId) }, ...(event.festId != null ? [{ festId: event.festId }] : [])],
          },
        });
        const now = new Date();
        const valid =
          promo &&
          (!promo.startsAt || promo.startsAt <= now) &&
          (!promo.expiresAt || promo.expiresAt >= now) &&
          (promo.minSubtotalPaise == null || subtotal >= promo.minSubtotalPaise) &&
          (promo.maxRedemptions == null || promo.redeemedCount < promo.maxRedemptions);
        if (!valid) {
          throw bookingError(400, "INVALID_PROMO", "This promo code is not valid for this booking");
        }
        const rawPromo =
          promo.kind === "PERCENT"
            ? Math.min(Math.round(subtotal * ((promo.percentOff || 0) / 100)), promo.maxDiscountPaise ?? Infinity)
            : Math.min(promo.flatOffPaise || 0, subtotal);
        // Never let the stacked discount drive the base below zero.
        promoDiscount = Math.max(0, Math.min(rawPromo, subtotal - discount));
        // Atomically claim a redemption (guarded when capped).
        const claim =
          promo.maxRedemptions == null
            ? await tx.promoCode.updateMany({ where: { id: promo.id }, data: { redeemedCount: { increment: 1 } } })
            : await tx.promoCode.updateMany({
                where: { id: promo.id, redeemedCount: { lt: promo.maxRedemptions } },
                data: { redeemedCount: { increment: 1 } },
              });
        if (claim.count === 0) {
          throw bookingError(409, "PROMO_EXHAUSTED", "This promo code has reached its redemption limit");
        }
        promoCodeId = promo.id;
      }

      // Compute fees on the base after BOTH the event discount and the promo.
      const discountedBase = subtotal - discount - promoDiscount; // paise (integers)
      const platformFee = Math.round(discountedBase * 0.02); // 2% platform fee (paise)
      const tax = Math.round((discountedBase + platformFee) * 0.18); // 18% GST (paise)
      const total = discountedBase + platformFee + tax; // paise (exact)

      // FREE / ZERO-TOTAL: a booking whose total is 0 (all-free tickets, or a
      // 100% discount) has NO payment step — create-order rejects amounts below
      // ₹1, so such a booking could never complete once Razorpay is configured.
      // Settle it immediately: mark it COMPLETED on creation and record a
      // zero-amount SUCCESS payment below. Paid bookings (total > 0) are
      // unaffected and still go through PENDING -> pay -> complete.
      const isFree = total === 0;

      // A paid total below ₹1 can never be charged (Razorpay's minimum is ₹1 /
      // 100 paise) and would otherwise sit PENDING forever, holding inventory
      // until the sweep. Reject it up front instead of creating a dead booking.
      if (!isFree && total < 100) {
        throw bookingError(400, "VALIDATION_ERROR", "Order total is below the ₹1 minimum for a paid booking");
      }

      // 4. Create the booking. `subtotal` is the ORIGINAL (pre-discount) amount
      // and `discount` the rupee amount applied, so that
      // subtotal - discount + platformFee + tax === total.
      const newBooking = await tx.booking.create({
        data: {
          eventId: parseInt(eventId),
          userId: userId ?? null, // derived from the token above, never the body
          guestEmail: guestEmail || null,
          guestName: guestName || null,
          guestPhone: guestPhone || null,
          subtotal,
          discount,
          promoCodeId,
          promoDiscount,
          platformFee,
          tax,
          total,
          status: isFree ? "COMPLETED" : "PENDING",
          purchaseDate: isFree ? new Date() : null,
          referredByCode, // SEO-09 (null unless a valid ?ref= was supplied)
          items: {
            create: bookingItems,
          },
        },
        include: {
          items: {
            include: { ticketType: true },
          },
        },
      });

      // 5. Create attendees if provided
      if (attendees && attendees.length > 0) {
        await tx.attendee.createMany({
          data: attendees.map((att) => ({
            bookingId: newBooking.id,
            ticketTypeId: parseInt(att.ticketTypeId),
            name: att.name,
            email: att.email,
          })),
        });
      }

      // 5b. Persist per-booking question answers as AttendeeAnswer rows (the
      // required-question coverage was already enforced above).
      if (answerList.length > 0) {
        await tx.attendeeAnswer.createMany({
          data: answerList.map((a) => ({
            bookingId: newBooking.id,
            questionId: parseInt(a.questionId),
            value: a.value == null ? "" : String(a.value),
          })),
        });
      }

      // 6. H10(c): claim inventory with an ATOMIC GUARDED write per ticket type.
      // The `sold <= quantity - qty` guard means the increment only lands if the
      // seats are still there at write time; count === 0 means a concurrent
      // booking took them first (closes the read-then-write oversell race).
      for (const { ticketType, qty } of perType) {
        const r = await tx.ticketType.updateMany({
          where: { id: ticketType.id, sold: { lte: ticketType.quantity - qty } },
          data: { sold: { increment: qty } },
        });
        if (r.count === 0) {
          // Lost the race to a concurrent booking — a conflict, not a fault -> 409.
          throw bookingError(409, "SOLD_OUT", `Not enough tickets available for ${ticketType.name}`);
        }
      }

      // 6b. FREE bookings are settled on creation with a zero-amount SUCCESS
      // payment. `method` is left null (the PaymentMethod enum only covers paid
      // rails: CARD/UPI/NETBANKING/WALLET); transactionId "FREE" marks the source.
      if (isFree) {
        await tx.payment.create({
          data: {
            bookingId: newBooking.id,
            amount: 0,
            status: "SUCCESS",
            transactionId: "FREE",
            paymentDate: new Date(),
          },
        });
        // PAY-07: a free booking is COMPLETED on creation, so assign its invoice now.
        await tx.booking.update({
          where: { id: newBooking.id },
          data: { invoiceNumber: invoiceNumberFor(newBooking.id) },
        });
      }

      // 7. Return complete booking
      const full = await tx.booking.findUnique({
        where: { id: newBooking.id },
        include: {
          event: {
            // hostId/festId feed the NOTIF-05 new-sale alert recipients.
            select: { id: true, name: true, venue: true, startDate: true, image: true, hostId: true, festId: true },
          },
          items: {
            include: { ticketType: { select: { id: true, name: true, price: true } } },
          },
          attendees: true,
          answers: true,
          user: { select: { email: true, name: true } },
        },
      });
      return { full, isFree };
    });

    // A free booking is already COMPLETED on creation — fire the confirmation
    // email the same way the paid completion paths do (non-blocking).
    if (booking.isFree) {
      sendBookingConfirmation(booking.full).catch((e) =>
        req.log.error({ err: e }, "[email] Booking confirmation failed")
      );
      notifyNewSale(booking.full, req.log); // NOTIF-05
      notifyTicketSms(booking.full, req.log); // NOTIF-07
      notifyInAppSale(booking.full).catch(() => {}); // NOTIF-08
    }

    res.status(201).json({
      success: true,
      data: booking.full,
      message: "Booking created successfully",
    });
  } catch (error) {
    req.log.error({ err: error }, "Error creating booking");
    // Tagged business/client errors (bookingError) carry an explicit HTTP status,
    // a stable code, and a safe user-facing message — map them straight through
    // (validation 400, not-found 404, sold-out / not-bookable 409). ANY other
    // error is an unexpected fault: respond 500 with a GENERIC message so the raw
    // error.message (which may reveal internals) is never leaked to the client.
    if (error.expose && error.status && error.code) {
      return res.status(error.status).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: "BOOKING_ERROR", message: "Failed to create booking" },
    });
  }
});

// ==================== PAY-04: PROMO PREVIEW ====================

// POST /api/bookings/validate-promo - preview a promo code's discount for an
// event + subtotal (paise) WITHOUT redeeming it, so the booking page can show the
// discount before submitting. Public; the authoritative redeem is at booking POST.
router.post("/validate-promo", async (req, res) => {
  try {
    const { eventId, code, subtotal } = req.body || {};
    const sub = Math.round(Number(subtotal));
    if (!eventId || !code || !Number.isFinite(sub) || sub <= 0) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "eventId, code and subtotal are required" } });
    }
    const event = await prisma.event.findUnique({ where: { id: parseInt(eventId) }, select: { festId: true } });
    if (!event) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Event not found" } });

    const promo = await prisma.promoCode.findFirst({
      where: {
        code: { equals: String(code).trim(), mode: "insensitive" },
        active: true,
        OR: [{ eventId: parseInt(eventId) }, ...(event.festId != null ? [{ festId: event.festId }] : [])],
      },
    });
    const now = new Date();
    const valid =
      promo &&
      (!promo.startsAt || promo.startsAt <= now) &&
      (!promo.expiresAt || promo.expiresAt >= now) &&
      (promo.minSubtotalPaise == null || sub >= promo.minSubtotalPaise) &&
      (promo.maxRedemptions == null || promo.redeemedCount < promo.maxRedemptions);
    if (!valid) {
      return res.json({ success: true, data: { valid: false, promoDiscount: 0, message: "Invalid or expired promo code" } });
    }
    const promoDiscount =
      promo.kind === "PERCENT"
        ? Math.min(Math.round(sub * ((promo.percentOff || 0) / 100)), promo.maxDiscountPaise ?? Infinity)
        : Math.min(promo.flatOffPaise || 0, sub);
    return res.json({ success: true, data: { valid: true, promoDiscount: Math.max(0, promoDiscount), kind: promo.kind } });
  } catch (error) {
    req.log.error({ err: error }, "Validate promo error");
    return res.status(500).json({ success: false, error: { code: "PROMO_ERROR", message: "Failed to validate promo code" } });
  }
});

// ==================== RAZORPAY: CREATE ORDER ====================

// POST /api/bookings/:id/create-order - Create Razorpay order for this booking (amount in paise)
router.post("/:id/create-order", writeLimiter, optionalAuthenticate, async (req, res) => {
  try {
    const razorpay = getRazorpay();
    if (!razorpay) {
      return res.status(503).json({
        success: false,
        error: { code: "RAZORPAY_DISABLED", message: "Razorpay keys not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET." },
      });
    }

    const bookingId = parseInt(req.params.id);
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { event: { select: { name: true, hostId: true, festId: true } } },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Booking not found" },
      });
    }
    // Guest-safe ownership: the buyer/host/admin or the booking's bookingCode.
    // Without this, an anonymous caller could enumerate booking ids and disclose
    // any booking's total / hijack a victim's Razorpay order.
    if (!(await callerOwnsBooking(req, booking))) {
      return forbid(res);
    }
    if (booking.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_STATE", message: "Booking is not pending payment" },
      });
    }

    const amountPaise = booking.total; // total is already integer paise (PAY-03)
    if (amountPaise < 100) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Amount too small (min ₹1)" },
      });
    }

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `booking-${booking.bookingCode}`,
      notes: { bookingId: String(bookingId), eventName: booking.event?.name || "" },
    });

    await prisma.payment.upsert({
      where: { bookingId },
      create: {
        bookingId,
        amount: booking.total,
        status: "PENDING",
        orderId: order.id,
      },
      update: {
        orderId: order.id,
        status: "PENDING",
      },
    });

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: amountPaise,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Razorpay create order error");
    res.status(500).json({
      success: false,
      error: { code: "ORDER_ERROR", message: err?.message || "Failed to create order" },
    });
  }
});

// ==================== RAZORPAY: VERIFY PAYMENT ====================

// POST /api/bookings/:id/verify-payment - Verify Razorpay payment and complete booking
router.post("/:id/verify-payment", writeLimiter, optionalAuthenticate, async (req, res) => {
  try {
    const razorpay = getRazorpay();
    if (!razorpay) {
      return res.status(503).json({
        success: false,
        error: { code: "RAZORPAY_DISABLED", message: "Razorpay not configured" },
      });
    }

    const bookingId = parseInt(req.params.id);
    const { razorpay_order_id, razorpay_payment_id } = req.body || {};

    if (!razorpay_payment_id || !razorpay_order_id) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "razorpay_order_id and razorpay_payment_id required" },
      });
    }

    const paymentEntity = await razorpay.payments.fetch(razorpay_payment_id);
    if (!paymentEntity || paymentEntity.order_id !== razorpay_order_id) {
      return res.status(400).json({
        success: false,
        error: { code: "VERIFY_FAILED", message: "Invalid or mismatched payment" },
      });
    }

    // Load the booking and verify OWNERSHIP + order-binding BEFORE acting on the
    // capture status. Doing the payment-failed notify (below) before these checks
    // let an unauthenticated caller flip an arbitrary booking's payment to FAILED
    // and spam its buyer with wrongful "payment failed" emails (Phase-5 review P2).
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { event: true, items: { include: { ticketType: true } }, attendees: true, payment: true },
    });
    if (!booking || booking.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_STATE", message: "Booking not found or already completed" },
      });
    }
    // Defense-in-depth: only the buyer/host/admin or the booking-code holder may
    // settle this booking (the Razorpay order-binding + amount check below is the
    // primary guard; this stops cross-booking calls).
    if (!(await callerOwnsBooking(req, booking))) {
      return forbid(res);
    }

    // Bind the payment to THIS booking: the order must be the one we created for
    // this booking (create-order stored Payment.orderId), and the captured amount
    // must equal the booking total. Without this, one captured ₹1 payment could be
    // replayed to complete any (expensive) booking.
    if (!booking.payment || booking.payment.orderId !== razorpay_order_id) {
      return res.status(400).json({
        success: false,
        error: { code: "VERIFY_FAILED", message: "Order does not belong to this booking" },
      });
    }

    if (paymentEntity.status !== "captured") {
      // NOTIF-06: a genuinely uncaptured/failed payment on THIS caller's own,
      // order-bound booking — mark it FAILED once and email the buyer a retry
      // link (non-blocking; guarded against repeat spam).
      markPaymentFailedAndNotify(bookingId, req.log);
      return res.status(400).json({
        success: false,
        error: { code: "VERIFY_FAILED", message: "Payment not captured" },
      });
    }
    if (paymentEntity.amount !== booking.total) { // both integer paise (PAY-03)
      return res.status(400).json({
        success: false,
        error: { code: "VERIFY_FAILED", message: "Paid amount does not match the booking total" },
      });
    }

    // Settle via the shared PENDING-guarded path so the browser verify-payment,
    // the Razorpay webhook, and the reconciler are mutually idempotent: whoever
    // flips PENDING->COMPLETED first wins and returns the booking; the losers get
    // null and must NOT re-send the confirmation email (avoids double emails and
    // re-flipping a concurrently cancelled/refunded booking).
    const settled = await settleBookingAsPaid(bookingId, {
      transactionId: razorpay_payment_id,
      method: mapRazorpayMethod(paymentEntity.method),
    });

    if (!settled) {
      const already = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          event: true,
          items: { include: { ticketType: true } },
          attendees: true,
          user: { select: { email: true, name: true } },
        },
      });
      return res.json({
        success: true,
        data: already,
        message: "Payment already verified",
      });
    }

    sendBookingConfirmation(settled).catch((e) => req.log.error({ err: e }, "[email] Booking confirmation failed"));
    notifyNewSale(settled, req.log); // NOTIF-05
    notifyTicketSms(settled, req.log); // NOTIF-07
    notifyInAppSale(settled).catch(() => {}); // NOTIF-08

    res.json({
      success: true,
      data: settled,
      message: "Payment verified and booking completed",
    });
  } catch (err) {
    req.log.error({ err }, "Razorpay verify error");
    res.status(500).json({
      success: false,
      error: { code: "VERIFY_ERROR", message: err?.message || "Verification failed" },
    });
  }
});

// ==================== COMPLETE BOOKING (After Payment) ====================

// PUT /api/bookings/:id/complete - Mark booking as completed (simulated / fallback when Razorpay not used)
router.put("/:id/complete", writeLimiter, optionalAuthenticate, async (req, res) => {
  try {
    // DEMO/FALLBACK ONLY. When Razorpay is configured, this no-payment completion
    // path is disabled — completion must go through verify-payment (real captured
    // payment, order-bound, amount-checked). This closes the production free-ticket
    // bypass while keeping the local demo flow (Razorpay unset) working.
    if (getRazorpay()) {
      return res.status(403).json({
        success: false,
        error: { code: "PAYMENT_REQUIRED", message: "Complete payment through the payment gateway" },
      });
    }

    const { id } = req.params;
    const { transactionId, paymentMethod } = req.body;
    const bid = parseInt(id);

    // Only a PENDING booking may be completed (blocks re-completing / tampering).
    const current = await prisma.booking.findUnique({
      where: { id: bid },
      select: {
        status: true,
        userId: true,
        bookingCode: true,
        event: { select: { hostId: true, festId: true } },
      },
    });
    if (!current) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Booking not found" },
      });
    }
    // Guest-safe ownership: even in demo mode, a caller must be the buyer/host/
    // admin OR present this booking's unguessable bookingCode. Closes the
    // live-exploitable hole where anyone could mark ANY pending booking paid.
    if (!(await callerOwnsBooking(req, current))) {
      return forbid(res);
    }
    if (current.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_STATE", message: "Booking is not pending payment" },
      });
    }

    const booking = await prisma.$transaction(async (tx) => {
      const updatedBooking = await tx.booking.update({
        where: { id: bid },
        data: { status: "COMPLETED", purchaseDate: new Date(), invoiceNumber: invoiceNumberFor(bid) },
        include: {
          event: true,
          items: { include: { ticketType: true } },
          attendees: true,
          user: { select: { email: true, name: true } },
        },
      });

      const existing = await tx.payment.findUnique({ where: { bookingId: bid } });
      if (existing) {
        await tx.payment.update({
          where: { bookingId: bid },
          data: {
            status: "SUCCESS",
            transactionId: transactionId || existing.transactionId,
            paymentDate: new Date(),
            method: paymentMethod || existing.method || "CARD",
          },
        });
      } else {
        await tx.payment.create({
          data: {
            bookingId: bid,
            amount: updatedBooking.total,
            method: paymentMethod || "CARD",
            status: "SUCCESS",
            transactionId: transactionId || null,
            paymentDate: new Date(),
          },
        });
      }
      return updatedBooking;
    });

    sendBookingConfirmation(booking).catch((e) => req.log.error({ err: e }, "[email] Booking confirmation failed"));
    notifyNewSale(booking, req.log); // NOTIF-05
    notifyTicketSms(booking, req.log); // NOTIF-07
    notifyInAppSale(booking).catch(() => {}); // NOTIF-08

    res.json({
      success: true,
      data: booking,
      message: "Booking completed successfully",
    });
  } catch (error) {
    req.log.error({ err: error }, "Error completing booking");
    res.status(500).json({
      success: false,
      error: { code: "COMPLETE_ERROR", message: "Failed to complete booking" },
    });
  }
});

// ==================== GET BOOKING DETAILS ====================

// GET /api/bookings/:id - Get booking by ID (numeric).
// Requires auth + ownership: the buyer, the event's host, or an ADMIN scoped to
// the event's fest. Guests use the unguessable-code path below instead.
router.get("/:id", authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id) },
      include: {
        event: { select: { ...bookingEventSelect, hostId: true, festId: true } },
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        items: {
          include: {
            ticketType: { select: { id: true, name: true, price: true } },
          },
        },
        attendees: true,
        payment: true,
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Booking not found" },
      });
    }

    // Ownership: buyer OR the event's host OR an ADMIN of the event's fest.
    const isOwner = booking.userId != null && booking.userId === req.user.userId;
    const isHost = booking.event?.hostId != null && booking.event.hostId === req.user.userId;
    let allowed = isOwner || isHost;
    if (!allowed && req.user.role === "ADMIN") {
      const { managedFestId } = await callerFests(req);
      allowed = booking.event?.festId != null && booking.event.festId === managedFestId;
    }
    if (!allowed) return forbid(res);

    res.json({
      success: true,
      data: withHoldExpiry(booking),
    });
  } catch (error) {
    req.log.error({ err: error }, "Error fetching booking");
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch booking" },
    });
  }
});

// GET /api/bookings/code/:bookingCode - Get booking by booking code.
// PUBLIC BY DESIGN: bookingCode is an unguessable cuid and this is the guest
// confirmation/payment path, so no auth is added here (see contract item 2/3).
router.get("/code/:bookingCode", async (req, res) => {
  try {
    const { bookingCode } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { bookingCode },
      include: {
        event: { select: bookingEventSelect },
        items: {
          include: {
            ticketType: { select: { id: true, name: true, price: true } },
          },
        },
        attendees: true,
        payment: true,
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Booking not found" },
      });
    }

    res.json({
      success: true,
      data: withHoldExpiry(booking),
    });
  } catch (error) {
    req.log.error({ err: error }, "Error fetching booking");
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch booking" },
    });
  }
});

// ==================== TIX-07: WALLET PASSES ====================

// GET /api/bookings/wallet/availability - which wallet integrations are live.
// Public + no secrets: lets the UI show/hide the Apple/Google buttons without a
// download probe. Placed before the /:id style routes so it isn't shadowed.
router.get("/wallet/availability", (req, res) => {
  res.json({ success: true, data: walletAvailability() });
});

// Fetch a COMPLETED booking (by unguessable code) + choose the attendee whose
// pass to build. Presenting the bookingCode proves access to the whole booking,
// so any attendee within it may be selected via ?ticketCode=. Returns
// { error } tuple or { booking, attendee } for the wallet handlers below.
async function loadBookingForPass(req) {
  const booking = await prisma.booking.findUnique({
    where: { bookingCode: req.params.bookingCode },
    include: {
      event: { select: bookingEventSelect },
      items: { include: { ticketType: { select: { name: true } } } },
      attendees: { include: { ticketType: { select: { name: true } } } },
    },
  });
  if (!booking) return { error: { status: 404, code: "NOT_FOUND", message: "Booking not found" } };
  if (booking.status !== "COMPLETED") {
    return { error: { status: 400, code: "INVALID_STATE", message: "A wallet pass is only available for a completed booking" } };
  }

  const attendees = booking.attendees || [];
  const wanted = req.query.ticketCode ? String(req.query.ticketCode) : null;
  let picked = wanted ? attendees.find((a) => a.ticketCode === wanted) : attendees[0];
  const attendee = picked
    ? { name: picked.name, ticketCode: picked.ticketCode, ticketType: picked.ticketType?.name }
    : // Order-level fallback for legacy bookings that have no attendee rows.
      {
        name: booking.guestName || "Guest",
        ticketCode: booking.bookingCode,
        ticketType: booking.items?.[0]?.ticketType?.name,
      };
  return { booking, attendee };
}

// GET /api/bookings/code/:bookingCode/apple-pass - stream a signed .pkpass.
// PUBLIC BY CODE (like the confirmation read). 503 WALLET_DISABLED when Apple
// signing certs aren't configured, so the button can be hidden.
router.get("/code/:bookingCode/apple-pass", async (req, res) => {
  try {
    if (!getAppleWalletConfig()) {
      return res.status(503).json({ success: false, error: { code: "WALLET_DISABLED", message: "Apple Wallet is not configured" } });
    }
    const { error, booking, attendee } = await loadBookingForPass(req);
    if (error) return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });

    const buffer = await buildApplePkpass({ event: booking.event, attendee });
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Content-Disposition", `attachment; filename="${booking.bookingCode}.pkpass"`);
    return res.send(buffer);
  } catch (error) {
    req.log.error({ err: error, bookingCode: req.params.bookingCode }, "Apple pass generation failed");
    if (res.headersSent) return res.end();
    return res.status(500).json({ success: false, error: { code: "WALLET_ERROR", message: "Failed to generate the Apple Wallet pass" } });
  }
});

// GET /api/bookings/code/:bookingCode/google-pass - return { saveUrl }.
// PUBLIC BY CODE. 503 WALLET_DISABLED when Google issuer creds aren't configured.
router.get("/code/:bookingCode/google-pass", async (req, res) => {
  try {
    if (!getGoogleWalletConfig()) {
      return res.status(503).json({ success: false, error: { code: "WALLET_DISABLED", message: "Google Wallet is not configured" } });
    }
    const { error, booking, attendee } = await loadBookingForPass(req);
    if (error) return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });

    const saveUrl = buildGoogleSaveUrl({ event: booking.event, attendee });
    // ?redirect=1 bounces straight to Google (used by email links, which can't
    // fetch JSON); the default returns { saveUrl } for the in-app button.
    if (req.query.redirect === "1" || req.query.redirect === "true") {
      return res.redirect(302, saveUrl);
    }
    return res.json({ success: true, data: { saveUrl } });
  } catch (error) {
    req.log.error({ err: error, bookingCode: req.params.bookingCode }, "Google pass generation failed");
    return res.status(500).json({ success: false, error: { code: "WALLET_ERROR", message: "Failed to generate the Google Wallet link" } });
  }
});

// ==================== USER BOOKINGS ====================

// GET /api/bookings/user/:userId - Get all bookings for a user.
// Auth required: only the user themselves or an ADMIN may read a user's bookings.
router.get("/user/:userId", authenticateUser, async (req, res) => {
  try {
    const { userId } = req.params;

    if (parseInt(userId) !== req.user.userId && req.user.role !== "ADMIN") {
      return forbid(res);
    }

    const bookings = await prisma.booking.findMany({
      where: { userId: parseInt(userId) },
      orderBy: { createdAt: "desc" },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            venue: true,
            startDate: true,
            image: true,
            status: true,
          },
        },
        items: {
          include: {
            ticketType: { select: { name: true, price: true } },
          },
        },
      },
    });

    res.json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    req.log.error({ err: error }, "Error fetching user bookings");
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch bookings" },
    });
  }
});

// GET /api/bookings/guest/:email - Get all bookings for a guest email.
// Auth required + ADMIN only: querying by arbitrary email is an enumeration
// surface, so it is restricted to admins.
router.get("/guest/:email", authenticateUser, async (req, res) => {
  try {
    const { email } = req.params;

    if (req.user.role !== "ADMIN") {
      return forbid(res);
    }

    const bookings = await prisma.booking.findMany({
      where: { guestEmail: email },
      orderBy: { createdAt: "desc" },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            venue: true,
            startDate: true,
            image: true,
          },
        },
        items: {
          include: {
            ticketType: { select: { name: true, price: true } },
          },
        },
      },
    });

    res.json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    req.log.error({ err: error }, "Error fetching guest bookings");
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch bookings" },
    });
  }
});

// ==================== CANCEL BOOKING ====================

// PUT /api/bookings/:id/cancel - Cancel a booking.
// Auth + ownership: the buyer, the event's host, or an ADMIN of the event's fest.
// Only a PENDING booking may be cancelled here; a COMPLETED booking must go
// through the (separate) refund flow, so it is rejected with INVALID_STATE.
router.put("/:id/cancel", authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    const existingBooking = await prisma.booking.findUnique({
      where: { id: parseInt(id) },
      include: {
        items: true,
        // NOTIF-06: name/id feed the cancellation email; user resolves the
        // recipient when there's no guestEmail.
        event: { select: { hostId: true, festId: true, name: true, id: true } },
        user: { select: { email: true, name: true } },
      },
    });

    if (!existingBooking) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Booking not found" },
      });
    }

    // Ownership: buyer OR the event's host OR an ADMIN of the event's fest.
    const isOwner = existingBooking.userId != null && existingBooking.userId === req.user.userId;
    const isHost = existingBooking.event?.hostId != null && existingBooking.event.hostId === req.user.userId;
    let allowed = isOwner || isHost;
    if (!allowed && req.user.role === "ADMIN") {
      const { managedFestId } = await callerFests(req);
      allowed = existingBooking.event?.festId != null && existingBooking.event.festId === managedFestId;
    }
    if (!allowed) return forbid(res);

    // Only PENDING bookings are cancellable here. COMPLETED -> refund flow;
    // CANCELLED/REFUNDED are terminal.
    if (existingBooking.status !== "PENDING") {
      let message = "Booking cannot be cancelled";
      if (existingBooking.status === "COMPLETED") message = "Completed bookings cannot be cancelled here (refunds are a separate flow)";
      else if (existingBooking.status === "CANCELLED") message = "Booking is already cancelled";
      else if (existingBooking.status === "REFUNDED") message = "Booking has already been refunded";
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_STATE", message },
      });
    }

    const booking = await prisma.$transaction(async (tx) => {
      // Atomically claim the PENDING -> CANCELLED transition. The status-guarded
      // updateMany means only ONE concurrent cancel can win (count === 1); a racing
      // second cancel sees count 0 and restores nothing. This closes the
      // double-decrement that could drive `sold` NEGATIVE (oversell).
      const flip = await tx.booking.updateMany({
        where: { id: parseInt(id), status: "PENDING" },
        data: { status: "CANCELLED" },
      });
      if (flip.count === 0) {
        throw bookingError(409, "INVALID_STATE", "Booking is no longer pending and cannot be cancelled");
      }

      // Restore ticket quantities held by this booking. The `sold >= quantity`
      // guard floors the counter so it can never go below zero even if data drifted.
      for (const item of existingBooking.items) {
        await tx.ticketType.updateMany({
          where: { id: item.ticketTypeId, sold: { gte: item.quantity } },
          data: { sold: { decrement: item.quantity } },
        });
      }
      await releasePromoRedemption(tx, existingBooking.promoCodeId); // PAY-04

      return tx.booking.findUnique({
        where: { id: parseInt(id) },
        include: {
          event: { select: { name: true } },
          items: { include: { ticketType: true } },
        },
      });
    });

    res.json({
      success: true,
      data: booking,
      message: "Booking cancelled successfully",
    });

    // NOTIF-06: tell the buyer their booking was cancelled (fire-and-forget,
    // after the response, skipped cleanly when no email resolves). The manual
    // route sends "cancelled"; the sweep sends the distinct "expired" mail.
    sendBookingCancelled(existingBooking).catch((e) =>
      req.log.error({ err: e, bookingId: existingBooking.id }, "[email] Booking cancellation email failed")
    );
    // NOTIF-08: in-app notice for the registered buyer.
    if (existingBooking.userId) {
      createNotification({
        userId: existingBooking.userId,
        type: "booking_cancelled",
        title: "Booking cancelled",
        body: `Your booking for ${existingBooking.event?.name || "an event"} was cancelled.`,
        linkUrl: "/bookings",
      }).catch(() => {});
    }
    // PAY-08: seats just freed — offer them to the oldest waiter per ticket type.
    for (const item of existingBooking.items) {
      releaseToWaitlist(item.ticketTypeId, item.quantity, req.log).catch(() => {});
    }
  } catch (error) {
    req.log.error({ err: error }, "Error cancelling booking");
    // Map tagged business errors (e.g. the lost-race 409) to their status/code;
    // anything else is an unexpected fault -> generic 500.
    if (error.expose && error.status && error.code) {
      return res.status(error.status).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: "CANCEL_ERROR", message: "Failed to cancel booking" },
    });
  }
});

// ==================== PAY-02: REFUNDS ====================

// Shared refund EXECUTOR, used by the host refund endpoint (full or partial) and
// the buyer self-service request-refund (PAY-06, always full remaining). The
// CALLER must have already verified ownership and that the booking is COMPLETED.
// Returns { status, body } to send. Handles the self-heal of a ledger-full-but-
// COMPLETED booking, the concurrency-safe two-attempt reservation, the gateway
// call (real Razorpay or demo), and the finalize. `amountBody` null = full remaining.
async function runRefund(booking, amountBody, reason, log) {
  const bid = booking.id;

  // Self-heal a booking whose refund ledger already reached the total but which
  // was left COMPLETED — e.g. a finalize that threw AFTER the gateway refund
  // succeeded. Finish the transition with NO new gateway call, restoring inventory
  // + promo exactly once (guarded flip). Makes a stuck booking recoverable on retry.
  if ((booking.refundedAmount || 0) >= booking.total) {
    const healed = await prisma.$transaction(async (tx) => {
      const flip = await tx.booking.updateMany({ where: { id: bid, status: "COMPLETED" }, data: { status: "REFUNDED" } });
      await tx.payment.updateMany({ where: { bookingId: bid }, data: { refundedAmount: booking.total, status: "REFUNDED" } });
      if (flip.count === 1) await restoreInventoryAndPromo(tx, booking);
      return tx.booking.findUnique({
        where: { id: bid },
        include: { items: { include: { ticketType: true } }, payment: true, event: { select: { name: true } } },
      });
    });
    return { status: 200, body: { success: true, data: healed, message: "Booking fully refunded" } };
  }

  const alreadyRefunded = booking.refundedAmount || 0;
  const remaining = booking.total - alreadyRefunded; // paise
  const amount = amountBody == null ? remaining : Math.round(Number(amountBody)); // paise
  if (!Number.isFinite(amount) || amount <= 0) {
    return { status: 400, body: { success: false, error: { code: "VALIDATION_ERROR", message: "Refund amount must be greater than 0" } } };
  }
  if (amount > remaining) {
    return { status: 400, body: { success: false, error: { code: "VALIDATION_ERROR", message: "Refund amount exceeds the refundable balance" } } };
  }

  // Atomically RESERVE the refund before calling the gateway, and determine
  // fullness FROM THE GUARD rather than the stale pre-read (so two concurrent
  // partials that together reach the total can't both think they're partial and
  // leave the booking stuck COMPLETED). First try to claim the FULL transition —
  // this amount brings the ledger exactly to total — then fall back to a strictly
  // partial claim. Whoever wins the full claim is the unique finalizer.
  let nowFull = true;
  let claim = await prisma.booking.updateMany({
    where: { id: bid, status: "COMPLETED", refundedAmount: booking.total - amount },
    data: { refundedAmount: { increment: amount }, refundReason: reason || undefined },
  });
  if (claim.count === 0) {
    nowFull = false;
    claim = await prisma.booking.updateMany({
      where: { id: bid, status: "COMPLETED", refundedAmount: { lt: booking.total - amount } },
      data: { refundedAmount: { increment: amount }, refundReason: reason || undefined },
    });
  }
  if (claim.count === 0) {
    return { status: 409, body: { success: false, error: { code: "INVALID_STATE", message: "Refund could not be reserved (already refunded or state changed)" } } };
  }

  // Issue the refund. Real Razorpay refund when configured + we have a captured
  // payment; otherwise a demo refund. On gateway failure, release the reservation.
  let refundId = "DEMO-REFUND";
  const razorpay = getRazorpay();
  try {
    if (razorpay && booking.payment?.transactionId) {
      const r = await razorpay.payments.refund(booking.payment.transactionId, { amount, speed: "normal" });
      refundId = r?.id || "REFUND";
    }
  } catch (err) {
    await prisma.booking.updateMany({ where: { id: bid }, data: { refundedAmount: { decrement: amount } } });
    log?.error({ err }, "Razorpay refund failed");
    return { status: 502, body: { success: false, error: { code: "REFUND_FAILED", message: "Payment gateway refund failed" } } };
  }

  // Finalize: payment accounting + statuses; a FULL refund flips the booking to
  // REFUNDED and restores inventory (floored). A partial refund keeps it COMPLETED
  // and does NOT restore inventory. The two-attempt reservation above guarantees
  // exactly one caller reaches nowFull, so the flip/restore is performed once.
  const updated = await prisma.$transaction(async (tx) => {
    await tx.payment.updateMany({
      where: { bookingId: bid },
      data: {
        refundedAmount: { increment: amount },
        refundId,
        ...(nowFull ? { status: "REFUNDED" } : {}),
      },
    });
    if (nowFull) {
      await tx.booking.update({ where: { id: bid }, data: { status: "REFUNDED" } });
      await restoreInventoryAndPromo(tx, booking); // PAY-04 + inventory
    }
    return tx.booking.findUnique({
      where: { id: bid },
      include: { items: { include: { ticketType: true } }, payment: true, event: { select: { name: true } } },
    });
  });

  // PAY-08: a FULL refund restored inventory — offer the freed seats to the
  // oldest waiter per ticket type (after commit, non-blocking).
  if (nowFull) {
    for (const item of booking.items || []) {
      releaseToWaitlist(item.ticketTypeId, item.quantity, log).catch(() => {});
    }
  }

  return { status: 200, body: { success: true, data: updated, message: nowFull ? "Booking fully refunded" : "Partial refund issued" } };
}

// POST /api/bookings/:id/refund - full or partial refund of a COMPLETED booking.
// Host of the event, or an ADMIN of the event's fest (buyers use PAY-06's
// request-refund instead). Body: { amount?: paise (omitted = full remaining), reason? }.
router.post("/:id/refund", writeLimiter, authenticateUser, async (req, res) => {
  const bid = parseInt(req.params.id);
  try {
    const { amount: amountBody, reason } = req.body || {};

    const booking = await prisma.booking.findUnique({
      where: { id: bid },
      include: { items: true, payment: true, event: { select: { hostId: true, festId: true } } },
    });
    if (!booking) {
      return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Booking not found" } });
    }

    // Ownership: the event's host, or an ADMIN of the event's fest.
    let allowed = booking.event?.hostId != null && booking.event.hostId === req.user.userId;
    if (!allowed && req.user.role === "ADMIN") {
      const { managedFestId } = await callerFests(req);
      allowed = booking.event?.festId != null && booking.event.festId === managedFestId;
    }
    if (!allowed) return forbid(res);

    if (booking.status !== "COMPLETED") {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_STATE", message: "Only a completed booking can be refunded" },
      });
    }

    const { status, body } = await runRefund(booking, amountBody, reason, req.log);
    return res.status(status).json(body);
  } catch (error) {
    req.log.error({ err: error, bookingId: bid }, "Refund error");
    return res.status(500).json({ success: false, error: { code: "REFUND_ERROR", message: "Failed to process refund" } });
  }
});

// PAY-06: POST /api/bookings/:id/request-refund - BUYER self-service cancel/refund.
// Auth: the booking's buyer OR the guest bookingCode holder (callerOwnsBooking).
// A PENDING booking is cancelled (no money); a COMPLETED booking is refunded in
// FULL via the shared refund engine, but ONLY when the event's refundPolicy allows.
router.post("/:id/request-refund", writeLimiter, optionalAuthenticate, async (req, res) => {
  const bid = parseInt(req.params.id);
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bid },
      include: {
        items: true,
        payment: true,
        event: {
          select: { hostId: true, festId: true, name: true, startDate: true, refundPolicy: true, refundCutoffHours: true },
        },
      },
    });
    if (!booking) {
      return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Booking not found" } });
    }
    if (!(await callerOwnsBooking(req, booking))) return forbid(res);

    // A still-unpaid booking: cancel it (no money moved), restoring inventory + promo.
    if (booking.status === "PENDING") {
      const cancelled = await prisma.$transaction(async (tx) => {
        const flip = await tx.booking.updateMany({ where: { id: bid, status: "PENDING" }, data: { status: "CANCELLED" } });
        if (flip.count === 0) throw bookingError(409, "INVALID_STATE", "Booking is no longer pending and cannot be cancelled");
        for (const item of booking.items) {
          await tx.ticketType.updateMany({ where: { id: item.ticketTypeId, sold: { gte: item.quantity } }, data: { sold: { decrement: item.quantity } } });
        }
        await releasePromoRedemption(tx, booking.promoCodeId);
        return tx.booking.findUnique({ where: { id: bid }, include: { event: { select: { name: true } }, items: { include: { ticketType: true } } } });
      });
      return res.json({ success: true, data: cancelled, message: "Booking cancelled" });
    }

    if (booking.status !== "COMPLETED") {
      return res.status(400).json({ success: false, error: { code: "INVALID_STATE", message: "This booking cannot be refunded" } });
    }

    // Evaluate the event's refund policy.
    const policy = booking.event?.refundPolicy || "NO_REFUND";
    if (policy === "NO_REFUND") {
      return res.status(403).json({ success: false, error: { code: "REFUND_NOT_ALLOWED", message: "This event does not allow buyer refunds" } });
    }
    if (policy === "FULL_UNTIL_CUTOFF") {
      const startDate = booking.event?.startDate ? new Date(booking.event.startDate) : null;
      const cutoffHours = booking.event?.refundCutoffHours;
      // Only enforce a window when BOTH the start date and cutoff are known. A null
      // startDate can't be evaluated, so treat it like FULL_ANYTIME (allow).
      if (startDate && cutoffHours != null) {
        const deadline = new Date(startDate.getTime() - cutoffHours * 3600 * 1000);
        if (new Date() > deadline) {
          return res.status(409).json({ success: false, error: { code: "REFUND_WINDOW_CLOSED", message: "The refund window for this event has closed" } });
        }
      }
    }

    // FULL_ANYTIME, or FULL_UNTIL_CUTOFF within the window: full refund via PAY-02.
    const { status, body } = await runRefund(booking, undefined, "Buyer self-service refund", req.log);
    return res.status(status).json(body);
  } catch (error) {
    if (error.expose && error.status && error.code) {
      return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    }
    req.log.error({ err: error, bookingId: bid }, "Request-refund error");
    return res.status(500).json({ success: false, error: { code: "REFUND_ERROR", message: "Failed to process refund request" } });
  }
});

// TIX-06: POST /api/bookings/:bookingCode/transfer - reassign an attendee (name/
// email) and reissue their ticketCode, invalidating the old QR. Auth: buyer/host/
// admin OR the guest presenting the :bookingCode. Booking must be COMPLETED; a
// checked-in attendee cannot be transferred.
router.post("/:bookingCode/transfer", writeLimiter, optionalAuthenticate, async (req, res) => {
  try {
    const { attendeeId, name, email } = req.body || {};
    const aid = parseInt(attendeeId);
    if (!Number.isInteger(aid) || typeof name !== "string" || !name.trim() || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "attendeeId, name and email are required" } });
    }

    const booking = await prisma.booking.findUnique({
      where: { bookingCode: req.params.bookingCode },
      include: {
        event: { select: { hostId: true, festId: true } },
        attendees: { select: { id: true, checkedInAt: true } },
      },
    });
    if (!booking) {
      return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Booking not found" } });
    }
    if (!(await callerOwnsBooking(req, booking))) return forbid(res);
    if (booking.status !== "COMPLETED") {
      return res.status(400).json({ success: false, error: { code: "INVALID_STATE", message: "Only a completed booking's tickets can be transferred" } });
    }
    const target = booking.attendees.find((a) => a.id === aid);
    if (!target) {
      return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Attendee not part of this booking" } });
    }
    if (target.checkedInAt) {
      return res.status(409).json({ success: false, error: { code: "ALREADY_CHECKED_IN", message: "This ticket has already been used and cannot be transferred" } });
    }

    // Reissue the ticketCode (a fresh opaque code auto-invalidates the old QR). The
    // checkedInAt:null guard means a door scan of the OLD code that lands first
    // simply admits the current holder rather than racing the reissue.
    const updated = await prisma.attendee.updateMany({
      where: { id: aid, checkedInAt: null },
      data: { name: name.trim(), email: email.trim(), ticketCode: crypto.randomUUID(), transferredAt: new Date() },
    });
    if (updated.count === 0) {
      return res.status(409).json({ success: false, error: { code: "ALREADY_CHECKED_IN", message: "This ticket has already been used and cannot be transferred" } });
    }
    const fresh = await prisma.attendee.findUnique({
      where: { id: aid },
      select: { id: true, name: true, email: true, ticketCode: true },
    });
    return res.json({ success: true, data: fresh, message: "Attendee transferred" });
  } catch (error) {
    req.log.error({ err: error, bookingCode: req.params.bookingCode }, "Transfer error");
    return res.status(500).json({ success: false, error: { code: "TRANSFER_ERROR", message: "Failed to transfer ticket" } });
  }
});

// PAY-07: GET /api/bookings/:id/invoice - stream a PDF GST tax-invoice/receipt.
// Ownership: the buyer / event host / fest ADMIN (callerOwnsBooking) OR a guest
// presenting the bookingCode via ?code=. Only COMPLETED/REFUNDED bookings.
router.get("/:id/invoice", optionalAuthenticate, async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        items: { include: { ticketType: { select: { name: true } } } },
        payment: true,
        user: { select: { name: true, email: true } },
        event: {
          select: {
            hostId: true, festId: true, name: true, venue: true, startDate: true,
            fest: { select: { name: true, college: true } },
          },
        },
      },
    });
    if (!booking) {
      return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Booking not found" } });
    }
    // Ownership: buyer/host/admin (via req.user) OR the guest bookingCode (?code=).
    const codeOk = req.query.code && booking.bookingCode && req.query.code === booking.bookingCode;
    if (!codeOk && !(await callerOwnsBooking(req, booking))) return forbid(res);

    if (booking.status !== "COMPLETED" && booking.status !== "REFUNDED") {
      return res.status(400).json({ success: false, error: { code: "INVALID_STATE", message: "An invoice is only available for a completed booking" } });
    }

    streamInvoicePdf(res, { booking, event: booking.event, fest: booking.event?.fest });
  } catch (error) {
    req.log.error({ err: error, bookingId: req.params.id }, "Invoice generation failed");
    if (res.headersSent) return res.end();
    return res.status(500).json({ success: false, error: { code: "INVOICE_ERROR", message: "Failed to generate invoice" } });
  }
});

// ==================== TIX-03: DOOR CHECK-IN ====================

// POST /api/bookings/checkin - admit an attendee by their ticketCode. Auth: the
// event's host, or an ADMIN/EDITOR/HOST scoped to the event's fest. First scan
// admits atomically (checkedInAt:null guard); re-scans return ALREADY; unknown or
// non-COMPLETED tickets return INVALID.
router.post("/checkin", writeLimiter, authenticateUser, async (req, res) => {
  try {
    const code = String(req.body?.code || "").trim();
    if (!code) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "A ticket code is required" } });
    }
    // Optional event binding: the per-event door scanner always sends the eventId
    // it is scanning for. When present, a ticket for a DIFFERENT event is rejected
    // even if it belongs to the same fest (see WRONG_EVENT below).
    const scannerEventId = Number.isInteger(parseInt(req.body?.eventId)) ? parseInt(req.body.eventId) : null;

    const attendee = await prisma.attendee.findUnique({
      where: { ticketCode: code },
      include: {
        ticketType: { select: { name: true } },
        booking: { select: { status: true, bookingCode: true, event: { select: { id: true, name: true, hostId: true, festId: true } } } },
      },
    });
    if (!attendee) {
      return res.status(404).json({ success: false, data: { status: "INVALID" }, error: { code: "NOT_FOUND", message: "Ticket not found" } });
    }

    const event = attendee.booking?.event;
    // Fest-scoped authorization: the event's host, or an ADMIN/EDITOR/HOST of its fest.
    let allowed = event?.hostId != null && event.hostId === req.user.userId;
    if (!allowed) {
      const { managedFestId, editorFestId } = await callerFests(req);
      allowed = event?.festId != null && (event.festId === managedFestId || event.festId === editorFestId);
    }
    if (!allowed) return forbid(res, "You cannot check in tickets for this event");

    // Event-scoped guard: a fest can run several simultaneous events under one
    // festId. If the scanner named an event, a ticket for a different event must
    // NOT be admitted here (it would let the wrong person in and corrupt this
    // event's admitted count). Report WRONG_EVENT so the operator sees the reason.
    if (scannerEventId != null && event?.id !== scannerEventId) {
      return res.json({
        success: true,
        data: {
          status: "WRONG_EVENT",
          reason: "This ticket is for a different event",
          attendee: { id: attendee.id, name: attendee.name },
          event: event ? { id: event.id, name: event.name } : null,
        },
      });
    }

    // Only a paid (COMPLETED) ticket is valid at the door — a PENDING/CANCELLED/
    // REFUNDED booking's attendee must not be admitted.
    if (attendee.booking?.status !== "COMPLETED") {
      return res.json({
        success: true,
        data: { status: "INVALID", reason: "Ticket is not valid (booking not completed)", attendee: { id: attendee.id, name: attendee.name } },
      });
    }

    // Atomic first-scan-admits. The checkedInAt:null guard means a concurrent
    // double-scan can only have ONE updateMany win (count === 1).
    const claim = await prisma.attendee.updateMany({
      where: { id: attendee.id, checkedInAt: null },
      data: { checkedInAt: new Date(), checkedInById: req.user.userId },
    });

    const publicAttendee = { id: attendee.id, name: attendee.name, email: attendee.email, ticketType: attendee.ticketType?.name };

    if (claim.count === 1) {
      return res.json({
        success: true,
        data: { status: "ADMITTED", attendee: publicAttendee, event: { id: event.id, name: event.name } },
      });
    }

    // Already admitted — surface the original time (never overwritten).
    const prior = await prisma.attendee.findUnique({ where: { id: attendee.id }, select: { checkedInAt: true } });
    return res.json({
      success: true,
      data: { status: "ALREADY", checkedInAt: prior?.checkedInAt, attendee: publicAttendee, event: { id: event.id, name: event.name } },
    });
  } catch (error) {
    req.log.error({ err: error }, "Check-in error");
    return res.status(500).json({ success: false, error: { code: "CHECKIN_ERROR", message: "Failed to check in" } });
  }
});

// TIX-04: POST /api/bookings/checkin/undo - revert an admit (organizer correction).
// Same fest-scoped authorization as check-in. Body { attendeeId }.
router.post("/checkin/undo", writeLimiter, authenticateUser, async (req, res) => {
  try {
    const attendeeId = parseInt(req.body?.attendeeId);
    if (!Number.isInteger(attendeeId)) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "attendeeId is required" } });
    }
    const attendee = await prisma.attendee.findUnique({
      where: { id: attendeeId },
      include: { booking: { select: { event: { select: { hostId: true, festId: true } } } } },
    });
    if (!attendee) {
      return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Attendee not found" } });
    }
    const event = attendee.booking?.event;
    let allowed = event?.hostId != null && event.hostId === req.user.userId;
    if (!allowed) {
      const { managedFestId, editorFestId } = await callerFests(req);
      allowed = event?.festId != null && (event.festId === managedFestId || event.festId === editorFestId);
    }
    if (!allowed) return forbid(res, "You cannot undo check-in for this event");

    await prisma.attendee.updateMany({
      where: { id: attendeeId, checkedInAt: { not: null } },
      data: { checkedInAt: null, checkedInById: null },
    });
    return res.json({ success: true, data: { status: "NOT_ADMITTED", attendeeId } });
  } catch (error) {
    req.log.error({ err: error }, "Check-in undo error");
    return res.status(500).json({ success: false, error: { code: "CHECKIN_ERROR", message: "Failed to undo check-in" } });
  }
});

// ==================== HOST DASHBOARD - EVENT BOOKINGS ====================

// GET /api/bookings/event/:eventId - Get all bookings for an event (for host dashboard).
// Auth + ownership: the event's host, or an ADMIN of the event's fest.
router.get("/event/:eventId", authenticateUser, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { status } = req.query;

    const event = await prisma.event.findUnique({
      where: { id: parseInt(eventId) },
      select: { hostId: true, festId: true },
    });
    if (!event) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Event not found" },
      });
    }
    // The event's host, OR any ADMIN/EDITOR/HOST scoped to the event's fest, may
    // read its bookings — mirrors the fest-wide access model so a fest editor can
    // drill into a co-fest event instead of hitting a dead 403.
    let allowed = event.hostId != null && event.hostId === req.user.userId;
    if (!allowed) {
      const { managedFestId, editorFestId } = await callerFests(req);
      allowed = event.festId != null && (event.festId === managedFestId || event.festId === editorFestId);
    }
    if (!allowed) return forbid(res);

    const eid = parseInt(eventId);
    const { page, pageSize, skip, take } = parsePagination(req.query);

    // ARCH-07: summary stats come from DB aggregates over the WHOLE event, not a
    // JS reduce over every row. groupBy(status) gives per-status counts +
    // completed revenue; a BookingItem aggregate gives total tickets sold. The
    // optional ?status filter narrows the row list only, never the stats.
    const statusGroups =
      (await prisma.booking.groupBy({
        by: ["status"],
        where: { eventId: eid },
        _count: { _all: true },
        _sum: { total: true },
      })) || [];
    const countByStatus = {};
    let totalBookings = 0;
    let totalRevenue = 0;
    for (const g of statusGroups) {
      countByStatus[g.status] = g._count?._all || 0;
      totalBookings += g._count?._all || 0;
      if (g.status === "COMPLETED") totalRevenue = g._sum?.total || 0;
    }
    const ticketsAgg = await prisma.bookingItem.aggregate({
      where: { booking: { eventId: eid, status: "COMPLETED" } },
      _sum: { quantity: true },
    });
    // TIX-04: door check-in totals over the event's COMPLETED attendees.
    const completedAttendeeWhere = { booking: { eventId: eid, status: "COMPLETED" } };
    const attendeeCount = await prisma.attendee.count({ where: completedAttendeeWhere });
    const admittedCount = await prisma.attendee.count({
      where: { ...completedAttendeeWhere, checkedInAt: { not: null } },
    });
    const stats = {
      totalBookings,
      completedBookings: countByStatus.COMPLETED || 0,
      pendingBookings: countByStatus.PENDING || 0,
      cancelledBookings: countByStatus.CANCELLED || 0,
      totalRevenue,
      totalTicketsSold: ticketsAgg?._sum?.quantity || 0,
      // TIX-04
      attendeeCount,
      admittedCount,
    };

    // The row list is paginated (default 50, max 100 per page).
    const listWhere = { eventId: eid };
    if (status) listWhere.status = status;
    const total = await prisma.booking.count({ where: listWhere });
    const bookings = await prisma.booking.findMany({
      where: listWhere,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        items: {
          include: {
            ticketType: { select: { id: true, name: true, price: true } },
          },
        },
        attendees: true,
        payment: true,
      },
    });

    // Format for host dashboard
    const formattedBookings = bookings.map((booking) => ({
      id: booking.id,
      bookingCode: booking.bookingCode,
      buyerName: booking.user?.name || booking.guestName || "Guest",
      buyerEmail: booking.user?.email || booking.guestEmail,
      buyerPhone: booking.user?.phone || booking.guestPhone,
      tickets: booking.items.map((item) => ({
        type: item.ticketType.name,
        quantity: item.quantity,
        price: item.unitPrice,
        total: item.totalPrice,
      })),
      totalTickets: sumTicketQuantity(booking.items),
      subtotal: booking.subtotal,
      platformFee: booking.platformFee,
      tax: booking.tax,
      total: booking.total,
      status: booking.status,
      refundedAmount: booking.refundedAmount || 0, // paise (PAY-02)
      paymentStatus: booking.payment?.status || "PENDING",
      paymentMethod: booking.payment?.method || null,
      purchaseDate: booking.purchaseDate,
      createdAt: booking.createdAt,
      attendees: booking.attendees.map((att) => ({
        // TIX-04: expose per-attendee id + ticketCode + check-in state for the
        // live door dashboard (manual admit/undo + search).
        id: att.id,
        ticketCode: att.ticketCode,
        checkedInAt: att.checkedInAt,
        name: att.name,
        email: att.email,
        ticketType: booking.items.find((i) => i.ticketTypeId === att.ticketTypeId)?.ticketType.name,
      })),
    }));

    res.json({
      success: true,
      data: {
        bookings: formattedBookings,
        stats,
        pagination: buildPagination(page, pageSize, total),
      },
    });
  } catch (error) {
    req.log.error({ err: error }, "Error fetching event bookings");
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch bookings" },
    });
  }
});

// ==================== HOST DASHBOARD - FEST BOOKINGS ====================

// GET /api/bookings/fest/:festId - Get all bookings for a fest.
// Auth + ownership: the fest's ADMIN (managedFestId) or its EDITOR/HOST (editorFestId).
router.get("/fest/:festId", authenticateUser, async (req, res) => {
  try {
    const { festId } = req.params;

    const fid = parseInt(festId);
    const { managedFestId, editorFestId } = await callerFests(req);
    if (fid !== managedFestId && fid !== editorFestId) {
      return forbid(res);
    }

    const RECENT_LIMIT = 20;

    // ARCH-07: never pull the fest's full booking graph. Fetch the event
    // id→name map, then compute totals + the per-event summary with DB
    // aggregates and load only the most-recent completed bookings for preview.
    const events = await prisma.event.findMany({
      where: { festId: fid },
      select: { id: true, name: true },
    });
    const eventIds = events.map((e) => e.id);
    const nameById = Object.fromEntries(events.map((e) => [e.id, e.name]));

    const completedWhere = { eventId: { in: eventIds }, status: "COMPLETED" };

    // Count + revenue per event (COMPLETED only) via one groupBy.
    const perEvent = eventIds.length
      ? await prisma.booking.groupBy({
          by: ["eventId"],
          where: completedWhere,
          _count: { _all: true },
          _sum: { total: true },
        })
      : [];

    // Tickets sold per event: BookingItem has no eventId, so join to Booking in a
    // single aggregate rather than looping. eventIds are integers from our own
    // query, so interpolating them is injection-safe.
    const ticketRows = eventIds.length
      ? await prisma.$queryRawUnsafe(
          `SELECT b."eventId" AS "eventId", COALESCE(SUM(bi.quantity), 0)::int AS tickets
           FROM "BookingItem" bi
           JOIN "Booking" b ON bi."bookingId" = b.id
           WHERE b."eventId" IN (${eventIds.join(",")}) AND b.status = 'COMPLETED'
           GROUP BY b."eventId"`
        )
      : [];
    const ticketsByEvent = Object.fromEntries(
      (ticketRows || []).map((r) => [Number(r.eventId), Number(r.tickets) || 0])
    );

    let totalBookings = 0;
    let totalRevenue = 0;
    let totalTickets = 0;
    const eventSummary = {};
    for (const g of perEvent) {
      const count = g._count?._all || 0;
      const revenue = g._sum?.total || 0;
      const tickets = ticketsByEvent[g.eventId] || 0;
      totalBookings += count;
      totalRevenue += revenue;
      totalTickets += tickets;
      // Accumulate into the name bucket rather than overwriting — two distinct
      // events in the same fest may share a name, and the per-event summary must
      // sum them (matching the pre-ARCH-07 behaviour) instead of dropping one.
      const name = nameById[g.eventId] ?? `Event ${g.eventId}`;
      const bucket = eventSummary[name] || { tickets: 0, revenue: 0 };
      bucket.tickets += tickets;
      bucket.revenue += revenue;
      eventSummary[name] = bucket;
    }

    // Recent-bookings preview: the N most-recent completed, no full-graph load.
    const recent = eventIds.length
      ? await prisma.booking.findMany({
          where: completedWhere,
          orderBy: { purchaseDate: "desc" },
          take: RECENT_LIMIT,
          include: {
            event: { select: { id: true, name: true } },
            user: { select: { name: true, email: true } },
          },
        })
      : [];

    res.json({
      success: true,
      data: {
        totalBookings,
        totalRevenue,
        totalTickets,
        eventSummary,
        recentBookings: recent.map((b) => ({
          bookingCode: b.bookingCode,
          eventName: b.event?.name,
          buyerName: b.user?.name || b.guestName,
          buyerEmail: b.user?.email || b.guestEmail,
          total: b.total,
          purchaseDate: b.purchaseDate,
        })),
        // A preview window over the completed bookings, not a full paginated
        // list — recentBookings is capped at RECENT_LIMIT.
        pagination: buildPagination(1, RECENT_LIMIT, totalBookings),
      },
    });
  } catch (error) {
    req.log.error({ err: error }, "Error fetching fest bookings");
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch bookings" },
    });
  }
});

// ==================== ADMIN: MANUAL STALE-SWEEP TRIGGER ====================

// POST /api/bookings/admin/sweep-stale - force a stale-hold release now.
// ADMIN only. Shares the exact expireStalePendingBookings implementation as the
// scheduled interval (no logic duplication). Optional body { olderThanMinutes }.
router.post("/admin/sweep-stale", authenticateUser, authorizeRoles("ADMIN"), async (req, res) => {
  try {
    const mins = Number(req.body?.olderThanMinutes);
    const olderThanMs = Number.isFinite(mins) && mins > 0 ? mins * 60 * 1000 : undefined;
    const result = await expireStalePendingBookings(olderThanMs);
    return res.json({ success: true, data: result });
  } catch (error) {
    req.log.error({ err: error }, "Manual stale sweep failed");
    return res.status(500).json({
      success: false,
      error: { code: "SWEEP_ERROR", message: "Failed to sweep stale bookings" },
    });
  }
});

// ==================== MAINTENANCE: EXPIRE STALE PENDING BOOKINGS ====================

// H11: Inventory is held the moment a PENDING booking is created (sold is
// incremented up front). If the buyer never pays, those seats stay locked
// forever. This sweep finds PENDING bookings older than `olderThanMs` and
// releases them — restoring each ticket type's `sold` and marking the booking
// CANCELLED (mirrors the manual cancel flow).
//
// NOTE: this does NOT start a timer. A scheduled job / cron (e.g. every few
// minutes) should import and call this; wiring an interval here would fire once
// per server process and is out of scope for a route module.
// NOTIF-02: email buyers whose PENDING booking has stalled a "finish your
// payment" nudge — once each — BEFORE the 15-min expiry sweep cancels it. The
// default 10-min threshold is strictly less than BOOKING_HOLD_MS (15 min) so the
// recovery mail always precedes cancellation. Marketing-gated for registered
// buyers (NOTIF-09); guests (no prefs) always get it when an email resolves.
export async function sendAbandonedCheckoutReminders(remindAfterMs = 10 * 60 * 1000) {
  const started = Date.now();
  const cutoff = new Date(Date.now() - remindAfterMs);

  const candidates = await prisma.booking.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff }, recoveryEmailSentAt: null },
    include: {
      event: { select: { id: true, name: true } },
      items: { include: { ticketType: { select: { name: true } } } },
      user: { select: { email: true, name: true, notifyMarketing: true } },
    },
  });

  let sent = 0;
  for (const booking of candidates) {
    const to = booking.guestEmail || booking.user?.email;
    if (!to) continue; // no resolvable recipient — skip cleanly
    // NOTIF-09: a registered buyer who opted out of marketing is skipped.
    if (booking.userId && booking.user && booking.user.notifyMarketing === false) continue;

    // Claim atomically FIRST so two overlapping sweep passes can never both email
    // the same booking (spamming the buyer is the worse failure). Only the winner
    // (count === 1) proceeds.
    const claim = await prisma.booking.updateMany({
      where: { id: booking.id, recoveryEmailSentAt: null, status: "PENDING" },
      data: { recoveryEmailSentAt: new Date() },
    });
    if (claim.count !== 1) continue;

    const result = await sendAbandonedCheckout(booking).catch((err) => ({ sent: false, error: err }));
    // A TRANSIENT send failure releases the claim so a later pass retries; a
    // deterministic skip (no provider / no email) keeps the stamp (nothing to retry).
    if (result && result.sent === false && result.error) {
      await prisma.booking.updateMany({ where: { id: booking.id }, data: { recoveryEmailSentAt: null } });
    } else if (result?.sent) {
      sent += 1;
    }
  }

  return { sent, durationMs: Date.now() - started };
}

// NOTIF-03: email each COMPLETED buyer a QR + .ics + directions reminder as the
// event approaches, deduped per (booking, kind) by the ReminderLog @@unique. The
// windows are [target, target+WINDOW): WINDOW must be >= the schedule interval so
// no event slips between ticks; any overlap is absorbed by the dedup guard.
const REMINDER_WINDOW_MS = 20 * 60 * 1000;

export async function sendEventReminders() {
  const started = Date.now();
  const now = Date.now();
  const windows = [
    { kind: "T24", start: new Date(now + 24 * 3600 * 1000), end: new Date(now + 24 * 3600 * 1000 + REMINDER_WINDOW_MS) },
    { kind: "T1", start: new Date(now + 1 * 3600 * 1000), end: new Date(now + 1 * 3600 * 1000 + REMINDER_WINDOW_MS) },
  ];

  let sent = 0;
  for (const w of windows) {
    const bookings = await prisma.booking.findMany({
      where: {
        status: "COMPLETED",
        event: { startDate: { gte: w.start, lt: w.end } },
        reminders: { none: { kind: w.kind } }, // not already reminded for this kind
      },
      include: {
        event: {
          select: {
            id: true, name: true, startDate: true, startTime: true, endDate: true, endTime: true,
            venue: true, venueAddress: true, onlineLink: true, isOnline: true, description: true,
          },
        },
        user: { select: { email: true, name: true, notifyReminders: true } },
      },
    });

    for (const booking of bookings) {
      const to = booking.guestEmail || booking.user?.email;
      if (!to) continue; // no recipient — skip cleanly
      // NOTIF-09: a registered buyer who opted out of reminders is skipped.
      if (booking.userId && booking.user && booking.user.notifyReminders === false) continue;

      // Insert the dedup row FIRST; the @@unique([bookingId,kind]) makes a racing
      // duplicate throw, so we skip rather than double-send. Reminders are
      // best-effort: on a transient send failure we keep the log (accept a rare
      // missed reminder over risking a duplicate).
      try {
        await prisma.reminderLog.create({ data: { bookingId: booking.id, kind: w.kind } });
      } catch {
        continue; // already logged by a concurrent sweep
      }
      const result = await sendEventReminder(booking, w.kind).catch((err) => ({ sent: false, error: err }));
      if (result?.sent) sent += 1;
    }
  }

  return { sent, durationMs: Date.now() - started };
}

// NOTIF-05: snapshot sales stats for a fest — tickets sold + revenue (paise) from
// COMPLETED bookings, and remaining inventory across the fest's ticket types.
async function computeFestSalesStats(festId) {
  const ticketTypes = await prisma.ticketType.findMany({
    where: { event: { festId } },
    select: { quantity: true, sold: true },
  });
  const remaining = ticketTypes.reduce((s, t) => s + Math.max(0, (t.quantity || 0) - (t.sold || 0)), 0);

  const bookings = await prisma.booking.findMany({
    where: { status: "COMPLETED", event: { festId } },
    select: { total: true, items: { select: { quantity: true } } },
  });
  let ticketsSold = 0;
  let revenue = 0;
  for (const b of bookings) {
    revenue += b.total || 0; // paise (PAY-03)
    ticketsSold += (b.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
  }
  return { ticketsSold, revenue, remaining };
}

// NOTIF-05: once-a-day (IST) per-fest sales digest to the fest ADMIN + its event
// hosts. Idempotent via a per-user lastSalesDigestAt claim so a restart mid-day
// never double-sends. Fests with zero completed sales are skipped.
export async function sendDailySalesDigests(now = new Date()) {
  const started = Date.now();
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  // UTC instant of the current IST calendar day's midnight.
  const todayStart = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS);
  const dueFilter = { OR: [{ lastSalesDigestAt: null }, { lastSalesDigestAt: { lt: todayStart } }] };

  // USER-centric (Phase-5 review P3 fix): iterate due organizers, not fests, so a
  // host organizing events in multiple fests receives EVERY fest's digest — the
  // old per-fest loop claimed the user on the first fest and skipped the rest.
  // The once-a-day claim stays per-user; each claimed user then gets a digest for
  // each of their fests that has sales.
  const dueUsers = await prisma.user.findMany({
    where: {
      notifySalesDigest: true,
      AND: [dueFilter, { OR: [{ managedFestId: { not: null } }, { hostedEvents: { some: {} } }] }],
    },
    select: { id: true, email: true, name: true, managedFestId: true },
  });
  if (dueUsers.length === 0) return { sent: 0, durationMs: Date.now() - started };

  let sent = 0;
  for (const user of dueUsers) {
    if (!user.email) continue;
    // Claim once-per-day atomically so a re-run / second replica can't double-send.
    const claim = await prisma.user.updateMany({
      where: { id: user.id, ...dueFilter },
      data: { lastSalesDigestAt: now },
    });
    if (claim.count !== 1) continue;

    // Every fest this user organizes: the one they ADMIN + the fests of their events.
    const festIds = new Set();
    if (user.managedFestId != null) festIds.add(user.managedFestId);
    const hosted = await prisma.event.findMany({
      where: { hostId: user.id },
      select: { festId: true },
      distinct: ["festId"],
    });
    for (const e of hosted) if (e.festId != null) festIds.add(e.festId);

    for (const festId of festIds) {
      const fest = await prisma.fest.findUnique({ where: { id: festId }, select: { id: true, name: true } });
      if (!fest) continue;
      const stats = await computeFestSalesStats(festId);
      if (stats.ticketsSold === 0) continue; // no empty digests
      const res = await sendSalesDigest(fest, [user], stats).catch(() => null);
      if (Array.isArray(res) && res.some((x) => x?.sent)) sent += 1;
    }
  }
  return { sent, durationMs: Date.now() - started };
}

export async function expireStalePendingBookings(olderThanMs = BOOKING_HOLD_MS) {
  const started = Date.now();
  const cutoff = new Date(Date.now() - olderThanMs);

  // SWEEP-RACE: never expire a booking whose payment is in flight. Once
  // create-order runs it stores a Payment with an orderId; if we cancelled here,
  // a payment captured moments later would land on a CANCELLED booking with no
  // ticket. So only sweep bookings that have NO payment, or a payment whose
  // orderId is still null (order never created).
  const stale = await prisma.booking.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: cutoff },
      OR: [{ payment: null }, { payment: { orderId: null } }],
    },
    // NOTIF-06: event/user feed the "reservation expired" email fired below.
    include: {
      items: true,
      event: { select: { id: true, name: true } },
      user: { select: { email: true, name: true } },
    },
  });

  let expired = 0;
  const cancelled = []; // only bookings THIS sweep actually flipped (for email)
  for (const booking of stale) {
    const won = await prisma.$transaction(async (tx) => {
      // Atomically claim the PENDING -> CANCELLED transition so a concurrent
      // manual cancel (or a second sweep) cannot also restore this booking's
      // inventory. Only the winner (count === 1) decrements.
      const flip = await tx.booking.updateMany({
        where: { id: booking.id, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
      if (flip.count === 0) return false; // already handled elsewhere
      for (const item of booking.items) {
        await tx.ticketType.updateMany({
          where: { id: item.ticketTypeId, sold: { gte: item.quantity } },
          data: { sold: { decrement: item.quantity } },
        });
      }
      await releasePromoRedemption(tx, booking.promoCodeId); // PAY-04
      expired += 1;
      return true;
    });
    if (won) cancelled.push(booking);
  }

  // NOTIF-06: email each buyer whose reservation THIS sweep expired (distinct
  // from the manual-cancel mail). Fire-and-forget after the transactions commit,
  // never inside them, and only for bookings this run actually cancelled — so a
  // booking a concurrent manual cancel already handled gets no expiry mail.
  for (const b of cancelled) {
    sendBookingExpired(b).catch(() => {});
    // NOTIF-08: in-app notice for the registered buyer.
    if (b.userId) {
      createNotification({
        userId: b.userId,
        type: "booking_expired",
        title: "Reservation expired",
        body: `Your held tickets for ${b.event?.name || "an event"} were released.`,
        linkUrl: "/bookings",
      }).catch(() => {});
    }
    // PAY-08: released inventory -> notify the oldest waiter per ticket type.
    for (const item of b.items) {
      releaseToWaitlist(item.ticketTypeId, item.quantity, null).catch(() => {});
    }
  }

  return { expired, durationMs: Date.now() - started };
}

// ==================== PAY-01: RAZORPAY WEBHOOK ====================

// Mounted directly in index.js with express.raw (BEFORE the global express.json)
// so the HMAC is computed over the exact bytes Razorpay signed. Settles/fails a
// booking server-side and idempotently, so a captured payment is honoured even
// if the buyer closed the tab before verify-payment ran.
export async function razorpayWebhookHandler(req, res) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!getRazorpay() || !secret) {
    return res.status(503).json({ received: false, error: "Razorpay webhook not configured" });
  }
  try {
    const raw = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body || {}));
    const signature = String(req.headers["x-razorpay-signature"] || "");
    const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(400).json({ received: false, error: "invalid signature" });
    }

    let event;
    try {
      event = JSON.parse(raw.toString("utf8"));
    } catch {
      return res.status(400).json({ received: false, error: "invalid body" });
    }

    const eventId = String(
      req.headers["x-razorpay-event-id"] || event.id || `${event.event}:${event?.payload?.payment?.entity?.id || ""}`
    );

    // Idempotency: first-write-wins on the unique eventId (Razorpay retries ~24h).
    try {
      await prisma.webhookEvent.create({
        data: { provider: "razorpay", eventId, type: event.event || "unknown", payload: raw.toString("utf8") },
      });
    } catch (e) {
      if (e?.code === "P2002") return res.status(200).json({ received: true, duplicate: true });
      throw e;
    }

    const entity = event?.payload?.payment?.entity;
    if (event.event === "payment.captured" && entity?.order_id) {
      const payment = await prisma.payment.findFirst({
        where: { orderId: entity.order_id },
        include: { booking: true },
      });
      // Only settle when the captured amount matches the booking total (paise).
      if (payment?.booking?.status === "PENDING" && entity.amount === payment.booking.total) {
        const updated = await settleBookingAsPaid(payment.bookingId, {
          transactionId: entity.id,
          method: mapRazorpayMethod(entity.method),
        });
        if (updated) {
          sendBookingConfirmation(updated).catch((err) =>
            req.log?.error({ err }, "[webhook] confirmation email failed")
          );
          notifyNewSale(updated, req.log); // NOTIF-05 (winner-only settle -> no dup)
          notifyTicketSms(updated, req.log); // NOTIF-07
          notifyInAppSale(updated).catch(() => {}); // NOTIF-08
        }
      }
    } else if (event.event === "payment.failed" && entity?.order_id) {
      // Guard on status PENDING so an out-of-order failed webhook (a declined
      // attempt whose retry already succeeded) can't clobber a SUCCESS payment on
      // an already-COMPLETED booking. Only a still-pending payment is marked FAILED.
      await prisma.payment.updateMany({
        where: { orderId: entity.order_id, status: "PENDING" },
        data: { status: "FAILED" },
      });
    }
    // Unknown event types are accepted (200) so Razorpay stops retrying them.

    await prisma.webhookEvent.updateMany({ where: { eventId }, data: { processedAt: new Date() } });
    return res.status(200).json({ received: true });
  } catch (error) {
    req.log?.error({ err: error }, "[webhook] razorpay handler failed");
    // 500 lets Razorpay retry a genuine server fault.
    return res.status(500).json({ received: false });
  }
}

// PAY-01: actively reconcile orderId-set PENDING bookings that the normal sweep
// deliberately skips (a payment may be in flight). Asks Razorpay whether the
// order was actually captured; if so, settles it (recovers a stuck booking). Only
// runs when Razorpay is configured, bounded per pass to avoid hammering the API.
export async function reconcileStalePaidOrders(olderThanMs = 30 * 60 * 1000, limit = 25) {
  const razorpay = getRazorpay();
  if (!razorpay) return { settled: 0, checked: 0 };
  const cutoff = new Date(Date.now() - olderThanMs);
  const stale = await prisma.booking.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff }, payment: { orderId: { not: null } } },
    include: { payment: true, items: true },
    take: limit,
  });
  let settled = 0;
  let released = 0;
  for (const b of stale) {
    try {
      const orderId = b.payment?.orderId;
      if (!orderId) continue;
      const result = await razorpay.orders.fetchPayments(orderId);
      const captured = (result?.items || []).find((p) => p.status === "captured" && p.amount === b.total);
      if (captured) {
        const updated = await settleBookingAsPaid(b.id, {
          transactionId: captured.id,
          method: mapRazorpayMethod(captured.method),
        });
        if (updated) {
          settled += 1;
          sendBookingConfirmation(updated).catch(() => {});
          notifyNewSale(updated, null); // NOTIF-05 (winner-only settle -> no dup)
          notifyTicketSms(updated, null); // NOTIF-07
          notifyInAppSale(updated).catch(() => {}); // NOTIF-08
        }
      } else {
        // No captured payment after the window: the order was abandoned or every
        // attempt failed. The normal sweep deliberately skips orderId-set bookings,
        // so RELEASE the hold here (Razorpay is authoritative that nothing was
        // captured) — cancel the booking and restore inventory + promo, else its
        // seats and a capped promo code leak forever. The guarded flip means a
        // late capture that settled it concurrently (count 0) is left untouched.
        const didRelease = await prisma.$transaction(async (tx) => {
          const flip = await tx.booking.updateMany({
            where: { id: b.id, status: "PENDING" },
            data: { status: "CANCELLED" },
          });
          if (flip.count === 0) return false;
          for (const item of b.items) {
            await tx.ticketType.updateMany({
              where: { id: item.ticketTypeId, sold: { gte: item.quantity } },
              data: { sold: { decrement: item.quantity } },
            });
          }
          await releasePromoRedemption(tx, b.promoCodeId);
          return true;
        });
        if (didRelease) released += 1;
      }
    } catch {
      /* skip this one; retried next pass */
    }
  }
  return { settled, released, checked: stale.length };
}

export default router;
