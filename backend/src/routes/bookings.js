// backend/src/routes/bookings.js
import { Router } from "express";
import prisma from "../prisma.js";
import Razorpay from "razorpay";
import { sendBookingConfirmation } from "../utils/email.js";
import { authenticateUser, optionalAuthenticate } from "../middleware/authMiddleware.js";
import { bookingLimiter, writeLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import { createBookingSchema } from "../validators/bookingValidator.js";

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
  const providedCode = req.body?.bookingCode;
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

// Tag a business/client error with an explicit HTTP status + stable code + a
// safe, user-facing message. The POST catch maps these to their status and
// exposes the message; ANY untagged error is treated as an unexpected fault and
// becomes a GENERIC 500 (its raw message is never leaked to the client).
const bookingError = (status, code, message) =>
  Object.assign(new Error(message), { status, code, expose: true });

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

// L9: CANONICAL fee/tax rounding. Round every currency amount to 2 decimals
// (paise) so the total we store/charge is byte-for-byte reproducible by the
// frontend from the same subtotal. Both frontend pages mirror this exact rule,
// and the Razorpay amount is Math.round(total * 100) paise.
const round2 = (n) => Math.round(n * 100) / 100;

// Compute { platformFee, tax, total } from a subtotal using the canonical rule:
// platformFee = round2(2% of subtotal); tax = round2(18% GST of subtotal+fee);
// total = subtotal + platformFee + tax.
const computeFees = (subtotal) => {
  const platformFee = round2(subtotal * 0.02); // 2% platform fee
  const tax = round2((subtotal + platformFee) * 0.18); // 18% GST on (subtotal + fee)
  const total = round2(subtotal + platformFee + tax);
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
    } = req.body;

    // L2: the owning user comes ONLY from a verified token, never from the body.
    // A guest (no token) can never attribute a booking to someone else's account.
    const userId = req.user ? req.user.userId : null;

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
      // discounted base with the canonical round2 rule. With no discount (pct
      // 0) discountedBase === subtotal, so behaviour is identical to before.
      const pct = event.discount || 0; // percentage 0..100 from the event
      const discount = round2(subtotal * (pct / 100));
      const discountedBase = round2(subtotal - discount);
      const platformFee = round2(discountedBase * 0.02); // 2% platform fee
      const tax = round2((discountedBase + platformFee) * 0.18); // 18% GST
      const total = round2(discountedBase + platformFee + tax);

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
      if (!isFree && Math.round(total * 100) < 100) {
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
          platformFee,
          tax,
          total,
          status: isFree ? "COMPLETED" : "PENDING",
          purchaseDate: isFree ? new Date() : null,
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
      }

      // 7. Return complete booking
      const full = await tx.booking.findUnique({
        where: { id: newBooking.id },
        include: {
          event: {
            select: { id: true, name: true, venue: true, startDate: true, image: true },
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
        console.error("[email] Booking confirmation failed:", e)
      );
    }

    res.status(201).json({
      success: true,
      data: booking.full,
      message: "Booking created successfully",
    });
  } catch (error) {
    console.error("Error creating booking:", error);
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

    const amountPaise = Math.round(booking.total * 100);
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
    console.error("Razorpay create order error:", err);
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
    if (paymentEntity.status !== "captured") {
      return res.status(400).json({
        success: false,
        error: { code: "VERIFY_FAILED", message: "Payment not captured" },
      });
    }

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
    if (paymentEntity.amount !== Math.round(booking.total * 100)) {
      return res.status(400).json({
        success: false,
        error: { code: "VERIFY_FAILED", message: "Paid amount does not match the booking total" },
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: "COMPLETED", purchaseDate: new Date() },
      });
      await tx.payment.updateMany({
        where: { bookingId },
        data: {
          status: "SUCCESS",
          transactionId: razorpay_payment_id,
          paymentDate: new Date(),
          method: mapRazorpayMethod(paymentEntity.method),
        },
      });
    });

    const updated = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        event: true,
        items: { include: { ticketType: true } },
        attendees: true,
        user: { select: { email: true, name: true } },
      },
    });

    sendBookingConfirmation(updated).catch((e) => console.error("[email] Booking confirmation failed:", e));

    res.json({
      success: true,
      data: updated,
      message: "Payment verified and booking completed",
    });
  } catch (err) {
    console.error("Razorpay verify error:", err);
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
        data: { status: "COMPLETED", purchaseDate: new Date() },
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

    sendBookingConfirmation(booking).catch((e) => console.error("[email] Booking confirmation failed:", e));

    res.json({
      success: true,
      data: booking,
      message: "Booking completed successfully",
    });
  } catch (error) {
    console.error("Error completing booking:", error);
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
      data: booking,
    });
  } catch (error) {
    console.error("Error fetching booking:", error);
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
      data: booking,
    });
  } catch (error) {
    console.error("Error fetching booking:", error);
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch booking" },
    });
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
    console.error("Error fetching user bookings:", error);
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
    console.error("Error fetching guest bookings:", error);
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
      include: { items: true, event: { select: { hostId: true, festId: true } } },
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
  } catch (error) {
    console.error("Error cancelling booking:", error);
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

    const where = { eventId: parseInt(eventId) };
    if (status) where.status = status;

    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
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
      paymentStatus: booking.payment?.status || "PENDING",
      paymentMethod: booking.payment?.method || null,
      purchaseDate: booking.purchaseDate,
      createdAt: booking.createdAt,
      attendees: booking.attendees.map((att) => ({
        name: att.name,
        email: att.email,
        ticketType: booking.items.find((i) => i.ticketTypeId === att.ticketTypeId)?.ticketType.name,
      })),
    }));

    // Calculate summary stats
    const completedBookings = bookings.filter((b) => b.status === "COMPLETED");
    const stats = {
      totalBookings: bookings.length,
      completedBookings: completedBookings.length,
      pendingBookings: bookings.filter((b) => b.status === "PENDING").length,
      cancelledBookings: bookings.filter((b) => b.status === "CANCELLED").length,
      totalRevenue: completedBookings.reduce((sum, b) => sum + b.total, 0),
      totalTicketsSold: completedBookings.reduce(
        (sum, b) => sum + sumTicketQuantity(b.items),
        0
      ),
    };

    res.json({
      success: true,
      data: {
        bookings: formattedBookings,
        stats,
      },
    });
  } catch (error) {
    console.error("Error fetching event bookings:", error);
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

    // Get all events for this fest
    const events = await prisma.event.findMany({
      where: { festId: parseInt(festId) },
      select: { id: true },
    });

    const eventIds = events.map((e) => e.id);

    const bookings = await prisma.booking.findMany({
      where: {
        eventId: { in: eventIds },
        status: "COMPLETED",
      },
      orderBy: { purchaseDate: "desc" },
      include: {
        event: { select: { id: true, name: true } },
        user: { select: { name: true, email: true } },
        items: {
          include: { ticketType: { select: { name: true, price: true } } },
        },
      },
    });

    // Summary by event
    const eventSummary = {};
    for (const booking of bookings) {
      const eventName = booking.event.name;
      if (!eventSummary[eventName]) {
        eventSummary[eventName] = { tickets: 0, revenue: 0 };
      }
      eventSummary[eventName].tickets += sumTicketQuantity(booking.items);
      eventSummary[eventName].revenue += booking.total;
    }

    res.json({
      success: true,
      data: {
        totalBookings: bookings.length,
        totalRevenue: bookings.reduce((sum, b) => sum + b.total, 0),
        totalTickets: bookings.reduce(
          (sum, b) => sum + sumTicketQuantity(b.items),
          0
        ),
        eventSummary,
        recentBookings: bookings.slice(0, 20).map((b) => ({
          bookingCode: b.bookingCode,
          eventName: b.event.name,
          buyerName: b.user?.name || b.guestName,
          buyerEmail: b.user?.email || b.guestEmail,
          total: b.total,
          purchaseDate: b.purchaseDate,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching fest bookings:", error);
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch bookings" },
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
export async function expireStalePendingBookings(olderThanMs = 15 * 60 * 1000) {
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
    include: { items: true },
  });

  let expired = 0;
  for (const booking of stale) {
    await prisma.$transaction(async (tx) => {
      // Atomically claim the PENDING -> CANCELLED transition so a concurrent
      // manual cancel (or a second sweep) cannot also restore this booking's
      // inventory. Only the winner (count === 1) decrements.
      const flip = await tx.booking.updateMany({
        where: { id: booking.id, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
      if (flip.count === 0) return; // already handled elsewhere
      for (const item of booking.items) {
        await tx.ticketType.updateMany({
          where: { id: item.ticketTypeId, sold: { gte: item.quantity } },
          data: { sold: { decrement: item.quantity } },
        });
      }
      expired += 1;
    });
  }

  return { expired };
}

export default router;
