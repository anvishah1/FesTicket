// backend/src/routes/events.js
import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { FileType } from "@prisma/client";
import prisma from "../prisma.js";
import { safeDate } from "../utils/date.js";
import { authenticateUser, authorizeRoles, optionalAuthenticate } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";
import { saveDataUrl, UPLOADS_DIR } from "../utils/storage.js";
import { createEventSchema, ticketTypeSchema } from "../validators/eventValidator.js";
import {
  createSponsorSchema,
  updateSponsorSchema,
  createExpenseSchema,
  updateExpenseSchema,
} from "../validators/marketingValidator.js";
import { parsePagination, buildPagination } from "../utils/pagination.js";

const router = Router();

// Resolve the caller's fest ids (the JWT only carries userId/role).
async function callerFests(req) {
  const u = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { managedFestId: true, editorFestId: true },
  });
  return { managedFestId: u?.managedFestId ?? null, editorFestId: u?.editorFestId ?? null };
}

// Fest-scoped event ownership: the event's host always passes; an ADMIN passes
// only for an event in the fest they manage (event.festId === managedFestId).
// `event` must carry { hostId, festId }. Returns a boolean.
async function callerCanManageEvent(event, req) {
  if (!event) return false;
  if (event.hostId === req.user.userId) return true;
  if (req.user.role === "ADMIN") {
    const { managedFestId } = await callerFests(req);
    return event.festId != null && event.festId === managedFestId;
  }
  return false;
}

// READ access to an event's operational data (buyers, stats): the event's host,
// OR any ADMIN/EDITOR/HOST scoped to the event's fest. Mirrors the fest-wide read
// model so a fest editor can drill into a co-fest event instead of a dead 403.
// Distinct from callerCanManageEvent (which governs WRITES and stays host / fest-
// ADMIN only). `event` must carry { hostId, festId }.
async function callerCanViewEvent(event, req) {
  if (!event) return false;
  if (event.hostId === req.user.userId) return true;
  const { managedFestId, editorFestId } = await callerFests(req);
  return event.festId != null && (event.festId === managedFestId || event.festId === editorFestId);
}

// Lifecycle state machine for the stored EventStatus. Only these transitions are
// legal; derived statuses (UPCOMING/LIVE/PAST) are never stored. Shared by both
// PUT /:id (when a status is supplied) and PATCH /:id/status.
const STATUS_TRANSITIONS = {
  DRAFT: ["PUBLISHED", "CANCELLED"],
  PUBLISHED: ["DRAFT", "CANCELLED"],
  CANCELLED: ["DRAFT"],
};

// Load an event's hostId/festId and verify the caller may manage it (its host,
// or an ADMIN of that event's fest). Returns { ok:true, event } or
// { ok:false, status, body } for the caller to return.
async function checkEventOwnership(eventId, req) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { hostId: true, festId: true, status: true },
  });
  if (!event) {
    return { ok: false, status: 404, body: { success: false, error: { code: "NOT_FOUND", message: "Event not found" } } };
  }
  if (!(await callerCanManageEvent(event, req))) {
    return { ok: false, status: 403, body: { success: false, error: { code: "FORBIDDEN", message: "You do not have permission to modify this event" } } };
  }
  return { ok: true, event };
}
function canAccessFest(festId, fests) {
  return (
    festId != null &&
    (festId === fests.managedFestId || festId === fests.editorFestId)
  );
}
const forbid = (res, message = "You do not have access to this fest's data") =>
  res.status(403).json({ success: false, error: { code: "FORBIDDEN", message } });

// Derive a lifecycle status from the (never-transitioning) stored EventStatus +
// the event's dates, WITHOUT mutating the stored status. Only a PUBLISHED event
// gets a lifecycle: UPCOMING (starts in the future or has no start date), LIVE
// (now is between start and end), or PAST (end date already passed). DRAFT /
// CANCELLED (and any other stored status) are returned unchanged.
function deriveEffectiveStatus(event, now = new Date()) {
  if (!event || event.status !== "PUBLISHED") return event?.status;
  const start = event.startDate ? new Date(event.startDate) : null;
  const end = event.endDate ? new Date(event.endDate) : null;
  const t = now.getTime();
  if (end && !Number.isNaN(end.getTime()) && end.getTime() < t) return "PAST";
  if (
    start && !Number.isNaN(start.getTime()) &&
    end && !Number.isNaN(end.getTime()) &&
    start.getTime() <= t && t <= end.getTime()
  ) {
    return "LIVE";
  }
  return "UPCOMING";
}

// Attach the derived `effectiveStatus` to an event (or null-safe passthrough).
const withEffectiveStatus = (event) =>
  event ? { ...event, effectiveStatus: deriveEffectiveStatus(event) } : event;

// Non-secret column selects for related rows returned to clients. Fest.adminKey
// (the student-facing fest key) and the User secret columns (password,
// resetPasswordToken, emailVerifyToken, tokenVersion, lockUntil, ...) must never
// be serialized in an API response.
const FEST_PUBLIC_SELECT = {
  id: true,
  name: true,
  college: true,
  description: true,
  image: true,
  startDate: true,
  endDate: true,
};
const USER_PUBLIC_SELECT = { id: true, name: true, email: true };

// Every marketing endpoint handles fest financial data (sponsors + expenses) and
// requires authentication. Registered before the marketing route handlers below,
// so it guards all of /api/events/marketing/*.
router.use("/marketing", authenticateUser, authorizeRoles("EDITOR", "HOST", "ADMIN"));

// L3: authenticated, fest-scoped download of an uploaded expense proof/bill or
// sponsor agreement. Replaces the public /uploads static mount so a leaked URL
// isn't world-readable across tenants — the caller must manage the fest the file
// belongs to. (Under the /marketing guard above: authed + EDITOR/HOST/ADMIN.)
router.get("/marketing/files/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    // Path-traversal guard: only a bare uuid-style name (no slashes / "..").
    if (!/^[A-Za-z0-9._-]+$/.test(filename)) {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Invalid file name" },
      });
    }
    const publicUrl = `/uploads/${filename}`;
    const [expFile, sponsor] = await Promise.all([
      prisma.expenseFile.findFirst({
        where: { fileUrl: publicUrl },
        select: { expense: { select: { festId: true, event: { select: { festId: true } } } } },
      }),
      prisma.sponsor.findFirst({
        where: { agreementUrl: publicUrl },
        select: { festId: true, event: { select: { festId: true } } },
      }),
    ]);
    const festId =
      expFile?.expense?.festId ??
      expFile?.expense?.event?.festId ??
      sponsor?.festId ??
      sponsor?.event?.festId ??
      null;
    if (festId == null) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "File not found" },
      });
    }
    if (!canAccessFest(festId, await callerFests(req))) {
      return forbid(res, "You do not have access to this file");
    }
    const filePath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "File not found" },
      });
    }
    return res.sendFile(filePath);
  } catch (error) {
    req.log.error({ err: error }, "Error serving marketing file");
    return res.status(500).json({
      success: false,
      error: { code: "FILE_ERROR", message: "Failed to serve file" },
    });
  }
});

