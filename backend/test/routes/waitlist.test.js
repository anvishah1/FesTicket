import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { prismaMock, resetPrismaMock } from "@prisma/client";
import { makeApp } from "../helpers/makeApp.js";
import waitlistRouter from "../../src/routes/waitlist.js";
import { releaseToWaitlist, expireStaleWaitlistClaims } from "../../src/utils/waitlist.js";

vi.mock("@prisma/client");
vi.mock("../../src/utils/email.js", () => ({
  sendWaitlistClaim: vi.fn(async () => ({ sent: true })),
}));
import { sendWaitlistClaim } from "../../src/utils/email.js";

const app = makeApp(waitlistRouter, "/api/waitlist");

beforeEach(() => resetPrismaMock());

describe("GET /api/waitlist/claim/:claimToken (PAY-08)", () => {
  it("returns the reserved event + ticket type for a valid, unexpired NOTIFIED token", async () => {
    prismaMock.waitlist.findUnique.mockResolvedValue({
      id: 1,
      ticketTypeId: 10,
      status: "NOTIFIED",
      claimExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      ticketType: { id: 10, name: "GA", price: 10000, event: { id: 5, name: "Fest" } },
    });
    const res = await request(app).get("/api/waitlist/claim/tok123");
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ ticketTypeId: 10, eventId: 5, ticketType: { id: 10, name: "GA" } });
  });

  it("404 for an unknown / already-consumed token", async () => {
    prismaMock.waitlist.findUnique.mockResolvedValue(null);
    const res = await request(app).get("/api/waitlist/claim/nope");
    expect(res.status).toBe(404);
  });

  it("404 when the row is not NOTIFIED (e.g. already CLAIMED)", async () => {
    prismaMock.waitlist.findUnique.mockResolvedValue({ id: 1, status: "CLAIMED", ticketTypeId: 10 });
    const res = await request(app).get("/api/waitlist/claim/tok");
    expect(res.status).toBe(404);
  });

  it("410 + expires the row when the claim window has passed", async () => {
    prismaMock.waitlist.findUnique.mockResolvedValue({
      id: 1,
      ticketTypeId: 10,
      status: "NOTIFIED",
      claimExpiresAt: new Date(Date.now() - 60 * 1000), // past
      ticketType: { id: 10, event: { id: 5 } },
    });
    prismaMock.waitlist.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).get("/api/waitlist/claim/tok");
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("CLAIM_EXPIRED");
    expect(prismaMock.waitlist.updateMany).toHaveBeenCalledWith({
      where: { id: 1, status: "NOTIFIED" },
      data: { status: "EXPIRED" },
    });
  });
});

