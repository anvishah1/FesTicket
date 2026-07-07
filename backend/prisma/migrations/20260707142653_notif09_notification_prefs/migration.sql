-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyMarketing" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyReminders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifySalesAlerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifySalesDigest" BOOLEAN NOT NULL DEFAULT true;