// Build Prisma `create` rows for an expense's proof/bill files. A file may arrive
// either already-hosted ({ name, url, size, type }) OR as an inline upload
// ({ fileName, dataUrl }); in the latter case the base64 payload is written to
// disk by saveDataUrl and its returned /uploads URL is stored in ExpenseFile.fileUrl.
// Async because writing the decoded bytes is async.
async function buildExpenseFileCreates(proofFiles, billFiles) {
  const buildOne = async (file, fileType) => {
    if (file?.dataUrl) {
      const saved = await saveDataUrl(file.dataUrl, { fileName: file.fileName || file.name });
      return {
        fileName: saved.fileName,
        fileType,
        fileUrl: saved.url,
        fileSize: saved.size,
        mimeType: saved.mimeType,
      };
    }
    return {
      fileName: file.name ?? file.fileName ?? null,
      fileType,
      fileUrl: file.url || "",
      fileSize: file.size || null,
      mimeType: file.type || null,
    };
  };
  const proof = await Promise.all((proofFiles || []).map((f) => buildOne(f, FileType.PROOF)));
  const bill = await Promise.all((billFiles || []).map((f) => buildOne(f, FileType.BILL)));
  return [...proof, ...bill];
}

// Resolve a sponsor agreement file into a stored /uploads URL. Accepts an inline
// upload ({ agreementDataUrl } or { agreementFile: { dataUrl, fileName } }) or a
// pre-hosted { agreementUrl } string. Returns the URL, or `undefined` when the
// body carries no agreement info (so callers can skip the column on update).
async function resolveAgreementUrl(body) {
  const inline = body.agreementDataUrl || body.agreementFile?.dataUrl;
  if (inline) {
    const saved = await saveDataUrl(inline, {
      fileName: body.agreementFileName || body.agreementFile?.fileName,
    });
    return saved.url;
  }
  if (body.agreementUrl !== undefined) return body.agreementUrl || null;
  return undefined;
}

// Map the `sort` query param to a Prisma orderBy. Defaults to soonest-first.
function eventOrderBy(sort) {
  switch (sort) {
    case "name":
      return { name: "asc" };
    case "newest":
      return { createdAt: "desc" };
    case "date":
    default:
      return { startDate: "asc" };
  }
}

// GET /api/events - List events (public + host). Optional hostId = only events
// created by that host. Also supports search (name contains, case-insensitive),
// category filter, sort (date|name|newest), and page/limit pagination. Always
// returns data as an array plus a pagination summary.
router.get("/", optionalAuthenticate, async (req, res) => {
  try {
    const { status, category, festId, hostId, search, sort } = req.query;

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 12));

    const where = {};
    if (category) where.category = category;
    if (festId) where.festId = parseInt(festId);
    if (hostId) where.hostId = parseInt(hostId);
    if (search && String(search).trim()) {
      where.name = { contains: String(search).trim(), mode: "insensitive" };
    }

    // Visibility gate: anonymous and cross-tenant callers only ever see
    // PUBLISHED + PUBLIC events. A caller scoped to their own hostId, or to a
    // fest they manage/edit, bypasses the filter so host/admin dashboards can
    // still list their own DRAFT/PRIVATE events.
    let ownerScoped = false;
    if (req.user) {
      if (hostId && parseInt(hostId) === req.user.userId) {
        ownerScoped = true;
      } else if (festId && canAccessFest(parseInt(festId), await callerFests(req))) {
        ownerScoped = true;
      }
    }
    if (ownerScoped) {
      if (status) where.status = status;
    } else {
      where.status = "PUBLISHED";
      where.visibility = "PUBLIC";
      // Hide events belonging to a soft-deleted fest from the public listing.
      // Events with no fest (festId null) stay visible.
      where.OR = [{ festId: null }, { fest: { isDeleted: false } }];
    }

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy: eventOrderBy(sort),
        skip: (page - 1) * limit,
        take: limit,
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
      }),
      prisma.event.count({ where }),
    ]);

    const totalCount = total || 0;
    res.json({
      success: true,
      data: events.map(withEffectiveStatus),
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    req.log.error({ err: error }, "Error fetching events");
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch events" },
    });
  }
});

// GET /api/events/analytics/fest/:festId - Aggregate analytics for a fest's
// events (revenue, tickets sold, event/booking counts) derived from COMPLETED
// bookings. Auth + the caller must own/manage the fest (managed or editor fest).
router.get("/analytics/fest/:festId", authenticateUser, async (req, res) => {
  try {
    const festId = parseInt(req.params.festId);
    if (Number.isNaN(festId)) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Invalid fest id" },
      });
    }

    if (!canAccessFest(festId, await callerFests(req))) return forbid(res);

    const events = await prisma.event.findMany({
      where: { festId },
      select: { id: true, ticketTypes: { select: { sold: true } } },
    });
    const eventsCount = events.length;
    const eventIds = events.map((e) => e.id);
    const ticketsSold = events.reduce(
      (sum, e) => sum + e.ticketTypes.reduce((a, t) => a + (t.sold || 0), 0),
      0
    );

    const agg = await prisma.booking.aggregate({
      where: { eventId: { in: eventIds }, status: "COMPLETED" },
      _sum: { subtotal: true, discount: true },
      _count: true,
    });

    res.json({
      success: true,
      data: {
        // Net ticket revenue the fest actually earns = sale value after the event
        // discount. The 2% platform fee and 18% GST are collected ON TOP and are
        // NOT the organiser's income, so they are excluded (previously this summed
        // booking.total and overstated income by ~20%).
        revenue: Math.round(((agg._sum.subtotal || 0) - (agg._sum.discount || 0)) * 100) / 100,
        ticketsSold,
        eventsCount,
        bookingsCount: agg._count || 0,
      },
    });
  } catch (error) {
    req.log.error({ err: error }, "Error fetching fest analytics");
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch analytics" },
    });
  }
});

