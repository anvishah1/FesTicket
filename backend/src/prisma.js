import { PrismaClient } from "@prisma/client";

/**
 * Single shared Prisma client for the whole app.
 *
 * The previous pattern instantiated `new PrismaClient()` in every route file,
 * which opens a separate connection pool per module and can exhaust the
 * database's connection limit (especially on serverless Postgres like Neon).
 * Import this one instance everywhere instead.
 */
const prisma = new PrismaClient();

export default prisma;
