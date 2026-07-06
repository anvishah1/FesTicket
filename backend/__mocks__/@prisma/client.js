// Manual mock for @prisma/client, picked up automatically by `vi.mock("@prisma/client")`.
//
// Every route module does `const prisma = new PrismaClient()` at import time. The
// mocked PrismaClient constructor always returns the SAME `prismaMock` singleton, so
// tests can configure/inspect it via `import { prismaMock } from "@prisma/client"`.
//
// Usage in a test file:
//   import { prismaMock, resetPrismaMock } from "@prisma/client";
//   vi.mock("@prisma/client");
//   beforeEach(resetPrismaMock);
//   prismaMock.user.findUnique.mockResolvedValue({ ... });
import { vi } from "vitest";

const MODEL_METHODS = [
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
];

const MODEL_KEYS = [
  "user",
  "fest",
  "event",
  "ticketType",
  "booking",
  "bookingItem",
  "attendee",
  "payment",
  "sponsor",
  "expense",
  "expenseFile",
  "roleRequest",
  "refreshToken",
  "adminRequest",
  "emailLog",
  "webhookEvent",
];

function makeModel() {
  const model = {};
  for (const m of MODEL_METHODS) model[m] = vi.fn();
  return model;
}

// The shared singleton every `new PrismaClient()` returns.
export const prismaMock = {};

export function resetPrismaMock() {
  for (const key of MODEL_KEYS) prismaMock[key] = makeModel();
  prismaMock.$connect = vi.fn().mockResolvedValue(undefined);
  prismaMock.$disconnect = vi.fn().mockResolvedValue(undefined);
  prismaMock.$on = vi.fn();
  // Raw-query helpers (advisory lock, readiness probe, reconciliation).
  prismaMock.$queryRaw = vi.fn().mockResolvedValue([]);
  prismaMock.$queryRawUnsafe = vi.fn().mockResolvedValue([]);
  prismaMock.$executeRaw = vi.fn().mockResolvedValue(0);
  prismaMock.$executeRawUnsafe = vi.fn().mockResolvedValue(0);
  // Support both callback form `$transaction(async (tx) => ...)` and array form
  // `$transaction([p1, p2])` used across the routes.
  prismaMock.$transaction = vi.fn(async (arg) =>
    Array.isArray(arg) ? Promise.all(arg) : arg(prismaMock)
  );
}

// Initialise once at module load so the constructor has something to return.
resetPrismaMock();

export const PrismaClient = vi.fn(() => prismaMock);

// Enums referenced as values in route code.
export const FileType = { PROOF: "PROOF", BILL: "BILL" };
export const Role = { VIEWER: "VIEWER", EDITOR: "EDITOR", HOST: "HOST", ADMIN: "ADMIN" };
export const Prisma = {};

export default { PrismaClient, FileType, Role, Prisma, prismaMock, resetPrismaMock };
