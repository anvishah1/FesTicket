import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { prismaMock, resetPrismaMock } from "@prisma/client";
import { makeApp } from "../helpers/makeApp.js";
import router from "../../src/routes/adminRequests.js";

vi.mock("@prisma/client");

// POST /api/admin-requests is wrapped in writeLimiter (IP-keyed). supertest
// reuses the same IP, so neutralise every limiter to pass through.
vi.mock("../../src/middleware/rateLimiter.js", () => ({
  loginLimiter: (req, res, next) => next(),
  signupLimiter: (req, res, next) => next(),
  bookingLimiter: (req, res, next) => next(),
  writeLimiter: (req, res, next) => next(),
}));

const app = makeApp(router, "/api/admin-requests");

beforeEach(resetPrismaMock);

// ARCH-01: this route now emits the same {success,data|error,requestId} envelope
// as every other route (via res.ok/res.fail), instead of a bare {message}.
describe("POST /api/admin-requests", () => {
  // ---- validation: email required (checked first) ----
  it("returns 400 when the body is empty (no email)", async () => {
    const res = await request(app).post("/api/admin-requests").send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toEqual({ code: "VALIDATION_ERROR", message: "Email is required." });
    expect(prismaMock.adminRequest.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.adminRequest.create).not.toHaveBeenCalled();
  });

  it("returns 400 when email is missing but festName is present", async () => {
    const res = await request(app)
      .post("/api/admin-requests")
      .send({ festName: "TechFest" });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: "VALIDATION_ERROR", message: "Email is required." });
  });

  it("returns 400 when email is not a string", async () => {
    const res = await request(app)
      .post("/api/admin-requests")
      .send({ email: 12345, festName: "TechFest" });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: "VALIDATION_ERROR", message: "Email is required." });
  });

  it("returns 400 when email is only whitespace", async () => {
    const res = await request(app)
      .post("/api/admin-requests")
      .send({ email: "   ", festName: "TechFest" });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: "VALIDATION_ERROR", message: "Email is required." });
  });

  // ---- validation: festName required (checked second) ----
  it("returns 400 when festName is missing", async () => {
    const res = await request(app)
      .post("/api/admin-requests")
      .send({ email: "prof@college.edu" });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: "VALIDATION_ERROR", message: "Fest name is required." });
    expect(prismaMock.adminRequest.findFirst).not.toHaveBeenCalled();
  });

  it("returns 400 when festName is not a string", async () => {
    const res = await request(app)
      .post("/api/admin-requests")
      .send({ email: "prof@college.edu", festName: 999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: "VALIDATION_ERROR", message: "Fest name is required." });
  });

  it("returns 400 when festName is only whitespace", async () => {
    const res = await request(app)
      .post("/api/admin-requests")
      .send({ email: "prof@college.edu", festName: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: "VALIDATION_ERROR", message: "Fest name is required." });
  });

  // ---- conflict: existing PENDING request ----
  it("returns 409 when a PENDING request already exists for the email", async () => {
    prismaMock.adminRequest.findFirst.mockResolvedValue({ id: 5, email: "prof@college.edu" });
    const res = await request(app)
      .post("/api/admin-requests")
      .send({ email: "prof@college.edu", festName: "TechFest" });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: "CONFLICT", message: "You already have a pending admin request." });
    expect(prismaMock.adminRequest.findFirst).toHaveBeenCalledWith({
      where: { email: "prof@college.edu", status: "PENDING" },
    });
    expect(prismaMock.adminRequest.create).not.toHaveBeenCalled();
  });

  // ---- happy path ----
  it("returns 201 with message and data.id on success (all fields provided)", async () => {
    prismaMock.adminRequest.findFirst.mockResolvedValue(null);
    prismaMock.adminRequest.create.mockResolvedValue({ id: 42, email: "prof@college.edu" });

    const res = await request(app).post("/api/admin-requests").send({
      email: "prof@college.edu",
      name: "Dr. Prof",
      organization: "Physics Dept",
      festName: "TechFest",
      phone: "555-1234",
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Request received. You will be set up with credentials after verification.");
    expect(res.body.data).toEqual({ id: 42 });
    expect(prismaMock.adminRequest.create).toHaveBeenCalledWith({
      data: {
        email: "prof@college.edu",
        name: "Dr. Prof",
        organization: "Physics Dept",
        festName: "TechFest",
        phone: "555-1234",
      },
    });
  });

  it("trims all string fields before checking and persisting", async () => {
    prismaMock.adminRequest.findFirst.mockResolvedValue(null);
    prismaMock.adminRequest.create.mockResolvedValue({ id: 7 });

    const res = await request(app).post("/api/admin-requests").send({
      email: "  prof@college.edu  ",
      name: "  Dr. Prof  ",
      organization: "  Physics Dept  ",
      festName: "  TechFest  ",
      phone: "  555-1234  ",
    });

    expect(res.status).toBe(201);
    // findFirst is called with the trimmed email
    expect(prismaMock.adminRequest.findFirst).toHaveBeenCalledWith({
      where: { email: "prof@college.edu", status: "PENDING" },
    });
    // create persists trimmed values
    expect(prismaMock.adminRequest.create).toHaveBeenCalledWith({
      data: {
        email: "prof@college.edu",
        name: "Dr. Prof",
        organization: "Physics Dept",
        festName: "TechFest",
        phone: "555-1234",
      },
    });
  });

  it("stores null for absent optional fields (name/organization/phone)", async () => {
    prismaMock.adminRequest.findFirst.mockResolvedValue(null);
    prismaMock.adminRequest.create.mockResolvedValue({ id: 8 });

    const res = await request(app).post("/api/admin-requests").send({
      email: "prof@college.edu",
      festName: "TechFest",
    });

    expect(res.status).toBe(201);
    expect(prismaMock.adminRequest.create).toHaveBeenCalledWith({
      data: {
        email: "prof@college.edu",
        name: null,
        organization: null,
        festName: "TechFest",
        phone: null,
      },
    });
  });

  it("stores null for empty-string optional fields (trimmed to falsy)", async () => {
    prismaMock.adminRequest.findFirst.mockResolvedValue(null);
    prismaMock.adminRequest.create.mockResolvedValue({ id: 9 });

    const res = await request(app).post("/api/admin-requests").send({
      email: "prof@college.edu",
      festName: "TechFest",
      name: "   ",
      organization: "",
      phone: "  ",
    });

    expect(res.status).toBe(201);
    expect(prismaMock.adminRequest.create).toHaveBeenCalledWith({
      data: {
        email: "prof@college.edu",
        name: null,
        organization: null,
        festName: "TechFest",
        phone: null,
      },
    });
  });

  // ---- quirk: non-string optional field throws inside handler -> 500 ----
  it("returns 500 with a generic message when an optional field is a non-string (no error leak)", async () => {
    prismaMock.adminRequest.findFirst.mockResolvedValue(null);
    const res = await request(app).post("/api/admin-requests").send({
      email: "prof@college.edu",
      festName: "TechFest",
      name: 123,
    });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("SERVER_ERROR");
    expect(res.body.error.message).toBe("Server error");
    // The raw error detail (e.g. ".trim is not a function") must NOT be leaked.
    expect(res.body.error.message).not.toMatch(/trim is not a function/);
  });

  // ---- 500: database errors (generic message, no raw detail leaked) ----
  it("returns 500 with a generic message when findFirst rejects", async () => {
    prismaMock.adminRequest.findFirst.mockRejectedValue(new Error("db down"));
    const res = await request(app)
      .post("/api/admin-requests")
      .send({ email: "prof@college.edu", festName: "TechFest" });
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: "SERVER_ERROR", message: "Server error" });
    expect(prismaMock.adminRequest.create).not.toHaveBeenCalled();
  });

  it("returns 500 with a generic message when create rejects", async () => {
    prismaMock.adminRequest.findFirst.mockResolvedValue(null);
    prismaMock.adminRequest.create.mockRejectedValue(new Error("insert failed"));
    const res = await request(app)
      .post("/api/admin-requests")
      .send({ email: "prof@college.edu", festName: "TechFest" });
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: "SERVER_ERROR", message: "Server error" });
  });
});
