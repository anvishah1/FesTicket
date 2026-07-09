-- ANL-06 follow-up (Phase-8 review): enforce a single overall (category IS NULL)
-- budget per fest. The model's @@unique([festId, category]) does NOT constrain
-- this, because Postgres treats NULLs as distinct in a composite unique index, so
-- concurrent overall-budget upserts could create duplicate rows. A partial unique
-- index on festId WHERE category IS NULL closes the gap. (Prisma's schema DSL
-- can't express a partial index, so this migration is hand-authored.)
CREATE UNIQUE INDEX "Budget_festId_overall_key" ON "Budget"("festId") WHERE "category" IS NULL;
