// backend/src/routes/bookings.js
import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// ==================== CREATE BOOKING ====================

// POST /api/bookings - Create a new booking (buy tickets)
router.post("/", async (req, res) => {
  try {
    const {
      eventId,
      userId,
      guestEmail,
      guestName,
      guestPhone,
      tickets, // Array of { ticketTypeId, quantity }
      attendees, // Array of { ticketTypeId, name, email }
    } = req.body;

    // Validation
    if (!eventId || !tickets || tickets.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Event ID and tickets are required" },
      });
    }

    // Must have either userId or guest info
    if (!userId && !guestEmail) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "User ID or guest email is required" },
      });
    }

    // Create booking in a transaction
    const booking = await prisma.$transaction(async (tx) => {
      // 1. Verify event exists and is published
      const event = await tx.event.findUnique({
        where: { id: parseInt(eventId) },
        include: { ticketTypes: true },
      });

      if (!event) {
        throw new Error("Event not found");
      }

      if (event.status !== "PUBLISHED") {
        throw new Error("Event is not available for booking");
      }

      // 2. Verify ticket availability and calculate totals
      let subtotal = 0;
      const bookingItems = [];

      for (const item of tickets) {
        const ticketType = event.ticketTypes.find(
          (t) => t.id === parseInt(item.ticketTypeId)
        );

        if (!ticketType) {
          throw new Error(`Ticket type ${item.ticketTypeId} not found`);
        }

        const available = ticketType.quantity - ticketType.sold;
        if (item.quantity > available) {
          throw new Error(
            `Not enough tickets available for ${ticketType.name}. Only ${available} left.`
          );
        }

        const itemTotal = ticketType.price * item.quantity;
        subtotal += itemTotal;

        bookingItems.push({
          ticketTypeId: ticketType.id,
          quantity: item.quantity,
          unitPrice: ticketType.price,
          totalPrice: itemTotal,
        });
      }

      // 3. Calculate fees and total
      const platformFee = subtotal * 0.02; // 2% platform fee
      const tax = (subtotal + platformFee) * 0.18; // 18% GST
      const total = subtotal + platformFee + tax;

      // 4. Create the booking
      const newBooking = await tx.booking.create({
        data: {
          eventId: parseInt(eventId),
          userId: userId ? parseInt(userId) : null,
          guestEmail: guestEmail || null,
          guestName: guestName || null,
          guestPhone: guestPhone || null,
          subtotal,
          platformFee,
          tax,
          total,
          status: "PENDING",
          items: {
            create: bookingItems,
          },
        },
        include: {
          items: {
            include: { ticketType: true },
          },
        },
      });

      // 5. Create attendees if provided
      if (attendees && attendees.length > 0) {
        await tx.attendee.createMany({
          data: attendees.map((att) => ({
            bookingId: newBooking.id,
            ticketTypeId: parseInt(att.ticketTypeId),
            name: att.name,
            email: att.email,
          })),
        });
      }

      // 6. Update ticket sold counts
      for (const item of tickets) {
        await tx.ticketType.update({
          where: { id: parseInt(item.ticketTypeId) },
          data: {
            sold: { increment: item.quantity },
          },
        });
      }

      // 7. Return complete booking
      return tx.booking.findUnique({
        where: { id: newBooking.id },
        include: {
          event: {
            select: { id: true, name: true, venue: true, startDate: true, image: true },
          },
          items: {
            include: { ticketType: { select: { id: true, name: true, price: true } } },
          },
          attendees: true,
        },
      });
    });

    res.status(201).json({
      success: true,
      data: booking,
      message: "Booking created successfully",
    });
  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).json({
      success: false,
      error: { code: "BOOKING_ERROR", message: error.message || "Failed to create booking" },
    });
  }
});

// ==================== COMPLETE BOOKING (After Payment) ====================