// ==================== PAY-04: PROMO CODES (host/admin scoped) ====================
// Registered BEFORE GET /:id so "promo-codes" isn't captured as an :id param.
const PROMO_KINDS = ["PERCENT", "FLAT"];
const promoNum = (v) => (v == null || v === "" ? null : Math.round(Number(v)));

// A promo is scoped to a single event OR a fest; the caller must manage that scope.
async function callerCanManagePromo(req, { eventId, festId }) {
  if (eventId != null) {
    const ev = await prisma.event.findUnique({ where: { id: parseInt(eventId) }, select: { hostId: true, festId: true } });
    if (!ev) return false;
    // A supplied festId MUST match the event's own fest. Otherwise an event's host
    // could authorize a code carrying a foreign festId (which the booking-time
    // lookup treats as fest-wide) and inject discounts across a fest they do not
    // manage — a cross-tenant leak. The scope is the event's fest, never a sibling.
    if (festId != null && parseInt(festId) !== ev.festId) return false;
    return callerCanManageEvent(ev, req);
  }
  if (festId != null) return canAccessFest(parseInt(festId), await callerFests(req));
  return false;
}

// GET /api/events/promo-codes?festId=&eventId=
router.get("/promo-codes", authenticateUser, authorizeRoles("EDITOR", "HOST", "ADMIN"), async (req, res) => {
  try {
    const eventId = req.query.eventId != null ? parseInt(req.query.eventId) : null;
    const festId = req.query.festId != null ? parseInt(req.query.festId) : null;
    if (!(await callerCanManagePromo(req, { eventId, festId }))) return forbid(res);
    const codes = await prisma.promoCode.findMany({
      where: eventId != null ? { eventId } : { festId },
      orderBy: { createdAt: "desc" },
    });
    return res.json({ success: true, data: codes });
  } catch (error) {
    req.log.error({ err: error }, "List promo codes error");
    return res.status(500).json({ success: false, error: { code: "FETCH_ERROR", message: "Failed to list promo codes" } });
  }
});

// POST /api/events/promo-codes
router.post("/promo-codes", authenticateUser, authorizeRoles("EDITOR", "HOST", "ADMIN"), async (req, res) => {
  try {
    const b = req.body || {};
    const eventId = b.eventId != null ? parseInt(b.eventId) : null;
    // A promo is scoped to a single event OR a whole fest, never both. When an
    // event is given it wins and we NEVER persist a caller-supplied festId — an
    // event-scoped row with a foreign festId would match every booking in that
    // fest (bookings.js OR:[{eventId},{festId}]), letting a host discount a fest
    // they don't manage. A fest-scoped code is created by omitting eventId.
    const festId = eventId != null ? null : b.festId != null ? parseInt(b.festId) : null;
    if (eventId == null && festId == null) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Provide an eventId or a festId to scope the code" } });
    }
    if (!(await callerCanManagePromo(req, { eventId, festId }))) return forbid(res);
    const code = String(b.code || "").trim();
    if (!code) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Code is required" } });
    const kind = String(b.kind || "").toUpperCase();
    if (!PROMO_KINDS.includes(kind)) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "kind must be PERCENT or FLAT" } });
    const created = await prisma.promoCode.create({
      data: {
        code,
        festId,
        eventId,
        kind,
        percentOff: kind === "PERCENT" ? Math.max(0, Math.min(100, promoNum(b.percentOff) ?? 0)) : null,
        flatOffPaise: kind === "FLAT" ? Math.max(0, promoNum(b.flatOffPaise) ?? 0) : null,
        maxDiscountPaise: promoNum(b.maxDiscountPaise),
        minSubtotalPaise: promoNum(b.minSubtotalPaise),
        maxRedemptions: promoNum(b.maxRedemptions),
        startsAt: b.startsAt ? new Date(b.startsAt) : null,
        expiresAt: b.expiresAt ? new Date(b.expiresAt) : null,
        active: b.active !== false,
      },
    });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    if (error?.code === "P2002") {
      return res.status(409).json({ success: false, error: { code: "CONFLICT", message: "A promo code with this code already exists for this fest" } });
    }
    req.log.error({ err: error }, "Create promo code error");
    return res.status(500).json({ success: false, error: { code: "CREATE_ERROR", message: "Failed to create promo code" } });
  }
});

// PATCH /api/events/promo-codes/:id
router.patch("/promo-codes/:id", authenticateUser, authorizeRoles("EDITOR", "HOST", "ADMIN"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const promo = await prisma.promoCode.findUnique({ where: { id } });
    if (!promo) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Promo code not found" } });
    if (!(await callerCanManagePromo(req, { eventId: promo.eventId, festId: promo.festId }))) return forbid(res);
    const b = req.body || {};
    const opt = (v) => (v === undefined ? undefined : promoNum(v));
    const updated = await prisma.promoCode.update({
      where: { id },
      data: {
        active: typeof b.active === "boolean" ? b.active : undefined,
        percentOff: opt(b.percentOff),
        flatOffPaise: opt(b.flatOffPaise),
        maxDiscountPaise: opt(b.maxDiscountPaise),
        minSubtotalPaise: opt(b.minSubtotalPaise),
        maxRedemptions: opt(b.maxRedemptions),
        expiresAt: b.expiresAt !== undefined ? (b.expiresAt ? new Date(b.expiresAt) : null) : undefined,
      },
    });
    return res.json({ success: true, data: updated });
  } catch (error) {
    req.log.error({ err: error }, "Update promo code error");
    return res.status(500).json({ success: false, error: { code: "UPDATE_ERROR", message: "Failed to update promo code" } });
  }
});

// DELETE /api/events/promo-codes/:id
router.delete("/promo-codes/:id", authenticateUser, authorizeRoles("EDITOR", "HOST", "ADMIN"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const promo = await prisma.promoCode.findUnique({ where: { id } });
    if (!promo) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Promo code not found" } });
    if (!(await callerCanManagePromo(req, { eventId: promo.eventId, festId: promo.festId }))) return forbid(res);
    await prisma.promoCode.delete({ where: { id } });
    return res.json({ success: true, data: { id } });
  } catch (error) {
    req.log.error({ err: error }, "Delete promo code error");
    return res.status(500).json({ success: false, error: { code: "DELETE_ERROR", message: "Failed to delete promo code" } });
  }
});

