import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Database access layer. One client per process, reused across hot reloads
// in development to avoid exhausting the connection pool (guide 4).
// Prisma 7 requires a driver adapter; PrismaPg connects to the
// Supabase-hosted PostgreSQL database (PRODUCT.md stack decision).
//
// The pool is bounded to 3 connections: the free-tier session pooler
// limits concurrent sessions, and a generous pool there causes
// ECONNREFUSED churn under burst creates.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill in the Supabase connection string.");
  }
  const pool = new Pool({ connectionString, max: 3 });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}