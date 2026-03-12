// backend/index.js
import dotenv from "dotenv";
dotenv.config(); // load .env immediately

import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";

// Import routes
import festsRouter from "./src/routes/fests.js";
import eventsRouter from "./src/routes/events.js";
import marketingRouter from "./src/routes/marketing.js";

const prisma = new PrismaClient({
  log: [
    { level: "query", emit: "event" },
    { level: "info",  emit: "event" },
    { level: "warn",  emit: "event" },
    { level: "error", emit: "event" },
  ],
});

prisma.$on("query", (e) => {
  // comment out in prod if noisy
  console.debug("Prisma query:", e.query);
});

prisma.$on("error", (e) => {
  console.error("Prisma client error:", e);
});

const app = express();
app.use(cors({ origin: "http://localhost:3000" })); // allow your frontend
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// API Routes
app.use("/api/fests", festsRouter);
app.use("/api/events", eventsRouter);
app.use("/api/marketing", marketingRouter);

// simple health route
app.get("/api/hello", (req, res) => {
  res.json({ message: "full stack dev" });
});

// Debug route: safe, shows which model accessors exist and optionally runs queries
app.get("/api/testdb", async (req, res) => {
  try {
    // Show available top-level keys on prisma client
    const clientKeys = Object.keys(prisma).sort();

    // build a simple response showing whether key accessors exist
    const hasUser = typeof prisma.user !== "undefined";
    const hasEvent = typeof prisma.event !== "undefined";
    const hasPost = typeof prisma.post !== "undefined";

    // If Event exists, return a tiny sample query; otherwise return available keys
    if (hasEvent) {
      const events = await prisma.event.findMany({ take: 10, orderBy: { createdAt: "desc" } });
      return res.json({
        ok: true,
        summary: {
          hasUser,
          hasPost,
          hasEvent,
          prismaKeysCount: clientKeys.length,
          prismaKeysSample: clientKeys.slice(0, 40),
        },
        sampleCount: events.length,
        data: events,
      });
    } else {
      return res.json({
        ok: false,
        message: "Prisma client is loaded but models are missing. Run `npx prisma generate` and ensure schema has models.",
        prismaKeys: clientKeys,
      });
    }
  } catch (err) {
    console.error("TEST-DB ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: "Database query failed",
      message: err?.message,
      stack: err?.stack?.split("\n").slice(0, 10),
    });
  }
});

// Try connecting at startup (non-blocking)
(async () => {
  try {
    await prisma.$connect();
    console.log("✅ Prisma connected to database");
  } catch (err) {
    console.error("❌ Prisma failed to connect at startup:", err?.message || err);
  }
})();

const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

// Graceful shutdown (important with Prisma)
const shutdown = async () => {
  console.log("Shutting down server...");
  server.close(async () => {
    try {
      await prisma.$disconnect();
      console.log("Prisma disconnected, exiting.");
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
