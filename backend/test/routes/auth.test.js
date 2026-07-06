import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prismaMock, resetPrismaMock } from "@prisma/client";
import { makeApp } from "../helpers/makeApp.js";
import { signToken } from "../helpers/auth.js";

// Tokens (refresh / reset / verify) are persisted as sha256(plaintext); the
// client keeps the plaintext. Mirror the route's hashing so DB-facing
// assertions can match on the stored hash.
const sha256 = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");

// Decode (without verifying) a signed access token to inspect its payload.
const jwtDecode = (t) => jwt.decode(t);

// --- Module mocks (hoisted) --------------------------------------------------
vi.mock("@prisma/client");

// signin/signup/forgot-password are wrapped in rate limiters keyed by IP.
// supertest hammers the same IP, so neutralise every limiter to pass through
// and avoid spurious 429s.
vi.mock("../../src/middleware/rateLimiter.js", () => ({
  loginLimiter: (req, res, next) => next(),
  signupLimiter: (req, res, next) => next(),
  bookingLimiter: (req, res, next) => next(),
  writeLimiter: (req, res, next) => next(),
}));

// bcrypt is a DEFAULT import in auth.js. Mock for determinism.
vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(async () => "hashed-pw"),
    compare: vi.fn(async () => true),
  },
}));

import router from "../../src/routes/auth.js";

const app = makeApp(router, "/api/auth");

beforeEach(() => {
  resetPrismaMock();
  // clearMocks (vitest.config) wipes call history but NOT implementations set
  // via mockResolvedValue, so re-establish bcrypt defaults each test.
  bcrypt.hash.mockResolvedValue("hashed-pw");
  bcrypt.compare.mockResolvedValue(true);
});

// A password that satisfies signupSchema (upper/lower/number/special, 8-30 chars).
const GOOD_PW = "Password1!";

/* =========================================================================
 * POST /api/auth/signup
 * ======================================================================= */
describe("POST /api/auth/signup", () => {
  it("returns 400 Validation failed when the body is invalid (bad email)", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: "not-an-email", password: GOOD_PW, name: "Alice" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Validation failed");
    expect(res.body.error.details).toBeTruthy();
    expect(res.body.error.details.email).toBeDefined();
    // Never reached the DB layer.
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns 400 Validation failed when the password is too weak", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: "a@b.com", password: "weak", name: "Alice" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Validation failed");
    expect(res.body.error.details.password).toBeDefined();
  });

  it("returns 400 when wantsEditor is true but no festKey is supplied", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: "a@b.com", password: GOOD_PW, wantsEditor: true });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe(
      "Fest key is required when requesting editor access."
    );
    expect(res.body.error.details.festKey).toBe(
      "Enter the key provided by your fest admin."
    );
  });

  it("returns 400 when wantsEditor is true and the festKey matches no fest", async () => {
    prismaMock.fest.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        email: "a@b.com",
        password: GOOD_PW,
        wantsEditor: true,
        festKey: "BADKEY",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe(
      "Invalid fest key. Check the key with your fest admin."
    );
    expect(res.body.error.details.festKey).toBe("No fest found for this key.");
    expect(prismaMock.fest.findFirst).toHaveBeenCalledWith({
      where: { adminKey: "BADKEY" },
    });
  });

  it("returns 409 when a user with the email already exists", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 99, email: "a@b.com" });

    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: "a@b.com", password: GOOD_PW, name: "Alice" });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe("User already exists");
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("creates a non-editor user and returns 201 (NODE_ENV=test verify message)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 42, email: "a@b.com" });

    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: "a@b.com", password: GOOD_PW, name: "Alice" });

    expect(res.status).toBe(201);
    // Enveloped success: message stays top-level, payload moves under `data`,
    // and every enveloped response carries success + requestId.
    expect(res.body.success).toBe(true);
    expect(res.body.requestId).toBeTruthy();
    expect(res.body.message).toBe("Signup successful. Please verify your email.");
    expect(res.body.data).toEqual({ userId: 42, createdRoleRequest: false });
    expect(bcrypt.hash).toHaveBeenCalledWith(GOOD_PW, 10);
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "a@b.com",
        password: "hashed-pw",
        name: "Alice",
        organizationName: null,
        emailVerified: true,
        emailVerifyToken: expect.any(String),
      }),
    });
    // Non-editor path: no role request created.
    expect(prismaMock.roleRequest.create).not.toHaveBeenCalled();
  });

  it("creates an editor user + RoleRequest and returns 201 createdRoleRequest:true", async () => {
    prismaMock.fest.findFirst.mockResolvedValue({ id: 7, name: "TechFest" });
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 43, email: "s@b.com" });
    prismaMock.roleRequest.create.mockResolvedValue({ id: 5 });

    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        email: "s@b.com",
        password: GOOD_PW,
        name: "Sam",
        wantsEditor: true,
        festKey: "GOODKEY",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(43);
    expect(res.body.data.createdRoleRequest).toBe(true);
    expect(prismaMock.roleRequest.create).toHaveBeenCalledWith({
      data: {
        userId: 43,
        festId: 7,
        requestedRole: "EDITOR",
        organization: "TechFest",
      },
    });
  });

  it("accepts a captchaToken and still signs up (graceful no-op when CAPTCHA_SECRET is unset)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 44, email: "c@b.com" });

    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: "c@b.com", password: GOOD_PW, name: "Cara", captchaToken: "anything" });

    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(44);
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockRejectedValue(new Error("db down"));

    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: "a@b.com", password: GOOD_PW, name: "Alice" });

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe("Internal server error");
  });
});

