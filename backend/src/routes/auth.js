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
import { sendVerificationEmail, sendPasswordResetEmail, sendMagicLink, isMailConfigured } from "../utils/email.js";
import { OAuth2Client } from "google-auth-library";

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
 * AUTH-05: lazily build the Google ID-token verifier. Returns null when
 * GOOGLE_CLIENT_ID is unset so /api/auth/google can 503 gracefully (mirrors the
 * Razorpay-optional pattern). Exposed for tests to mock the verify call.
 */
let _googleClient = null;
export function getGoogleClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return null;
  if (!_googleClient) _googleClient = new OAuth2Client(clientId);
  return _googleClient;
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

/*
 * Issue the standard access + refresh token pair for `user` and respond with the
 * signin-shaped body. Shared by /signin, /magic-link/verify (AUTH-06), and
 * /google (AUTH-05) so they all produce an identical session.
 */
async function issueSession(user, req, res, message = "Signin successful") {
  const accessToken = jwt.sign(
    { userId: user.id, role: user.role, tokenVersion: user.tokenVersion ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
  const refreshToken = crypto.randomBytes(40).toString("hex");
  await prisma.refreshToken.create({
    data: {
      token: hashToken(refreshToken),
      userId: user.id,
      familyId: crypto.randomUUID(),
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  await cleanupRefreshTokens(user.id);
  return res.ok(
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
      },
    },
    { message }
  );
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

    // AUTH-01: enforce email verification ONLY when a mail provider is configured
    // (so we can actually deliver the link). With SMTP unset, keep the previous
    // auto-verify behaviour so local dev / E2E keep working unchanged.
    const verificationOn = isMailConfigured();

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        organizationName: organizationName || null,
        emailVerifyToken: hashToken(verifyToken),
        emailVerified: !verificationOn
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

    // AUTH-01: when verification is on, e-mail the verify link (to the frontend
    // /verify page, which calls /api/auth/verify-email). Non-blocking — a mail
    // failure must never fail signup.
    if (verificationOn) {
      const verifyLink =
        `${process.env.FRONTEND_URL || "http://localhost:3000"}/verify?token=${verifyToken}`;
      sendVerificationEmail({ to: user.email, name: user.name, verifyLink }).catch((err) =>
        req.log.error({ err }, "[auth] verification email failed")
      );
    }

    res.ok(
      { userId: user.id, createdRoleRequest: wantEditor, emailVerified: user.emailVerified },
      {
        status: 201,
        message: verificationOn
          ? "Signup successful. Please check your email to verify your account."
          : "Signup successful. You can sign in.",
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
      // AUTH-09: surface the lock expiry so the client can show a live countdown
      // and a self-service recovery CTA.
      const retryAfterSeconds = Math.max(0, Math.ceil((user.lockUntil.getTime() - Date.now()) / 1000));
      return res.fail(403, "ACCOUNT_LOCKED", "Account locked. Try again later.", {
        lockUntil: user.lockUntil.toISOString(),
        retryAfterSeconds,
      });
    }

    /* Email verification is not required for signin */
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {

      const attempts = user.failedLoginAttempts + 1;

      if (attempts >= 5) {

        const lockUntil = new Date(Date.now() + 15 * 60 * 1000);

        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockUntil
          }
        });

        // AUTH-09: return lockUntil + retryAfterSeconds so the just-locked form can
        // start its countdown immediately.
        return res.fail(
          403,
          "ACCOUNT_LOCKED",
          "Too many failed attempts. Account locked for 15 minutes.",
          { lockUntil: lockUntil.toISOString(), retryAfterSeconds: 15 * 60 }
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

    // AUTH-01: when verification is enforced (a mail provider is configured), block
    // sign-in for an unverified account. Checked AFTER the password match so a
    // wrong-password attempt never learns the verification status. Guarded by
    // `=== false` + isMailConfigured() so dev/E2E (SMTP unset, no emailVerified
    // flag) are unaffected.
    if (isMailConfigured() && user.emailVerified === false) {
      return res.fail(
        403,
        "EMAIL_NOT_VERIFIED",
        "Please verify your email before signing in. Check your inbox for the verification link."
      );
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

    // AUTH-01: send the branded reset email (non-blocking). The response stays the
    // same generic message regardless, to avoid leaking whether the email exists.
    sendPasswordResetEmail({ to: user.email, name: user.name, resetLink }).catch((err) =>
      req.log.error({ err }, "[auth] reset email failed")
    );

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
        // A completed reset proves control of the mailbox (the link could only
        // arrive there), exactly like clicking the verify link — so mark the email
        // verified. Without this, the AUTH-01 signin gate would block an unverified
        // user who successfully reset their password (adversarial-review P2).
        emailVerified: true,
        emailVerifyToken: null,
        // AUTH-09: a completed reset clears an active lock so recovery actually
        // unlocks the account (previously the lock outlived the reset).
        failedLoginAttempts: 0,
        lockUntil: null,
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

/* ================= AUTH-05: GOOGLE SIGN-IN ================= */

// POST /api/auth/google { idToken } — verify a Google ID token server-side, find
// or create the user by stable googleId (or link a verified email), and issue the
// normal session. 503 when GOOGLE_CLIENT_ID is unset (graceful).
router.post("/google", loginLimiter, async (req, res) => {
  try {
    const client = getGoogleClient();
    if (!client) return res.fail(503, "GOOGLE_DISABLED", "Google sign-in is not configured");

    const { idToken } = req.body || {};
    if (typeof idToken !== "string" || !idToken) {
      return res.fail(400, "VALIDATION_ERROR", "idToken is required");
    }

    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch {
      return res.fail(401, "GOOGLE_INVALID", "Could not verify Google sign-in");
    }
    // A Google account whose email isn't verified must not be trusted for linking.
    if (!payload?.sub || !payload.email || payload.email_verified === false) {
      return res.fail(401, "GOOGLE_INVALID", "Google account email is not verified");
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase();

    // Prefer the stable googleId; fall back to a verified-email match to LINK an
    // existing (possibly password) account — safe because Google asserted the
    // email is verified (proves mailbox control, like a password reset).
    let user =
      (await prisma.user.findFirst({ where: { googleId, deletedAt: null } })) ||
      (await prisma.user.findFirst({ where: { email, deletedAt: null } }));

    if (user) {
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId, emailVerified: true, avatarUrl: user.avatarUrl || payload.picture || null },
        });
      }
    } else {
      user = await prisma.user.create({
        data: {
          email,
          password: null,
          name: payload.name || null,
          googleId,
          emailVerified: true,
          avatarUrl: payload.picture || null,
        },
      });
    }

    return await issueSession(user, req, res, "Signed in with Google");
  } catch (err) {
    req.log.error({ err }, "Google sign-in error");
    return res.fail(500, "SERVER_ERROR", "Server error");
  }
});

/* ================= AUTH-06: MAGIC-LINK (PASSWORDLESS) ================= */

// POST /api/auth/magic-link { email } — enumeration-safe: ALWAYS returns the
// same generic 200. When the email maps to a live account, stores a hashed,
// single-use, 15-min token and emails the link. With SMTP unset the link is
// logged in dev (graceful), mirroring forgot-password.
router.post("/magic-link", writeLimiter, async (req, res) => {
  const GENERIC = { message: "If this email exists, a sign-in link was sent." };
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!email) return res.ok(null, GENERIC);

    const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
    if (user) {
      const raw = crypto.randomBytes(32).toString("hex");
      await prisma.magicLinkToken.create({
        data: { token: hashToken(raw), userId: user.id, expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
      });
      const base = process.env.FRONTEND_URL || "http://localhost:3000";
      const link = `${base}/auth/magic?token=${raw}`;
      if (isMailConfigured()) {
        sendMagicLink({ to: user.email, name: user.name, link }).catch((err) =>
          req.log.error({ err }, "[auth] magic-link email failed")
        );
      } else {
        req.log.info({ link }, "[auth] magic-link (dev, SMTP unset)");
      }
    }
    return res.ok(null, GENERIC);
  } catch (err) {
    req.log.error({ err }, "magic-link request error");
    // Still generic — never leak whether the email exists.
    return res.ok(null, GENERIC);
  }
});

// POST /api/auth/magic-link/verify { token } — consume a single-use token and
// issue the normal session. Guards typeof token === "string" (like reset) so a
// Prisma filter-object can't match an arbitrary row.
router.post("/magic-link/verify", async (req, res) => {
  try {
    const { token } = req.body || {};
    if (typeof token !== "string" || token.length < 1) {
      return res.fail(400, "INVALID_TOKEN", "Invalid or expired link");
    }
    const record = await prisma.magicLinkToken.findFirst({
      where: { token: hashToken(token), usedAt: null, expiresAt: { gte: new Date() } },
    });
    if (!record) return res.fail(400, "INVALID_TOKEN", "Invalid or expired link");

    // Consume it (single-use) BEFORE issuing the session.
    const consumed = await prisma.magicLinkToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) return res.fail(400, "INVALID_TOKEN", "Invalid or expired link");

    const user = await prisma.user.findFirst({ where: { id: record.userId, deletedAt: null } });
    if (!user) return res.fail(400, "INVALID_TOKEN", "Invalid or expired link");

    return await issueSession(user, req, res, "Signed in");
  } catch (err) {
    req.log.error({ err }, "magic-link verify error");
    return res.fail(500, "SERVER_ERROR", "Server error");
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

/* ================= RESEND VERIFICATION ================= */
// AUTH-01: enumeration-safe — always returns the same generic 200. Only actually
// regenerates the token + re-sends when the user exists, is unverified, and mail
// is configured.
router.post("/resend-verification", writeLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (typeof email === "string" && email && isMailConfigured()) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user && !user.emailVerified) {
        const verifyToken = crypto.randomBytes(32).toString("hex");
        await prisma.user.update({
          where: { id: user.id },
          data: { emailVerifyToken: hashToken(verifyToken) },
        });
        const verifyLink = `${process.env.FRONTEND_URL || "http://localhost:3000"}/verify?token=${verifyToken}`;
        sendVerificationEmail({ to: user.email, name: user.name, verifyLink }).catch((err) =>
          req.log.error({ err }, "[auth] resend verification email failed")
        );
      }
    }
    res.ok(null, { message: "If your account needs verification, a new link was sent." });
  } catch (error) {
    req.log.error({ err: error }, "Resend verification error");
    res.fail(500, "SERVER_ERROR", "Server error");
  }
});

/* ================= CHANGE PASSWORD (authenticated) ================= */
// AUTH-04: verify the current password, enforce the full complexity policy, then
// rotate — bump tokenVersion and delete all refresh tokens so EVERY session
// (including the caller's) is revoked and must sign in again.
router.post("/change-password", authenticateUser, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return res.fail(400, "VALIDATION_ERROR", "currentPassword and newPassword are required");
    }
    if (newPassword.length < 8 || newPassword.length > 30) {
      return res.fail(400, "VALIDATION_ERROR", "Password must be 8–30 characters");
    }
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

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user || !user.password || !(await bcrypt.compare(currentPassword, user.password))) {
      return res.fail(400, "INVALID_CREDENTIALS", "Current password is incorrect");
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, tokenVersion: { increment: 1 } },
    });
    // Revoke every session (mirrors reset-password) so old tokens stop working.
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    res.ok(null, { message: "Password changed. Please sign in again." });
  } catch (error) {
    req.log.error({ err: error }, "Change password error");
    res.fail(500, "SERVER_ERROR", "Server error");
  }
});

export default router;