// GET /api/events/:id - Get single event with details
router.get("/:id", optionalAuthenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const event = await prisma.event.findUnique({
      where: { id: parseInt(id) },
      include: {
        fest: { select: { ...FEST_PUBLIC_SELECT, isDeleted: true } },
        host: {
          select: { id: true, name: true, email: true },
        },
        ticketTypes: {
          orderBy: { price: "asc" },
        },
        questions: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Event not found" },
      });
    }

    const canManage = req.user ? await callerCanManageEvent(event, req) : false;

    // Hide DRAFT/PRIVATE events, and events whose fest is soft-deleted, from
    // anyone who isn't the event's host or an ADMIN of its fest. Return 404 (not
    // 403) so we don't leak existence.
    const festDeleted = event.fest?.isDeleted === true;
    const isPublic =
      event.status === "PUBLISHED" && event.visibility === "PUBLIC" && !festDeleted;
    if (!isPublic && !canManage) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Event not found" },
      });
    }

    // Don't leak the host's email address to public (non-managing) callers — only
    // the event's host or a fest ADMIN may see it.
    if (!canManage && event.host) {
      event.host = { id: event.host.id, name: event.host.name };
    }

    res.json({
      success: true,
      data: withEffectiveStatus(event),
    });
  } catch (error) {
    req.log.error({ err: error }, "Error fetching event");
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch event" },
    });
  }
});

// PAY-06: normalize the refund policy + cutoff. The cutoff only applies to
// FULL_UNTIL_CUTOFF; it is cleared for the other policies so a stale value can't
// be misread as an open window.
function normalizeRefundFields(policy, cutoff) {
  const p = ["NO_REFUND", "FULL_ANYTIME", "FULL_UNTIL_CUTOFF"].includes(policy) ? policy : "NO_REFUND";
  const parsed = p === "FULL_UNTIL_CUTOFF" && cutoff != null && cutoff !== "" ? parseInt(cutoff) : NaN;
  return { refundPolicy: p, refundCutoffHours: Number.isFinite(parsed) ? Math.max(0, parsed) : null };
}

// POST /api/events - Create a new event. Requires an authenticated EDITOR/HOST/ADMIN.
// The event is always owned by the caller (hostId from the token); a supplied
// festId must be the caller's own fest.
router.post("/", authenticateUser, authorizeRoles("EDITOR", "HOST", "ADMIN"), validate(createEventSchema), async (req, res) => {
  try {
    const {
      festId,
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
      refundPolicy,
      refundCutoffHours,
      ticketTypes,
      questions,
    } = req.body;

    // Validation
    if (!name) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Event name is required" },
      });
    }

    // If a fest is specified it must be one the caller owns (managed or editor fest).
    if (festId) {
      if (!canAccessFest(parseInt(festId), await callerFests(req))) {
        return forbid(res, "You do not have access to create events for this fest");
      }
    }

    // The event is always owned by the authenticated caller; any body hostId is ignored.
    const hostId = req.user.userId;

    // Create event with ticket types in a transaction
    const event = await prisma.$transaction(async (tx) => {
      const newEvent = await tx.event.create({
        data: {
          festId: festId ? parseInt(festId) : null,
          hostId: hostId ? parseInt(hostId) : null,
          name,
          shortDescription: shortDescription || null,
          description: description || null,
          aboutEvent: aboutEvent || null,
          audience: audience || null,
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
          status: status || "PUBLISHED",
          discount: discount || 0,
          ...normalizeRefundFields(refundPolicy, refundCutoffHours),
        },
      });

      // Create ticket types if provided
      if (ticketTypes && ticketTypes.length > 0) {
        await tx.ticketType.createMany({
          data: ticketTypes.map((ticket) => ({
            eventId: newEvent.id,
            name: ticket.name,
            price: Math.round(Number(ticket.price)) || 0,
            quantity: parseInt(ticket.quantity) || 100,
            description: ticket.description || null,
          })),
        });
      }

      // Persist registration questions if provided (whitelist each field).
      if (questions && questions.length > 0) {
        await tx.eventQuestion.createMany({
          data: questions.map((q, i) => ({
            eventId: newEvent.id,
            label: q.label,
            type: q.type || "text",
            options: q.options ?? null,
            required: q.required ?? false,
            order: q.order ?? i,
          })),
        });
      }

      // Return event with ticket types + questions
      return tx.event.findUnique({
        where: { id: newEvent.id },
        include: {
          ticketTypes: true,
          questions: { orderBy: { order: "asc" } },
          fest: { select: FEST_PUBLIC_SELECT },
        },
      });
    });

    res.status(201).json({
      success: true,
      data: event,
      message: "Event created successfully",
    });
  } catch (error) {
    req.log.error({ err: error }, "Error creating event");
    res.status(500).json({
      success: false,
      error: { code: "CREATE_ERROR", message: "Failed to create event", details: error.message },
    });
  }
});