/* =========================================================================
 * POST /api/auth/signin
 * ======================================================================= */
describe("POST /api/auth/signin", () => {
  const verifiedUser = {
    id: 1,
    email: "a@b.com",
    password: "hashed-pw",
    name: "Alice",
    role: "VIEWER",
    emailVerified: true,
    failedLoginAttempts: 0,
    lockUntil: null,
    profileCompleted: false,
    editorFestId: null,
    managedFestId: null,
  };

  it("returns 400 Validation failed for an invalid email", async () => {
    const res = await request(app)
      .post("/api/auth/signin")
      .send({ email: "bad", password: "x" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Validation failed");
  });

  it("returns 401 when the user does not exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/auth/signin")
      .send({ email: "a@b.com", password: "whatever" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid credentials");
  });

  it("returns 401 when the user has no password set", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...verifiedUser, password: null });

    const res = await request(app)
      .post("/api/auth/signin")
      .send({ email: "a@b.com", password: "whatever" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid credentials");
  });

  it("returns 403 when the account is currently locked", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...verifiedUser,
      lockUntil: new Date(Date.now() + 10 * 60 * 1000),
    });

    const res = await request(app)
      .post("/api/auth/signin")
      .send({ email: "a@b.com", password: "whatever" });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe("Account locked. Try again later.");
  });

  it("increments failedLoginAttempts and returns 401 on a wrong password", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...verifiedUser, failedLoginAttempts: 1 });
    prismaMock.user.update.mockResolvedValue({});
    bcrypt.compare.mockResolvedValue(false);

    const res = await request(app)
      .post("/api/auth/signin")
      .send({ email: "a@b.com", password: "wrong" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid credentials");
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { failedLoginAttempts: 2 },
    });
  });

  it("locks the account (403) on the 5th consecutive failed attempt", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...verifiedUser, failedLoginAttempts: 4 });
    prismaMock.user.update.mockResolvedValue({});
    bcrypt.compare.mockResolvedValue(false);

    const res = await request(app)
      .post("/api/auth/signin")
      .send({ email: "a@b.com", password: "wrong" });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe(
      "Too many failed attempts. Account locked for 15 minutes."
    );
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        failedLoginAttempts: 0,
        lockUntil: expect.any(Date),
      }),
    });
  });

  it("signs in successfully and returns tokens + user", async () => {
    prismaMock.user.findUnique.mockResolvedValue(verifiedUser);
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.refreshToken.create.mockResolvedValue({});
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app)
      .post("/api/auth/signin")
      .send({ email: "a@b.com", password: GOOD_PW });

    expect(res.status).toBe(200);
    // res.ok keeps `message` top-level; tokens/user move under `data`.
    expect(res.body.message).toBe("Signin successful");
    expect(typeof res.body.data.accessToken).toBe("string");
    expect(typeof res.body.data.refreshToken).toBe("string");
    expect(res.body.data.user).toEqual({
      id: 1,
      email: "a@b.com",
      name: "Alice",
      role: "VIEWER",
      profileCompleted: false,
      editorFestId: null,
      managedFestId: null,
    });
    expect(prismaMock.refreshToken.create).toHaveBeenCalled();
    // Successful-login reset happens.
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ failedLoginAttempts: 0, lockUntil: null }),
    });
  });

  it("signs the access token with the user's role AND tokenVersion, and starts a NEW refresh-token family", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...verifiedUser, role: "ADMIN", tokenVersion: 7 });
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.refreshToken.create.mockResolvedValue({});
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app)
      .post("/api/auth/signin")
      .send({ email: "a@b.com", password: GOOD_PW });

    expect(res.status).toBe(200);
    const decoded = jwtDecode(res.body.data.accessToken);
    expect(decoded.userId).toBe(1);
    expect(decoded.role).toBe("ADMIN");
    expect(decoded.tokenVersion).toBe(7);
    // A fresh login mints a brand-new family lineage.
    const createArg = prismaMock.refreshToken.create.mock.calls[0][0];
    expect(typeof createArg.data.familyId).toBe("string");
    expect(createArg.data.familyId.length).toBeGreaterThan(0);
  });

  it("still signs in when CAPTCHA_SECRET is unset (graceful no-op) even if a captchaToken is sent", async () => {
    // No CAPTCHA_SECRET in the test env -> verifyCaptcha returns true.
    prismaMock.user.findUnique.mockResolvedValue(verifiedUser);
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.refreshToken.create.mockResolvedValue({});
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app)
      .post("/api/auth/signin")
      .send({ email: "a@b.com", password: GOOD_PW, captchaToken: "anything" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Signin successful");
  });

  it("signs in even when emailVerified is false, without flipping it before the password check", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...verifiedUser, emailVerified: false });
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.refreshToken.create.mockResolvedValue({});
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app)
      .post("/api/auth/signin")
      .send({ email: "a@b.com", password: GOOD_PW });

    expect(res.status).toBe(200);
    // emailVerified must NOT be flipped during signin: previously it was updated
    // BEFORE the password check, so even a wrong-password attempt flipped it.
    expect(prismaMock.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { emailVerified: true } })
    );
  });

  it("returns the SAME generic message for an unknown email as for a wrong password, and still runs a (dummy) bcrypt compare to keep timing constant", async () => {
    // Unknown email.
    prismaMock.user.findUnique.mockResolvedValue(null);
    const unknown = await request(app)
      .post("/api/auth/signin")
      .send({ email: "nobody@b.com", password: "whatever" });

    // A dummy compare must run even though there is no user, so response timing
    // does not leak whether the account exists.
    expect(bcrypt.compare).toHaveBeenCalled();
    expect(unknown.status).toBe(401);

    // Wrong password for an existing user.
    prismaMock.user.findUnique.mockResolvedValue({ ...verifiedUser });
    prismaMock.user.update.mockResolvedValue({});
    bcrypt.compare.mockResolvedValue(false);
    const wrongPw = await request(app)
      .post("/api/auth/signin")
      .send({ email: "a@b.com", password: "wrong" });

    expect(wrongPw.status).toBe(401);
    // Identical wording — nothing distinguishes unknown-email from wrong-password.
    expect(unknown.body.error.message).toBe("Invalid credentials");
    expect(wrongPw.body.error.message).toBe("Invalid credentials");
    expect(unknown.body.error.message).toBe(wrongPw.body.error.message);
  });

  it("persists the HASH of the refresh token, never the plaintext returned to the client", async () => {
    prismaMock.user.findUnique.mockResolvedValue(verifiedUser);
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.refreshToken.create.mockResolvedValue({});
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app)
      .post("/api/auth/signin")
      .send({ email: "a@b.com", password: GOOD_PW });

    expect(res.status).toBe(200);
    const createArg = prismaMock.refreshToken.create.mock.calls[0][0];
    expect(createArg.data.token).toBe(sha256(res.body.data.refreshToken));
    expect(createArg.data.token).not.toBe(res.body.data.refreshToken);
    // A sha256 hex digest is exactly 64 chars.
    expect(createArg.data.token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.user.findUnique.mockRejectedValue(new Error("db down"));

    const res = await request(app)
      .post("/api/auth/signin")
      .send({ email: "a@b.com", password: GOOD_PW });

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe("Internal server error");
  });
});

