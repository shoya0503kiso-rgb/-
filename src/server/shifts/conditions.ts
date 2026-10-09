// スタッフ別 月次条件（毎月変更可・固定プロフィールと分離。要件10/11）と参考情報（要件14）
import { summarize } from "@/lib/attendance/calc";
import { addMonths, datesOfMonth, shiftRangeOnBusinessDate, type YearMonth } from "@/lib/time";
import { listOpenAnomalies } from "../attendance";
import { prisma } from "../db";
import { UserError } from "../errors";
import { getSettings } from "../settings";

export const PRIORITY_LABELS = { HIGH: "高", MID: "中", LOW: "低" } as const;
export const VOLUME_LABELS = { MORE: "多め", NORMAL: "普通", LESS: "少なめ" } as const;

export interface ConditionValue {
  employeeId: string;
  priority: "HIGH" | "MID" | "LOW";
  volume: "MORE" | "NORMAL" | "LESS";
  maxDays: number | null;
  minDays: number | null;
  fillAll: boolean;
  memo: string;
}

/** 在籍スタッフの月次条件（未設定の人は固定プロフィールの基本条件を初期値にする） */
export async function listConditions(ym: YearMonth) {
  const [employees, rows] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.monthlyCondition.findMany({ where: { yearMonth: ym } }),
  ]);
  const byEmp = new Map(rows.map((r) => [r.employeeId, r]));
  return employees.map((e) => {
    const c = byEmp.get(e.id);
    const value: ConditionValue = c
      ? {
          employeeId: e.id,
          priority: c.priority as ConditionValue["priority"],
          volume: c.volume as ConditionValue["volume"],
          maxDays: c.maxDays,
          minDays: c.minDays,
          fillAll: c.fillAll,
          memo: c.memo,
        }
      : { employeeId: e.id, priority: "MID", volume: "NORMAL", maxDays: e.baseMaxDays, minDays: e.baseMinDays, fillAll: false, memo: "" };
    return { employee: e, saved: !!c, value };
  });
}

function validate(v: ConditionValue) {
  if (!["HIGH", "MID", "LOW"].includes(v.priority)) throw new UserError("優先度が正しくありません");
  if (!["MORE", "NORMAL", "LESS"].includes(v.volume)) throw new UserError("多め/少なめが正しくありません");
  for (const n of [v.maxDays, v.minDays]) {
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 31)) throw new UserError("日数は0〜31で入力してください");
  }
  if (v.maxDays !== null && v.minDays !== null && v.minDays > v.maxDays) throw new UserError("最低日数が最大日数を超えています");
}

export async function saveConditions(ym: YearMonth, values: ConditionValue[]) {
  values.forEach(validate);
  await prisma.$transaction(
    values.map((v) => {
      const data = { priority: v.priority, volume: v.volume, maxDays: v.maxDays, minDays: v.minDays, fillAll: v.fillAll, memo: v.memo.trim().slice(0, 500) };
      return prisma.monthlyCondition.upsert({
        where: { yearMonth_employeeId: { yearMonth: ym, employeeId: v.employeeId } },
        create: { yearMonth: ym, employeeId: v.employeeId, ...data },
        update: data,
      });
    }),
  );
}

/** 前月の条件・相性条件をコピー（今月分が既にある人は上書きしない） */
export async function copyFromPreviousMonth(ym: YearMonth) {
  const prev = addMonths(ym, -1);
  const [prevRows, prevPairs, existing] = await Promise.all([
    prisma.monthlyCondition.findMany({ where: { yearMonth: prev, employee: { active: true } } }),
    prisma.pairConstraint.findMany({ where: { yearMonth: prev } }),
    prisma.monthlyCondition.findMany({ where: { yearMonth: ym } }),
  ]);
  const has = new Set(existing.map((e) => e.employeeId));
  let copied = 0;
  for (const r of prevRows) {
    if (has.has(r.employeeId)) continue;
    await prisma.monthlyCondition.create({
      data: { yearMonth: ym, employeeId: r.employeeId, priority: r.priority, volume: r.volume, maxDays: r.maxDays, minDays: r.minDays, fillAll: r.fillAll, memo: r.memo },
    });
    copied++;
  }
  for (const p of prevPairs) {
    await prisma.pairConstraint.upsert({
      where: { yearMonth_employeeAId_employeeBId: { yearMonth: ym, employeeAId: p.employeeAId, employeeBId: p.employeeBId } },
      create: { yearMonth: ym, employeeAId: p.employeeAId, employeeBId: p.employeeBId, strength: p.strength, memo: p.memo },
      update: {},
    });
  }
  return { copied, pairs: prevPairs.length };
}

