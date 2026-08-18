import { z } from "zod";

// SEO-10: the curated event-category taxonomy, mirrored from
// frontend/lib/categories.ts. Event.category is stored as one of these canonical
// LABEL strings; values are validated case-insensitively so legacy casing still
// maps in. Keep this list in sync with the frontend module.
export const EVENT_CATEGORIES = [
  "Workshop",
  "Networking",
  "Conference",
  "Meetup",
  "Hackathon",
  "Concert",
  "Cultural",
  "Technical",
  "Sports",
  "Other",
];

// Canonical label for a value (case-insensitive), or undefined if it is not in
// the curated set. null/undefined/blank -> null (no category). Shared by the
// create zod schema and the PUT handler's inline guard.
export function normalizeCategory(value) {
  if (value == null) return null;
  const v = String(value).trim();
  if (v === "") return null;
  return EVENT_CATEGORIES.find((l) => l.toLowerCase() === v.toLowerCase());
}

// zod field: accept a curated label (any casing) and normalize to canonical, or
// reject with a listing of the allowed values. Blank collapses to null.
const categoryLike = z
  .string()
  .max(100)
  .transform((v) => v.trim())
  .refine((v) => v === "" || EVENT_CATEGORIES.some((l) => l.toLowerCase() === v.toLowerCase()), {
    message: `category must be one of: ${EVENT_CATEGORIES.join(", ")}`,
  })
  .transform((v) => (v === "" ? null : EVENT_CATEGORIES.find((l) => l.toLowerCase() === v.toLowerCase())))
  .optional()
  .nullable();

// Numbers that may arrive as JS number or numeric string (routes parseInt/parseFloat these).
const intLike = z.union([
  z.number().int("Must be an integer"),
  z.string().regex(/^\d+$/, "Must be a positive integer id"),
]);
const numberLike = z.union([z.number(), z.string()]);

// Event discount is a PERCENTAGE and must stay in [0, 100]. A negative value would
// OVERCHARGE every buyer; a value > 100 would produce a NEGATIVE booking total.
// Accept a number or numeric string but reject out-of-range values.
const discountLike = z.union([
  z.number().min(0, "discount must be >= 0").max(100, "discount must be <= 100"),
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, "discount must be a number between 0 and 100")
    .refine((s) => Number(s) >= 0 && Number(s) <= 100, "discount must be between 0 and 100"),
]);

// Only these statuses may be STORED on an event. UPCOMING/LIVE/PAST are derived at
// read time (deriveEffectiveStatus) and must never be persisted.
const storableEventStatus = z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]);

// A non-negative money amount: JS number >= 0 OR a numeric string like "100" /
// "99.50". Rejects negatives and non-numeric strings (the route parseFloat's it).
// PAY-03: ticket price is INTEGER PAISE (the frontend converts its rupee input
// to paise before POST). Whole paise only, non-negative.
const priceLike = z.union([
  z.number().int("price must be an integer number of paise").nonnegative("price must be >= 0"),
  z.string().trim().regex(/^\d+$/, "price must be a non-negative integer (paise)"),
]);

// A non-negative integer count: JS integer >= 0 OR a digit string like "5".
// Rejects negatives, decimals, blank/empty, and non-numeric strings.
const quantityLike = z.union([
  z.number().int("quantity must be an integer").nonnegative("quantity must be >= 0"),
  z.string().trim().regex(/^\d+$/, "quantity must be a non-negative integer"),
]);

// Whitelist the mutable enum-ish fields (mirrors prisma EventStatus / Visibility).
const eventStatus = z.enum([
  "DRAFT",
  "PUBLISHED",
  "UPCOMING",
  "LIVE",
  "PAST",
  "CANCELLED",
]);
const visibility = z.enum(["PUBLIC", "PRIVATE"]);

// PAY-06: buyer refund policy + optional cutoff (hours before startDate). The
// cutoff is a non-negative integer that may arrive as a number or digit string.
const refundPolicy = z.enum(["NO_REFUND", "FULL_ANYTIME", "FULL_UNTIL_CUTOFF"]);
const refundCutoffHoursLike = z.union([
  z.number().int("refundCutoffHours must be an integer").nonnegative("refundCutoffHours must be >= 0"),
  z.string().trim().regex(/^\d+$/, "refundCutoffHours must be a non-negative integer"),
]);

// An online event's meeting link: empty (offline events send none) or a real
// http(s) URL — a bare string like "not a real link" used to pass straight
// through with no format check at all.
const optionalUrl = z.union([z.literal(""), z.string().max(2000).url("Must be a valid URL")]).optional().nullable();

