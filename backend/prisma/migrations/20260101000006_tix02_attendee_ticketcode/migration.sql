-- TIX-02: per-attendee unique ticketCode. Adding a NOT NULL @unique column to a
-- table that already has rows requires a backfill: add nullable, assign a unique
-- value to existing rows, then enforce NOT NULL + the unique index. New rows get a
-- cuid from Prisma's @default(cuid()) at the app layer.
ALTER TABLE "Attendee" ADD COLUMN "ticketCode" TEXT;

-- Backfill existing rows with a deterministic, unique legacy code.
UPDATE "Attendee" SET "ticketCode" = 'legacy-' || id::text WHERE "ticketCode" IS NULL;

ALTER TABLE "Attendee" ALTER COLUMN "ticketCode" SET NOT NULL;

CREATE UNIQUE INDEX "Attendee_ticketCode_key" ON "Attendee"("ticketCode");