// PUT /api/events/:id - Update an event
router.put("/:id", authenticateUser, async (req, res) => {
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
      refundPolicy,
      refundCutoffHours,
    } = req.body;

    // Only the event's host (or an ADMIN of its fest) may update it.
    const owner = await checkEventOwnership(parseInt(id), req);
    if (!owner.ok) return res.status(owner.status).json(owner.body);

    // STATUS is governed by the state machine (see PATCH /:id/status). If one is
    // supplied here, validate it the same way rather than writing it blindly —
    // this blocks re-publishing a CANCELLED event and storing derived-only values
    // (UPCOMING/LIVE/PAST). Absent/unchanged status leaves it untouched.
    let nextStatus; // undefined => leave unchanged
    if (status !== undefined && status !== null && status !== owner.event.status) {
      if (!["PUBLISHED", "DRAFT", "CANCELLED"].includes(status)) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "status must be one of PUBLISHED, DRAFT, CANCELLED" },
        });
      }
      const allowedNext = STATUS_TRANSITIONS[owner.event.status] || [];
      if (!allowedNext.includes(status)) {
        return res.status(400).json({
          success: false,
          error: { code: "INVALID_TRANSITION", message: `Cannot change status from ${owner.event.status} to ${status}` },
        });
      }
      nextStatus = status;
    }

    // VISIBILITY enum guard — reject anything but PUBLIC/PRIVATE with a 400 instead
    // of letting an invalid enum surface as an opaque Prisma 500.
    if (visibility !== undefined && visibility !== null && !["PUBLIC", "PRIVATE"].includes(visibility)) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "visibility must be PUBLIC or PRIVATE" },
      });
    }

    // DISCOUNT is a percentage; clamp to [0,100] so a negative (overcharge) or
    // >100 (negative total) value can never be stored. (PUT has no zod validator.)
    let nextDiscount; // undefined => leave unchanged
    if (discount !== undefined && discount !== null) {
      const d = Number(discount);
      if (Number.isNaN(d)) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "discount must be a number between 0 and 100" },
        });
      }
      nextDiscount = Math.min(100, Math.max(0, d));
    }

    // PAY-06 refund policy (PUT has no zod validator, so guard inline). undefined
    // => leave unchanged. Switching to a non-cutoff policy clears the cutoff.
    let nextRefundPolicy; // undefined => unchanged
    let nextRefundCutoffHours; // undefined => unchanged
    if (refundPolicy !== undefined && refundPolicy !== null) {
      if (!["NO_REFUND", "FULL_ANYTIME", "FULL_UNTIL_CUTOFF"].includes(refundPolicy)) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "refundPolicy must be NO_REFUND, FULL_ANYTIME, or FULL_UNTIL_CUTOFF" },
        });
      }
      nextRefundPolicy = refundPolicy;
      if (refundPolicy !== "FULL_UNTIL_CUTOFF") nextRefundCutoffHours = null;
    }
    if (refundCutoffHours !== undefined) {
      if (refundCutoffHours === null || refundCutoffHours === "") {
        nextRefundCutoffHours = null;
      } else {
        const h = parseInt(refundCutoffHours);
        if (!Number.isFinite(h) || h < 0) {
          return res.status(400).json({
            success: false,
            error: { code: "VALIDATION_ERROR", message: "refundCutoffHours must be a non-negative integer" },
          });
        }
        nextRefundCutoffHours = h;
      }
    }

    const event = await prisma.event.update({
      where: { id: parseInt(id) },
      data: {
        name,
        description,
        aboutEvent,
        image,
        category,
        refundPolicy: nextRefundPolicy,
        refundCutoffHours: nextRefundCutoffHours,
        // Distinguish "clear this date" (explicit null in the body) from "leave
        // unchanged" (key absent -> undefined). Previously a null could never
        // clear a date because it collapsed to undefined.
        startDate: startDate === undefined ? undefined : startDate ? new Date(startDate) : null,
        endDate: endDate === undefined ? undefined : endDate ? new Date(endDate) : null,
        startTime,
        endTime,
        venue,
        venueAddress,
        onlineLink,
        isOnline,
        visibility,
        status: nextStatus,
        discount: nextDiscount,
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
    req.log.error({ err: error }, "Error updating event");
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

// PATCH /api/events/:id/status - Publish / unpublish / cancel an event. Owner
// (host) or ADMIN of the event's fest only. Validates the transition against the
// current stored status (STATUS_TRANSITIONS, defined near the top).
router.patch("/:id/status", authenticateUser, async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { status } = req.body;

    if (!["PUBLISHED", "DRAFT", "CANCELLED"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "status must be one of PUBLISHED, DRAFT, CANCELLED" },
      });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { status: true, hostId: true, festId: true },
    });
    if (!event) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Event not found" },
      });
    }
    if (!(await callerCanManageEvent(event, req))) {
      return res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: "You do not have permission to modify this event" },
      });
    }

    // Only validate a genuine change; setting the same status is a harmless no-op.
    if (event.status !== status) {
      const allowed = STATUS_TRANSITIONS[event.status] || [];
      if (!allowed.includes(status)) {
        return res.status(400).json({
          success: false,
          error: { code: "INVALID_TRANSITION", message: `Cannot change status from ${event.status} to ${status}` },
        });
      }
    }

    const updated = await prisma.event.update({
      where: { id: eventId },
      data: { status },
      include: { ticketTypes: true },
    });

    res.json({
      success: true,
      data: withEffectiveStatus(updated),
      message: "Event status updated successfully",
    });
  } catch (error) {
    req.log.error({ err: error }, "Error updating event status");
    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Event not found" },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: "UPDATE_ERROR", message: "Failed to update event status" },
    });
  }
});

// DELETE /api/events/:id - Delete an event
router.delete("/:id", authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    // Only the event's host (or an ADMIN of its fest) may delete it.
    const owner = await checkEventOwnership(parseInt(id), req);
    if (!owner.ok) return res.status(owner.status).json(owner.body);

    await prisma.event.delete({
      where: { id: parseInt(id) },
    });

    res.json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    req.log.error({ err: error }, "Error deleting event");
    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Event not found" },
      });
    }
    // Foreign-key violation: the event still has bookings referencing it.
    if (error.code === "P2003") {
      return res.status(409).json({
        success: false,
        error: { code: "HAS_BOOKINGS", message: "Cannot delete — bookings exist. Cancel the event instead." },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: "DELETE_ERROR", message: "Failed to delete event" },
    });
  }
});

// ==================== TICKET TYPES ====================

// GET /api/events/:id/ticket-types - Get ticket types for an event
router.get("/:id/ticket-types", optionalAuthenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const eventId = parseInt(id);

    // L1: don't expose ticket names/prices/quantities for a DRAFT/PRIVATE event
    // (or a soft-deleted fest's event) to anyone who isn't its host or an ADMIN of
    // its fest — mirror the GET /api/events/:id visibility gate; 404 to avoid leaking existence.
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        status: true,
        visibility: true,
        hostId: true,
        festId: true,
        fest: { select: { isDeleted: true } },
      },
    });
    if (!event) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Event not found" },
      });
    }
    const isPublic =
      event.status === "PUBLISHED" &&
      event.visibility === "PUBLIC" &&
      event.fest?.isDeleted !== true;
    if (!isPublic && !(req.user && (await callerCanManageEvent(event, req)))) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Event not found" },
      });
    }

    const ticketTypes = await prisma.ticketType.findMany({
      where: { eventId },
      orderBy: { price: "asc" },
    });

    res.json({
      success: true,
      data: ticketTypes,
    });
  } catch (error) {
    req.log.error({ err: error }, "Error fetching ticket types");
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch ticket types" },
    });
  }
});