/* =========================================================================
 * POST /api/auth/refresh-token
 * ======================================================================= */
describe("POST /api/auth/refresh-token", () => {
  it("returns 401 when no refreshToken is provided", async () => {
    const res = await request(app).post("/api/auth/refresh-token").send({});

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Refresh token required");
  });

  it("returns 401 for an unknown refresh token", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/auth/refresh-token")
      .send({ refreshToken: "nope" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid refresh token");
  });

  it("returns 403 and deletes the token when it is expired", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      token: "old",
      userId: 1,
      expiresAt: new Date(Date.now() - 1000),
    });
    prismaMock.refreshToken.delete.mockResolvedValue({});

    const res = await request(app)
      .post("/api/auth/refresh-token")
      .send({ refreshToken: "old" });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe("Refresh token expired");
    expect(prismaMock.refreshToken.delete).toHaveBeenCalledWith({
      where: { token: sha256("old") },
    });
  });

  it("returns 403 when the token's user no longer exists", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      token: "old",
      userId: 1,
      expiresAt: new Date(Date.now() + 10000),
    });
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/auth/refresh-token")
      .send({ refreshToken: "old" });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe("Invalid token user");
  });

  it("rotates the token (revoking the old as a tombstone) and returns a fresh access + refresh token that inherits the family", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 77,
      token: "old",
      userId: 1,
      familyId: "fam-123",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 10000),
    });
    prismaMock.user.findUnique.mockResolvedValue({ id: 1, role: "EDITOR", tokenVersion: 3 });
    prismaMock.refreshToken.update.mockResolvedValue({});
    prismaMock.refreshToken.create.mockResolvedValue({});
    prismaMock.refreshToken.findMany.mockResolvedValue([]);
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .post("/api/auth/refresh-token")
      .send({ refreshToken: "old" });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.accessToken).toBe("string");
    expect(typeof res.body.data.refreshToken).toBe("string");
    expect(res.body.data.refreshToken).not.toBe("old");

    // The old token is NOT hard-deleted; it is marked revoked (tombstone) so a
    // later replay can be detected.
    expect(prismaMock.refreshToken.update).toHaveBeenCalledWith({
      where: { token: sha256("old") },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prismaMock.refreshToken.create).toHaveBeenCalled();

    const createArg = prismaMock.refreshToken.create.mock.calls[0][0];
    // Persist the HASH of the new token, never the plaintext.
    expect(createArg.data.token).toBe(sha256(res.body.data.refreshToken));
    expect(createArg.data.token).not.toBe(res.body.data.refreshToken);
    // The new token inherits the presented token's family lineage.
    expect(createArg.data.familyId).toBe("fam-123");

    // The re-signed access token reflects the user's CURRENT role + tokenVersion.
    const decoded = jwtDecode(res.body.data.accessToken);
    expect(decoded.role).toBe("EDITOR");
    expect(decoded.tokenVersion).toBe(3);
  });

  it("detects replay of an already-revoked token, revokes the whole family, and returns 401", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 77,
      token: "old",
      userId: 1,
      familyId: "fam-123",
      revokedAt: new Date(Date.now() - 1000),
      expiresAt: new Date(Date.now() + 10000),
    });
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 4 });

    const res = await request(app)
      .post("/api/auth/refresh-token")
      .send({ refreshToken: "old" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Refresh token reuse detected");
    // Entire lineage revoked; no rotation happened.
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { familyId: "fam-123" },
    });
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
    expect(prismaMock.refreshToken.update).not.toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.refreshToken.findUnique.mockRejectedValue(new Error("db down"));

    const res = await request(app)
      .post("/api/auth/refresh-token")
      .send({ refreshToken: "old" });

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe("Server error");
  });
});

