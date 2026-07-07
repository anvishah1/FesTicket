-- CreateEnum
CREATE TYPE "RefundPolicy" AS ENUM ('NO_REFUND', 'FULL_ANYTIME', 'FULL_UNTIL_CUTOFF');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "refundCutoffHours" INTEGER,
ADD COLUMN     "refundPolicy" "RefundPolicy" NOT NULL DEFAULT 'NO_REFUND';

