// シフトの公開と通知（初回は全員へ確定シフト、2回目以降は変更があった人だけへ変更通知）。P-21
import { formatDateJa, formatHmRange, formatYearMonthJa, type YearMonth } from "@/lib/time";
import { prisma } from "../db";
import { UserError } from "../errors";
import { enqueue } from "../notify";
import { staffUrl } from "../staff-link";

interface SnapshotItem {
  date: string;
  employeeId: string;
  startTime: string;
  endTime: string;
  patternName: string | null;
}

const key = (a: SnapshotItem) => `${a.date}|${a.startTime}|${a.endTime}`;

function shiftLines(items: SnapshotItem[]) {
  if (items.length === 0) return "（シフトはありません）";
  return items
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((a) => `${formatDateJa(a.date)} ${a.patternName ? `${a.patternName} ` : ""}${formatHmRange(a.startTime, a.endTime)}`)
    .join("\n");
}

export async function publishPeriod(ym: YearMonth, admin: { name: string }, now = new Date()) {
  const period = await prisma.shiftPeriod.findUnique({
    where: { yearMonth: ym },
    include: { assignments: { include: { pattern: true } }, publications: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!period) throw new UserError("期間がありません");
  if (period.status === "PREPARING" || period.status === "COLLECTING") {
    throw new UserError("希望の受付を終了してから公開してください");
  }
  const snapshot: SnapshotItem[] = period.assignments.map((a) => ({
    date: a.date,
    employeeId: a.employeeId,
    startTime: a.startTime,
    endTime: a.endTime,
    patternName: a.pattern?.name ?? null,
  }));
  const prev = period.publications[0];
  const prevItems: SnapshotItem[] = prev ? JSON.parse(prev.snapshot) : [];
  const version = (prev?.version ?? 0) + 1;

  const employees = await prisma.employee.findMany({ where: { active: true } });
  const byEmp = (items: SnapshotItem[], id: string) => items.filter((i) => i.employeeId === id);

  await prisma.$transaction([
    prisma.shiftPublication.create({
      data: { periodId: period.id, version, snapshot: JSON.stringify(snapshot), publishedBy: admin.name, publishedAt: now },
    }),
    prisma.shiftPeriod.update({ where: { id: period.id }, data: { status: "PUBLISHED", publishedAt: now } }),
  ]);

  let notified = 0;
  for (const e of employees) {
    const mine = byEmp(snapshot, e.id);
    const url = staffUrl(e.id, "me", now);
    if (version === 1) {
      await enqueue({
        employeeId: e.id,
        kind: "SHIFT_PUBLISHED",
        title: `${formatYearMonthJa(ym)} 確定シフト`,
        body: `【${formatYearMonthJa(ym)} 確定シフト】\n${e.name}さんのシフトです（${mine.length}日）\n\n${shiftLines(mine)}\n\n▼詳細\n${url}`,
        dedupeKey: `SHIFT_PUBLISHED:${ym}:v1:${e.id}`,
      });
      notified++;
      continue;
    }
    const before = new Set(byEmp(prevItems, e.id).map(key));
    const after = new Set(mine.map(key));
    const changed = before.size !== after.size || [...after].some((k) => !before.has(k));
    if (!changed) continue;
    const added = mine.filter((a) => !before.has(key(a)));
    const removed = byEmp(prevItems, e.id).filter((a) => !after.has(key(a)));
    await enqueue({
      employeeId: e.id,
      kind: "SHIFT_CHANGED",
      title: `${formatYearMonthJa(ym)} シフト変更`,
      body:
        `【${formatYearMonthJa(ym)} シフト変更のお知らせ】\n${e.name}さんのシフトが変更されました。\n` +
        (added.length ? `\n＋追加\n${shiftLines(added)}\n` : "") +
        (removed.length ? `\n－取消\n${shiftLines(removed)}\n` : "") +
        `\n▼変更後のシフト（${mine.length}日）\n${shiftLines(mine)}\n\n${url}`,
      dedupeKey: `SHIFT_CHANGED:${ym}:v${version}:${e.id}`,
    });
    notified++;
  }
  return { version, notified };
}

/** 公開後に編集されて、まだ通知していない変更があるか */
export async function hasUnpublishedChanges(ym: YearMonth) {
  const period = await prisma.shiftPeriod.findUnique({
    where: { yearMonth: ym },
    include: { assignments: true, publications: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!period || !period.publications[0]) return false;
  const prev = (JSON.parse(period.publications[0].snapshot) as SnapshotItem[]).map((a) => `${a.employeeId}|${key(a)}`).sort();
  const now = period.assignments.map((a) => `${a.employeeId}|${a.date}|${a.startTime}|${a.endTime}`).sort();
  return prev.join(",") !== now.join(",");
}