/* =========================================================================
 * POST /api/auth/logout
 * ======================================================================= */
describe("POST /api/auth/logout", () => {
  it("returns 400 when no refreshToken is provided", async () => {
    const res = await request(app).post("/api/auth/logout").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Refresh token required");
  });

  it("deletes matching refresh tokens and returns 200", async () => {
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post("/api/auth/logout")
      .send({ refreshToken: "tok" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Logged out successfully");
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { token: sha256("tok") },
    });
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.refreshToken.deleteMany.mockRejectedValue(new Error("db down"));

    const res = await request(app)
      .post("/api/auth/logout")
      .send({ refreshToken: "tok" });

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe("Server error");
  });
});

/* =========================================================================
 * GET /api/auth/sessions  (authenticated)
 * ======================================================================= */
describe("GET /api/auth/sessions", () => {
  it("returns 401 without an Authorization header", async () => {
    const res = await request(app).get("/api/auth/sessions");
    expect(res.status).toBe(401);
  });

  it("returns the caller's sessions scoped by userId, without the raw token secret", async () => {
    prismaMock.refreshToken.findMany.mockResolvedValue([
      { id: 10, userAgent: "ua", ipAddress: "1.1.1.1", createdAt: new Date(), expiresAt: new Date() },
      { id: 11, userAgent: "ua2", ipAddress: "2.2.2.2", createdAt: new Date(), expiresAt: new Date() },
    ]);

    const res = await request(app)
      .get("/api/auth/sessions")
      .set("Authorization", `Bearer ${signToken({ userId: 3, role: "VIEWER" })}`);

    expect(res.status).toBe(200);
    // res.ok(sessions): the array is the `data` payload.
    expect(res.body.data).toHaveLength(2);
    // The query must select only metadata (no `token` field).
    const call = prismaMock.refreshToken.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ userId: 3 });
    expect(call.select).toBeDefined();
    expect(call.select.token).toBeUndefined();
    expect(res.body.data[0].token).toBeUndefined();
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.refreshToken.findMany.mockRejectedValue(new Error("db down"));

    const res = await request(app)
      .get("/api/auth/sessions")
      .set("Authorization", `Bearer ${signToken({ userId: 3, role: "VIEWER" })}`);

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe("Server error");
  });
});

