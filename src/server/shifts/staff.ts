// 従業員本人向けのシフト情報
import { formatDateJa, formatHmRange, type YearMonth } from "@/lib/time";
import { prisma } from "../db";

/** 公開済みの確定シフト（公開後の未通知の編集は含めず、最後に公開した内容を返す） */
export async function myShifts(employeeId: string, ym: YearMonth) {
  const period = await prisma.shiftPeriod.findUnique({
    where: { yearMonth: ym },
    include: { publications: { orderBy: { version: "desc" }, take: 1 } },
  });
  const pub = period?.publications[0];
  if (!period || !pub) return { published: false, items: [], lines: "" };
  const items = (JSON.parse(pub.snapshot) as { date: string; employeeId: string; startTime: string; endTime: string; patternName: string | null }[])
    .filter((a) => a.employeeId === employeeId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const lines = items.map((a) => `${formatDateJa(a.date)} ${a.patternName ? `${a.patternName} ` : ""}${formatHmRange(a.startTime, a.endTime)}`).join("\n");
  return { published: true, items, lines, publishedAt: pub.publishedAt };
}

/** その日の公開済みシフト（全員分）。営業日 date の最後に公開した内容 */
export async function publishedShiftsOn(date: string) {
  const period = await prisma.shiftPeriod.findUnique({
    where: { yearMonth: date.slice(0, 7) },
    include: { publications: { orderBy: { version: "desc" }, take: 1 } },
  });
  const pub = period?.publications[0];
  if (!pub) return [];
  return (JSON.parse(pub.snapshot) as { date: string; employeeId: string; startTime: string; endTime: string; patternName: string | null }[]).filter(
    (a) => a.date === date,
  );
}
