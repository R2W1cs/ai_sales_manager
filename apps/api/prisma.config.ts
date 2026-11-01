import "dotenv/config";
import { defineConfig } from "prisma/config";

import { env } from "@app/shared/server";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: env.DATABASE_URL,
  },
});