// PUT /api/bookings/:id/complete - Mark booking as completed
router.put("/:id/complete", async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionId, paymentMethod } = req.body;

    const booking = await prisma.$transaction(async (tx) => {
      // Update booking status
      const updatedBooking = await tx.booking.update({
        where: { id: parseInt(id) },
        data: {
          status: "COMPLETED",
          purchaseDate: new Date(),
        },
        include: {
          event: true,
          items: { include: { ticketType: true } },
          attendees: true,
        },
      });

      // Create payment record
      await tx.payment.create({
        data: {
          bookingId: parseInt(id),
          amount: updatedBooking.total,
          method: paymentMethod || "CARD",
          status: "SUCCESS",
          transactionId: transactionId || null,
          paymentDate: new Date(),
        },
      });

      return updatedBooking;
    });

    res.json({
      success: true,
      data: booking,
      message: "Booking completed successfully",
    });
  } catch (error) {
    console.error("Error completing booking:", error);
    res.status(500).json({
      success: false,
      error: { code: "COMPLETE_ERROR", message: "Failed to complete booking" },
    });
  }
});

// ==================== GET BOOKING DETAILS ====================

// GET /api/bookings/:id - Get booking by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id) },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            venue: true,
            venueAddress: true,
            startDate: true,
            endDate: true,
            startTime: true,
            image: true,
            fest: { select: { name: true, college: true } },
          },
        },
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        items: {
          include: {
            ticketType: { select: { id: true, name: true, price: true } },
          },
        },
        attendees: true,
        payment: true,
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Booking not found" },
      });
    }

    res.json({
      success: true,
      data: booking,
    });
  } catch (error) {
    console.error("Error fetching booking:", error);
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch booking" },
    });
  }
});

// GET /api/bookings/code/:bookingCode - Get booking by booking code
router.get("/code/:bookingCode", async (req, res) => {
  try {
    const { bookingCode } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { bookingCode },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            venue: true,
            venueAddress: true,
            startDate: true,
            endDate: true,
            startTime: true,
            image: true,
            fest: { select: { name: true, college: true } },
          },
        },
        items: {
          include: {
            ticketType: { select: { id: true, name: true, price: true } },
          },
        },
        attendees: true,
        payment: true,
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Booking not found" },
      });
    }

    res.json({
      success: true,
      data: booking,
    });
  } catch (error) {
    console.error("Error fetching booking:", error);
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch booking" },
    });
  }
});

// ==================== USER BOOKINGS ====================

// GET /api/bookings/user/:userId - Get all bookings for a user
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const bookings = await prisma.booking.findMany({
      where: { userId: parseInt(userId) },
      orderBy: { createdAt: "desc" },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            venue: true,
            startDate: true,
            image: true,
            status: true,
          },
        },
        items: {
          include: {
            ticketType: { select: { name: true, price: true } },
          },
        },
      },
    });

    res.json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    console.error("Error fetching user bookings:", error);
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch bookings" },
    });
  }
});

// GET /api/bookings/guest/:email - Get all bookings for a guest email
router.get("/guest/:email", async (req, res) => {
  try {
    const { email } = req.params;

    const bookings = await prisma.booking.findMany({
      where: { guestEmail: email },
      orderBy: { createdAt: "desc" },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            venue: true,
            startDate: true,
            image: true,
          },
        },
        items: {
          include: {
            ticketType: { select: { name: true, price: true } },
          },
        },
      },
    });

    res.json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    console.error("Error fetching guest bookings:", error);
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch bookings" },
    });
  }
});

// ==================== CANCEL BOOKING ====================

// PUT /api/bookings/:id/cancel - Cancel a booking
router.put("/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await prisma.$transaction(async (tx) => {
      // Get the booking with items
      const existingBooking = await tx.booking.findUnique({
        where: { id: parseInt(id) },
        include: { items: true },
      });

      if (!existingBooking) {
        throw new Error("Booking not found");
      }

      if (existingBooking.status === "CANCELLED") {
        throw new Error("Booking is already cancelled");
      }

      if (existingBooking.status === "REFUNDED") {
        throw new Error("Booking has already been refunded");
      }

      // Restore ticket quantities
      for (const item of existingBooking.items) {
        await tx.ticketType.update({
          where: { id: item.ticketTypeId },
          data: {
            sold: { decrement: item.quantity },
          },
        });
      }

      // Update booking status
      return tx.booking.update({
        where: { id: parseInt(id) },
        data: { status: "CANCELLED" },
        include: {
          event: { select: { name: true } },
          items: { include: { ticketType: true } },
        },
      });
    });

    res.json({
      success: true,
      data: booking,
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling booking:", error);
    res.status(500).json({
      success: false,
      error: { code: "CANCEL_ERROR", message: error.message || "Failed to cancel booking" },
    });
  }
});

