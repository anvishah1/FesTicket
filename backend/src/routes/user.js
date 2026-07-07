import express from "express";
import prisma from "../prisma.js";
import { authenticateUser } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";
import { completeProfileSchema, updateProfileSchema } from "../validators/userValidator.js";

const router = express.Router();

/*
GET CURRENT USER
*/
router.get("/me", authenticateUser, async (req, res) => {
  try {

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        profileCompleted: true,
        emailVerified: true,
        twoFactorEnabled: true, // AUTH-08
        createdAt: true,
        managedFestId: true,
        editorFestId: true,
        // Owner-only fest key: the ADMIN who manages a fest needs its adminKey
        // (the string students type at signup). Exposed ONLY to that owner below.
        managedFest: {
          select: { id: true, name: true, adminKey: true },
        },
      }
    });

    if (!user) {
      return res.fail(404, "NOT_FOUND", "User not found");
    }

    // The adminKey is a shared onboarding secret. Only surface managedFest (which
    // carries it) to the ADMIN who owns that fest — never to any other role.
    if (user.role !== "ADMIN") {
      delete user.managedFest;
    }

    // NOTE: managedFestId is returned exactly as stored. We intentionally do NOT
    // re-grant it from an approved AdminRequest when null — that self-heal
    // silently re-granted admin access and defeated admin revocation.
    res.ok(user);

  } catch (error) {

    req.log.error({ err: error }, "Get user error");

    res.fail(500, "SERVER_ERROR", "Server error");

  }
});

/*
COMPLETE PROFILE
Called by the root-layout "Basic Profile" modal. Persists the basic details and
flips profileCompleted so the modal stops showing.
*/
router.post("/complete-profile", authenticateUser, validate(completeProfileSchema), async (req, res) => {
  try {
    const { firstName, lastName, organiserName, phone } = req.body || {};

    const name = [firstName, lastName].filter(Boolean).join(" ").trim();

    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: {
        name: name || undefined,
        phone: phone || undefined,
        organizationName: organiserName || undefined,
        profileCompleted: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        organizationName: true,
        role: true,
        profileCompleted: true,
      },
    });

    res.ok(user);
  } catch (error) {
    req.log.error({ err: error }, "Complete profile error");
    res.fail(500, "SERVER_ERROR", "Server error");
  }
});

/*
AUTH-04: EDIT PROFILE (name / phone / organizationName). Only the provided fields
are changed. Distinct from complete-profile (which also flips profileCompleted).
*/
router.patch("/me", authenticateUser, validate(updateProfileSchema), async (req, res) => {
  try {
    const { name, phone, organizationName } = req.body || {};
    const data = {};
    if (name !== undefined) data.name = name || null;
    if (phone !== undefined) data.phone = phone || null;
    if (organizationName !== undefined) data.organizationName = organizationName || null;

    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data,
      select: {
        id: true, email: true, name: true, phone: true, organizationName: true,
        role: true, profileCompleted: true,
      },
    });
    res.ok(user);
  } catch (error) {
    req.log.error({ err: error }, "Update profile error");
    res.fail(500, "SERVER_ERROR", "Server error");
  }
});

/*
AUTH-04: DELETE ACCOUNT (soft delete). Requires the caller to type their exact
email in `confirmEmail`. Blocked for an ADMIN who still manages a fest or a
host/editor who still owns events (they must reassign first) so we never orphan a
non-cascading FK. On success: set deletedAt, scrub PII, anonymise the email (frees
the address + makes the account unfindable by signin), revoke tokens, bump
tokenVersion.
*/
router.delete("/me", authenticateUser, async (req, res) => {
  try {
    const { confirmEmail } = req.body || {};
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, email: true, role: true, managedFestId: true },
    });
    if (!user) return res.fail(404, "NOT_FOUND", "User not found");

    if (typeof confirmEmail !== "string" || confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      return res.fail(400, "CONFIRM_MISMATCH", "Type your exact account email to confirm deletion");
    }

    // Guard non-cascading ownership: an ADMIN managing a fest, or anyone who still
    // hosts events, must hand those off before deleting (avoids orphaned FKs).
    if (user.role === "ADMIN" && user.managedFestId != null) {
      return res.fail(409, "OWNS_FEST", "Transfer or delete your fest before deleting your account.");
    }
    const hostedCount = await prisma.event.count({ where: { hostId: user.id } });
    if (hostedCount > 0) {
      return res.fail(409, "OWNS_EVENTS", "Reassign or delete your events before deleting your account.");
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          deletedAt: new Date(),
          // Scrub PII + anonymise the email so it's freed and unfindable by signin.
          email: `deleted+${user.id}@deleted.tiqr`,
          name: null,
          phone: null,
          organizationName: null,
          organizationEmail: null,
          password: null,
          emailVerifyToken: null,
          resetPasswordToken: null,
          tokenVersion: { increment: 1 },
        },
      }),
      prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
    ]);

    res.ok(null, { message: "Your account has been deleted." });
  } catch (error) {
    req.log.error({ err: error }, "Delete account error");
    res.fail(500, "SERVER_ERROR", "Server error");
  }
});

export default router;