// POST /api/events/:id/ticket-types - Create a ticket type
router.post("/:id/ticket-types", authenticateUser, validate(ticketTypeSchema), async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { name, price, quantity, description } = req.body;

    const owner = await checkEventOwnership(eventId, req);
    if (!owner.ok) return res.status(owner.status).json(owner.body);

    if (!name || price === undefined || !quantity) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Name, price, and quantity are required" },
      });
    }
    const priceNum = Math.round(Number(price));
    const qtyNum = parseInt(quantity);
    if (Number.isNaN(priceNum) || priceNum < 0 || Number.isNaN(qtyNum) || qtyNum < 0) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "price must be >= 0 and quantity a non-negative integer" },
      });
    }

    const ticketType = await prisma.ticketType.create({
      data: {
        eventId,
        name,
        price: priceNum,
        quantity: qtyNum,
        description,
      },
    });

    res.status(201).json({
      success: true,
      data: ticketType,
      message: "Ticket type created successfully",
    });
  } catch (error) {
    req.log.error({ err: error }, "Error creating ticket type");
    res.status(500).json({
      success: false,
      error: { code: "CREATE_ERROR", message: "Failed to create ticket type" },
    });
  }
});

// PUT /api/events/:eventId/ticket-types/:ticketId - Update a ticket type
router.put("/:eventId/ticket-types/:ticketId", authenticateUser, validate(ticketTypeSchema), async (req, res) => {
  try {
    const { eventId, ticketId } = req.params;
    const { name, price, quantity, description } = req.body;

    const existing = await prisma.ticketType.findUnique({
      where: { id: parseInt(ticketId) },
      select: { eventId: true, event: { select: { hostId: true, festId: true } } },
    });
    if (!existing || existing.eventId !== parseInt(eventId)) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Ticket type not found" },
      });
    }
    if (!(await callerCanManageEvent(existing.event, req))) {
      return res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: "You do not have permission to modify this event" },
      });
    }

    if (price !== undefined) {
      const p = Math.round(Number(price));
      if (Number.isNaN(p) || p < 0) {
        return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "price must be >= 0" } });
      }
    }
    if (quantity !== undefined) {
      const q = parseInt(quantity);
      if (Number.isNaN(q) || q < 0) {
        return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "quantity must be a non-negative integer" } });
      }
    }

    const ticketType = await prisma.ticketType.update({
      where: { id: parseInt(ticketId) },
      data: {
        name,
        price: price !== undefined ? Math.round(Number(price)) : undefined,
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
    req.log.error({ err: error }, "Error updating ticket type");
    res.status(500).json({
      success: false,
      error: { code: "UPDATE_ERROR", message: "Failed to update ticket type" },
    });
  }
});

// DELETE /api/events/:eventId/ticket-types/:ticketId - Delete a ticket type
router.delete("/:eventId/ticket-types/:ticketId", authenticateUser, async (req, res) => {
  try {
    const { eventId, ticketId } = req.params;

    const existing = await prisma.ticketType.findUnique({
      where: { id: parseInt(ticketId) },
      select: { eventId: true, event: { select: { hostId: true, festId: true } } },
    });
    if (!existing || existing.eventId !== parseInt(eventId)) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Ticket type not found" },
      });
    }
    if (!(await callerCanManageEvent(existing.event, req))) {
      return res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: "You do not have permission to modify this event" },
      });
    }

    await prisma.ticketType.delete({
      where: { id: parseInt(ticketId) },
    });

    res.json({
      success: true,
      message: "Ticket type deleted successfully",
    });
  } catch (error) {
    req.log.error({ err: error }, "Error deleting ticket type");
    // Foreign-key violation: the ticket type still has bookings referencing it.
    if (error.code === "P2003") {
      return res.status(409).json({
        success: false,
        error: { code: "HAS_BOOKINGS", message: "Cannot delete — bookings exist. Cancel the event instead." },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: "DELETE_ERROR", message: "Failed to delete ticket type" },
    });
  }
});

// ==================== HOST DASHBOARD ====================

// GET /api/events/host/:hostId - Get all events for a host
router.get("/host/:hostId", optionalAuthenticate, async (req, res) => {
  try {
    const { hostId } = req.params;
    const hostIdNum = parseInt(hostId);

    // M1: only the host themselves or an ADMIN may see this host's DRAFT/PRIVATE
    // events. Everyone else is limited to PUBLISHED + PUBLIC, matching GET /api/events
    // and GET /api/events/:id (otherwise this endpoint leaks unpublished events + pricing).
    const isOwnerOrAdmin =
      req.user && (req.user.userId === hostIdNum || req.user.role === "ADMIN");
    const where = isOwnerOrAdmin
      ? { hostId: hostIdNum }
      : { hostId: hostIdNum, status: "PUBLISHED", visibility: "PUBLIC" };

    const events = await prisma.event.findMany({
      where,
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
    req.log.error({ err: error }, "Error fetching host events");
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch events" },
    });
  }
});

// GET /api/events/:id/buyers - Get all buyers/bookings for an event (for host dashboard)
router.get("/:id/buyers", authenticateUser, async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);

    // The event's host, or any ADMIN/EDITOR/HOST of its fest, may see the buyer
    // list (read access mirrors the fest-wide model).
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { hostId: true, festId: true },
    });
    if (!event) {
      return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Event not found" } });
    }
    if (!(await callerCanViewEvent(event, req))) {
      return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "You do not have permission to view this event's buyers" } });
    }

    // ARCH-07: paginate the buyer list (default 50, max 100 per page) so a large
    // event does not stream thousands of booking graphs on every request.
    const { page, pageSize, skip, take } = parsePagination(req.query);
    const buyerWhere = { eventId, status: "COMPLETED" };
    const total = await prisma.booking.count({ where: buyerWhere });
    const bookings = await prisma.booking.findMany({
      where: buyerWhere,
      orderBy: { purchaseDate: "desc" },
      skip,
      take,
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
        // Surface the custom registration-question answers to the organiser.
        // AttendeeAnswer stores questionId (there is no `question` relation), so
        // labels are resolved from the event's questions below.
        answers: { select: { questionId: true, value: true } },
      },
    });

    // Resolve question labels for this event once, then map each answer's
    // questionId → label (avoids a non-existent AttendeeAnswer.question relation).
    const questions = await prisma.eventQuestion.findMany({
      where: { eventId },
      select: { id: true, label: true },
    });
    const labelByQuestionId = Object.fromEntries(
      (questions || []).map((q) => [q.id, q.label])
    );

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
      answers: (booking.answers || []).map((a) => ({
        question: labelByQuestionId[a.questionId] || "",
        value: a.value,
      })),
    }));

    res.json({
      success: true,
      data: { buyers, pagination: buildPagination(page, pageSize, total) },
    });
  } catch (error) {
    req.log.error({ err: error }, "Error fetching buyers");
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch buyers" },
    });
  }
});