/* =========================================================================
 * DELETE /api/auth/sessions/:id  (authenticated)
 * ======================================================================= */
describe("DELETE /api/auth/sessions/:id", () => {
  it("returns 401 without an Authorization header", async () => {
    const res = await request(app).delete("/api/auth/sessions/5");
    expect(res.status).toBe(401);
  });

  it("revokes a single session scoped by id + userId", async () => {
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .delete("/api/auth/sessions/5")
      .set("Authorization", `Bearer ${signToken({ userId: 3, role: "VIEWER" })}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Session revoked");
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { id: 5, userId: 3 },
    });
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.refreshToken.deleteMany.mockRejectedValue(new Error("db down"));

    const res = await request(app)
      .delete("/api/auth/sessions/5")
      .set("Authorization", `Bearer ${signToken({ userId: 3, role: "VIEWER" })}`);

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe("Server error");
  });
});

/* =========================================================================
 * DELETE /api/auth/sessions  (authenticated, revoke all)
 * ======================================================================= */
describe("DELETE /api/auth/sessions", () => {
  it("returns 401 without an Authorization header", async () => {
    const res = await request(app).delete("/api/auth/sessions");
    expect(res.status).toBe(401);
  });

  it("revokes all sessions for the caller", async () => {
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 3 });

    const res = await request(app)
      .delete("/api/auth/sessions")
      .set("Authorization", `Bearer ${signToken({ userId: 3, role: "VIEWER" })}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("All sessions revoked");
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 3 },
    });
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.refreshToken.deleteMany.mockRejectedValue(new Error("db down"));

    const res = await request(app)
      .delete("/api/auth/sessions")
      .set("Authorization", `Bearer ${signToken({ userId: 3, role: "VIEWER" })}`);

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe("Server error");
  });
});

