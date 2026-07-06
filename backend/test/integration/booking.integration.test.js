// Real-Postgres integration test for the booking create flow.
//
// WHY THIS EXISTS: every other backend route test mocks @prisma/client
// (backend/__mocks__/@prisma/client.js), so transaction atomicity, the atomic
// GUARDED updateMany oversell guard (H10c: `sold <= quantity - qty`), relation
// cascades and real SQL behaviour are NEVER actually exercised. This suite runs
// the REAL router against a REAL PostgreSQL database to prove those hold.
//
// GATING: the whole suite is skipped unless INTEGRATION_DB === "1". It also
// skips (never hangs, never fails) if a database can't be reached within a short
// timeout. So normal `npm test` (fully mocked) and CI without a DB are
// unaffected. Run it with:  npm run test:integration  (sets INTEGRATION_DB=1 and
// a reachable DATABASE_URL — e.g. the throwaway Postgres the e2e suite uses).
//
// It deliberately does NOT call `vi.mock("@prisma/client")`, and imports the
// real PrismaClient (via src/prisma.js) dynamically only when gated, so the
// manual Prisma mock is never applied to this file.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { makeApp } from "../helpers/makeApp.js";

const GATED = process.env.INTEGRATION_DB === "1";

// Race a promise against a timeout so a dead/unreachable DB can't hang the run.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// --- Wire up the REAL prisma + real router, but only when gated and reachable ---
let prisma = null;
let app = null;
let ready = false;

if (GATED) {
  try {
    const prismaMod = await import("../../src/prisma.js");
    prisma = prismaMod.default;
    const routerMod = await import("../../src/routes/bookings.js");
    app = makeApp(routerMod.default, "/api/bookings");
    // A pooled/serverless URL can be slow to wake; keep it short so a genuinely
    // unreachable DB skips instead of stalling the suite.
    await withTimeout(prisma.$connect(), 8000, "prisma.$connect()");
    // Prove we can actually query (connect can lazily succeed yet queries fail).
    await withTimeout(prisma.$queryRaw`SELECT 1`, 8000, "SELECT 1");
    ready = true;
  } catch (err) {
    // Swallow the losing $connect promise's eventual rejection, if any.
    if (prisma) prisma.$connect().catch(() => {});
    console.warn(
      `[integration] Skipping booking integration suite — no reachable DB: ${err.message}`
    );
    ready = false;
  }
}

