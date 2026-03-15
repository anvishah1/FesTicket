import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email("Invalid email"),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(30, "Password must be less than 30 characters")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[0-9]/, "Password must contain a number")
    .regex(/[^A-Za-z0-9]/, "Password must contain a special character"),

  name: z.string().min(2, "Name must be at least 2 characters").optional(),

  // Student-specific: request to become editor for a fest (key provided by that fest's admin)
  wantsEditor: z.union([z.boolean(), z.literal("true"), z.literal("false")]).optional(),
  festKey: z.string().min(1, "Fest key is required when requesting editor").optional(),
  organizationName: z.string().min(2, "Organization must be at least 2 characters").optional()
});

export const signinSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password required")
});
