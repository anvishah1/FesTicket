import { defineConfig } from "prisma/config";
import * as dotenv from "dotenv";

dotenv.config(); // ✅ this explicitly loads .env

export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env.DATABASE_URL, // ✅ now env is definitely loaded
  },
});
