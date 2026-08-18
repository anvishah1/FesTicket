import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { prismaMock, resetPrismaMock } from "@prisma/client";
import {
  authenticateUser,
  optionalAuthenticate,
  authorizeRoles,
} from "../../src/middleware/authMiddleware.js";
import { signToken } from "../helpers/auth.js";

// authMiddleware looks up the caller's User row to enforce tokenVersion/soft-delete
// (see src/middleware/authMiddleware.js) — without this mock the suite silently hit
// the real database and only passed by accident of the lenient DB-error fallback.
vi.mock("@prisma/client");
beforeEach(resetPrismaMock);

// Build a tiny app that mounts the given middleware chain and echoes req.user.
function appWith(...middleware) {
  const app = express();
  app.use(express.json());
  app.get("/t", ...middleware, (req, res) =>
    res.json({ ok: true, user: req.user ?? null })
  );
  return app;
}

// Middleware that injects a fixed req.user (simulates a prior auth step).
const injectUser = (user) => (req, _res, next) => {
  req.user = user;
  next();
};

describe("authenticateUser", () => {
  const app = appWith(authenticateUser);

  it("returns 401 when no Authorization header is provided", async () => {
    const res = await request(app).get("/t");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("No token provided");
  });

  it("returns 401 when the Authorization header does not start with 'Bearer '", async () => {
    const res = await request(app).get("/t").set("Authorization", "Token abc");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("No token provided");
  });

  it("returns 401 for an invalid/garbage token", async () => {
    const res = await request(app)
      .get("/t")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid or expired token");
  });

  it("returns 401 for a token signed with the wrong secret", async () => {
    // jwt signed with a different secret must fail verification.
    const jwt = (await import("jsonwebtoken")).default;
    const bad = jwt.sign({ userId: 1, role: "ADMIN" }, "some-other-secret");
    const res = await request(app).get("/t").set("Authorization", `Bearer ${bad}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid or expired token");
  });

  it("calls next and sets req.user (decoded payload) on a valid token", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ tokenVersion: 0, deletedAt: null });
    const res = await request(app)
      .get("/t")
      .set("Authorization", `Bearer ${signToken({ userId: 42, role: "ADMIN" })}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user.userId).toBe(42);
    expect(res.body.user.role).toBe("ADMIN");
  });

  it("rejects a token whose tokenVersion no longer matches the DB (password reset / role change)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ tokenVersion: 5, deletedAt: null });
    const token = jwt.sign({ userId: 42, role: "ADMIN", tokenVersion: 0 }, process.env.JWT_SECRET);
    const res = await request(app).get("/t").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Session no longer valid. Please sign in again.");
  });

  it("rejects a token for a soft-deleted account (AUTH-04)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ tokenVersion: 0, deletedAt: new Date() });
    const res = await request(app)
      .get("/t")
      .set("Authorization", `Bearer ${signToken({ userId: 42, role: "ADMIN" })}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Account no longer exists.");
  });

  it("still authenticates on a DB error (lenient fallback)", async () => {
    prismaMock.user.findUnique.mockRejectedValue(new Error("DB unreachable"));
    const res = await request(app)
      .get("/t")
      .set("Authorization", `Bearer ${signToken({ userId: 42, role: "ADMIN" })}`);
    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe(42);
  });
});

describe("optionalAuthenticate", () => {
  const app = appWith(optionalAuthenticate);

  it("passes through (no req.user) when no Authorization header is present", async () => {
    const res = await request(app).get("/t");
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  it("passes through (no req.user) when header does not start with 'Bearer '", async () => {
    const res = await request(app).get("/t").set("Authorization", "Basic xyz");
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  it("never fails on an invalid token: proceeds with no req.user", async () => {
    const res = await request(app)
      .get("/t")
      .set("Authorization", "Bearer garbage.token.here");
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  it("sets req.user when a valid token is provided", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ tokenVersion: 0, deletedAt: null });
    const res = await request(app)
      .get("/t")
      .set("Authorization", `Bearer ${signToken({ userId: 7, role: "EDITOR" })}`);
    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe(7);
    expect(res.body.user.role).toBe("EDITOR");
  });

  it("stays anonymous when the token's tokenVersion is stale", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ tokenVersion: 5, deletedAt: null });
    const token = jwt.sign({ userId: 7, role: "EDITOR", tokenVersion: 0 }, process.env.JWT_SECRET);
    const res = await request(app).get("/t").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  it("stays anonymous for a soft-deleted account (AUTH-04)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ tokenVersion: 0, deletedAt: new Date() });
    const res = await request(app)
      .get("/t")
      .set("Authorization", `Bearer ${signToken({ userId: 7, role: "EDITOR" })}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  it("falls back to trusting the token when the DB errors", async () => {
    prismaMock.user.findUnique.mockRejectedValue(new Error("DB unreachable"));
    const res = await request(app)
      .get("/t")
      .set("Authorization", `Bearer ${signToken({ userId: 7, role: "EDITOR" })}`);
    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe(7);
  });
});

describe("authorizeRoles", () => {
  it("returns 401 when req.user is not set (no prior authentication)", async () => {
    const app = appWith(authorizeRoles("ADMIN"));
    const res = await request(app).get("/t");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Authentication required");
  });

  it("returns 403 when the user's role is not in the allowed list", async () => {
    const app = appWith(injectUser({ userId: 1, role: "VIEWER" }), authorizeRoles("ADMIN"));
    const res = await request(app).get("/t");
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Access denied");
  });

  it("calls next when the user's role is allowed", async () => {
    const app = appWith(injectUser({ userId: 1, role: "ADMIN" }), authorizeRoles("ADMIN"));
    const res = await request(app).get("/t");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("allows any of several permitted roles", async () => {
    const app = appWith(
      injectUser({ userId: 1, role: "HOST" }),
      authorizeRoles("ADMIN", "HOST", "EDITOR")
    );
    const res = await request(app).get("/t");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("integrates with authenticateUser end-to-end (valid ADMIN token passes)", async () => {
    const app = appWith(authenticateUser, authorizeRoles("ADMIN"));
    const res = await request(app)
      .get("/t")
      .set("Authorization", `Bearer ${signToken({ userId: 9, role: "ADMIN" })}`);
    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe(9);
  });

  it("integrates with authenticateUser end-to-end (valid VIEWER token is 403)", async () => {
    const app = appWith(authenticateUser, authorizeRoles("ADMIN"));
    const res = await request(app)
      .get("/t")
      .set("Authorization", `Bearer ${signToken({ userId: 9, role: "VIEWER" })}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Access denied");
  });
});
