import { z } from "zod";

// Fest create/update body. `name`/`college` are left optional here so the
// route's own "Name and college are required" check (which returns the
// {success,error} envelope, and only runs after the id/ownership checks on
// update) stays the authoritative gate. Dates are accepted as plain strings —
// the route parses them and returns its own INVALID_DATE errors — so zod only
// type-checks and length-caps them. Unlisted fields pass through unchanged.
const festBody = z
  .object({
    name: z.string().max(200, "Name is too long").optional().nullable(),
    college: z.string().max(200, "College is too long").optional().nullable(),
    description: z.string().max(20000, "Description is too long").optional().nullable(),
    image: z.string().max(2000, "Image URL is too long").optional().nullable(),
    startDate: z.string().max(100, "Invalid start date").optional().nullable(),
    endDate: z.string().max(100, "Invalid end date").optional().nullable(),
  })
  .passthrough();

export const createFestSchema = festBody;
export const updateFestSchema = festBody;
