import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { prismaMock, resetPrismaMock } from "@prisma/client";
import { makeApp } from "../helpers/makeApp.js";
import router from "../../src/routes/sponsorLeads.js";

vi.mock("@prisma/client");

// POST /api/sponsor-leads is wrapped in writeLimiter (IP-keyed). supertest
// reuses the same IP, so neutralise every limiter to pass through.
vi.mock("../../src/middleware/rateLimiter.js", () => ({
  loginLimiter: (req, res, next) => next(),
  signupLimiter: (req, res, next) => next(),
  bookingLimiter: (req, res, next) => next(),
  writeLimiter: (req, res, next) => next(),
}));

const app = makeApp(router, "/api/sponsor-leads");

beforeEach(resetPrismaMock);

describe("POST /api/sponsor-leads", () => {
  it("returns 400 VALIDATION_ERROR when required fields are missing", async () => {
    const res = await request(app)
      .post("/api/sponsor-leads")
      .send({ email: "hello@acme.com" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.sponsor.create).not.toHaveBeenCalled();
  });

  it("returns 400 when contactPerson is missing", async () => {
    const res = await request(app)
      .post("/api/sponsor-leads")
      .send({ companyName: "Acme Corp" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.sponsor.create).not.toHaveBeenCalled();
  });

  it("returns 400 when required fields are only whitespace", async () => {
    const res = await request(app)
      .post("/api/sponsor-leads")
      .send({ companyName: "   ", contactPerson: "  " });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.sponsor.create).not.toHaveBeenCalled();
  });

  it("creates an unscoped NEGOTIATING Sponsor and returns 201", async () => {
    prismaMock.sponsor.create.mockResolvedValue({ id: 1 });

    const res = await request(app).post("/api/sponsor-leads").send({
      companyName: "Acme Corp",
      contactPerson: "Jane Doe",
      email: "jane@acme.com",
      phone: "555-1234",
      message: "We'd love to sponsor.",
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      message: "Thanks — we will be in touch.",
    });
    expect(prismaMock.sponsor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyName: "Acme Corp",
        contactPerson: "Jane Doe",
        email: "jane@acme.com",
        phone: "555-1234",
        notes: "We'd love to sponsor.",
        festId: null,
        eventId: null,
        status: "NEGOTIATING",
      }),
    });
  });

  it("stores null for absent optional fields", async () => {
    prismaMock.sponsor.create.mockResolvedValue({ id: 2 });

    const res = await request(app).post("/api/sponsor-leads").send({
      companyName: "Beta LLC",
      contactPerson: "John Smith",
    });

    expect(res.status).toBe(201);
    expect(prismaMock.sponsor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyName: "Beta LLC",
        contactPerson: "John Smith",
        email: null,
        phone: null,
        notes: null,
        festId: null,
        eventId: null,
        status: "NEGOTIATING",
      }),
    });
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.sponsor.create.mockRejectedValue(new Error("db down"));

    const res = await request(app).post("/api/sponsor-leads").send({
      companyName: "Acme Corp",
      contactPerson: "Jane Doe",
    });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("SERVER_ERROR");
  });
});
