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

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        profileCompleted: true,
        emailVerified: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
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