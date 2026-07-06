import express from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";
import { authenticateUser } from "../middleware/authMiddleware.js";

import { signupSchema, signinSchema } from "../validators/authValidator.js";
import { validate } from "../middleware/validate.js";
import { loginLimiter, signupLimiter, writeLimiter } from "../middleware/rateLimiter.js";
import { verifyCaptcha } from "../utils/captcha.js";

const router = express.Router();

/*
 * Tokens (refresh, password-reset, email-verify) are stored HASHED at rest so a
 * DB read can't be replayed as a live credential. The client always receives the
 * plaintext; we persist only sha256(plaintext) and look up by the same hash.
 */
function hashToken(t) {
  return crypto.createHash("sha256").update(String(t)).digest("hex");
}

/*
 * Fixed bcrypt hash used to burn a comparable amount of CPU when an email is not
 * found, so sign-in response time doesn't reveal whether an account exists.
 */
const DUMMY_PASSWORD_HASH =
  "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

/*
 * Cap live refresh tokens per user and prune expired ones. Best-effort: any
 * failure here must never block issuing a token.
 */
const MAX_REFRESH_TOKENS_PER_USER = 5;

async function cleanupRefreshTokens(userId) {
  try {
    // Purge expired rows AND expired revoked tombstones so they can't
    // accumulate unbounded. A revoked tombstone is only useful for replay
    // detection until its original expiry, after which a replay is rejected as
    // an unknown token anyway.
    await prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } }
    });

    const live = (await prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true }
    })) || [];

    if (live.length > MAX_REFRESH_TOKENS_PER_USER) {
      const stale = live.slice(MAX_REFRESH_TOKENS_PER_USER).map((t) => t.id);
      await prisma.refreshToken.deleteMany({
        where: { id: { in: stale } }
      });
    }
  } catch (err) {
    logger.error({ err }, "[auth] refresh token cleanup failed");
  }
}

/* ================= SIGNUP ================= */
router.post("/signup", signupLimiter, validate(signupSchema), async (req, res) => {

  try {

    // CAPTCHA gate (graceful no-op when CAPTCHA_SECRET is unset).
    if (!(await verifyCaptcha(req.body.captchaToken, req.ip))) {
      return res.fail(400, "CAPTCHA_FAILED", "Captcha verification failed");
    }

    const {
      email,
      password,
      name,
      wantsEditor,
      festKey,
      organizationName
    } = req.body;

    const wantEditor = wantsEditor === true || wantsEditor === "true";

    if (wantEditor && (!festKey || String(festKey).trim() === "")) {
      return res.fail(
        400,
        "VALIDATION_ERROR",
        "Fest key is required when requesting editor access.",
        { festKey: "Enter the key provided by your fest admin." }
      );
    }

    let festForRequest = null;
    if (wantEditor) {
      const key = String(festKey).trim();
      festForRequest = await prisma.fest.findFirst({
        where: { adminKey: key }
      });
      if (!festForRequest) {
        return res.fail(
          400,
          "VALIDATION_ERROR",
          "Invalid fest key. Check the key with your fest admin.",
          { festKey: "No fest found for this key." }
        );
      }
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.fail(409, "CONFLICT", "User already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const verifyToken = crypto.randomBytes(32).toString("hex");

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        organizationName: organizationName || null,
        emailVerifyToken: hashToken(verifyToken),
        emailVerified: true
      }
    });

    req.log.info({ userId: user.id, email: user.email }, "[auth] Created user");

    if (wantEditor && festForRequest) {
      const roleRequest = await prisma.roleRequest.create({
        data: {
          userId: user.id,
          festId: festForRequest.id,
          requestedRole: "EDITOR",
          organization: festForRequest.name
        }
      });

      req.log.info(
        {
          roleRequestId: roleRequest.id,
          email: user.email,
          festId: festForRequest.id,
          festName: festForRequest.name,
        },
        "[auth] Created RoleRequest"
      );
    }

    if (process.env.NODE_ENV !== "development") {
      const verifyLink =
        `${process.env.BACKEND_URL || "http://localhost:4000"}/api/auth/verify-email?token=${verifyToken}`;
      req.log.info({ verifyLink }, "Email verification link");
    }

    res.ok(
      { userId: user.id, createdRoleRequest: wantEditor },
      {
        status: 201,
        message: process.env.NODE_ENV === "development"
          ? "Signup successful. You can sign in."
          : "Signup successful. Please verify your email.",
      }
    );

  } catch (error) {

    req.log.error({ err: error }, "Signup error");

    res.fail(500, "SERVER_ERROR", "Internal server error");

  }

});


