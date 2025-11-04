import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "./generated/prisma/index.js";

const prisma = new PrismaClient();

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Basic test route
app.get("/api/hello", (req, res) => {
  res.json({ message: "full stack dev" });
});

app.get("/api/testdb", async (req, res) => {
  try {
    const events = await prisma.event.findMany(); // replace 'event' with your model name
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database connection failed" });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
