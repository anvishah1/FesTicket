/**
 * Approve a pending admin request and link admin to a fest.
 * festId = the number that identifies the fest (constant for all events, users, etc.).
 * key = the string users enter so we know they're talking about the same fest (stored as Fest.adminKey).
 *
 * The key is the shared onboarding secret students type at signup / role-request
 * and is matched against user input, so it MUST be high-entropy. Omit it (or pass
 * "new") to auto-generate a 120-bit random key — recommended. The key is printed.
 *
 * Run from backend:
 *   node src/scripts/approveAdminRequest.js <requestId> <email> <password> <festId> [key|new]
 *
 * If the fest doesn't exist yet (first admin for a new fest):
 *   node src/scripts/approveAdminRequest.js <requestId> <email> <password> new [key|new] [festName] [college]
 *   → Creates a new fest (with optional festName, college), sets adminKey, assigns admin to that fest.
 *
 * If the fest already exists (you have its id):
 *   node src/scripts/approveAdminRequest.js <requestId> <email> <password> <festId> [key|new]
 *   → Uses that fest, sets adminKey, assigns admin to it.
 *
 * Examples (auto-generated key):
 *   node src/scripts/approveAdminRequest.js 1 prof@college.edu MyPass123! new new Ragam NIT-Calicut
 *   node src/scripts/approveAdminRequest.js 1 prof@college.edu MyPass123! 4
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import crypto from "node:crypto";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const [requestIdStr, email, password, festIdOrNew, key, festNameArg, collegeArg] = args;

// Generate a high-entropy, unguessable fest key (120 bits of randomness as 24
// base32 chars), optionally prefixed with a short readable slug of the fest name.
// The key is matched against user-supplied input at signup / role-request, so it
// must NOT be a guessable human string like "TATHVA-2025-KEY".
function generateFestKey(festName) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; // RFC 4648 base32
  const buf = crypto.randomBytes(15); // 15 bytes -> 24 base32 chars (120 bits)
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  const slug = (festName || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return slug ? `${slug}-${out}` : out;
}

async function main() {
  if (!requestIdStr || !email || !password || !festIdOrNew) {
    console.log("Usage: node src/scripts/approveAdminRequest.js <requestId> <email> <password> <festId|new> [key|new] [festName] [college]");
    console.log("  festId = number (existing fest) or 'new' (create fest).");
    console.log("  key = omit or pass 'new' to auto-generate a high-entropy fest key (recommended); it will be printed.");
    process.exit(1);
  }

  // Resolve the fest key: use an explicitly supplied key only if it isn't the
  // "new" sentinel; otherwise auto-generate a high-entropy one below.
  const suppliedKey = key && key.trim() && key.trim() !== "new" ? key.trim() : null;
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
  let adminKey;

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
    adminKey = suppliedKey || generateFestKey(festName);
    fest = await prisma.fest.create({
      data: {
        name: festName,
        college,
        adminKey,
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
    adminKey = suppliedKey || generateFestKey(fest.name);
    await prisma.fest.update({
      where: { id: festId },
      data: { adminKey },
    });
    console.log("Using existing fest: id=", festId, "name=", fest.name, "adminKey set to:", adminKey);
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
      adminKeySet: adminKey,
      festId, // same as User.managedFestId for this admin
    },
  });

  if (user.managedFestId !== festId) {
    console.error("Invariant failed: User.managedFestId should equal festId. Fix the script.");
    process.exit(1);
  }

  console.log("Approved admin request", requestId);
  console.log("User:", user.email, "role=ADMIN, managedFestId=", user.managedFestId, "(same as AdminRequest.festId; dashboard scopes to this fest only)");
  console.log("Key for this fest:", adminKey, "(users enter this to refer to this fest)");
  console.log("Give the professor: (1) email + password, (2) key:", adminKey);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
