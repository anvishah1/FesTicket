import { z } from "zod";

// An integer id that may arrive as a JS number or a numeric string (the routes
// parseInt() these). Rejects genuinely malformed ids like "abc" / {} / true.
const intLike = z.union([
  z.number().int("Must be an integer"),
  z.string().regex(/^\d+$/, "Must be a positive integer id"),
]);

// One requested ticket line. NOTE: `quantity` is intentionally only type-checked
// here (must be a number). The stricter domain rule — integer >= 1, plus the
// per-type aggregation + atomic guarded sold-write — is enforced inline in the
// route (H10a/H10b/H10c) and MUST stay there; zod is defense-in-depth on top.
const ticketSelectionSchema = z
  .object({
    ticketTypeId: intLike,
    quantity: z.number(),
  })
  .passthrough();

const attendeeSchema = z
  .object({
    ticketTypeId: intLike.optional(),
    name: z.string().max(200, "Attendee name is too long").optional().nullable(),
    email: z.string().max(254, "Attendee email is too long").optional().nullable(),
  })
  .passthrough();

// POST /api/bookings body. `eventId` and `tickets` are left optional here so the
// route's existing required/non-empty checks (which return the {success,error}
// envelope) stay the authoritative gate; zod adds type + size guards on top.
// `discount` is deliberately NOT accepted from the body — it is derived
// server-side from the event (see CONTRACT DISCOUNT / M8).
export const createBookingSchema = z
  .object({
    eventId: intLike.optional(),
    userId: intLike.optional().nullable(),
    guestEmail: z.string().max(254, "Email is too long").optional().nullable(),
    guestName: z.string().max(200, "Name is too long").optional().nullable(),
    guestPhone: z.string().max(50, "Phone is too long").optional().nullable(),
    tickets: z.array(ticketSelectionSchema).optional(),
    attendees: z.array(attendeeSchema).optional().nullable(),
  })
  .passthrough();
