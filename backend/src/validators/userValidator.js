import { z } from "zod";

// POST /api/user/complete-profile — the root-layout "Basic Profile" modal.
// All fields optional (the modal may submit a partial profile) but length- and
// format-bounded so unvalidated free text can't be persisted.
export const completeProfileSchema = z
  .object({
    firstName: z.string().trim().max(120, "First name is too long").optional().nullable(),
    lastName: z.string().trim().max(120, "Last name is too long").optional().nullable(),
    organiserName: z.string().trim().max(200, "Organisation name is too long").optional().nullable(),
    phone: z
      .string()
      .trim()
      .max(20, "Phone number is too long")
      .regex(/^[0-9+\-()\s]*$/, "Phone number contains invalid characters")
      .optional()
      .nullable(),
  })
  .passthrough();
