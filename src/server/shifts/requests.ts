// シフト希望の入力・提出
import { datesOfMonth, isValidHm, type YearMonth } from "@/lib/time";
import { prisma } from "../db";
import { UserError } from "../errors";
import { loadCalendar } from "../settings";
import { getOrCreatePeriod, getPeriod, isAcceptingRequests } from "./periods";

export interface RequestDayInput {
  date: string;
  availability: "OK" | "NG";
  patternId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

export async function requestForm(employeeId: string, ym: YearMonth, now = new Date()) {
  const period = await getOrCreatePeriod(ym);
  const dates = datesOfMonth(ym);
  const [calendar, patterns, submission] = await Promise.all([
    loadCalendar(dates[0], dates[dates.length - 1]),
    prisma.shiftPattern.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.shiftRequestSubmission.findUnique({
      where: { periodId_employeeId: { periodId: period.id, employeeId } },
      include: { days: true },
    }),
  ]);
  const byDate = new Map(submission?.days.map((d) => [d.date, d]));
  const activeIds = new Set(patterns.map((p) => p.id));
  // 希望していた枠が停止された日（「どの枠でも可」として表示し、本人に知らせる）
  const removedPatternDays = (submission?.days ?? []).filter((d) => d.patternId && !activeIds.has(d.patternId)).map((d) => d.date);
  return {
    period,
    accepting: isAcceptingRequests(period, now),
    patterns,
    submission,
    removedPatternDays,
    days: dates.map((date) => {
      const d = byDate.get(date);
      return {
        date,
        closed: calendar.isClosed(date),
        holiday: calendar.isHoliday(date),
        availability: (d?.availability ?? null) as "OK" | "NG" | null,
        patternId: d?.patternId && activeIds.has(d.patternId) ? d.patternId : null,
        startTime: d?.startTime ?? null,
        endTime: d?.endTime ?? null,
      };
    }),
  };
}

/**
 * 希望を提出（上書き）。入力のない日は「不可」として保存する（P-19）。
 * by = STAFF のときは受付期間内のみ（P-20）、ADMIN は代理入力としていつでも可。
 */
export async function submitRequest(
  employeeId: string,
  ym: YearMonth,
  input: { days: RequestDayInput[]; comment: string },
  by: "STAFF" | "ADMIN",
  now = new Date(),
) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || !employee.active) throw new UserError("従業員が見つかりません");
  // スタッフからは受付中の期間にだけ提出できる（期間を勝手に作らない）
  const period = by === "STAFF" ? await getPeriod(ym) : await getOrCreatePeriod(ym);
  if (!period || (by === "STAFF" && !isAcceptingRequests(period, now))) {
    throw new UserError("提出期間外のため変更できません。店長に連絡してください。");
  }
  const dates = datesOfMonth(ym);
  const calendar = await loadCalendar(dates[0], dates[dates.length - 1]);
  const patternIds = new Set((await prisma.shiftPattern.findMany({ where: { active: true } })).map((p) => p.id));
  const given = new Map<string, RequestDayInput>();
  for (const d of input.days) {
    if (!dates.includes(d.date)) throw new UserError(`対象月以外の日付です: ${d.date}`);
    if (d.availability !== "OK" && d.availability !== "NG") throw new UserError("出勤可否が正しくありません");
    if (d.patternId && !patternIds.has(d.patternId)) throw new UserError("選んだシフト枠は現在使われていません。枠を選び直してください");
    if ((d.startTime && !isValidHm(d.startTime)) || (d.endTime && !isValidHm(d.endTime))) throw new UserError("時刻が正しくありません");
    if (!!d.startTime !== !!d.endTime) throw new UserError("希望時間は開始と終了の両方を入力してください");
    given.set(d.date, d);
  }
  const days = dates.map((date) => {
    const d = given.get(date);
    const ok = d?.availability === "OK" && !calendar.isClosed(date);
    return {
      date,
      availability: ok ? "OK" : "NG",
      patternId: ok ? (d?.patternId ?? null) : null,
      startTime: ok ? (d?.startTime ?? null) : null,
      endTime: ok ? (d?.endTime ?? null) : null,
    };
  });
  const comment = input.comment.trim().slice(0, 500);
  return prisma.$transaction(async (tx) => {
    const sub = await tx.shiftRequestSubmission.upsert({
      where: { periodId_employeeId: { periodId: period.id, employeeId } },
      create: { periodId: period.id, employeeId, comment, submittedBy: by, submittedAt: now },
      update: { comment, submittedBy: by, submittedAt: now },
    });
    await tx.shiftRequestDay.deleteMany({ where: { submissionId: sub.id } });
    await tx.shiftRequestDay.createMany({ data: days.map((d) => ({ ...d, submissionId: sub.id })) });
    return { submission: sub, okDays: days.filter((d) => d.availability === "OK").length };
  });
}
