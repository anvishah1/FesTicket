// backend/src/routes/fests.js
import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// GET /api/fests - List all fests
router.get("/", async (req, res) => {
  try {
    const fests = await prisma.fest.findMany({
      orderBy: { startDate: "desc" },
      include: {
        _count: {
          select: { events: true },
        },
        events: {
          orderBy: { startDate: "asc" },
          select: {
            id: true,
            name: true,
            venue: true,
            startDate: true,
            image: true,
            status: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: fests,
    });
  } catch (error) {
    console.error("Error fetching fests:", error);
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch fests" },
    });
  }
});

// GET /api/fests/:id - Get fest by ID with its events
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const fest = await prisma.fest.findUnique({
      where: { id: parseInt(id) },
      include: {
        events: {
          orderBy: { startDate: "asc" },
          include: {
            ticketTypes: true,
            _count: { select: { bookings: true } },
          },
        },
      },
    });

    if (!fest) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Fest not found" },
      });
    }

    res.json({
      success: true,
      data: fest,
    });
  } catch (error) {
    console.error("Error fetching fest:", error);
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch fest" },
    });
  }
});

// POST /api/fests - Create a new fest
router.post("/", async (req, res) => {
  try {
    const { name, college, description, image, startDate, endDate } = req.body;

    if (!name || !college) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Name and college are required" },
      });
    }

    const fest = await prisma.fest.create({
      data: {
        name,
        college,
        description,
        image,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
    });

    res.status(201).json({
      success: true,
      data: fest,
      message: "Fest created successfully",
    });
  } catch (error) {
    console.error("Error creating fest:", error);
    res.status(500).json({
      success: false,
      error: { code: "CREATE_ERROR", message: "Failed to create fest" },
    });
  }
});

// PUT /api/fests/:id - Update a fest
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, college, description, image, startDate, endDate } = req.body;

    const fest = await prisma.fest.update({
      where: { id: parseInt(id) },
      data: {
        name,
        college,
        description,
        image,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
    });

    res.json({
      success: true,
      data: fest,
      message: "Fest updated successfully",
    });
  } catch (error) {
    console.error("Error updating fest:", error);
    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Fest not found" },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: "UPDATE_ERROR", message: "Failed to update fest" },
    });
  }
});

// DELETE /api/fests/:id - Delete a fest
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.fest.delete({
      where: { id: parseInt(id) },
    });

    res.json({
      success: true,
      message: "Fest deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting fest:", error);
    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Fest not found" },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: "DELETE_ERROR", message: "Failed to delete fest" },
    });
  }
});

// GET /api/fests/:festId/events - Get all events for a fest
router.get("/:festId/events", async (req, res) => {
  try {
    const { festId } = req.params;

    const events = await prisma.event.findMany({
      where: {
        festId: parseInt(festId),
        status: "PUBLISHED",
      },
      orderBy: { startDate: "asc" },
      include: {
        ticketTypes: true,
        host: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.json({
      success: true,
      data: events,
    });
  } catch (error) {
    console.error("Error fetching fest events:", error);
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch events" },
    });
  }
});

export default router;
