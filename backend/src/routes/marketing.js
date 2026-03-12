// backend/src/routes/marketing.js
import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// Helper to parse optional dates coming from the frontend (YYYY-MM-DD)
function safeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ==================== SPONSORS ====================

// GET /api/marketing/host/:hostId/sponsors
router.get("/host/:hostId/sponsors", async (req, res) => {
  try {
    const { hostId } = req.params;

    const sponsors = await prisma.sponsor.findMany({
      where: {
        OR: [
          { event: { hostId: parseInt(hostId) } },
          { fest: { events: { some: { hostId: parseInt(hostId) } } } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: sponsors });
  } catch (error) {
    console.error("Error fetching sponsors:", error);
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch sponsors" },
    });
  }
});

// POST /api/marketing/host/:hostId/sponsors
router.post("/host/:hostId/sponsors", async (req, res) => {
  try {
    const { hostId } = req.params;
    const {
      companyName,
      contactPerson,
      email,
      phone,
      sponsorshipAmount,
      receivedAmount,
      status,
      notes,
      festId,
      eventId,
    } = req.body;

    if (!companyName || !contactPerson) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Company and contact person are required" },
      });
    }

    const sponsor = await prisma.sponsor.create({
      data: {
        festId: festId ? parseInt(festId) : null,
        eventId: eventId ? parseInt(eventId) : null,
        companyName,
        contactPerson,
        email: email || null,
        phone: phone || null,
        sponsorshipAmount: parseFloat(sponsorshipAmount) || 0,
        receivedAmount: parseFloat(receivedAmount) || 0,
        status: status || "NEGOTIATING",
        notes: notes || null,
      },
    });

    res.status(201).json({
      success: true,
      data: sponsor,
      message: "Sponsor saved successfully",
    });
  } catch (error) {
    console.error("Error creating sponsor:", error);
    res.status(500).json({
      success: false,
      error: { code: "CREATE_ERROR", message: "Failed to create sponsor" },
    });
  }
});

// PUT /api/marketing/sponsors/:id
router.put("/sponsors/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      companyName,
      contactPerson,
      email,
      phone,
      sponsorshipAmount,
      receivedAmount,
      status,
      notes,
      festId,
      eventId,
    } = req.body;

    const sponsor = await prisma.sponsor.update({
      where: { id: parseInt(id) },
      data: {
        companyName,
        contactPerson,
        email,
        phone,
        sponsorshipAmount: sponsorshipAmount !== undefined ? parseFloat(sponsorshipAmount) : undefined,
        receivedAmount: receivedAmount !== undefined ? parseFloat(receivedAmount) : undefined,
        status,
        notes,
        festId: festId !== undefined ? (festId ? parseInt(festId) : null) : undefined,
        eventId: eventId !== undefined ? (eventId ? parseInt(eventId) : null) : undefined,
      },
    });

    res.json({
      success: true,
      data: sponsor,
      message: "Sponsor updated successfully",
    });
  } catch (error) {
    console.error("Error updating sponsor:", error);
    res.status(500).json({
      success: false,
      error: { code: "UPDATE_ERROR", message: "Failed to update sponsor" },
    });
  }
});

// DELETE /api/marketing/sponsors/:id
router.delete("/sponsors/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.sponsor.delete({ where: { id: parseInt(id) } });

    res.json({
      success: true,
      message: "Sponsor deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting sponsor:", error);
    res.status(500).json({
      success: false,
      error: { code: "DELETE_ERROR", message: "Failed to delete sponsor" },
    });
  }
});

// ==================== EXPENSES ====================

// GET /api/marketing/host/:hostId/expenses
router.get("/host/:hostId/expenses", async (req, res) => {
  try {
    const { hostId } = req.params;

    const expenses = await prisma.expense.findMany({
      where: { hostId: parseInt(hostId) },
      include: { files: true, fest: true, event: true },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: expenses });
  } catch (error) {
    console.error("Error fetching expenses:", error);
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch expenses" },
    });
  }
});

// POST /api/marketing/host/:hostId/expenses
router.post("/host/:hostId/expenses", async (req, res) => {
  try {
    const { hostId } = req.params;
    const {
      festId,
      eventId,
      description,
      category,
      vendor,
      amount,
      paymentDate,
      paymentMethod,
      notes,
      proofFiles = [],
      billFiles = [],
    } = req.body;

    if (!description || !category || !vendor) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Description, category and vendor are required" },
      });
    }

    const expense = await prisma.expense.create({
      data: {
        hostId: parseInt(hostId),
        festId: festId ? parseInt(festId) : null,
        eventId: eventId ? parseInt(eventId) : null,
        description,
        category,
        vendor,
        amount: parseFloat(amount) || 0,
        paymentDate: safeDate(paymentDate),
        paymentMethod: paymentMethod || null,
        notes: notes || null,
        files: {
          create: [
            ...(proofFiles || []).map((file) => ({
              fileName: file.name,
              fileType: "PROOF",
              fileUrl: file.url || "",
              fileSize: file.size || null,
              mimeType: file.type || null,
            })),
            ...(billFiles || []).map((file) => ({
              fileName: file.name,
              fileType: "BILL",
              fileUrl: file.url || "",
              fileSize: file.size || null,
              mimeType: file.type || null,
            })),
          ],
        },
      },
      include: { files: true },
    });

    res.status(201).json({
      success: true,
      data: expense,
      message: "Expense saved successfully",
    });
  } catch (error) {
    console.error("Error creating expense:", error);
    res.status(500).json({
      success: false,
      error: { code: "CREATE_ERROR", message: "Failed to create expense" },
    });
  }
});

// PUT /api/marketing/expenses/:id
router.put("/expenses/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      festId,
      eventId,
      description,
      category,
      vendor,
      amount,
      paymentDate,
      paymentMethod,
      notes,
      proofFiles = [],
      billFiles = [],
    } = req.body;

    const updated = await prisma.expense.update({
      where: { id: parseInt(id) },
      data: {
        festId: festId !== undefined ? (festId ? parseInt(festId) : null) : undefined,
        eventId: eventId !== undefined ? (eventId ? parseInt(eventId) : null) : undefined,
        description,
        category,
        vendor,
        amount: amount !== undefined ? parseFloat(amount) : undefined,
        paymentDate: paymentDate !== undefined ? safeDate(paymentDate) : undefined,
        paymentMethod,
        notes,
        files: {
          deleteMany: {},
          create: [
            ...(proofFiles || []).map((file) => ({
              fileName: file.name,
              fileType: "PROOF",
              fileUrl: file.url || "",
              fileSize: file.size || null,
              mimeType: file.type || null,
            })),
            ...(billFiles || []).map((file) => ({
              fileName: file.name,
              fileType: "BILL",
              fileUrl: file.url || "",
              fileSize: file.size || null,
              mimeType: file.type || null,
            })),
          ],
        },
      },
      include: { files: true },
    });

    res.json({
      success: true,
      data: updated,
      message: "Expense updated successfully",
    });
  } catch (error) {
    console.error("Error updating expense:", error);
    res.status(500).json({
      success: false,
      error: { code: "UPDATE_ERROR", message: "Failed to update expense" },
    });
  }
});

// DELETE /api/marketing/expenses/:id
router.delete("/expenses/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.expense.delete({ where: { id: parseInt(id) } });

    res.json({
      success: true,
      message: "Expense deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting expense:", error);
    res.status(500).json({
      success: false,
      error: { code: "DELETE_ERROR", message: "Failed to delete expense" },
    });
  }
});

export default router;

