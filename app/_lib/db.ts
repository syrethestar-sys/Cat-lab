import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Reuse one client while `next dev` hot-reloads.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      // The adapter ignores Prisma's ?pgbouncer=true flag, so drop it.
      connectionString: process.env.DATABASE_URL!.replace(/[?&]pgbouncer=true/, ""),
      // Node doesn't trust Supabase's certificate by default, so hand it over.
      ssl: { ca: readFileSync(join(process.cwd(), "certs/supabase-ca.crt"), "utf8") },
    }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
