import express from "express";
import prisma from "../prisma.js";
import { authenticateUser } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";
import { completeProfileSchema } from "../validators/userValidator.js";

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
      return res.status(404).json({
        message: "User not found"
      });
    }

    // The adminKey is a shared onboarding secret. Only surface managedFest (which
    // carries it) to the ADMIN who owns that fest — never to any other role.
    if (user.role !== "ADMIN") {
      delete user.managedFest;
    }

    // NOTE: managedFestId is returned exactly as stored. We intentionally do NOT
    // re-grant it from an approved AdminRequest when null — that self-heal
    // silently re-granted admin access and defeated admin revocation.
    res.json(user);

  } catch (error) {

    req.log.error({ err: error }, "Get user error");

    res.status(500).json({
      message: "Server error"
    });

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

    res.json(user);
  } catch (error) {
    req.log.error({ err: error }, "Complete profile error");
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
