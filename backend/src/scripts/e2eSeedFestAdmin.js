// backend/src/scripts/e2eSeedFestAdmin.js
// E2E-ONLY seed for the OPS-05 role-approval journey. There is no public API to
// set a Fest.adminKey or to promote a user to ADMIN with a managedFestId — both
// are DB-level onboarding actions (normally done by approveAdminRequest.js /
// setFestAdminKey.js) — so the journey seeds them here.
//
// Creates a Fest with a known adminKey and an ADMIN user who manages it, then
// prints ONE JSON line so the caller can parse it:
//   { "festId": 1, "adminKey": "...", "adminUserId": 2, "adminEmail": "..." }
//
// Usage (from backend/): node src/scripts/e2eSeedFestAdmin.js [adminKey] [adminEmail]
import "dotenv/config";
import prisma from "../prisma.js";

async function main() {
  const stamp = Date.now();
  const adminKey = process.argv[2] || `E2E-KEY-${stamp}`;
  const adminEmail = process.argv[3] || `e2e.admin.${stamp}@example.com`;

  const fest = await prisma.fest.create({
    data: { name: `E2E Fest ${stamp}`, college: "E2E College", adminKey },
  });
  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      name: "E2E Admin",
      role: "ADMIN",
      emailVerified: true,
      managedFestId: fest.id,
    },
  });

  process.stdout.write(
    JSON.stringify({ festId: fest.id, adminKey, adminUserId: admin.id, adminEmail }) + "\n"
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