describe("releaseToWaitlist (PAY-08)", () => {
  it("notifies the oldest WAITING waiter, transitioning to NOTIFIED with a claim token", async () => {
    prismaMock.waitlist.findFirst.mockResolvedValue({ id: 7, ticketTypeId: 10, status: "WAITING" });
    prismaMock.waitlist.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.waitlist.findUnique.mockResolvedValue({
      id: 7,
      email: "w@x.com",
      claimExpiresAt: new Date(),
      ticketType: { id: 10, name: "GA", event: { id: 5, name: "Fest" } },
    });

    const notified = await releaseToWaitlist(10, 1);
    expect(notified).toBe(1);
    // Oldest-first selection.
    expect(prismaMock.waitlist.findFirst).toHaveBeenCalledWith({
      where: { ticketTypeId: 10, status: "WAITING" },
      orderBy: { createdAt: "asc" },
    });
    // Atomic WAITING -> NOTIFIED with a token + expiry.
    const upd = prismaMock.waitlist.updateMany.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 7, status: "WAITING" });
    expect(upd.data.status).toBe("NOTIFIED");
    expect(typeof upd.data.claimToken).toBe("string");
    expect(sendWaitlistClaim).toHaveBeenCalledTimes(1);
  });

  it("Phase-5 review P2: N freed seats notify up to N distinct waiters", async () => {
    // Three waiters, three freed seats -> three notifications (one per seat).
    prismaMock.waitlist.findFirst
      .mockResolvedValueOnce({ id: 1, ticketTypeId: 10, status: "WAITING" })
      .mockResolvedValueOnce({ id: 2, ticketTypeId: 10, status: "WAITING" })
      .mockResolvedValueOnce({ id: 3, ticketTypeId: 10, status: "WAITING" });
    prismaMock.waitlist.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.waitlist.findUnique.mockResolvedValue({
      id: 1, email: "w@x.com", claimExpiresAt: new Date(), ticketType: { id: 10, name: "GA", event: { id: 5 } },
    });
    const notified = await releaseToWaitlist(10, 3);
    expect(notified).toBe(3);
    expect(sendWaitlistClaim).toHaveBeenCalledTimes(3);
  });

  it("stops early when the waiters run out before the seats", async () => {
    prismaMock.waitlist.findFirst
      .mockResolvedValueOnce({ id: 1, ticketTypeId: 10, status: "WAITING" })
      .mockResolvedValueOnce(null); // only one waiter for 3 seats
    prismaMock.waitlist.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.waitlist.findUnique.mockResolvedValue({
      id: 1, email: "w@x.com", claimExpiresAt: new Date(), ticketType: { id: 10, event: { id: 5 } },
    });
    const notified = await releaseToWaitlist(10, 3);
    expect(notified).toBe(1);
    expect(sendWaitlistClaim).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there is no waiter", async () => {
    prismaMock.waitlist.findFirst.mockResolvedValue(null);
    const notified = await releaseToWaitlist(10, 1);
    expect(notified).toBe(0);
    expect(prismaMock.waitlist.updateMany).not.toHaveBeenCalled();
    expect(sendWaitlistClaim).not.toHaveBeenCalled();
  });

  it("does not notify twice when the WAITING->NOTIFIED claim is lost (count 0)", async () => {
    prismaMock.waitlist.findFirst.mockResolvedValue({ id: 7, ticketTypeId: 10, status: "WAITING" });
    prismaMock.waitlist.updateMany.mockResolvedValue({ count: 0 }); // another release won
    const notified = await releaseToWaitlist(10, 2);
    expect(notified).toBe(0);
    expect(sendWaitlistClaim).not.toHaveBeenCalled();
  });
});

describe("expireStaleWaitlistClaims (Phase-5 review P3)", () => {
  it("expires each stale NOTIFIED entry and re-offers the seat to the next waiter", async () => {
    // One NOTIFIED entry past its window; a WAITING waiter still queued.
    prismaMock.waitlist.findMany.mockResolvedValue([{ id: 1, ticketTypeId: 10 }]);
    prismaMock.waitlist.updateMany.mockResolvedValue({ count: 1 }); // NOTIFIED->EXPIRED flip + the re-release flip
    prismaMock.waitlist.findFirst.mockResolvedValue({ id: 2, ticketTypeId: 10, status: "WAITING" });
    prismaMock.waitlist.findUnique.mockResolvedValue({
      id: 2, email: "next@x.com", claimExpiresAt: new Date(), ticketType: { id: 10, event: { id: 5 } },
    });

    const result = await expireStaleWaitlistClaims();
    expect(result.expired).toBe(1);
    // Query targets only past-window NOTIFIED entries.
    const where = prismaMock.waitlist.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("NOTIFIED");
    expect(where.claimExpiresAt.lt).toBeInstanceOf(Date);
    // The freed seat was re-offered.
    expect(sendWaitlistClaim).toHaveBeenCalledTimes(1);
  });

  it("no-op when nothing is stale", async () => {
    prismaMock.waitlist.findMany.mockResolvedValue([]);
    const result = await expireStaleWaitlistClaims();
    expect(result.expired).toBe(0);
    expect(sendWaitlistClaim).not.toHaveBeenCalled();
  });
});
