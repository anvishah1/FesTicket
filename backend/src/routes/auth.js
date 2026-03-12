import express from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { authenticateUser } from "../middleware/authMiddleware.js";

import { signupSchema, signinSchema } from "../validators/authValidator.js";
import { validate } from "../middleware/validate.js";
import { loginLimiter } from "../middleware/rateLimiter.js";

const prisma = new PrismaClient();
const router = express.Router();

/* ================= SIGNUP ================= */
router.post("/signup", validate(signupSchema), async (req, res) => {

  try {

    const { email, password, name } = req.body;

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json({
        message: "User already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const verifyToken = crypto.randomBytes(32).toString("hex");

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        emailVerifyToken: verifyToken
      }
    });

    const verifyLink =
      `http://localhost:4000/api/auth/verify-email?token=${verifyToken}`;

    console.log("Email verification link:", verifyLink);

    res.status(201).json({
      message: "Signup successful. Please verify your email.",
      userId: user.id
    });

  } catch (error) {

    console.error("Signup error:", error);

    res.status(500).json({
      message: "Internal server error"
    });

  }

});


/* ================= SIGNIN ================= */
router.post("/signin", loginLimiter, validate(signinSchema), async (req, res) => {

  try {

    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user || !user.password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    /* ACCOUNT LOCK CHECK */
    if (user.lockUntil && user.lockUntil > new Date()) {
      return res.status(403).json({
        message: "Account locked. Try again later."
      });
    }

    /* EMAIL VERIFICATION */
    if (!user.emailVerified) {
      return res.status(403).json({
        message: "Please verify your email before logging in"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {

      const attempts = user.failedLoginAttempts + 1;

      if (attempts >= 5) {

        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockUntil: new Date(Date.now() + 15 * 60 * 1000)
          }
        });

        return res.status(403).json({
          message: "Too many failed attempts. Account locked for 15 minutes."
        });

      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts
        }
      });

      return res.status(401).json({
        message: "Invalid credentials"
      });

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

    /* ACCESS TOKEN */
    const accessToken = jwt.sign(
      {
        userId: user.id,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    /* REFRESH TOKEN */
    const refreshToken = crypto.randomBytes(40).toString("hex");

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    res.json({
      message: "Signin successful",
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        profileCompleted: user.profileCompleted
      }
    });

  } catch (error) {

    console.error("Signin error:", error);

    res.status(500).json({
      message: "Internal server error"
    });

  }

});


/* ================= REFRESH TOKEN ================= */
router.post("/refresh-token", async (req, res) => {

  try {

    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        message: "Refresh token required"
      });
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken }
    });

    if (!storedToken) {
      return res.status(403).json({
        message: "Invalid refresh token"
      });
    }

    if (storedToken.expiresAt < new Date()) {

      await prisma.refreshToken.delete({
        where: { token: refreshToken }
      });

      return res.status(403).json({
        message: "Refresh token expired"
      });

    }

    const user = await prisma.user.findUnique({
      where: { id: storedToken.userId }
    });

    if (!user) {
      return res.status(403).json({
        message: "Invalid token user"
      });
    }

    /* ROTATION */
    await prisma.refreshToken.delete({
      where: { token: refreshToken }
    });

    const newRefreshToken = crypto.randomBytes(40).toString("hex");

    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: user.id,
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    const accessToken = jwt.sign(
      {
        userId: user.id,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    res.json({
      accessToken,
      refreshToken: newRefreshToken
    });

  } catch (error) {

    console.error("Refresh token error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});


/* ================= LOGOUT ================= */
router.post("/logout", async (req, res) => {

  try {

    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        message: "Refresh token required"
      });
    }

    await prisma.refreshToken.deleteMany({
      where: { token: refreshToken }
    });

    res.json({
      message: "Logged out successfully"
    });

  } catch (error) {

    console.error("Logout error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});

router.get("/sessions", authenticateUser, async (req, res) => {

  try {

    const sessions = await prisma.refreshToken.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: "desc" }
    });

    res.json({
      sessions
    });

  } catch (error) {

    console.error("Session fetch error:", error);

    res.status(500).json({
      message: "Server error"
    });

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

    res.json({
      message: "Session revoked"
    });

  } catch (error) {

    console.error("Session delete error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});

router.delete("/sessions", authenticateUser, async (req, res) => {

  try {

    await prisma.refreshToken.deleteMany({
      where: {
        userId: req.user.userId
      }
    });

    res.json({
      message: "All sessions revoked"
    });

  } catch (error) {

    console.error("Session clear error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});

/* ================= FORGOT PASSWORD ================= */
router.post("/forgot-password", async (req, res) => {

  try {

    const { email } = req.body;

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.json({
        message: "If this email exists, a reset link was sent."
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");

    const expiry = new Date(Date.now() + 1000 * 60 * 30);

    await prisma.user.update({
      where: { email },
      data: {
        resetPasswordToken: resetToken,
        resetPasswordExpiry: expiry
      }
    });

    const resetLink =
      `http://localhost:3000/reset-password?token=${resetToken}`;

    console.log("Password reset link:", resetLink);

    res.json({
      message: "If this email exists, a reset link was sent."
    });

  } catch (err) {

    console.error("Forgot password error:", err);

    res.status(500).json({
      message: "Server error"
    });

  }

});


/* ================= RESET PASSWORD ================= */
router.post("/reset-password", async (req, res) => {

  try {

    const { token, newPassword } = req.body;

    if (!newPassword || newPassword.length < 8 || newPassword.length > 30) {
      return res.status(400).json({
        message: "Password must be 8–30 characters"
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpiry: {
          gte: new Date()
        }
      }
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired token"
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpiry: null
      }
    });

    res.json({
      message: "Password reset successful"
    });

  } catch (err) {

    console.error("Reset password error:", err);

    res.status(500).json({
      message: "Server error"
    });

  }

});


/* ================= VERIFY EMAIL ================= */
router.get("/verify-email", async (req, res) => {

  try {

    const { token } = req.query;

    const user = await prisma.user.findFirst({
      where: {
        emailVerifyToken: token
      }
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid verification token"
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifyToken: null
      }
    });

    res.json({
      message: "Email verified successfully"
    });

  } catch (error) {

    console.error("Email verification error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});

export default router;