// GET /api/events/:id/stats - Get event statistics
router.get("/:id/stats", authenticateUser, async (req, res) => {
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

    // The event's host, or any ADMIN/EDITOR/HOST of its fest, may see event stats.
    if (!(await callerCanViewEvent(event, req))) {
      return res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: "You do not have permission to view this event's stats" },
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
    req.log.error({ err: error }, "Error fetching event stats");
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch event stats" },
    });
  }
});

// ==================== MARKETING (SPONSORS & EXPENSES) ====================

// GET /api/events/marketing/host/:hostId/sponsors
router.get("/marketing/host/:hostId/sponsors", async (req, res) => {
  try {
    const { hostId } = req.params;
    if (parseInt(hostId) !== req.user.userId && req.user.role !== "ADMIN") return forbid(res);

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
    req.log.error({ err: error }, "Error fetching sponsors");
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch sponsors" },
    });
  }
});

// GET /api/events/marketing/fest/:festId/sponsors - all sponsors linked to a fest
router.get("/marketing/fest/:festId/sponsors", async (req, res) => {
  try {
    const { festId } = req.params;
    const id = parseInt(festId);
    if (!canAccessFest(id, await callerFests(req))) return forbid(res);

    const sponsors = await prisma.sponsor.findMany({
      where: {
        OR: [
          { festId: id },
          { event: { festId: id } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: sponsors });
  } catch (error) {
    req.log.error({ err: error }, "Error fetching fest sponsors");
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch fest sponsors" },
    });
  }
});

// POST /api/events/marketing/host/:hostId/sponsors
router.post("/marketing/host/:hostId/sponsors", validate(createSponsorSchema), async (req, res) => {
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

    // H1: a marketing sponsor must belong to a fest/event the CALLER actually
    // manages. Without this, any EDITOR/HOST of another fest could POST here with a
    // body festId and inject a sponsor into someone else's ledger + financial totals.
    const fests = await callerFests(req);
    let targetFestId = festId ? parseInt(festId) : null;
    if (eventId) {
      const ev = await prisma.event.findUnique({
        where: { id: parseInt(eventId) },
        select: { festId: true },
      });
      if (!ev) {
        return res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Event not found" },
        });
      }
      // If a festId was also supplied it must agree with the event's fest.
      if (targetFestId != null && ev.festId !== targetFestId) {
        return forbid(res, "Event does not belong to the given fest");
      }
      targetFestId = ev.festId;
    }
    if (targetFestId == null || !canAccessFest(targetFestId, fests)) {
      return forbid(res, "You can only add sponsors to a fest you manage");
    }

    // An inline { agreementDataUrl } (or { agreementFile:{dataUrl} }) is written
    // to disk and its /uploads URL stored; a plain agreementUrl string is kept.
    const agreementUrl = await resolveAgreementUrl(req.body);

    const sponsor = await prisma.sponsor.create({
      data: {
        festId: festId ? parseInt(festId) : null,
        eventId: eventId ? parseInt(eventId) : null,
        companyName,
        contactPerson,
        email: email || null,
        phone: phone || null,
        sponsorshipAmount: Math.round(Number(sponsorshipAmount)) || 0,
        receivedAmount: Math.round(Number(receivedAmount)) || 0,
        status: status || "NEGOTIATING",
        notes: notes || null,
        agreementUrl: agreementUrl ?? null,
      },
    });

    res.status(201).json({
      success: true,
      data: sponsor,
      message: "Sponsor saved successfully",
    });
  } catch (error) {
    req.log.error({ err: error }, "Error creating sponsor");
    res.status(500).json({
      success: false,
      error: { code: "CREATE_ERROR", message: "Failed to create sponsor" },
    });
  }
});

// PUT /api/events/marketing/sponsors/:id
router.put("/marketing/sponsors/:id", validate(updateSponsorSchema), async (req, res) => {
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

    if (companyName !== undefined && !String(companyName).trim()) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Company name cannot be empty" },
      });
    }
    if (contactPerson !== undefined && !String(contactPerson).trim()) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Contact person cannot be empty" },
      });
    }

    // Ownership: only the host of the sponsor's event, or an ADMIN/editor of the
    // sponsor's fest, may mutate it. Guards against cross-tenant IDOR.
    const existing = await prisma.sponsor.findUnique({
      where: { id: parseInt(id) },
      select: { festId: true, event: { select: { festId: true, hostId: true } } },
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Sponsor not found" },
      });
    }
    let owns = existing.event?.hostId != null && existing.event.hostId === req.user.userId;
    if (!owns) {
      const rowFestId = existing.festId ?? existing.event?.festId ?? null;
      owns = canAccessFest(rowFestId, await callerFests(req));
    }
    if (!owns) return forbid(res);

    // resolveAgreementUrl returns undefined when the body carries no agreement
    // info, so the column is left untouched on update.
    const agreementUrl = await resolveAgreementUrl(req.body);

    const sponsor = await prisma.sponsor.update({
      where: { id: parseInt(id) },
      data: {
        companyName,
        contactPerson,
        email,
        phone,
        sponsorshipAmount: sponsorshipAmount !== undefined ? Math.round(Number(sponsorshipAmount)) : undefined,
        receivedAmount: receivedAmount !== undefined ? Math.round(Number(receivedAmount)) : undefined,
        status,
        notes,
        festId: festId !== undefined ? (festId ? parseInt(festId) : null) : undefined,
        eventId: eventId !== undefined ? (eventId ? parseInt(eventId) : null) : undefined,
        agreementUrl,
      },
    });

    res.json({
      success: true,
      data: sponsor,
      message: "Sponsor updated successfully",
    });
  } catch (error) {
    req.log.error({ err: error }, "Error updating sponsor");
    res.status(500).json({
      success: false,
      error: { code: "UPDATE_ERROR", message: "Failed to update sponsor" },
    });
  }
});

