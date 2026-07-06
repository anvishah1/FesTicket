-- Database CHECK constraints not expressible in the Prisma schema.
-- Re-apply after every `prisma db push` (db push does not manage these).
-- Run:  psql "$DATABASE_URL" -f backend/prisma/constraints.sql

-- Inventory invariant: a ticket type can never sell more than its quantity.
-- Backs up the atomic guarded updateMany in POST /api/bookings (defence in depth).
ALTER TABLE "TicketType" DROP CONSTRAINT IF EXISTS ticket_sold_lte_quantity;
ALTER TABLE "TicketType" ADD CONSTRAINT ticket_sold_lte_quantity CHECK (sold <= quantity);

-- Money invariant (PAY-03): all currency columns are non-negative INTEGER paise.
-- Backs up the zod validators / integer math (defence in depth).
ALTER TABLE "TicketType" DROP CONSTRAINT IF EXISTS tickettype_price_nonneg;
ALTER TABLE "TicketType" ADD CONSTRAINT tickettype_price_nonneg CHECK (price >= 0);
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS booking_money_nonneg;
ALTER TABLE "Booking" ADD CONSTRAINT booking_money_nonneg CHECK (subtotal >= 0 AND discount >= 0 AND "platformFee" >= 0 AND tax >= 0 AND total >= 0);
ALTER TABLE "BookingItem" DROP CONSTRAINT IF EXISTS bookingitem_money_nonneg;
ALTER TABLE "BookingItem" ADD CONSTRAINT bookingitem_money_nonneg CHECK ("unitPrice" >= 0 AND "totalPrice" >= 0);
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS payment_amount_nonneg;
ALTER TABLE "Payment" ADD CONSTRAINT payment_amount_nonneg CHECK (amount >= 0);
ALTER TABLE "Sponsor" DROP CONSTRAINT IF EXISTS sponsor_money_nonneg;
ALTER TABLE "Sponsor" ADD CONSTRAINT sponsor_money_nonneg CHECK ("sponsorshipAmount" >= 0 AND "receivedAmount" >= 0);
ALTER TABLE "Expense" DROP CONSTRAINT IF EXISTS expense_amount_nonneg;
ALTER TABLE "Expense" ADD CONSTRAINT expense_amount_nonneg CHECK (amount >= 0);
