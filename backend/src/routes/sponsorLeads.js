import express from "express";
import prisma from "../prisma.js";
import { writeLimiter } from "../middleware/rateLimiter.js";
import { authenticateUser, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * GET /api/sponsor-leads
 * ADMIN-only. Lists the unscoped public "become a sponsor" leads (festId/eventId
 * null) so an organizer can actually see and follow up on them — previously these
 * rows were written by the public form but no in-app view ever surfaced them.
 */
router.get("/", authenticateUser, authorizeRoles("ADMIN"), async (req, res) => {
  try {
    const leads = await prisma.sponsor.findMany({
      where: { festId: null, eventId: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        companyName: true,
        contactPerson: true,
        email: true,
        phone: true,
        notes: true,
        status: true,
        createdAt: true,
      },
    });
    return res.json({ success: true, data: leads });
  } catch (err) {
    console.error("Sponsor lead list error:", err);
    return res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: "Internal server error" },
    });
  }
});

/**
 * POST /api/sponsor-leads
 * PUBLIC inbound lead from the "become a sponsor" form. Creates an unscoped
 * Sponsor row (festId/eventId null) in the NEGOTIATING stage so an organizer
 * can follow up. Rate-limited via writeLimiter.
 *
 * Body: { companyName, contactPerson, email?, phone?, message? }
 */
router.post("/", writeLimiter, async (req, res) => {
  try {
    const { companyName, contactPerson, email, phone, message } = req.body || {};

    const company = typeof companyName === "string" ? companyName.trim() : "";
    const contact = typeof contactPerson === "string" ? contactPerson.trim() : "";

    if (!company || !contact) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "companyName and contactPerson are required.",
        },
      });
    }

    await prisma.sponsor.create({
      data: {
        companyName: company,
        contactPerson: contact,
        email: email || null,
        phone: phone || null,
        notes: message || null,
        festId: null,
        eventId: null,
        // Schema requires sponsorshipAmount (Float, no default); a public lead
        // has no committed amount yet, so seed it at 0.
        sponsorshipAmount: 0,
        status: "NEGOTIATING",
      },
    });

    return res.status(201).json({
      success: true,
      message: "Thanks — we will be in touch.",
    });
  } catch (err) {
    console.error("Sponsor lead create error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "Internal server error",
      },
    });
  }
});

export default router;
