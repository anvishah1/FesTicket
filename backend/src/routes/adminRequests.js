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
      return res.fail(400, "VALIDATION_ERROR", "Email is required.");
    }
    if (!festName || typeof festName !== "string" || !festName.trim()) {
      return res.fail(400, "VALIDATION_ERROR", "Fest name is required.");
    }
    const existing = await prisma.adminRequest.findFirst({
      where: { email: email.trim(), status: "PENDING" },
    });
    if (existing) {
      return res.fail(409, "CONFLICT", "You already have a pending admin request.");
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
    req.log.info({ adminRequestId: request.id, email: request.email }, "[admin-requests] Created request");
    res.ok(
      { id: request.id },
      { status: 201, message: "Request received. You will be set up with credentials after verification." }
    );
  } catch (err) {
    req.log.error({ err }, "Admin request create error");
    res.fail(500, "SERVER_ERROR", "Server error");
  }
});

export default router;
