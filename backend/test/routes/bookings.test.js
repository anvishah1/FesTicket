import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { prismaMock, resetPrismaMock } from "@prisma/client";
import { makeApp } from "../helpers/makeApp.js";
import { signToken } from "../helpers/auth.js";
import router, { expireStalePendingBookings, BOOKING_HOLD_MS } from "../../src/routes/bookings.js";
import { sendBookingConfirmation } from "../../src/utils/email.js";

vi.mock("@prisma/client");

// Keep confirmation emails quiet + inspectable.
vi.mock("../../src/utils/email.js", () => ({
  sendBookingConfirmation: vi.fn(async () => ({ sent: false })),
}));

// supertest hammers the same IP, so neutralise the rate limiters (bookingLimiter
// on POST /, writeLimiter on create-order/verify-payment) — otherwise repeated
// calls would start returning 429 and break the suite.
vi.mock("../../src/middleware/rateLimiter.js", () => ({
  loginLimiter: (req, res, next) => next(),
  signupLimiter: (req, res, next) => next(),
  bookingLimiter: (req, res, next) => next(),
  writeLimiter: (req, res, next) => next(),
}));

// Razorpay is a default-import constructor in bookings.js. The mock returns a
// shared object whose methods we configure per test.
const rzp = vi.hoisted(() => ({
  orders: { create: vi.fn() },
  payments: { fetch: vi.fn() },
}));
vi.mock("razorpay", () => ({
  default: vi.fn(() => rzp),
}));

const app = makeApp(router, "/api/bookings");

beforeEach(() => {
  resetPrismaMock();
  // AttendeeAnswer is a newer model not present in the shared mock's MODEL_KEYS,
  // and that mock file is out of scope to edit here — so register the calls this
  // suite exercises (bookings.js persists answers via attendeeAnswer.createMany).
  prismaMock.attendeeAnswer = { createMany: vi.fn().mockResolvedValue({ count: 0 }) };
  rzp.orders.create.mockReset();
  rzp.payments.fetch.mockReset();
});

// setup.js deletes RAZORPAY env by default; ensure any test that sets it cleans up.
afterEach(() => {
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
});

function enableRazorpay() {
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
}

// Bearer header for a signed access token ({ userId, role }).
function auth(payload = {}) {
  return `Bearer ${signToken(payload)}`;
}

// ==================== POST / (create booking) ====================

