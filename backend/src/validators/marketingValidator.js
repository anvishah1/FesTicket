import { z } from "zod";

// Numbers that may arrive as JS number or numeric string (routes parseInt/parseFloat these).
const intLike = z.union([
  z.number().int("Must be an integer"),
  z.string().regex(/^\d+$/, "Must be a positive integer id"),
]);
const numberLike = z.union([z.number(), z.string()]);

// A non-negative money amount: number >= 0 OR a numeric string like "100"/"99.50".
// Rejects negatives, which would otherwise corrupt fest sponsorship/expense totals.
const amountLike = z.union([
  z.number().nonnegative("amount must be >= 0"),
  z.string().trim().regex(/^\d+(\.\d+)?$/, "amount must be a non-negative number"),
]);

// Sponsor create/update body (POST /marketing/host/:hostId/sponsors,
// PUT /marketing/sponsors/:id). All fields optional/permissive: the route's own
// "company/contact required" + "cannot be empty" checks stay the authoritative
// gate (they return the {success,error} envelope). zod adds type + length caps.
export const createSponsorSchema = z
  .object({
    companyName: z.string().max(300, "Company name is too long").optional().nullable(),
    contactPerson: z.string().max(200, "Contact person is too long").optional().nullable(),
    email: z.string().max(254, "Email is too long").optional().nullable(),
    phone: z.string().max(50, "Phone is too long").optional().nullable(),
    sponsorshipAmount: amountLike.optional().nullable(),
    receivedAmount: amountLike.optional().nullable(),
    status: z.string().max(50, "Status is too long").optional().nullable(),
    notes: z.string().max(5000, "Notes are too long").optional().nullable(),
    festId: intLike.optional().nullable(),
    eventId: intLike.optional().nullable(),
  })
  .passthrough();

export const updateSponsorSchema = createSponsorSchema;

// A single uploaded proof/bill file descriptor (see buildExpenseFileCreates).
const fileSchema = z
  .object({
    name: z.string().max(500, "File name is too long").optional().nullable(),
    url: z.string().max(5000, "File URL is too long").optional().nullable(),
    size: numberLike.optional().nullable(),
    type: z.string().max(200, "File type is too long").optional().nullable(),
  })
  .passthrough();

// Expense create/update body (POST /marketing/host/:hostId/expenses,
// PUT /marketing/expenses/:id). Optional/permissive — the route's inline
// "description/category/vendor required" + "cannot be empty" checks stay the gate.
export const createExpenseSchema = z
  .object({
    festId: intLike.optional().nullable(),
    eventId: intLike.optional().nullable(),
    description: z.string().max(2000, "Description is too long").optional().nullable(),
    category: z.string().max(200, "Category is too long").optional().nullable(),
    vendor: z.string().max(300, "Vendor is too long").optional().nullable(),
    amount: amountLike.optional().nullable(),
    paymentDate: z.string().max(100, "Invalid payment date").optional().nullable(),
    paymentMethod: z.string().max(100, "Payment method is too long").optional().nullable(),
    notes: z.string().max(5000, "Notes are too long").optional().nullable(),
    proofFiles: z.array(fileSchema).optional().nullable(),
    billFiles: z.array(fileSchema).optional().nullable(),
  })
  .passthrough();

export const updateExpenseSchema = createExpenseSchema;
