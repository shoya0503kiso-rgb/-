import { PrismaClient } from "@prisma/client";
import { isPostgres, normalizeDbUrls } from "@/lib/db-url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  // 本番（PostgreSQL）は、貼り付けたままの接続文字列でも動くよう整形して使う
  const { databaseUrl, directUrl } = normalizeDbUrls({ DATABASE_URL: process.env.DATABASE_URL, DIRECT_URL: process.env.DIRECT_URL });
  if (!isPostgres(databaseUrl)) return new PrismaClient();
  if (directUrl && !process.env.DIRECT_URL) process.env.DIRECT_URL = directUrl;
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
