import { prisma } from "@/server/db";

/** JST の日時文字列 → Date（"2026-10-30 21:00"） */
export const jst = (s: string) => new Date(`${s.replace(" ", "T")}:00+09:00`);

export async function resetDb() {
  const tables = await prisma.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'",
  );
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  for (const { name } of tables) await prisma.$executeRawUnsafe(`DELETE FROM "${name}"`);
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
}

export function makeMember(nickname = "テスト", extra: Record<string, unknown> = {}) {
  return prisma.member.create({ data: { nickname, ...extra } });
}

/** 決まった順に値を返す乱数 */
export function seq(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}