// DELETE /api/events/marketing/sponsors/:id
router.delete("/marketing/sponsors/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Ownership: only the host of the sponsor's event, or an ADMIN/editor of the
    // sponsor's fest, may delete it. Guards against cross-tenant IDOR.
    const existing = await prisma.sponsor.findUnique({
      where: { id: parseInt(id) },
      select: { festId: true, event: { select: { festId: true, hostId: true } } },
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Sponsor not found" },
      });
    }
    let owns = existing.event?.hostId != null && existing.event.hostId === req.user.userId;
    if (!owns) {
      const rowFestId = existing.festId ?? existing.event?.festId ?? null;
      owns = canAccessFest(rowFestId, await callerFests(req));
    }
    if (!owns) return forbid(res);

    await prisma.sponsor.delete({ where: { id: parseInt(id) } });

    res.json({
      success: true,
      message: "Sponsor deleted successfully",
    });
  } catch (error) {
    req.log.error({ err: error }, "Error deleting sponsor");
    res.status(500).json({
      success: false,
      error: { code: "DELETE_ERROR", message: "Failed to delete sponsor" },
    });
  }
});

// GET /api/events/marketing/host/:hostId/expenses
router.get("/marketing/host/:hostId/expenses", async (req, res) => {
  try {
    const { hostId } = req.params;
    if (parseInt(hostId) !== req.user.userId && req.user.role !== "ADMIN") return forbid(res);

    const expenses = await prisma.expense.findMany({
      where: { hostId: parseInt(hostId) },
      include: { files: true, fest: { select: FEST_PUBLIC_SELECT }, event: true },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: expenses });
  } catch (error) {
    req.log.error({ err: error }, "Error fetching expenses");
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch expenses" },
    });
  }
});

// GET /api/events/marketing/fest/:festId/expenses - all expenses for a fest
router.get("/marketing/fest/:festId/expenses", async (req, res) => {
  try {
    const { festId } = req.params;
    const id = parseInt(festId);
    if (!canAccessFest(id, await callerFests(req))) return forbid(res);

    const expenses = await prisma.expense.findMany({
      where: {
        OR: [
          { festId: id },
          { event: { festId: id } },
        ],
      },
      include: {
        host: { select: USER_PUBLIC_SELECT },
        fest: { select: FEST_PUBLIC_SELECT },
        event: true,
        files: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: expenses });
  } catch (error) {
    req.log.error({ err: error }, "Error fetching fest expenses");
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch fest expenses" },
    });
  }
});

// POST /api/events/marketing/host/:hostId/expenses
router.post("/marketing/host/:hostId/expenses", validate(createExpenseSchema), async (req, res) => {
  try {
    const { hostId } = req.params;
    if (parseInt(hostId) !== req.user.userId && req.user.role !== "ADMIN") return forbid(res);
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

    const fileCreates = await buildExpenseFileCreates(proofFiles, billFiles);

    const expense = await prisma.expense.create({
      data: {
        hostId: parseInt(hostId),
        festId: festId ? parseInt(festId) : null,
        eventId: eventId ? parseInt(eventId) : null,
        description,
        category,
        vendor,
        amount: Math.round(Number(amount)) || 0,
        paymentDate: safeDate(paymentDate),
        paymentMethod: paymentMethod || null,
        notes: notes || null,
        files: {
          create: fileCreates,
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
    req.log.error({ err: error }, "Error creating expense");
    res.status(500).json({
      success: false,
      error: { code: "CREATE_ERROR", message: "Failed to create expense" },
    });
  }
});

// PUT /api/events/marketing/expenses/:id
router.put("/marketing/expenses/:id", validate(updateExpenseSchema), async (req, res) => {
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

    for (const [label, value] of [
      ["Description", description],
      ["Category", category],
      ["Vendor", vendor],
    ]) {
      if (value !== undefined && !String(value).trim()) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: `${label} cannot be empty` },
        });
      }
    }

    // Ownership: only the expense's own host, or an ADMIN/editor of its fest, may
    // mutate it. Guards against cross-tenant IDOR.
    const existing = await prisma.expense.findUnique({
      where: { id: parseInt(id) },
      select: { hostId: true, festId: true, event: { select: { festId: true } } },
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Expense not found" },
      });
    }
    let owns = existing.hostId === req.user.userId;
    if (!owns) {
      const rowFestId = existing.festId ?? existing.event?.festId ?? null;
      owns = canAccessFest(rowFestId, await callerFests(req));
    }
    if (!owns) return forbid(res);

    const fileCreates = await buildExpenseFileCreates(proofFiles, billFiles);

    const updated = await prisma.expense.update({
      where: { id: parseInt(id) },
      data: {
        festId: festId !== undefined ? (festId ? parseInt(festId) : null) : undefined,
        eventId: eventId !== undefined ? (eventId ? parseInt(eventId) : null) : undefined,
        description,
        category,
        vendor,
        amount: amount !== undefined ? Math.round(Number(amount)) : undefined,
        paymentDate: paymentDate !== undefined ? safeDate(paymentDate) : undefined,
        paymentMethod,
        notes,
        files: {
          deleteMany: {},
          create: fileCreates,
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
    req.log.error({ err: error }, "Error updating expense");
    res.status(500).json({
      success: false,
      error: { code: "UPDATE_ERROR", message: "Failed to update expense" },
    });
  }
});

// DELETE /api/events/marketing/expenses/:id
router.delete("/marketing/expenses/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Ownership: only the expense's own host, or an ADMIN/editor of its fest, may
    // delete it. Guards against cross-tenant IDOR.
    const existing = await prisma.expense.findUnique({
      where: { id: parseInt(id) },
      select: { hostId: true, festId: true, event: { select: { festId: true } } },
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Expense not found" },
      });
    }
    let owns = existing.hostId === req.user.userId;
    if (!owns) {
      const rowFestId = existing.festId ?? existing.event?.festId ?? null;
      owns = canAccessFest(rowFestId, await callerFests(req));
    }
    if (!owns) return forbid(res);

    await prisma.expense.delete({ where: { id: parseInt(id) } });

    res.json({
      success: true,
      message: "Expense deleted successfully",
    });
  } catch (error) {
    req.log.error({ err: error }, "Error deleting expense");
    res.status(500).json({
      success: false,
      error: { code: "DELETE_ERROR", message: "Failed to delete expense" },
    });
  }
});

export default router;
