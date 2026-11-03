import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Migrations need a normal connection, so use the direct/session string (port 5432).
  datasource: { url: env("DIRECT_URL") },
});
