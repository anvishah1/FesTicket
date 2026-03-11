// backend/src/routes/events.js
import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// Helper to safely parse optional date strings coming from the frontend.
// Treats empty strings or invalid dates as null so Prisma doesn't receive
// `new Date("Invalid Date")`.
function safeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// GET /api/events - List all published events
router.get("/", async (req, res) => {
  try {
    const { status, category, festId } = req.query;

    const where = {};
    if (status) where.status = status;
    else where.status = "PUBLISHED"; // Default to published events
    if (category) where.category = category;
    if (festId) where.festId = parseInt(festId);

    const events = await prisma.event.findMany({
      where,
      orderBy: { startDate: "asc" },
      include: {
        fest: {
          select: { id: true, name: true, college: true },
        },
        host: {
          select: { id: true, name: true },
        },
        ticketTypes: true,
        _count: {
          select: { bookings: true },
        },
      },
    });

    res.json({
      success: true,
      data: events,
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch events" },
    });
  }
});

// GET /api/events/:id - Get single event with details
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const event = await prisma.event.findUnique({
      where: { id: parseInt(id) },
      include: {
        fest: true,
        host: {
          select: { id: true, name: true, email: true },
        },
        ticketTypes: {
          orderBy: { price: "asc" },
        },
      },
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Event not found" },
      });
    }

    res.json({
      success: true,
      data: event,
    });
  } catch (error) {
    console.error("Error fetching event:", error);
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch event" },
    });
  }
});

// POST /api/events - Create a new event
router.post("/", async (req, res) => {
  try {
    const {
      festId,
      hostId,
      name,
      shortDescription,
      description,
      aboutEvent,
      image,
      category,
      audience,
      startDate,
      endDate,
      startTime,
      endTime,
      venue,
      venueAddress,
      address,
      onlineLink,
      meetingLink,
      isOnline,
      eventType,
      visibility,
      status,
      discount,
      ticketTypes,
    } = req.body;

    // Validation
    if (!name) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Event name is required" },
      });
    }

    // Create event with ticket types in a transaction
    const event = await prisma.$transaction(async (tx) => {
      // Create the event
      const newEvent = await tx.event.create({
        data: {
          festId: festId ? parseInt(festId) : null,
          hostId: hostId ? parseInt(hostId) : null,
          name,
          shortDescription: shortDescription || null,
          description: description || aboutEvent || null,
          aboutEvent: audience || null,
          image: image || null,
          category: category || null,
          startDate: safeDate(startDate),
          endDate: safeDate(endDate),
          startTime: startTime || null,
          endTime: endTime || null,
          venue: venue || null,
          venueAddress: venueAddress || address || null,
          onlineLink: onlineLink || meetingLink || null,
          isOnline: isOnline || eventType === "ONLINE" || false,
          visibility: visibility || "PUBLIC",
          status: status || "DRAFT",
          discount: discount || 0,
        },
      });

      // Create ticket types if provided
      if (ticketTypes && ticketTypes.length > 0) {
        await tx.ticketType.createMany({
          data: ticketTypes.map((ticket) => ({
            eventId: newEvent.id,
            name: ticket.name,
            price: parseFloat(ticket.price) || 0,
            quantity: parseInt(ticket.quantity) || 100,
            description: ticket.description || null,
          })),
        });
      }

      // Return event with ticket types
      return tx.event.findUnique({
        where: { id: newEvent.id },
        include: { ticketTypes: true, fest: true },
      });
    });

    res.status(201).json({
      success: true,
      data: event,
      message: "Event created successfully",
    });
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(500).json({
      success: false,
      error: { code: "CREATE_ERROR", message: "Failed to create event", details: error.message },
    });
  }
});

// PUT /api/events/:id - Update an event
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      aboutEvent,
      image,
      category,
      startDate,
      endDate,
      startTime,
      endTime,
      venue,
      venueAddress,
      onlineLink,
      isOnline,
      visibility,
      status,
      discount,
    } = req.body;

    const event = await prisma.event.update({
      where: { id: parseInt(id) },
      data: {
        name,
        description,
        aboutEvent,
        image,
        category,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        startTime,
        endTime,
        venue,
        venueAddress,
        onlineLink,
        isOnline,
        visibility,
        status,
        discount,
      },
      include: {
        ticketTypes: true,
      },
    });

    res.json({
      success: true,
      data: event,
      message: "Event updated successfully",
    });
  } catch (error) {
    console.error("Error updating event:", error);
    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Event not found" },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: "UPDATE_ERROR", message: "Failed to update event" },
    });
  }
});

// DELETE /api/events/:id - Delete an event
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.event.delete({
      where: { id: parseInt(id) },
    });

    res.json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting event:", error);
    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Event not found" },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: "DELETE_ERROR", message: "Failed to delete event" },
    });
  }
});

// PUT /api/events/:id/publish - Publish an event
router.put("/:id/publish", async (req, res) => {
  try {
    const { id } = req.params;

    const event = await prisma.event.update({
      where: { id: parseInt(id) },
      data: { status: "PUBLISHED" },
      include: { ticketTypes: true },
    });

    res.json({
      success: true,
      data: event,
      message: "Event published successfully",
    });
  } catch (error) {
    console.error("Error publishing event:", error);
    res.status(500).json({
      success: false,
      error: { code: "PUBLISH_ERROR", message: "Failed to publish event" },
    });
  }
});

// ==================== TICKET TYPES ====================

