-- AUTH-05: link Google accounts by stable sub + optional avatar.
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;

-- Nullable unique: Postgres allows multiple NULLs, so existing rows are fine.
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