// TIX-10: max tickets per order — a positive integer (>= 1) or null (no cap).
const maxTicketsPerOrderLike = z.union([
  z.number().int("maxTicketsPerOrder must be an integer").positive("maxTicketsPerOrder must be >= 1"),
  z.string().trim().regex(/^\d+$/, "maxTicketsPerOrder must be a positive integer"),
]);

// A ticket type supplied inline when creating an event. price may be a number or
// numeric string (the route parseFloat's it) and must be >= 0. `quantity` is
// REQUIRED on create (a non-negative integer) — a create must not silently
// default a missing/blank quantity to some magic number.
const inlineTicketTypeSchema = z
  .object({
    name: z.string().max(200, "Ticket name is too long").optional().nullable(),
    price: priceLike.optional().nullable(),
    quantity: quantityLike,
    description: z.string().max(2000, "Description is too long").optional().nullable(),
  })
  .passthrough();

// A registration question attached to an event at create time. `label` is
// required; type/required/order have route-applied defaults; options is a free
// string (e.g. comma-separated choices). Extra keys pass through unused.
const eventQuestionSchema = z
  .object({
    label: z.string().min(1, "Question label is required").max(500, "Question label is too long"),
    type: z.string().max(50, "Question type is too long").optional().nullable(),
    required: z.boolean().optional(),
    order: z.number().int("order must be an integer").optional().nullable(),
    options: z.string().max(5000, "Options are too long").optional().nullable(),
  })
  .passthrough();

// POST /api/events. `name` is optional here so the route's own "Event name is
// required" check (which returns the {success,error} envelope) stays the gate;
// zod adds type/length caps + enum whitelisting on top. Unlisted fields pass
// through unchanged (the route reads many optional fields).
export const createEventSchema = z
  .object({
    name: z.string().max(200, "Event name is too long").optional().nullable(),
    shortDescription: z.string().max(1000).optional().nullable(),
    description: z.string().max(20000).optional().nullable(),
    aboutEvent: z.string().max(20000).optional().nullable(),
    image: z.string().max(2000).optional().nullable(),
    category: categoryLike,
    audience: z.string().max(200).optional().nullable(),
    startDate: z.string().max(100).optional().nullable(),
    endDate: z.string().max(100).optional().nullable(),
    startTime: z.string().max(50).optional().nullable(),
    endTime: z.string().max(50).optional().nullable(),
    venue: z.string().max(300).optional().nullable(),
    venueAddress: z.string().max(500).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    onlineLink: optionalUrl,
    meetingLink: optionalUrl,
    eventType: z.string().max(50).optional().nullable(),
    festId: intLike.optional().nullable(),
    discount: discountLike.optional().nullable(),
    status: storableEventStatus.optional(),
    visibility: visibility.optional(),
    refundPolicy: refundPolicy.optional(),
    refundCutoffHours: refundCutoffHoursLike.optional().nullable(),
    maxTicketsPerOrder: maxTicketsPerOrderLike.optional().nullable(),
    ticketTypes: z.array(inlineTicketTypeSchema).optional().nullable(),
    questions: z.array(eventQuestionSchema).optional().nullable(),
  })
  .passthrough()
  // An event must never END BEFORE IT STARTS. Enforced server-side (not just with
  // the wizard's date-picker `min`) because that guard is trivially bypassed by a
  // direct API call, a script, or any other client — and bad ranges were reaching
  // the DB (see the defensive "end not after start" fallback in utils/ics.js).
  .superRefine((data, ctx) => {
    const range = validateDateRange(data.startDate, data.endDate);
    if (range) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: range });
    }
  });

/**
 * Shared start/end check. Returns an error message when the range is invalid, or
 * null when it is fine (including when either side is absent — both are optional).
 * Unparseable dates are ignored here; the route/Prisma layer surfaces those.
 */
export function validateDateRange(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end < start) return "End date must be on or after the start date";
  return null;
}

// POST /api/events/:id/ticket-types and PUT .../ticket-types/:ticketId.
// All fields optional/permissive: the route's inline "name/price/quantity
// required" + "price>=0 / quantity>=0" checks remain the authoritative gate.
export const ticketTypeSchema = z
  .object({
    name: z.string().max(200, "Ticket name is too long").optional().nullable(),
    price: priceLike.optional().nullable(),
    quantity: quantityLike.optional().nullable(),
    description: z.string().max(2000, "Description is too long").optional().nullable(),
  })
  .passthrough();
