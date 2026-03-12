import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { PrismaClient } from "@prisma/client";

import { authenticateUser, authorizeRoles } from "./src/middleware/authMiddleware.js";
import authRoutes from "./src/routes/auth.js";
import userRoutes from "./src/routes/user.js";

/* ================= PRISMA ================= */

const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === "development"
      ? [
          { level: "query", emit: "event" },
          { level: "info", emit: "event" },
          { level: "warn", emit: "event" },
          { level: "error", emit: "event" },
        ]
      : [{ level: "error", emit: "event" }],
});

if (process.env.NODE_ENV === "development") {
  prisma.$on("query", (e) => {
    console.debug("Prisma query:", e.query);
  });
}

prisma.$on("error", (e) => {
  console.error("Prisma client error:", e);
});

/* ================= EXPRESS ================= */

const app = express();

/* Trust proxy for deployments (Render, Railway, etc.) */
app.set("trust proxy", 1);

/* Security headers */
app.use(helmet());

/* CORS */
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);

/* JSON body parser with limit */
app.use(express.json({ limit: "10mb" }));

/* ================= ROUTES ================= */

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);

/* ================= PROTECTED ROUTE ================= */

app.get("/api/protected", authenticateUser, (req, res) => {
  res.json({
    message: "You accessed a protected route!",
    user: req.user,
  });
});

/* ================= ADMIN ROUTE ================= */

app.get(
  "/api/admin/test",
  authenticateUser,
  authorizeRoles("ADMIN"),
  (req, res) => {
    res.json({
      message: "Welcome Admin",
      user: req.user,
    });
  }
);

/* ================= HEALTH ROUTE ================= */

app.get("/api/hello", (req, res) => {
  res.json({ message: "full stack dev" });
});

/* ================= TEST DB ROUTE ================= */

app.get("/api/testdb", async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
    });

    res.json({
      ok: true,
      sampleCount: events.length,
      data: events,
    });
  } catch (err) {
    console.error("TEST-DB ERROR:", err);

    res.status(500).json({
      ok: false,
      message: "Database query failed",
    });
  }
});

/* ================= GLOBAL ERROR HANDLER ================= */

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);

  res.status(500).json({
    message: "Internal server error",
  });
});

/* ================= START SERVER ================= */

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, async () => {
  try {
    await prisma.$connect();
    console.log("✅ Prisma connected to database");
    console.log(`✅ Server running on port ${PORT}`);
  } catch (err) {
    console.error("❌ Prisma connection failed:", err.message);
  }
});

/* ================= GRACEFUL SHUTDOWN ================= */

const shutdown = async () => {
  console.log("Shutting down server...");

  server.close(async () => {
    try {
      await prisma.$disconnect();
      console.log("Prisma disconnected");
      process.exit(0);
    } catch (e) {
      console.error("Error during Prisma disconnect:", e);
      process.exit(1);
    }
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  shutdown();
});