/* ================= SIGNIN ================= */
router.post("/signin", loginLimiter, validate(signinSchema), async (req, res) => {

  try {

    const { email, password } = req.body;

    // CAPTCHA gate BEFORE any password/lockout logic: without this an attacker
    // could weaponise the failed-attempt lockout to DoS an account. Graceful
    // no-op when CAPTCHA_SECRET is unset.
    if (!(await verifyCaptcha(req.body.captchaToken, req.ip))) {
      return res.fail(400, "CAPTCHA_FAILED", "Captcha verification failed");
    }

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user || !user.password) {
      // Constant-time guard: run a dummy bcrypt compare so an unknown email
      // takes roughly the same time as a wrong password, and return the SAME
      // generic message so timing/wording can't be used to enumerate accounts.
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      return res.fail(401, "INVALID_CREDENTIALS", "Invalid credentials");
    }

    /* ACCOUNT LOCK CHECK */
    if (user.lockUntil && user.lockUntil > new Date()) {
      return res.fail(403, "ACCOUNT_LOCKED", "Account locked. Try again later.");
    }

    /* Email verification is not required for signin */
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {

      const attempts = user.failedLoginAttempts + 1;

      if (attempts >= 5) {

        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockUntil: new Date(Date.now() + 15 * 60 * 1000)
          }
        });

        return res.fail(
          403,
          "ACCOUNT_LOCKED",
          "Too many failed attempts. Account locked for 15 minutes."
        );

      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts
        }
      });

      return res.fail(401, "INVALID_CREDENTIALS", "Invalid credentials");

    }

    /* SUCCESSFUL LOGIN RESET */
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockUntil: null,
        lastLogin: new Date()
      }
    });

    /* ACCESS TOKEN — carries tokenVersion so a later password/role change can
       invalidate this token without a per-request DB lookup. */
    const accessToken = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        tokenVersion: user.tokenVersion ?? 0
      },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    /* REFRESH TOKEN (plaintext to client, hash at rest). A fresh login starts a
       NEW family lineage; rotations inherit this familyId for replay detection. */
    const refreshToken = crypto.randomBytes(40).toString("hex");

    await prisma.refreshToken.create({
      data: {
        token: hashToken(refreshToken),
        userId: user.id,
        familyId: crypto.randomUUID(),
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    await cleanupRefreshTokens(user.id);

    res.ok(
      {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          role: user.role,
          profileCompleted: user.profileCompleted,
          editorFestId: user.editorFestId ?? null,
          managedFestId: user.managedFestId ?? null,
        }
      },
      { message: "Signin successful" }
    );

  } catch (error) {

    req.log.error({ err: error }, "Signin error");

    res.fail(500, "SERVER_ERROR", "Internal server error");

  }

});


/* ================= REFRESH TOKEN ================= */
router.post("/refresh-token", async (req, res) => {

  try {

    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.fail(401, "TOKEN_REQUIRED", "Refresh token required");
    }

    const hashedToken = hashToken(refreshToken);

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: hashedToken }
    });

    if (!storedToken) {
      return res.fail(401, "INVALID_TOKEN", "Invalid refresh token");
    }

    // REPLAY DETECTION: a match on an already-revoked tombstone means a rotated
    // (superseded) token is being presented again -> the whole lineage is
    // compromised. Revoke the entire family and reject.
    if (storedToken.revokedAt) {
      await prisma.refreshToken.deleteMany(
        storedToken.familyId
          ? { where: { familyId: storedToken.familyId } }
          : { where: { id: storedToken.id } }
      );
      return res.fail(401, "TOKEN_REUSE_DETECTED", "Refresh token reuse detected");
    }

    if (storedToken.expiresAt < new Date()) {

      await prisma.refreshToken.delete({
        where: { token: hashedToken }
      });

      return res.fail(403, "TOKEN_EXPIRED", "Refresh token expired");

    }

    const user = await prisma.user.findUnique({
      where: { id: storedToken.userId }
    });

    if (!user) {
      return res.fail(403, "INVALID_TOKEN", "Invalid token user");
    }

    /* ROTATION: mark the presented token as a revoked tombstone (kept so a
       later replay is caught) and mint a new token that INHERITS the family. */
    await prisma.refreshToken.update({
      where: { token: hashedToken },
      data: { revokedAt: new Date() }
    });

    const newRefreshToken = crypto.randomBytes(40).toString("hex");

    await prisma.refreshToken.create({
      data: {
        token: hashToken(newRefreshToken),
        userId: user.id,
        familyId: storedToken.familyId ?? crypto.randomUUID(),
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    await cleanupRefreshTokens(user.id);

    /* Re-sign with the CURRENT role + tokenVersion so a refreshed access token
       always reflects the live role (and clears once a bump has occurred). */
    const accessToken = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        tokenVersion: user.tokenVersion ?? 0
      },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    res.ok({
      accessToken,
      refreshToken: newRefreshToken
    });

  } catch (error) {

    req.log.error({ err: error }, "Refresh token error");

    res.fail(500, "SERVER_ERROR", "Server error");

  }

});


/* ================= LOGOUT ================= */
router.post("/logout", async (req, res) => {

  try {

    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.fail(400, "TOKEN_REQUIRED", "Refresh token required");
    }

    await prisma.refreshToken.deleteMany({
      where: { token: hashToken(refreshToken) }
    });

    // Opportunistically purge expired rows / tombstones so they don't
    // accumulate unbounded.
    await prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });

    res.ok(null, { message: "Logged out successfully" });

  } catch (error) {

    req.log.error({ err: error }, "Logout error");

    res.fail(500, "SERVER_ERROR", "Server error");

  }

});

