/**
 * Set a fest's admin key and optionally link an admin user to that fest.
 * Run from backend: node src/scripts/setFestAdminKey.js <festId> [key] [adminEmail]
 *
 * The key is the shared onboarding secret students type at signup / role-request,
 * and it is matched against user-supplied input — so it must be high-entropy and
 * unguessable, NOT a human-memorable string like "TATHVA-2025-KEY".
 * Omit the key (or pass "new") to auto-generate a 120-bit random key; it is printed.
 *
 * Example:
 *   node src/scripts/setFestAdminKey.js 4 new admin@college.edu   # auto-generate
 *   node src/scripts/setFestAdminKey.js 4 admin@college.edu       # auto-generate (3rd arg is email)
 *
 * Then give the professor: (1) login credentials for admin@college.edu, (2) the printed key.
 * Students requesting editor access enter that key on signup; the request appears for this admin.
 */

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();

// Generate a high-entropy, unguessable fest key (120 bits of randomness as 24
// base32 chars), optionally prefixed with a short readable slug of the fest name.
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
let [festIdStr, key, adminEmail] = process.argv.slice(2);

// Allow omitting the key: `setFestAdminKey.js <festId> <adminEmail>` — if the 2nd
// arg looks like an email, treat it as the admin email and auto-generate the key.
if (key && key.includes("@") && !adminEmail) {
  adminEmail = key;
  key = undefined;
}

async function main() {
  if (!festIdStr) {
    console.log("Usage: node src/scripts/setFestAdminKey.js <festId> [key|new] [adminEmail]");
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

  // No key supplied (or the "new" sentinel) → generate a high-entropy one.
  const adminKey = key && key.trim() && key.trim() !== "new" ? key.trim() : generateFestKey(fest.name);

  await prisma.fest.update({
    where: { id: festId },
    data: { adminKey },
  });
  console.log("Fest", fest.name, "(id", festId + ") adminKey set to:", adminKey);

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
