// backend/src/scripts/createDefaultHost.js
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    const host = await prisma.user.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        email: "default-host@example.com",
        role: Role.HOST,
        name: "Default Host",
      },
    });

    console.log("Default host ready:", host);
  } catch (err) {
    console.error("Failed to create default host:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();

