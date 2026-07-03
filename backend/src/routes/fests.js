// backend/src/routes/fests.js
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateUser, authorizeRoles } from "../middleware/authMiddleware.js";
import validator from "validator";

const router = Router();
const prisma = new PrismaClient();

// GET /api/fests - List all fests
router.get("/", async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    const skip = (page - 1) * limit;

    const total = await prisma.fest.count({
      where: {
        isDeleted: false
      }
    });

    const fests = await prisma.fest.findMany({
      where: {
        isDeleted: false
      },
      skip,
      take: limit,
      orderBy: { startDate: "desc" },
      include: {
        _count: {
          select: { events: true },
        },
        events: {
          where: {
            visibility: "PUBLIC",
            status: "PUBLISHED"
          },
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
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
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
    const festId = Number(req.params.id);

    if (isNaN(festId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_ID",
          message: "Invalid fest ID"
        }
      });
    }

    const fest = await prisma.fest.findFirst({
      where: { id: festId, isDeleted: false },
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
router.post("/", authenticateUser, authorizeRoles("ADMIN"), async (req, res) => {
  try {
    const { name, college, description, image, startDate, endDate } = req.body;

    if (!name || !college) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Name and college are required" },
      });

    }

    const cleanStartDate = startDate?.trim() || null;
    const cleanEndDate = endDate?.trim() || null;

    const sanitizedName = validator.escape(name.trim());

    const sanitizedCollege = validator.escape(college.trim());

    const sanitizedDescription =
      description
        ? validator.escape(description.trim())
        : null;

    const sanitizedImage = image?.trim() || null;

    if (cleanStartDate && cleanEndDate) {

      const start = new Date(cleanStartDate);
      const end = new Date(cleanEndDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_DATE",
            message: "Invalid date format"
          }
        });
      }

      const now = new Date();
      now.setHours(0, 0, 0, 0);

      if (start < now) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_DATE",
            message: "Start date cannot be in the past"
          }
        });
      }

      if (end < start) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_DATE",
            message: "End date must be after start date"
          }
        });
      }

    }

    const fest = await prisma.fest.create({
      data: {
        name: sanitizedName,
        college: sanitizedCollege,
        description: sanitizedDescription,
        image: sanitizedImage,
        startDate: startDate ? new Date(cleanStartDate) : null,
        endDate: endDate ? new Date(cleanEndDate) : null,
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
router.put("/:id", authenticateUser, authorizeRoles("ADMIN"), async (req, res) => {
  try {
    const { id } = req.params;

    const festId = Number(id);

    if (isNaN(festId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_ID",
          message: "Invalid fest ID"
        }
      });
    }

    const { name, college, description, image, startDate, endDate } = req.body;

    if (!name || !college) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Name and college are required"
        }
      });
    }

    const cleanStartDate = startDate?.trim() || null;
    const cleanEndDate = endDate?.trim() || null;

    const sanitizedName = validator.escape(name.trim());

    const sanitizedCollege = validator.escape(college.trim());

    const sanitizedDescription =
      description
        ? validator.escape(description.trim())
        : null;

    const sanitizedImage =
      image?.trim() || null;

    if (cleanStartDate && cleanEndDate) {

      const start = new Date(cleanStartDate);
      const end = new Date(cleanEndDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_DATE",
            message: "Invalid date format"
          }
        });
      }
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      if (start < now) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_DATE",
            message: "Start date cannot be in the past"
          }
        });
      }

      if (end < start) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_DATE",
            message: "End date must be after start date"
          }
        });
      }

    }

    const fest = await prisma.fest.update({
      where: { id: festId },
      data: {
        name: sanitizedName,
        college: sanitizedCollege,
        description: sanitizedDescription,
        image: sanitizedImage,
        startDate: startDate ? new Date(cleanStartDate) : null,
        endDate: endDate ? new Date(cleanEndDate) : null,
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
router.delete("/:id", authenticateUser, authorizeRoles("ADMIN"), async (req, res) => {
  try {
    const festId = Number(req.params.id);

    if (isNaN(festId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_ID",
          message: "Invalid fest ID"
        }
      });
    }

    await prisma.fest.update({
      where: { id: festId },
      data: {
        isDeleted: true
      }
    });

    res.json({
      success: true,
      message: "Fest archived successfully",
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
    const festId = Number(req.params.festId);

    if (isNaN(festId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_ID",
          message: "Invalid fest ID"
        }
      });
    }

    const events = await prisma.event.findMany({
      where: {
        // All events for this fest (no status filter) — for host and
        // public fest views. festId is already a Number (see above).
        festId: festId,
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