/* =========================================================================
 * POST /api/auth/forgot-password
 * ======================================================================= */
describe("POST /api/auth/forgot-password", () => {
  it("returns the generic message without updating when the email is unknown", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "unknown@b.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("If this email exists, a reset link was sent.");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("stores a reset token and returns the same generic message for a known email", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 1, email: "a@b.com" });
    prismaMock.user.update.mockResolvedValue({});

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "a@b.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("If this email exists, a reset link was sent.");
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { email: "a@b.com" },
      data: expect.objectContaining({
        resetPasswordToken: expect.any(String),
        resetPasswordExpiry: expect.any(Date),
      }),
    });
  });

  it("returns an identical 200 body whether or not the email exists (no enumeration)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const unknown = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "ghost@b.com" });

    prismaMock.user.findUnique.mockResolvedValue({ id: 1, email: "a@b.com" });
    prismaMock.user.update.mockResolvedValue({});
    const known = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "a@b.com" });

    expect(unknown.status).toBe(200);
    expect(known.status).toBe(200);
    // The per-request `requestId` differs by design; the rest of the enveloped
    // body must be identical so existence can't be inferred (no enumeration).
    const { requestId: _unknownReqId, ...unknownRest } = unknown.body;
    const { requestId: _knownReqId, ...knownRest } = known.body;
    expect(unknownRest).toEqual(knownRest);
  });

  it("stores the sha256 HASH of the reset token, not the plaintext", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 1, email: "a@b.com" });
    prismaMock.user.update.mockResolvedValue({});

    await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "a@b.com" });

    const updateArg = prismaMock.user.update.mock.calls[0][0];
    expect(updateArg.data.resetPasswordToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.user.findUnique.mockRejectedValue(new Error("db down"));

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "a@b.com" });

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe("Server error");
  });
});

/* =========================================================================
 * POST /api/auth/reset-password
 * ======================================================================= */
describe("POST /api/auth/reset-password", () => {
  it("returns 400 when newPassword is missing", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "tok" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Password must be/);
  });

  it("returns 400 when newPassword is shorter than 8 characters", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "tok", newPassword: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Password must be/);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a Prisma-operator object token (injection) without querying", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: { not: null }, newPassword: "NewPassword1!" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Invalid or expired token");
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a missing token (undefined-filter bypass) without querying", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ newPassword: "NewPassword1!" });
    expect(res.status).toBe(400);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid or expired reset token", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "bad", newPassword: "NewPassword1!" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Invalid or expired token");
  });

  it("resets the password and clears the token on success", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 1 });
    prismaMock.user.update.mockResolvedValue({});

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "good", newPassword: "NewPassword1!" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Password reset successful");
    expect(bcrypt.hash).toHaveBeenCalledWith("NewPassword1!", 10);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        password: "hashed-pw",
        resetPasswordToken: null,
        resetPasswordExpiry: null,
        // Password reset bumps tokenVersion to invalidate live access tokens.
        tokenVersion: { increment: 1 },
      },
    });
    // All sessions revoked on reset.
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 1 },
    });
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.user.findFirst.mockRejectedValue(new Error("db down"));

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "good", newPassword: "NewPassword1!" });

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe("Server error");
  });
});

/* =========================================================================
 * GET /api/auth/verify-email
 * ======================================================================= */
describe("GET /api/auth/verify-email", () => {
  it("returns 400 for an invalid verification token", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/auth/verify-email")
      .query({ token: "bad" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Invalid verification token");
  });

  it("rejects a missing token (undefined-filter bypass) without querying", async () => {
    const res = await request(app).get("/api/auth/verify-email");
    expect(res.status).toBe(400);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it("verifies the email and clears the token on success", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 1 });
    prismaMock.user.update.mockResolvedValue({});

    const res = await request(app)
      .get("/api/auth/verify-email")
      .query({ token: "good" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Email verified successfully");
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: { emailVerifyToken: sha256("good") },
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { emailVerified: true, emailVerifyToken: null },
    });
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.user.findFirst.mockRejectedValue(new Error("db down"));

    const res = await request(app)
      .get("/api/auth/verify-email")
      .query({ token: "good" });

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe("Server error");
  });
});