// GET /api/events/:id/ticket-types - Get ticket types for an event
router.get("/:id/ticket-types", async (req, res) => {
  try {
    const { id } = req.params;

    const ticketTypes = await prisma.ticketType.findMany({
      where: { eventId: parseInt(id) },
      orderBy: { price: "asc" },
    });

    res.json({
      success: true,
      data: ticketTypes,
    });
  } catch (error) {
    console.error("Error fetching ticket types:", error);
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch ticket types" },
    });
  }
});

// POST /api/events/:id/ticket-types - Create a ticket type
router.post("/:id/ticket-types", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, quantity, description } = req.body;

    if (!name || price === undefined || !quantity) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Name, price, and quantity are required" },
      });
    }

    const ticketType = await prisma.ticketType.create({
      data: {
        eventId: parseInt(id),
        name,
        price: parseFloat(price),
        quantity: parseInt(quantity),
        description,
      },
    });

    res.status(201).json({
      success: true,
      data: ticketType,
      message: "Ticket type created successfully",
    });
  } catch (error) {
    console.error("Error creating ticket type:", error);
    res.status(500).json({
      success: false,
      error: { code: "CREATE_ERROR", message: "Failed to create ticket type" },
    });
  }
});

// PUT /api/events/:eventId/ticket-types/:ticketId - Update a ticket type
router.put("/:eventId/ticket-types/:ticketId", async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { name, price, quantity, description } = req.body;

    const ticketType = await prisma.ticketType.update({
      where: { id: parseInt(ticketId) },
      data: {
        name,
        price: price !== undefined ? parseFloat(price) : undefined,
        quantity: quantity !== undefined ? parseInt(quantity) : undefined,
        description,
      },
    });

    res.json({
      success: true,
      data: ticketType,
      message: "Ticket type updated successfully",
    });
  } catch (error) {
    console.error("Error updating ticket type:", error);
    res.status(500).json({
      success: false,
      error: { code: "UPDATE_ERROR", message: "Failed to update ticket type" },
    });
  }
});

// DELETE /api/events/:eventId/ticket-types/:ticketId - Delete a ticket type
router.delete("/:eventId/ticket-types/:ticketId", async (req, res) => {
  try {
    const { ticketId } = req.params;

    await prisma.ticketType.delete({
      where: { id: parseInt(ticketId) },
    });

    res.json({
      success: true,
      message: "Ticket type deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting ticket type:", error);
    res.status(500).json({
      success: false,
      error: { code: "DELETE_ERROR", message: "Failed to delete ticket type" },
    });
  }
});

// ==================== HOST DASHBOARD ====================

// GET /api/events/host/:hostId - Get all events for a host
router.get("/host/:hostId", async (req, res) => {
  try {
    const { hostId } = req.params;

    const events = await prisma.event.findMany({
      where: { hostId: parseInt(hostId) },
      orderBy: { createdAt: "desc" },
      include: {
        fest: {
          select: { id: true, name: true },
        },
        ticketTypes: true,
        _count: {
          select: { bookings: true },
        },
      },
    });

    res.json({
      success: true,
      data: events,
    });
  } catch (error) {
    console.error("Error fetching host events:", error);
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch events" },
    });
  }
});

// GET /api/events/:id/buyers - Get all buyers/bookings for an event (for host dashboard)
router.get("/:id/buyers", async (req, res) => {
  try {
    const { id } = req.params;

    const bookings = await prisma.booking.findMany({
      where: {
        eventId: parseInt(id),
        status: "COMPLETED",
      },
      orderBy: { purchaseDate: "desc" },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        items: {
          include: {
            ticketType: {
              select: { name: true, price: true },
            },
          },
        },
        attendees: true,
      },
    });

    // Format response for frontend
    const buyers = bookings.map((booking) => ({
      id: booking.id,
      bookingId: booking.bookingCode,
      name: booking.user?.name || booking.guestName || "Guest",
      email: booking.user?.email || booking.guestEmail,
      phone: booking.user?.phone || booking.guestPhone,
      ticketType: booking.items.map((i) => i.ticketType.name).join(", "),
      quantity: booking.items.reduce((sum, i) => sum + i.quantity, 0),
      amountPaid: booking.total,
      purchaseDate: booking.purchaseDate,
      attendees: booking.attendees,
    }));

    res.json({
      success: true,
      data: buyers,
    });
  } catch (error) {
    console.error("Error fetching buyers:", error);
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch buyers" },
    });
  }
});

// GET /api/events/:id/stats - Get event statistics
router.get("/:id/stats", async (req, res) => {
  try {
    const { id } = req.params;
    const eventId = parseInt(id);

    // Get event with ticket types
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { ticketTypes: true },
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Event not found" },
      });
    }

    // Calculate stats
    const totalTickets = event.ticketTypes.reduce((sum, t) => sum + t.quantity, 0);
    const ticketsSold = event.ticketTypes.reduce((sum, t) => sum + t.sold, 0);

    // Get revenue from completed bookings
    const revenueResult = await prisma.booking.aggregate({
      where: {
        eventId,
        status: "COMPLETED",
      },
      _sum: { total: true },
      _count: true,
    });

    res.json({
      success: true,
      data: {
        totalTickets,
        ticketsSold,
        ticketsAvailable: totalTickets - ticketsSold,
        totalRevenue: revenueResult._sum.total || 0,
        totalBookings: revenueResult._count,
        ticketTypes: event.ticketTypes.map((t) => ({
          name: t.name,
          price: t.price,
          quantity: t.quantity,
          sold: t.sold,
          available: t.quantity - t.sold,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching event stats:", error);
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch event stats" },
    });
  }
});

export default router;
