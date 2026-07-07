import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { prismaMock, resetPrismaMock } from "@prisma/client";
import { makeApp } from "../helpers/makeApp.js";
import waitlistRouter from "../../src/routes/waitlist.js";
import { releaseToWaitlist } from "../../src/utils/waitlist.js";

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

    const result = await releaseToWaitlist(10);
    expect(result).toMatchObject({ id: 7 });
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

  it("does nothing when there is no waiter", async () => {
    prismaMock.waitlist.findFirst.mockResolvedValue(null);
    const result = await releaseToWaitlist(10);
    expect(result).toBeNull();
    expect(prismaMock.waitlist.updateMany).not.toHaveBeenCalled();
    expect(sendWaitlistClaim).not.toHaveBeenCalled();
  });

  it("does not notify twice when the WAITING->NOTIFIED claim is lost (count 0)", async () => {
    prismaMock.waitlist.findFirst.mockResolvedValue({ id: 7, ticketTypeId: 10, status: "WAITING" });
    prismaMock.waitlist.updateMany.mockResolvedValue({ count: 0 }); // another release won
    const result = await releaseToWaitlist(10);
    expect(result).toBeNull();
    expect(sendWaitlistClaim).not.toHaveBeenCalled();
  });
});