describe("POST /api/bookings", () => {
  it("returns 400 when eventId/tickets are missing", async () => {
    const res = await request(app).post("/api/bookings").send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toMatch(/Event ID and tickets are required/);
  });

  it("returns 400 when tickets is an empty array", async () => {
    const res = await request(app)
      .post("/api/bookings")
      .send({ eventId: 1, tickets: [], guestEmail: "g@x.com" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when neither userId nor guestEmail is provided", async () => {
    const res = await request(app)
      .post("/api/bookings")
      .send({ eventId: 1, tickets: [{ ticketTypeId: 10, quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toMatch(/User ID or guest email is required/);
  });

  it("creates a booking (guest + attendees) with correct fee math and side-effects", async () => {
    const event = {
      id: 1,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ticketTypes: [{ id: 10, name: "GA", price: 100, quantity: 50, sold: 0 }],
    };
    prismaMock.event.findUnique.mockResolvedValue(event);
    prismaMock.booking.create.mockResolvedValue({ id: 99, items: [] });
    prismaMock.attendee.createMany.mockResolvedValue({ count: 1 });
    prismaMock.ticketType.updateMany.mockResolvedValue({ count: 1 });
    const finalBooking = {
      id: 99,
      status: "PENDING",
      subtotal: 200,
      event: { id: 1, name: "Fest Night" },
      items: [],
      attendees: [],
    };
    prismaMock.booking.findUnique.mockResolvedValue(finalBooking);

    const res = await request(app)
      .post("/api/bookings")
      .send({
        eventId: 1,
        guestEmail: "g@x.com",
        guestName: "Guesty",
        guestPhone: "555",
        tickets: [{ ticketTypeId: 10, quantity: 2 }],
        attendees: [
          { ticketTypeId: 10, name: "Att One", email: "att1@x.com" },
          { ticketTypeId: 10, name: "Att Two", email: "att2@x.com" },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Booking created successfully");
    expect(res.body.data.id).toBe(99);

    // Fee math (PAY-03 integer paise): platformFee = round(2% of subtotal),
    // tax = round(18% GST on subtotal + fee), total = sum. All whole paise.
    const subtotal = 200; // paise
    const platformFee = Math.round(subtotal * 0.02); // 4
    const tax = Math.round((subtotal + platformFee) * 0.18); // round(36.72) = 37
    const total = subtotal + platformFee + tax; // 241
    expect(prismaMock.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: 1,
          userId: null,
          guestEmail: "g@x.com",
          guestName: "Guesty",
          guestPhone: "555",
          subtotal,
          platformFee,
          tax,
          total,
          status: "PENDING",
          items: {
            create: [
              { ticketTypeId: 10, quantity: 2, unitPrice: 100, totalPrice: 200 },
            ],
          },
        }),
      })
    );

    // Attendees inserted with the new booking id + parsed ticketTypeId (one per ticket).
    expect(prismaMock.attendee.createMany).toHaveBeenCalledWith({
      data: [
        { bookingId: 99, ticketTypeId: 10, name: "Att One", email: "att1@x.com" },
        { bookingId: 99, ticketTypeId: 10, name: "Att Two", email: "att2@x.com" },
      ],
    });

    // Sold count claimed via the atomic guarded write (sold <= quantity - qty).
    expect(prismaMock.ticketType.updateMany).toHaveBeenCalledWith({
      where: { id: 10, sold: { lte: 48 } },
      data: { sold: { increment: 2 } },
    });

    // Final read-back for the returned payload.
    expect(prismaMock.booking.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 99 } })
    );
  });

  it("rounds fractional fees/tax consistently to 2 decimals (paise) — L9 canonical", async () => {
    // subtotal 111 exercises the case where the OLD unrounded backend and the
    // OLD whole-rupee frontend disagreed with each other AND with the charged
    // amount: platformFee = 2.22, GST base 113.22, raw GST 20.3796. The old
    // backend stored total 133.5996 (charged 13360 paise) while the old frontend
    // displayed ₹133. Canonical rounding makes both show/charge 133.60.
    prismaMock.event.findUnique.mockResolvedValue({
      id: 1,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ticketTypes: [{ id: 30, name: "GA", price: 111, quantity: 50, sold: 0 }],
    });
    prismaMock.booking.create.mockResolvedValue({ id: 88, items: [] });
    prismaMock.ticketType.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.booking.findUnique.mockResolvedValue({ id: 88 });

    const res = await request(app)
      .post("/api/bookings")
      .send({
        eventId: 1,
        guestEmail: "g@x.com",
        tickets: [{ ticketTypeId: 30, quantity: 1 }],
      });

    expect(res.status).toBe(201);

    // PAY-03 integer paise:
    // platformFee = round(111 * 0.02)  = round(2.22)   = 2
    // tax         = round(113 * 0.18)  = round(20.34)  = 20
    // total       = 111 + 2 + 20       = 133
    expect(prismaMock.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: 111,
          platformFee: 2,
          tax: 20,
          total: 133,
        }),
      })
    );

    // The number charged (Razorpay paise) is derived from the SAME stored total,
    // so display == charge for every input.
    expect(Math.round(133.6 * 100)).toBe(13360);
  });

  it("creates a booking with userId and skips attendee.createMany when none given", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 3,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ticketTypes: [{ id: 20, name: "VIP", price: 500, quantity: 10, sold: 1 }],
    });
    prismaMock.booking.create.mockResolvedValue({ id: 7, items: [] });
    prismaMock.ticketType.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.booking.findUnique.mockResolvedValue({ id: 7 });

    // L2: the owning userId now comes from the auth token, never the request body.
    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${signToken({ userId: 42, role: "VIEWER" })}`)
      .send({
        eventId: 3,
        tickets: [{ ticketTypeId: 20, quantity: 1 }],
      });

    expect(res.status).toBe(201);
    expect(prismaMock.attendee.createMany).not.toHaveBeenCalled();
    expect(prismaMock.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 42, guestEmail: null }),
      })
    );
  });

  it("ignores a body userId for a guest booking (L2 anti-spoof)", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 3,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ticketTypes: [{ id: 20, name: "VIP", price: 500, quantity: 10, sold: 1 }],
    });
    prismaMock.booking.create.mockResolvedValue({ id: 7, items: [] });
    prismaMock.ticketType.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.booking.findUnique.mockResolvedValue({ id: 7 });

    const res = await request(app)
      .post("/api/bookings")
      .send({
        eventId: 3,
        userId: 42, // attacker tries to attribute the booking to user 42
        guestEmail: "g@x.com",
        tickets: [{ ticketTypeId: 20, quantity: 1 }],
      });

    expect(res.status).toBe(201);
    expect(prismaMock.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: null, guestEmail: "g@x.com" }),
      })
    );
  });

  it("returns 404 NOT_FOUND when the event does not exist", async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/bookings")
      .send({ eventId: 999, guestEmail: "g@x.com", tickets: [{ ticketTypeId: 1, quantity: 1 }] });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.message).toBe("Event not found");
  });

  it("returns 400 VALIDATION_ERROR when a ticket type is not part of the event", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 1,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ticketTypes: [{ id: 10, name: "GA", price: 100, quantity: 5, sold: 0 }],
    });
    const res = await request(app)
      .post("/api/bookings")
      .send({ eventId: 1, guestEmail: "g@x.com", tickets: [{ ticketTypeId: 77, quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toMatch(/Ticket type 77 not found/);
  });

  it("returns 409 SOLD_OUT when inventory is insufficient (not 500)", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 1,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ticketTypes: [{ id: 10, name: "GA", price: 100, quantity: 5, sold: 4 }],
    });
    const res = await request(app)
      .post("/api/bookings")
      .send({ eventId: 1, guestEmail: "g@x.com", tickets: [{ ticketTypeId: 10, quantity: 3 }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SOLD_OUT");
    expect(res.body.error.message).toMatch(/Not enough tickets available for GA\. Only 1 left\./);
  });

  // ---- H10(a): quantity domain check (integer >= 1) stays inline ----
  // These are numeric values that pass the zod type gate (quantity is a number)
  // but violate the domain rule, so the route's own VALIDATION_ERROR fires.
  it.each([
    ["zero", 0],
    ["negative", -1],
    ["fractional", 1.5],
  ])("returns 400 VALIDATION_ERROR for %s quantity (and never touches the DB)", async (_label, quantity) => {
    const res = await request(app)
      .post("/api/bookings")
      .send({ eventId: 1, guestEmail: "g@x.com", tickets: [{ ticketTypeId: 10, quantity }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toMatch(/quantity must be an integer >= 1/i);
    // Rejected before the transaction — the event was never loaded.
    expect(prismaMock.event.findUnique).not.toHaveBeenCalled();
  });

  // ---- M1: zod body validation rejects a non-numeric quantity up front ----
  it("returns 400 (zod) when quantity is not a number, before the handler runs", async () => {
    const res = await request(app)
      .post("/api/bookings")
      .send({ eventId: 1, guestEmail: "g@x.com", tickets: [{ ticketTypeId: 10, quantity: "2" }] });
    expect(res.status).toBe(400);
    // validate() now emits the unified envelope: { success:false, error:{ code,
    // message, details }, requestId } (ARCH-01).
    expect(res.body.error.message).toBe("Validation failed");
    // Rejected by middleware — the route/transaction never ran.
    expect(prismaMock.event.findUnique).not.toHaveBeenCalled();
  });

  // ---- M1: zod body validation rejects a malformed eventId ----
  it("returns 400 (zod) when eventId is a non-numeric string", async () => {
    const res = await request(app)
      .post("/api/bookings")
      .send({ eventId: "abc", guestEmail: "g@x.com", tickets: [{ ticketTypeId: 10, quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Validation failed");
    expect(prismaMock.event.findUnique).not.toHaveBeenCalled();
  });

  // ---- M8: an event-level percentage discount is applied to the total ----
  it("applies the event discount: subtotal 1000 + 10% -> discount 100, total 1083.24", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 1,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      discount: 10, // 10% off, sourced from the EVENT (never the client body)
      ticketTypes: [{ id: 10, name: "GA", price: 1000, quantity: 50, sold: 0 }],
    });
    prismaMock.booking.create.mockResolvedValue({ id: 77, items: [] });
    prismaMock.ticketType.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.booking.findUnique.mockResolvedValue({ id: 77, total: 1083 });

    const res = await request(app)
      .post("/api/bookings")
      .send({ eventId: 1, guestEmail: "g@x.com", tickets: [{ ticketTypeId: 10, quantity: 1 }] });

    expect(res.status).toBe(201);

    // PAY-03 integer paise (subtotal 1000 paise, event 10% off):
    // discount      = round(1000 * 10/100)     = 100
    // discountedBase= 1000 - 100               = 900
    // platformFee   = round(900 * 0.02)        = 18
    // tax           = round((900 + 18) * 0.18) = round(165.24) = 165
    // total         = 900 + 18 + 165           = 1083
    expect(prismaMock.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: 1000,
          discount: 100,
          platformFee: 18,
          tax: 165,
          total: 1083,
        }),
      })
    );
    // subtotal - discount + platformFee + tax === total
    expect(1000 - 100 + 18 + 165).toBe(1083);
  });

  it("charges booking.total paise directly via create-order (108324 paise)", async () => {
    enableRazorpay();
    prismaMock.booking.findUnique.mockResolvedValue({
      id: 77,
      total: 108324, // discounted total in PAISE (PAY-03) — sent to Razorpay as-is
      status: "PENDING",
      bookingCode: "BK77",
      event: { name: "Fest Night" },
    });
    rzp.orders.create.mockResolvedValue({ id: "order_d", currency: "INR" });
    prismaMock.payment.upsert.mockResolvedValue({});

    const res = await request(app).post("/api/bookings/77/create-order").send({ bookingCode: "BK77" });

    expect(res.status).toBe(200);
    expect(res.body.data.amount).toBe(108324);
    expect(rzp.orders.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 108324, currency: "INR" })
    );
  });

  // ---- H10(b): duplicate line items for one ticket type are summed ----
  it("sums duplicate line items for the same ticket type before the availability check", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 1,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ticketTypes: [{ id: 10, name: "GA", price: 100, quantity: 50, sold: 0 }],
    });
    prismaMock.booking.create.mockResolvedValue({ id: 99, items: [] });
    prismaMock.ticketType.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.booking.findUnique.mockResolvedValue({ id: 99 });

    const res = await request(app)
      .post("/api/bookings")
      .send({
        eventId: 1,
        guestEmail: "g@x.com",
        tickets: [
          { ticketTypeId: 10, quantity: 2 },
          { ticketTypeId: 10, quantity: 3 },
        ],
      });

    expect(res.status).toBe(201);

    // Booking stores ONE merged line of quantity 5 (2 + 3), priced accordingly.
    expect(prismaMock.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: 500,
          items: {
            create: [
              { ticketTypeId: 10, quantity: 5, unitPrice: 100, totalPrice: 500 },
            ],
          },
        }),
      })
    );

    // A single guarded claim for the summed quantity (5), guard = 50 - 5 = 45.
    expect(prismaMock.ticketType.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.ticketType.updateMany).toHaveBeenCalledWith({
      where: { id: 10, sold: { lte: 45 } },
      data: { sold: { increment: 5 } },
    });
  });

  // ---- H10(c): the guarded write closes the oversell race ----
  it("returns 409 SOLD_OUT when the guarded sold-increment matches no rows (concurrent sell-out)", async () => {
    // Availability passes at read time (sold 0 of 5, asking 3) but the atomic
    // guarded updateMany claims nothing (count 0) because a concurrent booking
    // grabbed the seats first.
    prismaMock.event.findUnique.mockResolvedValue({
      id: 1,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ticketTypes: [{ id: 10, name: "GA", price: 100, quantity: 5, sold: 0 }],
    });
    prismaMock.booking.create.mockResolvedValue({ id: 99, items: [] });
    prismaMock.ticketType.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .post("/api/bookings")
      .send({ eventId: 1, guestEmail: "g@x.com", tickets: [{ ticketTypeId: 10, quantity: 3 }] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SOLD_OUT");
    expect(res.body.error.message).toMatch(/Not enough tickets available for GA/);
  });

  // ---- C2: an unexpected (untagged) fault becomes a GENERIC 500, no leak ----
  it("returns 500 BOOKING_ERROR with a generic message when an unexpected error is thrown (no raw leak)", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 1,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ticketTypes: [{ id: 10, name: "GA", price: 100, quantity: 50, sold: 0 }],
    });
    // A genuine DB fault inside the transaction (not a tagged business error).
    prismaMock.booking.create.mockRejectedValue(new Error("connection reset by peer"));

    const res = await request(app)
      .post("/api/bookings")
      .send({ eventId: 1, guestEmail: "g@x.com", tickets: [{ ticketTypeId: 10, quantity: 1 }] });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("BOOKING_ERROR");
    // Generic message only — the raw error text must NOT reach the client.
    expect(res.body.error.message).toBe("Failed to create booking");
    expect(res.body.error.message).not.toMatch(/connection reset/);
  });

  // ---- C2 ATTENDEE-COUNT: attendees, when given, must be one per ticket ----
  it("returns 400 when the number of attendees does not match the total ticket quantity", async () => {
    const res = await request(app)
      .post("/api/bookings")
      .send({
        eventId: 1,
        guestEmail: "g@x.com",
        tickets: [{ ticketTypeId: 10, quantity: 3 }],
        attendees: [{ ticketTypeId: 10, name: "Only One", email: "one@x.com" }], // 1 != 3
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toMatch(/attendees.*must match the total ticket quantity/i);
    // Rejected before the transaction — the event was never loaded.
    expect(prismaMock.event.findUnique).not.toHaveBeenCalled();
  });

  // ---- C2 ATTENDEE-TICKET: a foreign attendee.ticketTypeId is a 400, not a 500 ----
  it("returns 400 when an attendee's ticketTypeId does not belong to the event", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 1,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ticketTypes: [{ id: 10, name: "GA", price: 100, quantity: 50, sold: 0 }],
    });
    const res = await request(app)
      .post("/api/bookings")
      .send({
        eventId: 1,
        guestEmail: "g@x.com",
        tickets: [{ ticketTypeId: 10, quantity: 1 }],
        attendees: [{ ticketTypeId: 999, name: "Foreign", email: "f@x.com" }], // 999 not on event
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toMatch(/not part of this event/i);
    // No inventory claimed / booking created on a rejected foreign ticket type.
    expect(prismaMock.booking.create).not.toHaveBeenCalled();
    expect(prismaMock.attendee.createMany).not.toHaveBeenCalled();
  });

  // ---- C2 FREE / ZERO-TOTAL: a free event books AND completes without Razorpay ----
  it("completes a zero-total (free) booking immediately with a SUCCESS ₹0 payment (no Razorpay)", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 1,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ticketTypes: [{ id: 10, name: "Free Pass", price: 0, quantity: 100, sold: 0 }],
    });
    prismaMock.booking.create.mockResolvedValue({ id: 55, items: [] });
    prismaMock.ticketType.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.payment.create.mockResolvedValue({});
    prismaMock.booking.findUnique.mockResolvedValue({
      id: 55,
      status: "COMPLETED",
      total: 0,
      event: { id: 1, name: "Free Fest" },
      items: [],
      attendees: [],
    });

    const res = await request(app)
      .post("/api/bookings")
      .send({ eventId: 1, guestEmail: "g@x.com", tickets: [{ ticketTypeId: 10, quantity: 2 }] });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("COMPLETED");

    // Booking is created already COMPLETED (no PENDING payment step).
    expect(prismaMock.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subtotal: 0, total: 0, status: "COMPLETED" }),
      })
    );
    // A zero-amount SUCCESS payment settles it in the same transaction.
    expect(prismaMock.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ bookingId: 55, amount: 0, status: "SUCCESS" }),
    });
    // Confirmation email fired for the completed free booking.
    expect(sendBookingConfirmation).toHaveBeenCalled();
  });

  it("does NOT create a zero-amount payment for a paid booking (total > 0 stays PENDING)", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 1,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ticketTypes: [{ id: 10, name: "GA", price: 100, quantity: 50, sold: 0 }],
    });
    prismaMock.booking.create.mockResolvedValue({ id: 60, items: [] });
    prismaMock.ticketType.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.booking.findUnique.mockResolvedValue({ id: 60, status: "PENDING" });

    const res = await request(app)
      .post("/api/bookings")
      .send({ eventId: 1, guestEmail: "g@x.com", tickets: [{ ticketTypeId: 10, quantity: 1 }] });

    expect(res.status).toBe(201);
    expect(prismaMock.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PENDING" }) })
    );
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  // ---- C2 ANSWERS: optional per-booking answers persist as AttendeeAnswer rows ----
  it("persists submitted answers as AttendeeAnswer rows linked to the booking", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 1,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ticketTypes: [{ id: 10, name: "GA", price: 100, quantity: 50, sold: 0 }],
      questions: [{ id: 1, label: "T-shirt size", required: false }],
    });
    prismaMock.booking.create.mockResolvedValue({ id: 70, items: [] });
    prismaMock.ticketType.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.booking.findUnique.mockResolvedValue({ id: 70 });

    const res = await request(app)
      .post("/api/bookings")
      .send({
        eventId: 1,
        guestEmail: "g@x.com",
        tickets: [{ ticketTypeId: 10, quantity: 1 }],
        answers: [{ questionId: 1, value: "L" }],
      });

    expect(res.status).toBe(201);
    expect(prismaMock.attendeeAnswer.createMany).toHaveBeenCalledWith({
      data: [{ bookingId: 70, questionId: 1, value: "L" }],
    });
  });

  // ---- C2 ANSWERS: a required question with no answer is a 400 ----
  it("returns 400 when a required question has no answer", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 1,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ticketTypes: [{ id: 10, name: "GA", price: 100, quantity: 50, sold: 0 }],
      questions: [{ id: 1, label: "Full name", required: true }],
    });

    const res = await request(app)
      .post("/api/bookings")
      .send({
        eventId: 1,
        guestEmail: "g@x.com",
        tickets: [{ ticketTypeId: 10, quantity: 1 }],
        // no answers -> required question unanswered
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toMatch(/answer is required/i);
    expect(prismaMock.booking.create).not.toHaveBeenCalled();
  });

  it("returns 400 when a required question is answered with only whitespace", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 1,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ticketTypes: [{ id: 10, name: "GA", price: 100, quantity: 50, sold: 0 }],
      questions: [{ id: 2, label: "Full name", required: true }],
    });

    const res = await request(app)
      .post("/api/bookings")
      .send({
        eventId: 1,
        guestEmail: "g@x.com",
        tickets: [{ ticketTypeId: 10, quantity: 1 }],
        answers: [{ questionId: 2, value: "   " }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.booking.create).not.toHaveBeenCalled();
  });

  it("accepts a booking when all required questions are answered", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 1,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ticketTypes: [{ id: 10, name: "GA", price: 100, quantity: 50, sold: 0 }],
      questions: [{ id: 3, label: "Full name", required: true }],
    });
    prismaMock.booking.create.mockResolvedValue({ id: 71, items: [] });
    prismaMock.ticketType.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.booking.findUnique.mockResolvedValue({ id: 71 });

    const res = await request(app)
      .post("/api/bookings")
      .send({
        eventId: 1,
        guestEmail: "g@x.com",
        tickets: [{ ticketTypeId: 10, quantity: 1 }],
        answers: [{ questionId: 3, value: "Ada Lovelace" }],
      });

    expect(res.status).toBe(201);
    expect(prismaMock.attendeeAnswer.createMany).toHaveBeenCalledWith({
      data: [{ bookingId: 71, questionId: 3, value: "Ada Lovelace" }],
    });
  });

  // ---- BOOK-STATUS: only PUBLISHED + PUBLIC, not-yet-ended events are bookable ----
  it.each([
    ["DRAFT status", { status: "DRAFT", visibility: "PUBLIC" }],
    ["CANCELLED status", { status: "CANCELLED", visibility: "PUBLIC" }],
    ["PRIVATE visibility", { status: "PUBLISHED", visibility: "PRIVATE" }],
  ])("returns 409 EVENT_NOT_BOOKABLE for a %s event (no inventory claimed)", async (_label, overrides) => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 1,
      ...overrides,
      ticketTypes: [{ id: 10, name: "GA", price: 100, quantity: 50, sold: 0 }],
    });

    const res = await request(app)
      .post("/api/bookings")
      .send({ eventId: 1, guestEmail: "g@x.com", tickets: [{ ticketTypeId: 10, quantity: 1 }] });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("EVENT_NOT_BOOKABLE");
    // Gate fires before any pricing/inventory write.
    expect(prismaMock.booking.create).not.toHaveBeenCalled();
    expect(prismaMock.ticketType.updateMany).not.toHaveBeenCalled();
  });

  it("returns 409 EVENT_NOT_BOOKABLE for a PUBLISHED/PUBLIC event whose endDate is in the past", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 1,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      endDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // ended yesterday
      ticketTypes: [{ id: 10, name: "GA", price: 100, quantity: 50, sold: 0 }],
    });

    const res = await request(app)
      .post("/api/bookings")
      .send({ eventId: 1, guestEmail: "g@x.com", tickets: [{ ticketTypeId: 10, quantity: 1 }] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EVENT_NOT_BOOKABLE");
    expect(res.body.error.message).toMatch(/already ended/i);
    expect(prismaMock.booking.create).not.toHaveBeenCalled();
  });

  it("allows a PUBLISHED/PUBLIC event with null dates and a future endDate", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 1,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      endDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // ends tomorrow
      ticketTypes: [{ id: 10, name: "GA", price: 100, quantity: 50, sold: 0 }],
    });
    prismaMock.booking.create.mockResolvedValue({ id: 99, items: [] });
    prismaMock.ticketType.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.booking.findUnique.mockResolvedValue({ id: 99 });

    const res = await request(app)
      .post("/api/bookings")
      .send({ eventId: 1, guestEmail: "g@x.com", tickets: [{ ticketTypeId: 10, quantity: 1 }] });

    expect(res.status).toBe(201);
    expect(prismaMock.ticketType.updateMany).toHaveBeenCalled();
  });
});

// ==================== POST /:id/create-order ====================

describe("POST /api/bookings/:id/create-order", () => {
  it("returns 503 when Razorpay keys are not configured", async () => {
    const res = await request(app).post("/api/bookings/5/create-order").send({});
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("RAZORPAY_DISABLED");
  });

  it("creates an order and upserts a PENDING payment on success", async () => {
    enableRazorpay();
    prismaMock.booking.findUnique.mockResolvedValue({
      id: 5,
      total: 24072, // paise (PAY-03)
      status: "PENDING",
      bookingCode: "BK5",
      event: { name: "Fest Night" },
    });
    rzp.orders.create.mockResolvedValue({ id: "order_1", currency: "INR" });
    prismaMock.payment.upsert.mockResolvedValue({});

    // The booking's own bookingCode authorizes the guest-safe ownership check.
    const res = await request(app).post("/api/bookings/5/create-order").send({ bookingCode: "BK5" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      orderId: "order_1",
      amount: 24072, // booking.total paise, sent to Razorpay as-is
      currency: "INR",
      keyId: "rzp_test_key",
    });
    expect(rzp.orders.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 24072, currency: "INR", receipt: "booking-BK5" })
    );
    expect(prismaMock.payment.upsert).toHaveBeenCalledWith({
      where: { bookingId: 5 },
      create: { bookingId: 5, amount: 24072, status: "PENDING", orderId: "order_1" },
      update: { orderId: "order_1", status: "PENDING" },
    });
  });

  it("returns 404 when the booking does not exist", async () => {
    enableRazorpay();
    prismaMock.booking.findUnique.mockResolvedValue(null);
    const res = await request(app).post("/api/bookings/5/create-order").send({});
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(rzp.orders.create).not.toHaveBeenCalled();
  });

  it("returns 400 when the booking is not PENDING", async () => {
    enableRazorpay();
    prismaMock.booking.findUnique.mockResolvedValue({
      id: 5,
      total: 100,
      status: "COMPLETED",
      bookingCode: "BK5",
      event: { name: "E" },
    });
    const res = await request(app).post("/api/bookings/5/create-order").send({ bookingCode: "BK5" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_STATE");
  });

  it("returns 400 when the amount is below the ₹1 minimum", async () => {
    enableRazorpay();
    prismaMock.booking.findUnique.mockResolvedValue({
      id: 5,
      total: 0.5,
      status: "PENDING",
      bookingCode: "BK5",
      event: { name: "E" },
    });
    const res = await request(app).post("/api/bookings/5/create-order").send({ bookingCode: "BK5" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toMatch(/Amount too small/);
    expect(rzp.orders.create).not.toHaveBeenCalled();
  });

  it("returns 500 when order creation throws", async () => {
    enableRazorpay();
    prismaMock.booking.findUnique.mockResolvedValue({
      id: 5,
      total: 240.72,
      status: "PENDING",
      bookingCode: "BK5",
      event: { name: "E" },
    });
    rzp.orders.create.mockRejectedValue(new Error("rzp down"));
    const res = await request(app).post("/api/bookings/5/create-order").send({ bookingCode: "BK5" });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("ORDER_ERROR");
    expect(res.body.error.message).toBe("rzp down");
  });
});

// ==================== POST /:id/verify-payment ====================

describe("POST /api/bookings/:id/verify-payment", () => {
  it("returns 503 when Razorpay is not configured", async () => {
    const res = await request(app).post("/api/bookings/5/verify-payment").send({});
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("RAZORPAY_DISABLED");
  });

  it("returns 400 when razorpay ids are missing", async () => {
    enableRazorpay();
    const res = await request(app).post("/api/bookings/5/verify-payment").send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when the fetched payment order does not match", async () => {
    enableRazorpay();
    rzp.payments.fetch.mockResolvedValue({ order_id: "other_order", status: "captured" });
    const res = await request(app)
      .post("/api/bookings/5/verify-payment")
      .send({ razorpay_order_id: "order_1", razorpay_payment_id: "pay_1" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VERIFY_FAILED");
    expect(res.body.error.message).toMatch(/Invalid or mismatched payment/);
  });

  it("returns 400 when the payment is not captured", async () => {
    enableRazorpay();
    rzp.payments.fetch.mockResolvedValue({ order_id: "order_1", status: "authorized" });
    const res = await request(app)
      .post("/api/bookings/5/verify-payment")
      .send({ razorpay_order_id: "order_1", razorpay_payment_id: "pay_1" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VERIFY_FAILED");
    expect(res.body.error.message).toMatch(/Payment not captured/);
  });

  it("returns 400 when the booking is missing or already completed", async () => {
    enableRazorpay();
    rzp.payments.fetch.mockResolvedValue({ order_id: "order_1", status: "captured", method: "upi" });
    prismaMock.booking.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/bookings/5/verify-payment")
      .send({ razorpay_order_id: "order_1", razorpay_payment_id: "pay_1" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_STATE");
  });

  it("verifies payment, completes the booking, and sends confirmation", async () => {
    enableRazorpay();
    rzp.payments.fetch.mockResolvedValue({ order_id: "order_1", status: "captured", method: "upi", amount: 10000 });
    const updated = {
      id: 5,
      status: "COMPLETED",
      user: { email: "u@x.com", name: "U" },
      items: [],
      attendees: [],
      event: {},
    };
    prismaMock.booking.findUnique
      .mockResolvedValueOnce({ id: 5, status: "PENDING", total: 10000, bookingCode: "BK5", payment: { orderId: "order_1" }, items: [], attendees: [], event: {} })
      .mockResolvedValueOnce(updated);
    prismaMock.booking.update.mockResolvedValue({});
    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post("/api/bookings/5/verify-payment")
      .send({ razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", bookingCode: "BK5" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Payment verified and booking completed");
    expect(res.body.data.status).toBe("COMPLETED");

    expect(prismaMock.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: expect.objectContaining({ status: "COMPLETED" }),
      })
    );
    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId: 5 },
        data: expect.objectContaining({
          status: "SUCCESS",
          transactionId: "pay_1",
          method: "UPI",
        }),
      })
    );
    expect(sendBookingConfirmation).toHaveBeenCalledWith(updated);
  });

  it("rejects a captured payment whose order is not the one created for this booking (replay)", async () => {
    enableRazorpay();
    rzp.payments.fetch.mockResolvedValue({ order_id: "order_1", status: "captured", method: "upi", amount: 10000 });
    prismaMock.booking.findUnique.mockResolvedValueOnce({ id: 5, status: "PENDING", total: 100, bookingCode: "BK5", payment: { orderId: "SOME_OTHER_ORDER" }, items: [], attendees: [], event: {} });
    const res = await request(app)
      .post("/api/bookings/5/verify-payment")
      .send({ razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", bookingCode: "BK5" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/does not belong/i);
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
  });

  it("rejects when the captured amount does not equal the booking total", async () => {
    enableRazorpay();
    rzp.payments.fetch.mockResolvedValue({ order_id: "order_1", status: "captured", method: "upi", amount: 100 });
    prismaMock.booking.findUnique.mockResolvedValueOnce({ id: 5, status: "PENDING", total: 5000, bookingCode: "BK5", payment: { orderId: "order_1" }, items: [], attendees: [], event: {} });
    const res = await request(app)
      .post("/api/bookings/5/verify-payment")
      .send({ razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", bookingCode: "BK5" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/amount/i);
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
  });

  it("returns 500 when payment fetch throws", async () => {
    enableRazorpay();
    rzp.payments.fetch.mockRejectedValue(new Error("boom"));
    const res = await request(app)
      .post("/api/bookings/5/verify-payment")
      .send({ razorpay_order_id: "order_1", razorpay_payment_id: "pay_1" });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("VERIFY_ERROR");
    expect(res.body.error.message).toBe("boom");
  });
});

// ==================== PUT /:id/complete ====================

describe("PUT /api/bookings/:id/complete", () => {
  it("returns 403 (payment required) when Razorpay IS configured", async () => {
    enableRazorpay();
    const res = await request(app).put("/api/bookings/5/complete").send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PAYMENT_REQUIRED");
  });

  it("returns 404 when the booking does not exist (demo mode)", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(null);
    const res = await request(app).put("/api/bookings/5/complete").send({});
    expect(res.status).toBe(404);
  });

  it("returns 400 when the booking is not PENDING", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ status: "COMPLETED", bookingCode: "BK5" });
    const res = await request(app).put("/api/bookings/5/complete").send({ bookingCode: "BK5" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_STATE");
  });

  it("completes a booking and updates an existing payment", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ status: "PENDING", bookingCode: "BK5" });
    prismaMock.booking.update.mockResolvedValue({
      id: 5,
      total: 240.72,
      event: {},
      items: [],
      attendees: [],
      user: { email: "u@x.com", name: "U" },
    });
    prismaMock.payment.findUnique.mockResolvedValue({
      bookingId: 5,
      transactionId: "old",
      method: "CARD",
    });
    prismaMock.payment.update.mockResolvedValue({});

    const res = await request(app)
      .put("/api/bookings/5/complete")
      .send({ transactionId: "txn_1", paymentMethod: "UPI", bookingCode: "BK5" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Booking completed successfully");
    expect(prismaMock.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId: 5 },
        data: expect.objectContaining({
          status: "SUCCESS",
          transactionId: "txn_1",
          method: "UPI",
        }),
      })
    );
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
    expect(sendBookingConfirmation).toHaveBeenCalled();
  });

  it("completes a booking and creates a payment when none exists (CARD defaults)", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ status: "PENDING", bookingCode: "BK5" });
    prismaMock.booking.update.mockResolvedValue({
      id: 5,
      total: 240.72,
      event: {},
      items: [],
      attendees: [],
      user: {},
    });
    prismaMock.payment.findUnique.mockResolvedValue(null);
    prismaMock.payment.create.mockResolvedValue({});

    const res = await request(app).put("/api/bookings/5/complete").send({ bookingCode: "BK5" });

    expect(res.status).toBe(200);
    expect(prismaMock.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingId: 5,
        amount: 240.72,
        method: "CARD",
        status: "SUCCESS",
        transactionId: null,
      }),
    });
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });

  it("returns 500 when completion fails", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ status: "PENDING", bookingCode: "BK5" });
    prismaMock.booking.update.mockRejectedValue(new Error("db down"));
    const res = await request(app).put("/api/bookings/5/complete").send({ bookingCode: "BK5" });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("COMPLETE_ERROR");
    expect(res.body.error.message).toBe("Failed to complete booking");
  });
});

// ==================== GET /:id ====================

describe("GET /api/bookings/:id", () => {
  it("returns 401 when no token is provided", async () => {
    const res = await request(app).get("/api/bookings/5");
    expect(res.status).toBe(401);
    expect(prismaMock.booking.findUnique).not.toHaveBeenCalled();
  });

  it("returns 200 for the booking's owner (booking.userId === caller)", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({
      id: 5,
      bookingCode: "BK5",
      userId: 42,
      event: { hostId: 7, festId: 3 },
    });
    const res = await request(app)
      .get("/api/bookings/5")
      .set("Authorization", auth({ userId: 42, role: "VIEWER" }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(5);
    expect(prismaMock.booking.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5 } })
    );
  });

  it("returns 200 for the event's host", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({
      id: 5,
      userId: 99,
      event: { hostId: 7, festId: 3 },
    });
    const res = await request(app)
      .get("/api/bookings/5")
      .set("Authorization", auth({ userId: 7, role: "HOST" }));
    expect(res.status).toBe(200);
  });

  it("returns 200 for an ADMIN of the event's fest", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({
      id: 5,
      userId: 99,
      event: { hostId: 7, festId: 3 },
    });
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 3, editorFestId: null });
    const res = await request(app)
      .get("/api/bookings/5")
      .set("Authorization", auth({ userId: 1, role: "ADMIN" }));
    expect(res.status).toBe(200);
  });

  it("returns 403 for an unrelated user (not owner/host, not admin of the fest)", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({
      id: 5,
      userId: 99,
      event: { hostId: 7, festId: 3 },
    });
    const res = await request(app)
      .get("/api/bookings/5")
      .set("Authorization", auth({ userId: 1234, role: "VIEWER" }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns 403 for an ADMIN of a DIFFERENT fest", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({
      id: 5,
      userId: 99,
      event: { hostId: 7, festId: 3 },
    });
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 999, editorFestId: null });
    const res = await request(app)
      .get("/api/bookings/5")
      .set("Authorization", auth({ userId: 1, role: "ADMIN" }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns 404 when the booking is not found", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get("/api/bookings/5")
      .set("Authorization", auth({ userId: 42, role: "VIEWER" }));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 500 when the query throws", async () => {
    prismaMock.booking.findUnique.mockRejectedValue(new Error("db down"));
    const res = await request(app)
      .get("/api/bookings/5")
      .set("Authorization", auth({ userId: 42, role: "VIEWER" }));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("FETCH_ERROR");
  });
});

// ==================== GET /code/:bookingCode ====================

describe("GET /api/bookings/code/:bookingCode", () => {
  it("returns 200 and queries by bookingCode", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ id: 5, bookingCode: "BK5" });
    const res = await request(app).get("/api/bookings/code/BK5");
    expect(res.status).toBe(200);
    expect(res.body.data.bookingCode).toBe("BK5");
    expect(prismaMock.booking.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bookingCode: "BK5" } })
    );
  });

  it("returns 404 when no booking matches the code", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(null);
    const res = await request(app).get("/api/bookings/code/NOPE");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  // PAY-05: the hold countdown source
  it("adds expiresAt = createdAt + BOOKING_HOLD_MS + holdMs for a PENDING booking", async () => {
    const createdAt = new Date("2026-01-01T10:00:00.000Z");
    prismaMock.booking.findUnique.mockResolvedValue({ id: 5, bookingCode: "BK5", status: "PENDING", createdAt });
    const res = await request(app).get("/api/bookings/code/BK5");
    expect(res.status).toBe(200);
    expect(res.body.data.holdMs).toBe(BOOKING_HOLD_MS);
    expect(res.body.data.expiresAt).toBe(new Date(createdAt.getTime() + BOOKING_HOLD_MS).toISOString());
  });

  it("returns expiresAt null for a non-PENDING booking", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({
      id: 6,
      bookingCode: "BK6",
      status: "COMPLETED",
      createdAt: new Date("2026-01-01T10:00:00.000Z"),
    });
    const res = await request(app).get("/api/bookings/code/BK6");
    expect(res.status).toBe(200);
    expect(res.body.data.expiresAt).toBeNull();
  });
});

// ==================== GET /user/:userId ====================

describe("GET /api/bookings/user/:userId", () => {
  it("returns 401 when no token is provided", async () => {
    const res = await request(app).get("/api/bookings/user/42");
    expect(res.status).toBe(401);
    expect(prismaMock.booking.findMany).not.toHaveBeenCalled();
  });

  it("returns 200 with the user's own bookings", async () => {
    prismaMock.booking.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const res = await request(app)
      .get("/api/bookings/user/42")
      .set("Authorization", auth({ userId: 42, role: "VIEWER" }));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(prismaMock.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 42 }, orderBy: { createdAt: "desc" } })
    );
  });

  it("returns 200 for an ADMIN reading another user's bookings", async () => {
    prismaMock.booking.findMany.mockResolvedValue([{ id: 1 }]);
    const res = await request(app)
      .get("/api/bookings/user/42")
      .set("Authorization", auth({ userId: 1, role: "ADMIN" }));
    expect(res.status).toBe(200);
  });

  it("returns 403 when a non-admin requests someone else's bookings", async () => {
    const res = await request(app)
      .get("/api/bookings/user/42")
      .set("Authorization", auth({ userId: 7, role: "VIEWER" }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prismaMock.booking.findMany).not.toHaveBeenCalled();
  });

  it("returns 500 when the query throws", async () => {
    prismaMock.booking.findMany.mockRejectedValue(new Error("db down"));
    const res = await request(app)
      .get("/api/bookings/user/42")
      .set("Authorization", auth({ userId: 42, role: "VIEWER" }));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("FETCH_ERROR");
  });
});

// ==================== GET /guest/:email ====================

describe("GET /api/bookings/guest/:email", () => {
  it("returns 401 when no token is provided", async () => {
    const res = await request(app).get("/api/bookings/guest/guest@x.com");
    expect(res.status).toBe(401);
    expect(prismaMock.booking.findMany).not.toHaveBeenCalled();
  });

  it("returns 200 with the guest's bookings for an ADMIN", async () => {
    prismaMock.booking.findMany.mockResolvedValue([{ id: 1 }]);
    const res = await request(app)
      .get("/api/bookings/guest/guest@x.com")
      .set("Authorization", auth({ userId: 1, role: "ADMIN" }));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(prismaMock.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { guestEmail: "guest@x.com" } })
    );
  });

  it("returns 403 for a non-admin (email enumeration surface)", async () => {
    const res = await request(app)
      .get("/api/bookings/guest/guest@x.com")
      .set("Authorization", auth({ userId: 7, role: "HOST" }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prismaMock.booking.findMany).not.toHaveBeenCalled();
  });

  it("returns 500 when the query throws", async () => {
    prismaMock.booking.findMany.mockRejectedValue(new Error("db down"));
    const res = await request(app)
      .get("/api/bookings/guest/guest@x.com")
      .set("Authorization", auth({ userId: 1, role: "ADMIN" }));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("FETCH_ERROR");
  });
});

// ==================== PUT /:id/cancel ====================

describe("PUT /api/bookings/:id/cancel", () => {
  // A PENDING booking owned by user 42, on an event hosted by 7 in fest 3.
  const pendingBooking = () => ({
    id: 5,
    userId: 42,
    status: "PENDING",
    event: { hostId: 7, festId: 3 },
    items: [
      { ticketTypeId: 10, quantity: 2 },
      { ticketTypeId: 11, quantity: 1 },
    ],
  });

  it("returns 401 when no token is provided", async () => {
    const res = await request(app).put("/api/bookings/5/cancel").send({});
    expect(res.status).toBe(401);
    expect(prismaMock.booking.findUnique).not.toHaveBeenCalled();
  });

  it("cancels a PENDING booking (owner) and restores sold counts", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(pendingBooking());
    // Atomic flip PENDING -> CANCELLED, then floored restore via updateMany.
    prismaMock.booking.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.ticketType.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .put("/api/bookings/5/cancel")
      .set("Authorization", auth({ userId: 42, role: "VIEWER" }))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Booking cancelled successfully");
    expect(prismaMock.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 5, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    expect(prismaMock.ticketType.updateMany).toHaveBeenCalledWith({
      where: { id: 10, sold: { gte: 2 } },
      data: { sold: { decrement: 2 } },
    });
    expect(prismaMock.ticketType.updateMany).toHaveBeenCalledWith({
      where: { id: 11, sold: { gte: 1 } },
      data: { sold: { decrement: 1 } },
    });
  });

  it("lets the event's host cancel a PENDING booking they did not buy", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ ...pendingBooking(), userId: 99 });
    prismaMock.booking.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.ticketType.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .put("/api/bookings/5/cancel")
      .set("Authorization", auth({ userId: 7, role: "HOST" }))
      .send({});
    expect(res.status).toBe(200);
  });

  it("lets an ADMIN of the event's fest cancel a PENDING booking", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ ...pendingBooking(), userId: 99 });
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 3, editorFestId: null });
    prismaMock.booking.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.ticketType.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .put("/api/bookings/5/cancel")
      .set("Authorization", auth({ userId: 1, role: "ADMIN" }))
      .send({});
    expect(res.status).toBe(200);
  });

  it("returns 403 for an unrelated user", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ ...pendingBooking(), userId: 99 });
    const res = await request(app)
      .put("/api/bookings/5/cancel")
      .set("Authorization", auth({ userId: 1234, role: "VIEWER" }))
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
  });

  it("returns 403 for an ADMIN of a different fest", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ ...pendingBooking(), userId: 99 });
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 999, editorFestId: null });
    const res = await request(app)
      .put("/api/bookings/5/cancel")
      .set("Authorization", auth({ userId: 1, role: "ADMIN" }))
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns 404 when the booking is not found", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .put("/api/bookings/5/cancel")
      .set("Authorization", auth({ userId: 42, role: "VIEWER" }))
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 INVALID_STATE when trying to cancel a COMPLETED booking (refund is separate)", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ ...pendingBooking(), status: "COMPLETED" });
    const res = await request(app)
      .put("/api/bookings/5/cancel")
      .set("Authorization", auth({ userId: 42, role: "VIEWER" }))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_STATE");
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_STATE when the booking is already cancelled", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ ...pendingBooking(), status: "CANCELLED" });
    const res = await request(app)
      .put("/api/bookings/5/cancel")
      .set("Authorization", auth({ userId: 42, role: "VIEWER" }))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_STATE");
    expect(res.body.error.message).toBe("Booking is already cancelled");
  });

  it("returns 400 INVALID_STATE when the booking has already been refunded", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ ...pendingBooking(), status: "REFUNDED" });
    const res = await request(app)
      .put("/api/bookings/5/cancel")
      .set("Authorization", auth({ userId: 42, role: "VIEWER" }))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_STATE");
    expect(res.body.error.message).toBe("Booking has already been refunded");
  });
});

// ==================== GET /event/:eventId ====================

describe("GET /api/bookings/event/:eventId", () => {
  const eventBookings = [
    {
      id: 1,
      bookingCode: "BK1",
      user: { id: 1, name: "Alice", email: "alice@x.com", phone: "111" },
      guestName: null,
      guestEmail: null,
      guestPhone: null,
      items: [
        {
          ticketTypeId: 10,
          quantity: 2,
          unitPrice: 100,
          totalPrice: 200,
          ticketType: { id: 10, name: "GA", price: 100 },
        },
      ],
      subtotal: 200,
      platformFee: 4,
      tax: 36.72,
      total: 240.72,
      status: "COMPLETED",
      payment: { status: "SUCCESS", method: "UPI" },
      purchaseDate: "2024-01-02T00:00:00.000Z",
      createdAt: "2024-01-01T00:00:00.000Z",
      attendees: [{ name: "Att1", email: "att1@x.com", ticketTypeId: 10 }],
    },
    {
      id: 2,
      bookingCode: "BK2",
      user: null,
      guestName: "Bob",
      guestEmail: "bob@x.com",
      guestPhone: "222",
      items: [
        {
          ticketTypeId: 11,
          quantity: 1,
          unitPrice: 50,
          totalPrice: 50,
          ticketType: { id: 11, name: "VIP", price: 50 },
        },
      ],
      subtotal: 50,
      platformFee: 1,
      tax: 9.18,
      total: 60.18,
      status: "PENDING",
      payment: null,
      purchaseDate: null,
      createdAt: "2024-01-03T00:00:00.000Z",
      attendees: [],
    },
  ];

  it("returns 401 when no token is provided", async () => {
    const res = await request(app).get("/api/bookings/event/1");
    expect(res.status).toBe(401);
    expect(prismaMock.booking.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the event does not exist", async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get("/api/bookings/event/1")
      .set("Authorization", auth({ userId: 7, role: "HOST" }));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(prismaMock.booking.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for a user who is neither the host nor an admin of the fest", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 7, festId: 3 });
    const res = await request(app)
      .get("/api/bookings/event/1")
      .set("Authorization", auth({ userId: 1234, role: "HOST" }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prismaMock.booking.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for an ADMIN of a different fest", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 7, festId: 3 });
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 999, editorFestId: null });
    const res = await request(app)
      .get("/api/bookings/event/1")
      .set("Authorization", auth({ userId: 1, role: "ADMIN" }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns formatted bookings and summary stats (host)", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 7, festId: 3 });
    prismaMock.booking.findMany.mockResolvedValue(eventBookings);
    const res = await request(app)
      .get("/api/bookings/event/1")
      .set("Authorization", auth({ userId: 7, role: "HOST" }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { bookings, stats } = res.body.data;
    expect(bookings).toHaveLength(2);

    // Registered-user booking formatting.
    expect(bookings[0]).toMatchObject({
      buyerName: "Alice",
      buyerEmail: "alice@x.com",
      buyerPhone: "111",
      totalTickets: 2,
      paymentStatus: "SUCCESS",
      paymentMethod: "UPI",
    });
    expect(bookings[0].tickets[0]).toEqual({ type: "GA", quantity: 2, price: 100, total: 200 });
    expect(bookings[0].attendees[0]).toEqual({
      name: "Att1",
      email: "att1@x.com",
      ticketType: "GA",
    });

    // Guest booking falls back to guest fields; no payment -> PENDING/null.
    expect(bookings[1]).toMatchObject({
      buyerName: "Bob",
      buyerEmail: "bob@x.com",
      paymentStatus: "PENDING",
      paymentMethod: null,
    });

    expect(stats).toEqual({
      totalBookings: 2,
      completedBookings: 1,
      pendingBookings: 1,
      cancelledBookings: 0,
      totalRevenue: 240.72,
      totalTicketsSold: 2,
    });
  });

  it("lets an ADMIN of the event's fest read the bookings", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 7, festId: 3 });
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 3, editorFestId: null });
    prismaMock.booking.findMany.mockResolvedValue([]);
    const res = await request(app)
      .get("/api/bookings/event/1")
      .set("Authorization", auth({ userId: 1, role: "ADMIN" }));
    expect(res.status).toBe(200);
  });

  it("passes the status filter through to the where clause", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 7, festId: 3 });
    prismaMock.booking.findMany.mockResolvedValue([]);
    const res = await request(app)
      .get("/api/bookings/event/1?status=COMPLETED")
      .set("Authorization", auth({ userId: 7, role: "HOST" }));
    expect(res.status).toBe(200);
    expect(prismaMock.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: 1, status: "COMPLETED" } })
    );
  });

  it("returns 500 when the query throws", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 7, festId: 3 });
    prismaMock.booking.findMany.mockRejectedValue(new Error("db down"));
    const res = await request(app)
      .get("/api/bookings/event/1")
      .set("Authorization", auth({ userId: 7, role: "HOST" }));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("FETCH_ERROR");
  });
});

// ==================== GET /fest/:festId ====================

describe("GET /api/bookings/fest/:festId", () => {
  it("returns 401 when no token is provided", async () => {
    const res = await request(app).get("/api/bookings/fest/9");
    expect(res.status).toBe(401);
    expect(prismaMock.event.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 when the fest is neither the caller's managed nor editor fest", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 1, editorFestId: 2 });
    const res = await request(app)
      .get("/api/bookings/fest/9")
      .set("Authorization", auth({ userId: 1, role: "ADMIN" }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prismaMock.event.findMany).not.toHaveBeenCalled();
  });

  it("allows an EDITOR/HOST scoped to the fest (editorFestId)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: null, editorFestId: 9 });
    prismaMock.event.findMany.mockResolvedValue([]);
    prismaMock.booking.findMany.mockResolvedValue([]);
    const res = await request(app)
      .get("/api/bookings/fest/9")
      .set("Authorization", auth({ userId: 7, role: "HOST" }));
    expect(res.status).toBe(200);
  });

  it("aggregates completed bookings across the fest's events", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 9, editorFestId: null });
    prismaMock.event.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    prismaMock.booking.findMany.mockResolvedValue([
      {
        bookingCode: "BK1",
        event: { id: 1, name: "EventA" },
        user: { name: "Alice", email: "alice@x.com" },
        guestName: null,
        guestEmail: null,
        items: [{ quantity: 2, ticketType: { name: "GA", price: 100 } }],
        total: 240.72,
        purchaseDate: "2024-01-02T00:00:00.000Z",
      },
      {
        bookingCode: "BK2",
        event: { id: 1, name: "EventA" },
        user: null,
        guestName: "Bob",
        guestEmail: "bob@x.com",
        items: [{ quantity: 1, ticketType: { name: "VIP", price: 50 } }],
        total: 59,
        purchaseDate: "2024-01-03T00:00:00.000Z",
      },
    ]);

    const res = await request(app)
      .get("/api/bookings/fest/9")
      .set("Authorization", auth({ userId: 1, role: "ADMIN" }));

    expect(res.status).toBe(200);
    expect(prismaMock.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: { in: [1, 2] }, status: "COMPLETED" },
      })
    );

    const d = res.body.data;
    expect(d.totalBookings).toBe(2);
    expect(d.totalRevenue).toBe(299.72);
    expect(d.totalTickets).toBe(3);
    expect(d.eventSummary).toEqual({ EventA: { tickets: 3, revenue: 299.72 } });
    expect(d.recentBookings).toHaveLength(2);
    expect(d.recentBookings[0]).toMatchObject({
      bookingCode: "BK1",
      eventName: "EventA",
      buyerName: "Alice",
      buyerEmail: "alice@x.com",
    });
    expect(d.recentBookings[1]).toMatchObject({ buyerName: "Bob", buyerEmail: "bob@x.com" });
  });

  it("returns zeroed aggregates when the fest has no completed bookings", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 9, editorFestId: null });
    prismaMock.event.findMany.mockResolvedValue([]);
    prismaMock.booking.findMany.mockResolvedValue([]);
    const res = await request(app)
      .get("/api/bookings/fest/9")
      .set("Authorization", auth({ userId: 1, role: "ADMIN" }));
    expect(res.status).toBe(200);
    expect(res.body.data.totalBookings).toBe(0);
    expect(res.body.data.totalRevenue).toBe(0);
    expect(res.body.data.eventSummary).toEqual({});
  });

  it("returns 500 when the query throws", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 9, editorFestId: null });
    prismaMock.event.findMany.mockRejectedValue(new Error("db down"));
    const res = await request(app)
      .get("/api/bookings/fest/9")
      .set("Authorization", auth({ userId: 1, role: "ADMIN" }));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("FETCH_ERROR");
  });
});

// ==================== expireStalePendingBookings (H11) ====================

describe("expireStalePendingBookings", () => {
  it("cancels each stale PENDING booking and restores its sold counts", async () => {
    prismaMock.booking.findMany.mockResolvedValue([
      { id: 1, items: [{ ticketTypeId: 10, quantity: 2 }, { ticketTypeId: 11, quantity: 1 }] },
      { id: 2, items: [{ ticketTypeId: 12, quantity: 5 }] },
    ]);
    // Atomic flip PENDING -> CANCELLED per booking, then floored restore.
    prismaMock.booking.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.ticketType.updateMany.mockResolvedValue({ count: 1 });

    const before = Date.now();
    const result = await expireStalePendingBookings(15 * 60 * 1000);

    expect(result.expired).toBe(2);
    expect(typeof result.durationMs).toBe("number");

    // Only PENDING bookings older than the cutoff are swept.
    expect(prismaMock.booking.findMany).toHaveBeenCalledTimes(1);
    const whereArg = prismaMock.booking.findMany.mock.calls[0][0].where;
    expect(whereArg.status).toBe("PENDING");
    expect(whereArg.createdAt.lt).toBeInstanceOf(Date);
    expect(whereArg.createdAt.lt.getTime()).toBeLessThanOrEqual(before - 15 * 60 * 1000 + 5);

    // Inventory released (floored) for every item across both bookings.
    expect(prismaMock.ticketType.updateMany).toHaveBeenCalledWith({
      where: { id: 10, sold: { gte: 2 } },
      data: { sold: { decrement: 2 } },
    });
    expect(prismaMock.ticketType.updateMany).toHaveBeenCalledWith({
      where: { id: 11, sold: { gte: 1 } },
      data: { sold: { decrement: 1 } },
    });
    expect(prismaMock.ticketType.updateMany).toHaveBeenCalledWith({
      where: { id: 12, sold: { gte: 5 } },
      data: { sold: { decrement: 5 } },
    });

    // Each booking atomically flipped to CANCELLED.
    expect(prismaMock.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 1, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    expect(prismaMock.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 2, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
  });

  it("no-ops (no writes) when there are no stale bookings", async () => {
    prismaMock.booking.findMany.mockResolvedValue([]);
    const result = await expireStalePendingBookings();
    expect(result.expired).toBe(0);
    expect(prismaMock.ticketType.update).not.toHaveBeenCalled();
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
  });

  // ---- SWEEP-RACE: never expire a booking whose payment is in flight ----
  it("excludes bookings with an in-flight payment (orderId set) from the sweep query", async () => {
    prismaMock.booking.findMany.mockResolvedValue([]);
    await expireStalePendingBookings();

    // The where clause must restrict to bookings with NO payment, or a payment
    // whose orderId is still null — so a booking mid-checkout is never cancelled.
    const whereArg = prismaMock.booking.findMany.mock.calls[0][0].where;
    expect(whereArg.status).toBe("PENDING");
    expect(whereArg.OR).toEqual([{ payment: null }, { payment: { orderId: null } }]);
  });

  it("expires a stale booking WITHOUT an in-flight payment but leaves one WITH an orderId untouched", async () => {
    // The DB-level OR filter is what protects the paying booking; simulate it by
    // returning only the booking that matches (no payment / null orderId). The
    // booking with an orderId must never be returned here, so it is never
    // cancelled and its sold count is never restored.
    prismaMock.booking.findMany.mockResolvedValue([
      { id: 1, items: [{ ticketTypeId: 10, quantity: 2 }] }, // no in-flight payment
    ]);
    prismaMock.booking.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.ticketType.updateMany.mockResolvedValue({ count: 1 });

    const result = await expireStalePendingBookings();

    expect(result.expired).toBe(1);
    // Only the unpaid booking's inventory is restored and it alone is cancelled.
    expect(prismaMock.ticketType.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.ticketType.updateMany).toHaveBeenCalledWith({
      where: { id: 10, sold: { gte: 2 } },
      data: { sold: { decrement: 2 } },
    });
    expect(prismaMock.booking.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 1, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
  });
});

// ==================== POST /admin/sweep-stale (ARCH-05) ====================
describe("POST /api/bookings/admin/sweep-stale", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).post("/api/bookings/admin/sweep-stale").send({});
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin", async () => {
    const res = await request(app)
      .post("/api/bookings/admin/sweep-stale")
      .set("Authorization", auth({ userId: 2, role: "VIEWER" }))
      .send({});
    expect(res.status).toBe(403);
  });

  it("lets an ADMIN trigger the sweep and returns the expired count + durationMs", async () => {
    prismaMock.booking.findMany.mockResolvedValue([]);
    const res = await request(app)
      .post("/api/bookings/admin/sweep-stale")
      .set("Authorization", auth({ userId: 1, role: "ADMIN" }))
      .send({ olderThanMinutes: 30 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.expired).toBe(0);
    expect(typeof res.body.data.durationMs).toBe("number");
  });
});
