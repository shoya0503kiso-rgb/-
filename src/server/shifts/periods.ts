// シフト期間（月）と希望提出の受付管理
import type { ShiftPeriod, StoreSetting } from "@prisma/client";
import { addMonths, businessDateOf, formatYearMonthJa, jstAt, jstParts, toDateStr, yearMonthOf, type YearMonth } from "@/lib/time";
import { prisma } from "../db";
import { UserError } from "../errors";
import { enqueue } from "../notify";
import { getSettings } from "../settings";
import { staffUrl } from "../staff-link";

export const PERIOD_STATUS_LABELS: Record<string, string> = {
  PREPARING: "受付前",
  COLLECTING: "希望受付中",
  CLOSED: "受付終了",
  DRAFT: "シフト案作成中",
  PUBLISHED: "公開済み",
};

/** 対象月 ym の締切：前月の締切日の翌0:00（= 締切日 23:59 まで受付） */
export function defaultDeadline(ym: YearMonth, settings: Pick<StoreSetting, "requestDeadlineDay">) {
  const prev = addMonths(ym, -1);
  return jstAt(`${prev}-${String(settings.requestDeadlineDay).padStart(2, "0")}`, 24 * 60);
}

/** 締切の表示（"10/17(金) 23:59"） */
export function formatDeadline(deadline: Date) {
  const last = new Date(deadline.getTime() - 60_000);
  const p = jstParts(last);
  const w = ["日", "月", "火", "水", "木", "金", "土"][p.weekday];
  return `${p.month}/${p.day}(${w}) ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function isAcceptingRequests(period: Pick<ShiftPeriod, "status" | "deadline">, now = new Date()) {
  return period.status === "COLLECTING" && now.getTime() < period.deadline.getTime();
}

export async function getPeriod(ym: YearMonth) {
  return prisma.shiftPeriod.findUnique({ where: { yearMonth: ym } });
}

export async function getOrCreatePeriod(ym: YearMonth) {
  const existing = await getPeriod(ym);
  if (existing) return existing;
  const settings = await getSettings();
  return prisma.shiftPeriod.upsert({
    where: { yearMonth: ym },
    create: { yearMonth: ym, deadline: defaultDeadline(ym, settings) },
    update: {},
  });
}

export function listPeriods() {
  return prisma.shiftPeriod.findMany({ orderBy: { yearMonth: "desc" }, take: 24 });
}

async function activeEmployees() {
  return prisma.employee.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { lineAccount: true },
  });
}

/** 受付開始＋提出依頼通知（P-19）。既に通知済みの人には再送しない */
export async function openCollection(ym: YearMonth, now = new Date()) {
  const period = await getOrCreatePeriod(ym);
  if (period.status === "DRAFT" || period.status === "PUBLISHED") {
    throw new UserError("シフト作成後のため受付を再開できません");
  }
  if (period.deadline.getTime() <= now.getTime()) {
    throw new UserError("締切が過ぎています。先に締切を延長してください");
  }
  const updated = await prisma.shiftPeriod.update({ where: { id: period.id }, data: { status: "COLLECTING" } });
  let queued = 0;
  for (const e of await activeEmployees()) {
    const r = await enqueue({
      employeeId: e.id,
      kind: "SHIFT_REQUEST",
      title: `${formatYearMonthJa(ym)} シフト提出依頼`,
      body: `【シフト提出のお願い】\n${e.name}さん、${formatYearMonthJa(ym)}の希望シフトを ${formatDeadline(updated.deadline)} までに提出してください。\n\n▼提出はこちら\n${staffUrl(e.id, "submit", now)}`,
      dedupeKey: `SHIFT_REQUEST:${ym}:${e.id}`,
    });
    if (r.created) queued++;
  }
  return { period: updated, queued };
}

/** 未提出者へのリマインド。1回/日まで */
export async function sendReminders(ym: YearMonth, now = new Date()) {
  const period = await getPeriod(ym);
  if (!period || !isAcceptingRequests(period, now)) throw new UserError("受付中の期間がありません");
  const settings = await getSettings();
  const today = businessDateOf(now, settings.dayChangeHour);
  const submitted = new Set((await prisma.shiftRequestSubmission.findMany({ where: { periodId: period.id } })).map((s) => s.employeeId));
  let queued = 0;
  for (const e of await activeEmployees()) {
    if (submitted.has(e.id)) continue;
    const r = await enqueue({
      employeeId: e.id,
      kind: "SHIFT_REMINDER",
      title: `${formatYearMonthJa(ym)} シフト提出リマインド`,
      body: `【シフト提出リマインド】\n${e.name}さん、${formatYearMonthJa(ym)}の希望シフトがまだ提出されていません。\n締切は ${formatDeadline(period.deadline)} です。\n\n▼提出はこちら\n${staffUrl(e.id, "submit", now)}`,
      dedupeKey: `SHIFT_REMINDER:${ym}:${e.id}:${today}`,
    });
    if (r.created) queued++;
  }
  return { queued };
}

export async function closeCollection(ym: YearMonth) {
  const period = await getPeriod(ym);
  if (!period) throw new UserError("期間がありません");
  if (period.status !== "COLLECTING") return period;
  return prisma.shiftPeriod.update({ where: { id: period.id }, data: { status: "CLOSED" } });
}

/** 締切延長（P-20）。date の 23:59 まで */
export async function extendDeadline(ym: YearMonth, date: string, now = new Date()) {
  const period = await getOrCreatePeriod(ym);
  const deadline = jstAt(date, 24 * 60);
  if (deadline.getTime() <= now.getTime()) throw new UserError("締切は未来の日付にしてください");
  if (yearMonthOf(date) > ym) throw new UserError("締切は対象月より前にしてください");
  const reopen = period.status === "CLOSED";
  return prisma.shiftPeriod.update({ where: { id: period.id }, data: { deadline, ...(reopen ? { status: "COLLECTING" } : {}) } });
}

/** 期間の提出状況 */
export async function periodOverview(ym: YearMonth) {
  const period = await getOrCreatePeriod(ym);
  const [employees, submissions] = await Promise.all([
    activeEmployees(),
    prisma.shiftRequestSubmission.findMany({ where: { periodId: period.id }, include: { days: true } }),
  ]);
  const byEmployee = new Map(submissions.map((s) => [s.employeeId, s]));
  const rows = employees.map((e) => {
    const s = byEmployee.get(e.id);
    return {
      employee: e,
      submission: s ?? null,
      okDays: s ? s.days.filter((d) => d.availability === "OK").length : 0,
    };
  });
  const submittedCount = rows.filter((r) => r.submission).length;
  return {
    period,
    rows,
    submittedCount,
    total: rows.length,
    rate: rows.length ? Math.round((submittedCount / rows.length) * 100) : 0,
  };
}

/** 次に作るべきシフトの月（今日の営業日の翌月） */
export async function nextTargetMonth(now = new Date()) {
  const settings = await getSettings();
  return addMonths(yearMonthOf(businessDateOf(now, settings.dayChangeHour)), 1);
}

/** 公開予定日（対象月の前月の公開日） */
export function publishDueDate(ym: YearMonth, settings: Pick<StoreSetting, "publishDay">) {
  const prev = addMonths(ym, -1);
  return toDateStr(Number(prev.slice(0, 4)), Number(prev.slice(5, 7)), settings.publishDay);
}
