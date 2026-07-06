// backend/src/routes/fests.js
import { Router } from "express";
import prisma from "../prisma.js";
import { authenticateUser, authorizeRoles } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";
import { createFestSchema, updateFestSchema } from "../validators/festValidator.js";

const router = Router();

// An ADMIN may only act on the fest they manage. Writes to res + returns false on mismatch.
async function assertManagesFest(festId, req, res) {
  const u = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { managedFestId: true },
  });
  if ((u?.managedFestId ?? null) !== festId) {
    res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "You can only modify the fest you manage" },
    });
    return false;
  }
  return true;
}

// GET /api/fests - List all fests
router.get("/", async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    const skip = (page - 1) * limit;

    // Optional free-text search on the fest name or college (case-insensitive).
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const where = { isDeleted: false };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { college: { contains: search, mode: "insensitive" } },
      ];
    }

    const total = await prisma.fest.count({ where });

    const fests = await prisma.fest.findMany({
      where,
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

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      // Top-level fields kept for backward compatibility with existing callers.
      total,
      page,
      limit,
      totalPages,
      pagination: { page, limit, total, totalPages },
      // Never expose the fest's adminKey (the shared onboarding secret) publicly.
      data: fests.map(({ adminKey, ...rest }) => rest),
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
          // Public fest detail: never expose DRAFT or PRIVATE events (they are
          // not bookable and must not leak on the public read path).
          where: { status: "PUBLISHED", visibility: "PUBLIC" },
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

    const { adminKey, ...festSafe } = fest;
    res.json({
      success: true,
      data: festSafe,
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
router.post("/", authenticateUser, authorizeRoles("ADMIN"), validate(createFestSchema), async (req, res) => {
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

    // Store raw user text (trimmed). Do NOT HTML-entity-escape at rest — that
    // double-encodes and leaks entities into the UI (e.g. "St. Xavier&#x27;s").
    // React escapes on render, which is the correct XSS boundary.
    const sanitizedName = name.trim();

    const sanitizedCollege = college.trim();

    const sanitizedDescription = description ? description.trim() : null;

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
        startDate: cleanStartDate ? new Date(cleanStartDate) : null,
        endDate: cleanEndDate ? new Date(cleanEndDate) : null,
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
router.put("/:id", authenticateUser, authorizeRoles("ADMIN"), validate(updateFestSchema), async (req, res) => {
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

    if (!(await assertManagesFest(festId, req, res))) return;

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

    // Store raw user text (trimmed). See POST handler note: no HTML-entity
    // escaping at rest; React escapes at render.
    const sanitizedName = name.trim();

    const sanitizedCollege = college.trim();

    const sanitizedDescription = description ? description.trim() : null;

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
        startDate: cleanStartDate ? new Date(cleanStartDate) : null,
        endDate: cleanEndDate ? new Date(cleanEndDate) : null,
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

    if (!(await assertManagesFest(festId, req, res))) return;

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
        // Public fest events list: only PUBLISHED + PUBLIC events. DRAFT/PRIVATE
        // events must not be exposed or made bookable here. festId is already a
        // Number (see above). Also require the parent fest to be live — a
        // soft-deleted (isDeleted=true) fest must expose no events publicly.
        festId: festId,
        status: "PUBLISHED",
        visibility: "PUBLIC",
        fest: { isDeleted: false },
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
