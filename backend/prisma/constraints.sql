-- Database CHECK constraints not expressible in the Prisma schema.
-- Re-apply after every `prisma db push` (db push does not manage these).
-- Run:  psql "$DATABASE_URL" -f backend/prisma/constraints.sql

-- Inventory invariant: a ticket type can never sell more than its quantity.
-- Backs up the atomic guarded updateMany in POST /api/bookings (defence in depth).
ALTER TABLE "TicketType" DROP CONSTRAINT IF EXISTS ticket_sold_lte_quantity;
ALTER TABLE "TicketType" ADD CONSTRAINT ticket_sold_lte_quantity CHECK (sold <= quantity);
