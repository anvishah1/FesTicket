import express from "express";
import prisma from "../prisma.js";
import { writeLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

/**
 * POST /api/admin-requests
 * Professor (or anyone) requests admin access. Creates a PENDING entry.
 * You verify manually and then run: node src/scripts/approveAdminRequest.js <id> <email> <password> <festId> <key>
 */
router.post("/", writeLimiter, async (req, res) => {
  try {
    const { email, name, organization, festName, phone } = req.body || {};
    if (!email || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ message: "Email is required." });
    }
    if (!festName || typeof festName !== "string" || !festName.trim()) {
      return res.status(400).json({ message: "Fest name is required." });
    }
    const existing = await prisma.adminRequest.findFirst({
      where: { email: email.trim(), status: "PENDING" },
    });
    if (existing) {
      return res.status(409).json({
        message: "You already have a pending admin request.",
      });
    }
    const request = await prisma.adminRequest.create({
      data: {
        email: email.trim(),
        name: name?.trim() || null,
        organization: organization?.trim() || null,
        festName: festName?.trim() || null,
        phone: phone?.trim() || null,
      },
    });
    console.log("[admin-requests] Created request id:", request.id, "email:", request.email);
    res.status(201).json({
      message: "Request received. You will be set up with credentials after verification.",
      id: request.id,
    });
  } catch (err) {
    console.error("Admin request create error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
