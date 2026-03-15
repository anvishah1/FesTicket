// Run from backend: node src/scripts/makeAdmin.js <email>
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const email = process.argv[2];

async function main() {
  if (!email) {
    console.log("Usage: node src/scripts/makeAdmin.js <email>");
    process.exit(1);
  }
  const user = await prisma.user.update({
    where: { email },
    data: { role: "ADMIN" },
  });
  console.log("Updated", user.email, "to role ADMIN");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
