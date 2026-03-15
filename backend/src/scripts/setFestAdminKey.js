/**
 * Set a fest's admin key and optionally link an admin user to that fest.
 * Run from backend: node src/scripts/setFestAdminKey.js <festId> <key> [adminEmail]
 *
 * Example:
 *   node src/scripts/setFestAdminKey.js 4 TATHVA-2025-KEY admin@college.edu
 *
 * Then give the professor: (1) login credentials for admin@college.edu, (2) the key TATHVA-2025-KEY.
 * Students requesting editor access enter that key on signup; the request appears for this admin.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const [festIdStr, key, adminEmail] = process.argv.slice(2);

async function main() {
  if (!festIdStr || !key) {
    console.log("Usage: node src/scripts/setFestAdminKey.js <festId> <key> [adminEmail]");
    process.exit(1);
  }
  const festId = parseInt(festIdStr, 10);
  if (Number.isNaN(festId)) {
    console.error("festId must be a number");
    process.exit(1);
  }

  const fest = await prisma.fest.findUnique({ where: { id: festId } });
  if (!fest) {
    console.error("Fest not found for id:", festId);
    process.exit(1);
  }

  await prisma.fest.update({
    where: { id: festId },
    data: { adminKey: key.trim() },
  });
  console.log("Fest", fest.name, "(id", festId + ") adminKey set to:", key.trim());

  if (adminEmail) {
    const user = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!user) {
      console.error("User not found for email:", adminEmail);
      process.exit(1);
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { managedFestId: festId, role: "ADMIN" },
    });
    console.log("User", adminEmail, "is now admin for fest id", festId);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