// Unique tag so seeded rows are trivially identifiable and cleanable.
const TAG = `itest-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

describe.skipIf(!GATED || !ready)("bookings — real Postgres integration", () => {
  let festId;
  let eventId;

  // Track every ticket type we create so afterAll can null out inventory and
  // (after bookings are removed) delete them.
  const ticketTypeIds = [];

  async function seedTicketType({ quantity, sold = 0, price = 100, name = "GA" }) {
    const tt = await prisma.ticketType.create({
      data: { eventId, name: `${name}-${TAG}`, price, quantity, sold },
    });
    ticketTypeIds.push(tt.id);
    return tt;
  }

  beforeAll(async () => {
    const fest = await prisma.fest.create({
      data: { name: `Fest ${TAG}`, college: `College ${TAG}` },
    });
    festId = fest.id;

    const event = await prisma.event.create({
      data: {
        festId,
        name: `Event ${TAG}`,
        status: "PUBLISHED",
        visibility: "PUBLIC",
        // Future end date so the BOOK-STATUS "already ended" guard passes.
        startDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        endDate: new Date(Date.now() + 8 * 24 * 3600 * 1000),
      },
    });
    eventId = event.id;
  }, 30000);

  afterAll(async () => {
    if (!ready) return;
    try {
      // Booking delete cascades to items / attendees / answers / payment, which
      // releases the FK references that would otherwise block ticketType deletes.
      await prisma.booking.deleteMany({ where: { eventId } });
      if (ticketTypeIds.length) {
        await prisma.ticketType.deleteMany({ where: { id: { in: ticketTypeIds } } });
      }
      if (eventId) await prisma.event.delete({ where: { id: eventId } }).catch(() => {});
      if (festId) await prisma.fest.delete({ where: { id: festId } }).catch(() => {});
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  }, 30000);

  // (a) sold increments atomically + (c) items and attendees are persisted.
  it("increments sold atomically and creates items + attendees against real SQL", async () => {
    const tt = await seedTicketType({ quantity: 5, sold: 0 });

    const res = await request(app)
      .post("/api/bookings")
      .send({
        eventId,
        guestEmail: `buyer-${TAG}@example.com`,
        guestName: "Buyer One",
        tickets: [{ ticketTypeId: tt.id, quantity: 2 }],
        attendees: [
          { ticketTypeId: tt.id, name: "A One", email: "a1@example.com" },
          { ticketTypeId: tt.id, name: "A Two", email: "a2@example.com" },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const bookingId = res.body.data.id;
    expect(bookingId).toBeTruthy();

    // (a) The real row's `sold` moved from 0 -> 2 (committed by the transaction).
    const afterTt = await prisma.ticketType.findUnique({ where: { id: tt.id } });
    expect(afterTt.sold).toBe(2);

    // (c) Real BookingItem + Attendee rows exist and are linked to the booking.
    const itemCount = await prisma.bookingItem.count({ where: { bookingId } });
    const attendeeCount = await prisma.attendee.count({ where: { bookingId } });
    expect(itemCount).toBe(1);
    expect(attendeeCount).toBe(2);
  }, 30000);

  // (b) A single request asking for more than remaining is rejected (409 SOLD_OUT)
  // and — critically — the real `sold` counter is left untouched (no partial write,
  // the whole $transaction rolls back).
  it("rejects an oversell request beyond available quantity and rolls back", async () => {
    const tt = await seedTicketType({ quantity: 3, sold: 0 });

    const res = await request(app)
      .post("/api/bookings")
      .send({
        eventId,
        guestEmail: `over-${TAG}@example.com`,
        tickets: [{ ticketTypeId: tt.id, quantity: 10 }], // only 3 exist
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("SOLD_OUT");

    const afterTt = await prisma.ticketType.findUnique({ where: { id: tt.id } });
    expect(afterTt.sold).toBe(0); // untouched — transaction rolled back
  }, 30000);

  // (b') THE ATOMICITY PROOF: fire more concurrent single-ticket bookings than
  // there are seats. The atomic guarded updateMany (`sold <= quantity - qty`,
  // enforced by real Postgres row locking under the transaction) must let EXACTLY
  // `quantity` bookings win and reject the rest with 409 — and `sold` must never
  // exceed `quantity`. Under the mocked suite this race can't be observed at all.
  it("holds the oversell guard under concurrency: exactly quantity bookings win", async () => {
    const quantity = 3;
    const attempts = 6;
    const tt = await seedTicketType({ quantity, sold: 0, name: "RACE" });

    const results = await Promise.all(
      Array.from({ length: attempts }, (_, i) =>
        request(app)
          .post("/api/bookings")
          .send({
            eventId,
            guestEmail: `race-${i}-${TAG}@example.com`,
            tickets: [{ ticketTypeId: tt.id, quantity: 1 }],
          })
      )
    );

    const created = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);

    // Exactly `quantity` succeed; the overflow attempts are cleanly rejected.
    expect(created.length).toBe(quantity);
    expect(rejected.length).toBe(attempts - quantity);
    for (const r of rejected) expect(r.body.error.code).toBe("SOLD_OUT");

    // The real inventory landed exactly full and never oversold.
    const afterTt = await prisma.ticketType.findUnique({ where: { id: tt.id } });
    expect(afterTt.sold).toBe(quantity);
    expect(afterTt.sold).toBeLessThanOrEqual(afterTt.quantity);

    // And the DB actually holds `quantity` distinct successful bookings' items.
    const soldItems = await prisma.bookingItem.aggregate({
      where: { ticketTypeId: tt.id },
      _sum: { quantity: true },
    });
    expect(soldItems._sum.quantity).toBe(quantity);
  }, 60000);
});
