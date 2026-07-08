-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "geocodedAt" TIMESTAMP(3),
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;
