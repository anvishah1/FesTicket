import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { prismaMock, resetPrismaMock } from "@prisma/client";
import { makeApp } from "../helpers/makeApp.js";
import { signToken } from "../helpers/auth.js";
import router from "../../src/routes/roleRequests.js";

vi.mock("@prisma/client");

// POST /api/role-requests is wrapped in writeLimiter (IP-keyed). supertest
// reuses the same IP, so neutralise every limiter to pass through.
vi.mock("../../src/middleware/rateLimiter.js", () => ({
  loginLimiter: (req, res, next) => next(),
  signupLimiter: (req, res, next) => next(),
  bookingLimiter: (req, res, next) => next(),
  writeLimiter: (req, res, next) => next(),
}));

const app = makeApp(router, "/api/role-requests");

beforeEach(resetPrismaMock);

// Convenience token builders.
const adminToken = () => signToken({ userId: 1, role: "ADMIN" });
const viewerToken = () => signToken({ userId: 2, role: "VIEWER" });

/* =====================================================================
 * GET /  — list requests (auth + ADMIN, scoped by admin.managedFestId)
 * ===================================================================== */
describe("GET /api/role-requests", () => {
  it("returns 401 when no Authorization header is provided", async () => {
    const res = await request(app).get("/api/role-requests");
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/no token/i);
  });

  it("returns 401 for an invalid token", async () => {
    const res = await request(app)
      .get("/api/role-requests")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid or expired/i);
  });

  it("returns 403 when the caller is not an ADMIN", async () => {
    const res = await request(app)
      .get("/api/role-requests")
      .set("Authorization", `Bearer ${viewerToken()}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/access denied/i);
  });

  it("scopes to the admin's managedFestId and defaults to only PENDING", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 42 });
    prismaMock.roleRequest.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get("/api/role-requests")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: { managedFestId: true },
    });
    expect(prismaMock.roleRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "PENDING", festId: 42 },
        orderBy: [{ requestDate: "desc" }, { id: "desc" }],
      })
    );
  });

  it("includes all statuses (no status filter) when ?status=all", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 42 });
    prismaMock.roleRequest.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get("/api/role-requests?status=all")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(prismaMock.roleRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { festId: 42 } })
    );
  });

  it("returns an empty list (no cross-fest leak) when the admin has no managedFestId", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: null });

    const res = await request(app)
      .get("/api/role-requests")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(prismaMock.roleRequest.findMany).not.toHaveBeenCalled();
  });

  it("returns an empty list when the admin user record is missing", async () => {
    const res = await request(app)
      .get("/api/role-requests")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(prismaMock.roleRequest.findMany).not.toHaveBeenCalled();
  });

  it("maps records to the response shape with fest/name present", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 42 });
    prismaMock.roleRequest.findMany.mockResolvedValue([
      {
        id: 10,
        userId: 5,
        festId: 42,
        organization: "Robotics Club",
        requestedRole: "EDITOR",
        requestDate: new Date("2024-05-01T00:00:00.000Z"),
        status: "PENDING",
        user: { id: 5, email: "stu@x.com", name: "Stu Dent" },
        fest: { id: 42, name: "TechFest" },
      },
    ]);

    const res = await request(app)
      .get("/api/role-requests")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toEqual({
      id: 10,
      userId: 5,
      festId: 42,
      festName: "TechFest", // fest.name preferred
      studentName: "Stu Dent", // user.name preferred
      email: "stu@x.com",
      organization: "Robotics Club",
      requestedRole: "EDITOR",
      requestDate: "2024-05-01T00:00:00.000Z",
      status: "PENDING",
    });
  });

  it("falls back to organization for festName and email for studentName", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 42 });
    prismaMock.roleRequest.findMany.mockResolvedValue([
      {
        id: 11,
        userId: 6,
        festId: null,
        organization: "OrgOnly",
        requestedRole: "HOST",
        requestDate: new Date("2024-06-01T00:00:00.000Z"),
        status: "PENDING",
        user: { id: 6, email: "noname@x.com", name: null },
        fest: null,
      },
    ]);

    const res = await request(app)
      .get("/api/role-requests")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body[0].festName).toBe("OrgOnly"); // fest?.name ?? organization
    expect(res.body[0].studentName).toBe("noname@x.com"); // name || email
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 42 });
    prismaMock.roleRequest.findMany.mockRejectedValue(new Error("db down"));

    const res = await request(app)
      .get("/api/role-requests")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Server error");
  });
});

/* =====================================================================
 * POST /  — create a role request (auth only)
 * ===================================================================== */
describe("POST /api/role-requests", () => {
  it("returns 401 when no Authorization header is provided", async () => {
    const res = await request(app)
      .post("/api/role-requests")
      .send({ requestedRole: "EDITOR" });
    expect(res.status).toBe(401);
  });

  it("creates a HOST request with organization and returns 201", async () => {
    prismaMock.roleRequest.findFirst.mockResolvedValue(null);
    prismaMock.roleRequest.create.mockResolvedValue({
      id: 100,
      status: "PENDING",
      user: { email: "stu@x.com", name: "Stu" },
    });

    const res = await request(app)
      .post("/api/role-requests")
      .set("Authorization", `Bearer ${viewerToken()}`)
      .send({ requestedRole: "HOST", organization: "IIT" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      message: "Role request submitted",
      id: 100,
      status: "PENDING",
    });
    expect(prismaMock.roleRequest.findFirst).toHaveBeenCalledWith({
      where: { userId: 2, status: "PENDING" },
    });
    expect(prismaMock.roleRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userId: 2, festId: null, requestedRole: "HOST", organization: "IIT" },
      })
    );
  });

  it("defaults requestedRole to EDITOR and organization to null when omitted", async () => {
    prismaMock.roleRequest.findFirst.mockResolvedValue(null);
    prismaMock.roleRequest.create.mockResolvedValue({
      id: 101,
      status: "PENDING",
      user: { email: "stu@x.com", name: "Stu" },
    });

    const res = await request(app)
      .post("/api/role-requests")
      .set("Authorization", `Bearer ${viewerToken()}`)
      .send({});

    expect(res.status).toBe(201);
    expect(prismaMock.roleRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userId: 2, festId: null, requestedRole: "EDITOR", organization: null },
      })
    );
  });

  it("scopes the request to a fest when a valid festKey is provided", async () => {
    prismaMock.fest.findFirst.mockResolvedValue({ id: 7 });
    prismaMock.roleRequest.findFirst.mockResolvedValue(null);
    prismaMock.roleRequest.create.mockResolvedValue({
      id: 102,
      status: "PENDING",
      user: { email: "s@x.com", name: "S" },
    });

    const res = await request(app)
      .post("/api/role-requests")
      .set("Authorization", `Bearer ${viewerToken()}`)
      .send({ requestedRole: "EDITOR", festKey: "KEY-7" });

    expect(res.status).toBe(201);
    expect(prismaMock.fest.findFirst).toHaveBeenCalledWith({ where: { adminKey: "KEY-7" } });
    expect(prismaMock.roleRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ festId: 7 }) })
    );
  });

  it("returns 400 for an invalid festKey", async () => {
    prismaMock.fest.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/role-requests")
      .set("Authorization", `Bearer ${viewerToken()}`)
      .send({ requestedRole: "EDITOR", festKey: "BOGUS" });
    expect(res.status).toBe(400);
    expect(res.body.errors.festKey).toBeTruthy();
  });

  it("coerces an invalid requestedRole to EDITOR (never 400 — the guard is dead code)", async () => {
    prismaMock.roleRequest.findFirst.mockResolvedValue(null);
    prismaMock.roleRequest.create.mockResolvedValue({
      id: 102,
      status: "PENDING",
      user: { email: "stu@x.com", name: null },
    });

    const res = await request(app)
      .post("/api/role-requests")
      .set("Authorization", `Bearer ${viewerToken()}`)
      .send({ requestedRole: "ADMIN" });

    expect(res.status).toBe(201);
    expect(prismaMock.roleRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ requestedRole: "EDITOR" }),
      })
    );
  });

  it("returns 409 when the user already has a pending request", async () => {
    prismaMock.roleRequest.findFirst.mockResolvedValue({ id: 55 });

    const res = await request(app)
      .post("/api/role-requests")
      .set("Authorization", `Bearer ${viewerToken()}`)
      .send({ requestedRole: "EDITOR" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      message: "You already have a pending role request",
      requestId: 55,
    });
    expect(prismaMock.roleRequest.create).not.toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.roleRequest.findFirst.mockRejectedValue(new Error("db down"));

    const res = await request(app)
      .post("/api/role-requests")
      .set("Authorization", `Bearer ${viewerToken()}`)
      .send({ requestedRole: "EDITOR" });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Server error");
  });
});

/* =====================================================================
 * PATCH /:id  — approve/deny (auth + ADMIN)
 * ===================================================================== */
describe("PATCH /api/role-requests/:id", () => {
  it("returns 401 when no Authorization header is provided", async () => {
    const res = await request(app)
      .patch("/api/role-requests/5")
      .send({ status: "APPROVED" });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an ADMIN", async () => {
    const res = await request(app)
      .patch("/api/role-requests/5")
      .set("Authorization", `Bearer ${viewerToken()}`)
      .send({ status: "APPROVED" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when status is missing", async () => {
    const res = await request(app)
      .patch("/api/role-requests/5")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/APPROVED or DENIED/);
    expect(prismaMock.roleRequest.findUnique).not.toHaveBeenCalled();
  });

  it("returns 400 when status is an invalid value", async () => {
    const res = await request(app)
      .patch("/api/role-requests/5")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ status: "MAYBE" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when status is PENDING (explicitly disallowed)", async () => {
    const res = await request(app)
      .patch("/api/role-requests/5")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ status: "PENDING" });
    expect(res.status).toBe(400);
    expect(prismaMock.roleRequest.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the request does not exist", async () => {
    prismaMock.roleRequest.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch("/api/role-requests/5")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ status: "APPROVED" });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
    expect(prismaMock.roleRequest.findUnique).toHaveBeenCalledWith({
      where: { id: 5 },
    });
  });

  it("returns 400 when the request is no longer pending", async () => {
    prismaMock.roleRequest.findUnique.mockResolvedValue({
      id: 5,
      userId: 9,
      festId: 3,
      requestedRole: "HOST",
      status: "APPROVED",
    });
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 3 });

    const res = await request(app)
      .patch("/api/role-requests/5")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ status: "DENIED" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no longer pending/i);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("approves a pending request, updating the user's role/editorFestId, bumping tokenVersion and revoking refresh tokens", async () => {
    prismaMock.roleRequest.findUnique.mockResolvedValue({
      id: 5,
      userId: 9,
      festId: 3,
      requestedRole: "HOST",
      status: "PENDING",
    });
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 3 });
    prismaMock.roleRequest.update.mockResolvedValue({});
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 2 });

    const res = await request(app)
      .patch("/api/role-requests/5")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ status: "APPROVED" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Request approved", id: 5, status: "APPROVED" });
    expect(prismaMock.roleRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: expect.objectContaining({ status: "APPROVED", reviewedById: 1 }),
      })
    );
    // Role change bumps tokenVersion so old access tokens are superseded.
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { role: "HOST", editorFestId: 3, tokenVersion: { increment: 1 } },
    });
    // And revokes the user's refresh tokens so they must re-login.
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 9 },
    });
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

  it("returns 403 for a request with no festId (cannot be scoped to the admin's fest)", async () => {
    prismaMock.roleRequest.findUnique.mockResolvedValue({
      id: 6,
      userId: 12,
      festId: null,
      requestedRole: "EDITOR",
      status: "PENDING",
    });
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 3 });

    const res = await request(app)
      .patch("/api/role-requests/6")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ status: "APPROVED" });

    expect(res.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("returns 403 when the request belongs to another fest (cross-tenant)", async () => {
    prismaMock.roleRequest.findUnique.mockResolvedValue({
      id: 8,
      userId: 20,
      festId: 99,
      requestedRole: "HOST",
      status: "PENDING",
    });
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 3 });

    const res = await request(app)
      .patch("/api/role-requests/8")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ status: "APPROVED" });

    expect(res.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("denies a pending request without touching the user record", async () => {
    prismaMock.roleRequest.findUnique.mockResolvedValue({
      id: 7,
      userId: 15,
      festId: 3,
      requestedRole: "HOST",
      status: "PENDING",
    });
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 3 });
    prismaMock.roleRequest.update.mockResolvedValue({});

    const res = await request(app)
      .patch("/api/role-requests/7")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ status: "DENIED" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Request denied", id: 7, status: "DENIED" });
    expect(prismaMock.roleRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({ status: "DENIED", reviewedById: 1 }),
      })
    );
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("returns 500 when the lookup throws", async () => {
    prismaMock.roleRequest.findUnique.mockRejectedValue(new Error("db down"));

    const res = await request(app)
      .patch("/api/role-requests/5")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ status: "APPROVED" });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Server error");
  });
});
