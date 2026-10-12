import { prisma } from "@/server/db";
import { parseJstLocal } from "@/lib/time";

/** "2026-10-12 20:00"（JST）→ Date */
export const t = (s: string) => parseJstLocal(s.replace(" ", "T"))!;

export const editor = { adminId: "admin-test", name: "テスト店長" };

export async function resetDb() {
  const tables = await prisma.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'",
  );
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  for (const { name } of tables) await prisma.$executeRawUnsafe(`DELETE FROM "${name}"`);
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
}

export async function makeEmployee(name: string, extra: Record<string, unknown> = {}) {
  return prisma.employee.create({ data: { name, ...extra } });
}
