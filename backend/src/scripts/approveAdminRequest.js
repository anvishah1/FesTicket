/**
 * Approve a pending admin request and link admin to a fest.
 * festId = the number that identifies the fest (constant for all events, users, etc.).
 * key = the string users enter so we know they're talking about the same fest (stored as Fest.adminKey).
 *
 * Run from backend:
 *   node src/scripts/approveAdminRequest.js <requestId> <email> <password> <festId> <key>
 *
 * If the fest doesn't exist yet (first admin for a new fest):
 *   node src/scripts/approveAdminRequest.js <requestId> <email> <password> new <key> [festName] [college]
 *   → Creates a new fest (with optional festName, college), sets adminKey = key, assigns admin to that fest.
 *
 * If the fest already exists (you have its id):
 *   node src/scripts/approveAdminRequest.js <requestId> <email> <password> <festId> <key>
 *   → Uses that fest, sets adminKey = key, assigns admin to it.
 *
 * Examples:
 *   node src/scripts/approveAdminRequest.js 1 prof@college.edu MyPass123! new TATHVA-2025-KEY Ragam NIT-Calicut
 *   node src/scripts/approveAdminRequest.js 1 prof@college.edu MyPass123! 4 TATHVA-2025-KEY
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const [requestIdStr, email, password, festIdOrNew, key, festNameArg, collegeArg] = args;

async function main() {
  if (!requestIdStr || !email || !password || !festIdOrNew || !key) {
    console.log("Usage: node src/scripts/approveAdminRequest.js <requestId> <email> <password> <festId|new> <key> [festName] [college]");
    console.log("  festId = number (existing fest) or 'new' (create fest). key = string users enter for this fest.");
    process.exit(1);
  }
  const requestId = parseInt(requestIdStr, 10);
  if (Number.isNaN(requestId)) {
    console.error("requestId must be a number");
    process.exit(1);
  }

  const adminRequest = await prisma.adminRequest.findUnique({
    where: { id: requestId },
  });
  if (!adminRequest) {
    console.error("AdminRequest not found for id:", requestId);
    process.exit(1);
  }
  if (adminRequest.status !== "PENDING") {
    console.error("Request is not PENDING:", adminRequest.status);
    process.exit(1);
  }

  const createNewFest = festIdOrNew === "new" || festIdOrNew === "0";
  let fest;
  let festId;

  if (createNewFest) {
    // Fest name = from script arg, or from the "Fest name" field on the admin signup (required there).
    const festName = (festNameArg && festNameArg.trim()) || (adminRequest.festName && adminRequest.festName.trim());
    if (!festName) {
      console.error("No fest name. The admin request has no festName set.");
      console.error("Either: (1) Pass fest name in the script: ... new KEY MyFestName [college]");
      console.error("        (2) Or add festName to the AdminRequest in Prisma Studio and run the script again.");
      process.exit(1);
    }
    const college = (collegeArg && collegeArg.trim()) || adminRequest.organization?.trim() || "";
    fest = await prisma.fest.create({
      data: {
        name: festName,
        college,
        adminKey: key.trim(),
      },
    });
    festId = fest.id;
    console.log("Created new fest: id=", festId, "name=", fest.name, "college=", college || "(none)");
  } else {
    festId = parseInt(festIdOrNew, 10);
    if (Number.isNaN(festId)) {
      console.error("festId must be a number or 'new'");
      process.exit(1);
    }
    fest = await prisma.fest.findUnique({ where: { id: festId } });
    if (!fest) {
      console.error("Fest not found for id:", festId);
      process.exit(1);
    }
    await prisma.fest.update({
      where: { id: festId },
      data: { adminKey: key.trim() },
    });
    console.log("Using existing fest: id=", festId, "name=", fest.name, "adminKey set to:", key.trim());
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.user.updateMany({
    where: { managedFestId: festId },
    data: { managedFestId: null },
  });

  // Same festId is written to both User.managedFestId and AdminRequest.festId so the admin
  // is linked to this fest and the dashboard can show only this fest's data.
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      password: hashedPassword,
      role: "ADMIN",
      managedFestId: festId, // admin dashboard uses this to scope events/expenses/sponsors/role-requests
      name: adminRequest.name || undefined,
    },
    create: {
      email,
      password: hashedPassword,
      name: adminRequest.name || null,
      role: "ADMIN",
      managedFestId: festId, // must match AdminRequest.festId so admin sees only this fest
      emailVerified: true,
    },
  });

  await prisma.adminRequest.update({
    where: { id: requestId },
    data: {
      status: "APPROVED",
      passwordSet: password,
      adminKeySet: key.trim(),
      festId, // same as User.managedFestId for this admin
    },
  });

  if (user.managedFestId !== festId) {
    console.error("Invariant failed: User.managedFestId should equal festId. Fix the script.");
    process.exit(1);
  }

  console.log("Approved admin request", requestId);
  console.log("User:", user.email, "role=ADMIN, managedFestId=", user.managedFestId, "(same as AdminRequest.festId; dashboard scopes to this fest only)");
  console.log("Key for this fest:", key.trim(), "(users enter this to refer to this fest)");
  console.log("Give the professor: (1) email + password, (2) key:", key.trim());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