export function listPairs(ym: YearMonth) {
  return prisma.pairConstraint.findMany({ where: { yearMonth: ym }, include: { employeeA: true, employeeB: true } });
}

export async function addPair(ym: YearMonth, a: string, b: string, strength: "HARD" | "SOFT", memo: string) {
  if (a === b) throw new UserError("別々のスタッフを選んでください");
  if (strength !== "HARD" && strength !== "SOFT") throw new UserError("強さが正しくありません");
  const [x, y] = a < b ? [a, b] : [b, a];
  await prisma.pairConstraint.upsert({
    where: { yearMonth_employeeAId_employeeBId: { yearMonth: ym, employeeAId: x, employeeBId: y } },
    create: { yearMonth: ym, employeeAId: x, employeeBId: y, strength, memo: memo.trim() },
    update: { strength, memo: memo.trim() },
  });
}

export async function removePair(id: string) {
  await prisma.pairConstraint.deleteMany({ where: { id } });
}

/**
 * 参考情報：対象月の前月の勤務日数・遅刻回数・シフトあり打刻なし・要確認件数。
 * 表示するだけで、条件を自動で変えることはしない（要件14）
 */
export async function referenceStats(ym: YearMonth, now = new Date()) {
  const settings = await getSettings();
  const prev = addMonths(ym, -1);
  const dates = datesOfMonth(prev);
  const [sessions, period, anomalies] = await Promise.all([
    prisma.workSession.findMany({ where: { deletedAt: null, businessDate: { gte: dates[0], lte: dates[dates.length - 1] } }, include: { breaks: true } }),
    prisma.shiftPeriod.findUnique({ where: { yearMonth: prev }, include: { publications: { orderBy: { version: "desc" }, take: 1 } } }),
    listOpenAnomalies({ from: dates[0], now }),
  ]);
  const shifts: { date: string; employeeId: string; startTime: string; endTime: string }[] = period?.publications[0]
    ? JSON.parse(period.publications[0].snapshot)
    : [];
  const stats = new Map<string, { workDays: number; workMinutes: number; late: number; noShow: number; anomalies: number }>();
  const get = (id: string) => {
    if (!stats.has(id)) stats.set(id, { workDays: 0, workMinutes: 0, late: 0, noShow: 0, anomalies: 0 });
    return stats.get(id)!;
  };
  const days = new Map<string, Set<string>>();
  for (const s of sessions) {
    const set = days.get(s.employeeId) ?? new Set();
    set.add(s.businessDate);
    days.set(s.employeeId, set);
    get(s.employeeId).workMinutes += summarize(s).workMinutes ?? 0;
  }
  for (const [id, set] of days) get(id).workDays = set.size;
  for (const sh of shifts) {
    const start = shiftRangeOnBusinessDate(sh.date, sh.startTime, sh.endTime, settings.dayChangeHour).start;
    if (start.getTime() > now.getTime()) continue;
    const mine = sessions.filter((s) => s.employeeId === sh.employeeId && s.businessDate === sh.date);
    if (mine.length === 0) {
      get(sh.employeeId).noShow++;
      continue;
    }
    const firstIn = mine.map((s) => s.clockIn).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0];
    if (firstIn && firstIn.getTime() > start.getTime() + settings.lateGraceMinutes * 60_000) get(sh.employeeId).late++;
  }
  for (const a of anomalies) if (a.businessDate <= dates[dates.length - 1]) get(a.employeeId).anomalies++;
  return { month: prev, hasShifts: shifts.length > 0, stats };
}
