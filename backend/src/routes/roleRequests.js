import express from "express";
import prisma from "../prisma.js";
import { authenticateUser, authorizeRoles } from "../middleware/authMiddleware.js";
import { writeLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

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

      // An admin who manages no fest must not see other fests' requests.
      if (managedFestId == null) {
        return res.json([]);
      }

      const onlyPending = req.query.status !== "all";
      const where = {
        ...(onlyPending ? { status: "PENDING" } : {}),
        festId: managedFestId,
      };

      const requests = await prisma.roleRequest.findMany({
        where,
        // Newest first; id is a deterministic tiebreaker for equal requestDates.
        orderBy: [{ requestDate: "desc" }, { id: "desc" }],
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
      req.log.error({ err }, "Role requests list error");
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ================= MY REQUESTS (self status) ================= */
// Lets a signed-in user see their own role-request history/status (pending,
// approved, denied) — the LIST route above is ADMIN-only.
router.get("/mine", authenticateUser, async (req, res) => {
  try {
    const requests = await prisma.roleRequest.findMany({
      where: { userId: req.user.userId },
      orderBy: [{ requestDate: "desc" }, { id: "desc" }],
      include: { fest: { select: { id: true, name: true } } },
    });
    res.json(
      requests.map((r) => ({
        id: r.id,
        festId: r.festId,
        festName: r.fest?.name ?? r.organization,
        requestedRole: r.requestedRole,
        status: r.status,
        requestDate: r.requestDate,
      }))
    );
  } catch (err) {
    req.log.error({ err }, "My role requests error");
    res.status(500).json({ message: "Server error" });
  }
});

/* ================= CREATE (authenticated user) ================= */
router.post("/", writeLimiter, authenticateUser, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { organization, festKey } = req.body || {};
    // Students may self-request EDITOR only. HOST/ADMIN are elevated grants made
    // by an admin, never self-assigned (previously a VIEWER could POST
    // requestedRole:"HOST" and self-request it).
    const role = "EDITOR";

    // A fest key is REQUIRED so every request is scoped to a fest. Without it the
    // request had festId=null and became an un-actionable dead-end: no admin could
    // approve/deny it (approval needs festId===managedFestId) yet the
    // one-pending-per-user rule permanently blocked the user from re-requesting.
    if (!festKey || !String(festKey).trim()) {
      return res.status(400).json({
        message: "A fest key is required to request organizer access",
        errors: { festKey: "Enter the fest key provided by your fest's organizer." },
      });
    }
    const fest = await prisma.fest.findFirst({
      where: { adminKey: String(festKey).trim() },
    });
    if (!fest) {
      return res.status(400).json({
        message: "Invalid fest key",
        errors: { festKey: "No fest found for this key." },
      });
    }
    const festId = fest.id;

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
        festId,
        requestedRole: role,
        organization: organization || null,
      },
      include: {
        user: { select: { email: true, name: true } },
      },
    });
    req.log.info({ roleRequestId: created.id, email: created.user.email }, "[role-requests] Created request");
    res.status(201).json({
      message: "Role request submitted",
      id: created.id,
      status: created.status,
    });
  } catch (err) {
    req.log.error({ err }, "Role request create error");
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
      // Admins may only act on requests belonging to the fest they manage.
      const admin = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { managedFestId: true },
      });
      if (admin?.managedFestId == null || roleRequest.festId !== admin.managedFestId) {
        return res.status(403).json({ message: "You can only act on your own fest's requests" });
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
              // Role change: bump tokenVersion so any live access token minted
              // under the old role is superseded, and revoke the user's refresh
              // tokens so they must re-login and pick up the new role.
              prisma.user.update({
                where: { id: roleRequest.userId },
                data: {
                  role: roleRequest.requestedRole,
                  editorFestId: roleRequest.festId ?? undefined,
                  tokenVersion: { increment: 1 },
                },
              }),
              prisma.refreshToken.deleteMany({
                where: { userId: roleRequest.userId },
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
      req.log.error({ err }, "Role request update error");
      res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