// ==================== HOST DASHBOARD - EVENT BOOKINGS ====================

// GET /api/bookings/event/:eventId - Get all bookings for an event (for host dashboard)
router.get("/event/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;
    const { status } = req.query;

    const where = { eventId: parseInt(eventId) };
    if (status) where.status = status;

    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        items: {
          include: {
            ticketType: { select: { id: true, name: true, price: true } },
          },
        },
        attendees: true,
        payment: true,
      },
    });

    // Format for host dashboard
    const formattedBookings = bookings.map((booking) => ({
      id: booking.id,
      bookingCode: booking.bookingCode,
      buyerName: booking.user?.name || booking.guestName || "Guest",
      buyerEmail: booking.user?.email || booking.guestEmail,
      buyerPhone: booking.user?.phone || booking.guestPhone,
      tickets: booking.items.map((item) => ({
        type: item.ticketType.name,
        quantity: item.quantity,
        price: item.unitPrice,
        total: item.totalPrice,
      })),
      totalTickets: booking.items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: booking.subtotal,
      platformFee: booking.platformFee,
      tax: booking.tax,
      total: booking.total,
      status: booking.status,
      paymentStatus: booking.payment?.status || "PENDING",
      paymentMethod: booking.payment?.method || null,
      purchaseDate: booking.purchaseDate,
      createdAt: booking.createdAt,
      attendees: booking.attendees.map((att) => ({
        name: att.name,
        email: att.email,
        ticketType: booking.items.find((i) => i.ticketTypeId === att.ticketTypeId)?.ticketType.name,
      })),
    }));

    // Calculate summary stats
    const completedBookings = bookings.filter((b) => b.status === "COMPLETED");
    const stats = {
      totalBookings: bookings.length,
      completedBookings: completedBookings.length,
      pendingBookings: bookings.filter((b) => b.status === "PENDING").length,
      cancelledBookings: bookings.filter((b) => b.status === "CANCELLED").length,
      totalRevenue: completedBookings.reduce((sum, b) => sum + b.total, 0),
      totalTicketsSold: completedBookings.reduce(
        (sum, b) => sum + b.items.reduce((s, i) => s + i.quantity, 0),
        0
      ),
    };

    res.json({
      success: true,
      data: {
        bookings: formattedBookings,
        stats,
      },
    });
  } catch (error) {
    console.error("Error fetching event bookings:", error);
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch bookings" },
    });
  }
});

// ==================== HOST DASHBOARD - FEST BOOKINGS ====================

// GET /api/bookings/fest/:festId - Get all bookings for a fest
router.get("/fest/:festId", async (req, res) => {
  try {
    const { festId } = req.params;

    // Get all events for this fest
    const events = await prisma.event.findMany({
      where: { festId: parseInt(festId) },
      select: { id: true },
    });

    const eventIds = events.map((e) => e.id);

    const bookings = await prisma.booking.findMany({
      where: {
        eventId: { in: eventIds },
        status: "COMPLETED",
      },
      orderBy: { purchaseDate: "desc" },
      include: {
        event: { select: { id: true, name: true } },
        user: { select: { name: true, email: true } },
        items: {
          include: { ticketType: { select: { name: true, price: true } } },
        },
      },
    });

    // Summary by event
    const eventSummary = {};
    for (const booking of bookings) {
      const eventName = booking.event.name;
      if (!eventSummary[eventName]) {
        eventSummary[eventName] = { tickets: 0, revenue: 0 };
      }
      eventSummary[eventName].tickets += booking.items.reduce((s, i) => s + i.quantity, 0);
      eventSummary[eventName].revenue += booking.total;
    }

    res.json({
      success: true,
      data: {
        totalBookings: bookings.length,
        totalRevenue: bookings.reduce((sum, b) => sum + b.total, 0),
        totalTickets: bookings.reduce(
          (sum, b) => sum + b.items.reduce((s, i) => s + i.quantity, 0),
          0
        ),
        eventSummary,
        recentBookings: bookings.slice(0, 20).map((b) => ({
          bookingCode: b.bookingCode,
          eventName: b.event.name,
          buyerName: b.user?.name || b.guestName,
          buyerEmail: b.user?.email || b.guestEmail,
          total: b.total,
          purchaseDate: b.purchaseDate,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching fest bookings:", error);
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch bookings" },
    });
  }
});

export default router;
