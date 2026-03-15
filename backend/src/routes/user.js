import express from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateUser } from "../middleware/authMiddleware.js";

const prisma = new PrismaClient();
const router = express.Router();

/*
GET CURRENT USER
*/
router.get("/me", authenticateUser, async (req, res) => {
  try {

    let user = await prisma.user.findUnique({
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
        editorFestId: true
      }
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    // If admin has no managedFestId, repair from their approved AdminRequest (festId there = fest they're for)
    if (user.role === "ADMIN" && user.managedFestId == null) {
      const approved = await prisma.adminRequest.findFirst({
        where: { email: user.email, status: "APPROVED", festId: { not: null } },
        orderBy: { updatedAt: "desc" }
      });
      if (approved?.festId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { managedFestId: approved.festId }
        });
        user = { ...user, managedFestId: approved.festId };
      }
    }

    res.json(user);

  } catch (error) {

    console.error("Get user error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }
});

export default router;
