import express from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateUser, authorizeRoles } from "../middleware/authMiddleware.js";

const prisma = new PrismaClient();
const router = express.Router();

const VALID_ROLES = ["VIEWER", "EDITOR", "HOST", "ADMIN"];
const VALID_STATUSES = ["PENDING", "APPROVED", "DENIED"];

/* ================= LIST (admin only; only requests for their fest) ================= */
router.get(
  "/",
  authenticateUser,
  authorizeRoles("ADMIN"),
  async (req, res) => {
    try {
      const adminUser = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { managedFestId: true },
      });
      const managedFestId = adminUser?.managedFestId ?? null;

      const onlyPending = req.query.status !== "all";
      const where = {
        ...(onlyPending ? { status: "PENDING" } : {}),
        ...(managedFestId != null ? { festId: managedFestId } : {}),
      };

      const requests = await prisma.roleRequest.findMany({
        where,
        orderBy: { requestDate: "desc" },
        include: {
          user: { select: { id: true, email: true, name: true } },
          fest: { select: { id: true, name: true } },
        },
      });

      res.json(
        requests.map((r) => ({
          id: r.id,
          userId: r.userId,
          festId: r.festId,
          festName: r.fest?.name ?? r.organization,
          studentName: r.user.name || r.user.email,
          email: r.user.email,
          organization: r.organization,
          requestedRole: r.requestedRole,
          requestDate: r.requestDate,
          status: r.status,
        }))
      );
    } catch (err) {
      console.error("Role requests list error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ================= CREATE (authenticated user) ================= */
router.post("/", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { organization, requestedRole } = req.body || {};
    const role = requestedRole === "EDITOR" || requestedRole === "HOST"
      ? requestedRole
      : "EDITOR";
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: "Invalid requestedRole" });
    }
    const existing = await prisma.roleRequest.findFirst({
      where: { userId, status: "PENDING" },
    });
    if (existing) {
      return res.status(409).json({
        message: "You already have a pending role request",
        requestId: existing.id,
      });
    }
    const created = await prisma.roleRequest.create({
      data: {
        userId,
        requestedRole: role,
        organization: organization || null,
      },
      include: {
        user: { select: { email: true, name: true } },
      },
    });
    console.log("[role-requests] Created request id:", created.id, "user:", created.user.email);
    res.status(201).json({
      message: "Role request submitted",
      id: created.id,
      status: created.status,
    });
  } catch (err) {
    console.error("Role request create error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ================= APPROVE / DENY (admin only) ================= */
router.patch(
  "/:id",
  authenticateUser,
  authorizeRoles("ADMIN"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body || {};
      if (!VALID_STATUSES.includes(status) || status === "PENDING") {
        return res.status(400).json({ message: "Body must include status: APPROVED or DENIED" });
      }
      const roleRequest = await prisma.roleRequest.findUnique({
        where: { id },
      });
      if (!roleRequest) {
        return res.status(404).json({ message: "Request not found" });
      }
      if (roleRequest.status !== "PENDING") {
        return res.status(400).json({ message: "Request is no longer pending" });
      }
      const reviewerId = req.user.userId;
      await prisma.$transaction([
        prisma.roleRequest.update({
          where: { id },
          data: {
            status,
            reviewedAt: new Date(),
            reviewedById: reviewerId,
          },
        }),
        ...(status === "APPROVED"
          ? [
              prisma.user.update({
                where: { id: roleRequest.userId },
                data: {
                  role: roleRequest.requestedRole,
                  editorFestId: roleRequest.festId ?? undefined,
                },
              }),
            ]
          : []),
      ]);
      res.json({
        message: status === "APPROVED" ? "Request approved" : "Request denied",
        id,
        status,
      });
    } catch (err) {
      console.error("Role request update error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