router.get("/sessions", authenticateUser, async (req, res) => {

  try {

    // Never expose the raw refresh-token secret; return only session metadata.
    const sessions = await prisma.refreshToken.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    res.ok(sessions);

  } catch (error) {

    req.log.error({ err: error }, "Session fetch error");

    res.fail(500, "SERVER_ERROR", "Server error");

  }

});

router.delete("/sessions/:id", authenticateUser, async (req, res) => {

  try {

    const { id } = req.params;

    await prisma.refreshToken.deleteMany({
      where: {
        id: Number(id),
        userId: req.user.userId
      }
    });

    res.ok(null, { message: "Session revoked" });

  } catch (error) {

    req.log.error({ err: error }, "Session delete error");

    res.fail(500, "SERVER_ERROR", "Server error");

  }

});

router.delete("/sessions", authenticateUser, async (req, res) => {

  try {

    await prisma.refreshToken.deleteMany({
      where: {
        userId: req.user.userId
      }
    });

    res.ok(null, { message: "All sessions revoked" });

  } catch (error) {

    req.log.error({ err: error }, "Session clear error");

    res.fail(500, "SERVER_ERROR", "Server error");

  }

});

/* ================= FORGOT PASSWORD ================= */
router.post("/forgot-password", writeLimiter, async (req, res) => {

  try {

    const { email } = req.body;

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.ok(null, {
        message: "If this email exists, a reset link was sent."
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");

    const expiry = new Date(Date.now() + 1000 * 60 * 30);

    await prisma.user.update({
      where: { email },
      data: {
        resetPasswordToken: hashToken(resetToken),
        resetPasswordExpiry: expiry
      }
    });

    const resetLink =
      `${process.env.FRONTEND_URL || "http://localhost:3000"}/reset?token=${resetToken}`;

    req.log.info({ resetLink }, "Password reset link");

    res.ok(null, {
      message: "If this email exists, a reset link was sent."
    });

  } catch (err) {

    req.log.error({ err }, "Forgot password error");

    res.fail(500, "SERVER_ERROR", "Server error");

  }

});


/* ================= RESET PASSWORD ================= */
router.post("/reset-password", async (req, res) => {

  try {

    const { token, newPassword } = req.body;

    // Token MUST be a non-empty string. Without this guard, Express/qs lets an
    // attacker pass a Prisma filter object (e.g. {"not":null}) or omit the token
    // entirely (undefined => Prisma drops the filter), matching an arbitrary
    // user's reset row and taking over the account without the token.
    if (typeof token !== "string" || token.length < 1) {
      return res.fail(400, "INVALID_TOKEN", "Invalid or expired token");
    }

    if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 30) {
      return res.fail(400, "VALIDATION_ERROR", "Password must be 8–30 characters");
    }

    // Enforce the SAME complexity rules as signup — previously reset-password only
    // checked length, so it accepted weak passwords that signup would reject.
    const complexity = [
      [/[A-Z]/, "an uppercase letter"],
      [/[a-z]/, "a lowercase letter"],
      [/[0-9]/, "a number"],
      [/[^A-Za-z0-9]/, "a special character"],
    ];
    for (const [re, label] of complexity) {
      if (!re.test(newPassword)) {
        return res.fail(400, "VALIDATION_ERROR", `Password must contain ${label}`);
      }
    }

    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: hashToken(token),
        resetPasswordExpiry: {
          gte: new Date()
        }
      }
    });

    if (!user) {
      return res.fail(400, "INVALID_TOKEN", "Invalid or expired token");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpiry: null,
        // Bump tokenVersion so any live access token minted before the reset is
        // rejected (see authMiddleware / refresh re-sign).
        tokenVersion: { increment: 1 }
      }
    });

    // Revoke all existing sessions so a compromised account cannot stay logged in
    // after a password reset.
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    res.ok(null, { message: "Password reset successful" });

  } catch (err) {

    req.log.error({ err }, "Reset password error");

    res.fail(500, "SERVER_ERROR", "Server error");

  }

});


/* ================= VERIFY EMAIL ================= */
router.get("/verify-email", async (req, res) => {

  try {

    const { token } = req.query;

    // Guard against a non-string token (?token[not]=null => object) or a missing
    // token (undefined => Prisma drops the filter and verifies an arbitrary user).
    if (typeof token !== "string" || !token) {
      return res.fail(400, "INVALID_TOKEN", "Invalid verification token");
    }

    const user = await prisma.user.findFirst({
      where: {
        emailVerifyToken: hashToken(token)
      }
    });

    if (!user) {
      return res.fail(400, "INVALID_TOKEN", "Invalid verification token");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifyToken: null
      }
    });

    res.ok(null, { message: "Email verified successfully" });

  } catch (error) {

    req.log.error({ err: error }, "Email verification error");

    res.fail(500, "SERVER_ERROR", "Server error");

  }

});

export default router;
