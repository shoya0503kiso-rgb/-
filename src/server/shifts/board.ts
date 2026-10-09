// シフト案の生成・編集（AIが案を作る → 店長が確認・修正 → 公開。要件12）
import { generateShifts, type GenAvailability, type GenResult, type GenStaff } from "@/lib/shift/generate";
import { datesOfMonth, isValidHm, type YearMonth } from "@/lib/time";
import { prisma } from "../db";
import { UserError } from "../errors";
import { getSettings, loadCalendar } from "../settings";
import { listConditions } from "./conditions";
import { getOrCreatePeriod } from "./periods";
import { requiredSlots } from "./patterns";

function assertEditable(status: string) {
  if (status === "PREPARING" || status === "COLLECTING") {
    throw new UserError("希望の受付中です。受付を終了してからシフトを作成してください");
  }
}

/** 生成の入力をDBから組み立てる */
async function buildInput(ym: YearMonth, keepManual: boolean) {
  const period = await getOrCreatePeriod(ym);
  const settings = await getSettings();
  const [slots, conditions, pairs, submissions, manual] = await Promise.all([
    requiredSlots(ym),
    listConditions(ym),
    prisma.pairConstraint.findMany({ where: { yearMonth: ym } }),
    prisma.shiftRequestSubmission.findMany({ where: { periodId: period.id }, include: { days: true } }),
    keepManual ? prisma.shiftAssignment.findMany({ where: { periodId: period.id, source: "MANUAL" } }) : Promise.resolve([]),
  ]);
  const subByEmp = new Map(submissions.map((s) => [s.employeeId, s]));
  const staff: GenStaff[] = conditions.map(({ employee, value }) => {
    const available = new Map<string, GenAvailability>();
    for (const d of subByEmp.get(employee.id)?.days ?? []) {
      if (d.availability === "OK") available.set(d.date, { patternId: d.patternId, startTime: d.startTime, endTime: d.endTime });
    }
    return { id: employee.id, name: employee.name, available, ...value };
  });
  return {
    period,
    input: {
      slots,
      staff,
      pairs: pairs.map((p) => ({ a: p.employeeAId, b: p.employeeBId, strength: p.strength as "HARD" | "SOFT" })),
      fixed: manual.map((m) => ({ date: m.date, employeeId: m.employeeId, patternId: m.patternId, startTime: m.startTime, endTime: m.endTime })),
      maxConsecutiveDays: settings.maxConsecutiveDays,
      seed: 20260101,
    },
  };
}

/** シフト案を自動生成して保存する。keepManual = 手動で入れた配置は残す */
export async function runGeneration(ym: YearMonth, admin: { name: string }, opts: { keepManual: boolean }) {
  const period = await getOrCreatePeriod(ym);
  assertEditable(period.status);
  const { input } = await buildInput(ym, opts.keepManual);
  if (input.slots.every((s) => s.required === 0)) {
    throw new UserError("必要人数が設定されていません。「シフト枠・必要人数」で設定してください");
  }
  const result = generateShifts(input);
  await prisma.$transaction(async (tx) => {
    await tx.shiftAssignment.deleteMany({ where: { periodId: period.id, ...(opts.keepManual ? { source: "AUTO" } : {}) } });
    await tx.shiftAssignment.createMany({
      data: result.assignments
        .filter((a) => !a.fixed)
        .map((a) => ({ periodId: period.id, date: a.date, employeeId: a.employeeId, patternId: a.patternId, startTime: a.startTime, endTime: a.endTime, source: "AUTO" })),
    });
    await tx.shiftGenerationRun.create({
      data: { periodId: period.id, createdBy: admin.name, score: result.score, report: JSON.stringify(reportOf(result)) },
    });
    // 公開済みの月は「公開済み（未通知の変更あり）」のまま。それ以外は案作成中へ
    if (period.status !== "PUBLISHED") await tx.shiftPeriod.update({ where: { id: period.id }, data: { status: "DRAFT" } });
  });
  return reportOf(result);
}

export type GenerationReport = ReturnType<typeof reportOf>;

function reportOf(r: GenResult) {
  return { shortages: r.shortages, staff: r.staff, warnings: r.warnings, assigned: r.assignments.length };
}

export async function latestReport(ym: YearMonth) {
  const run = await prisma.shiftGenerationRun.findFirst({ where: { period: { yearMonth: ym } }, orderBy: { createdAt: "desc" } });
  return run ? { createdAt: run.createdAt, createdBy: run.createdBy, report: JSON.parse(run.report) as GenerationReport } : null;
}

/** 編集画面のデータ：日 × スタッフの希望・配置、日 × 枠の充足状況 */
export async function boardData(ym: YearMonth) {
  const period = await getOrCreatePeriod(ym);
  const dates = datesOfMonth(ym);
  const [slots, conditions, submissions, assignments, patterns, calendar, pairs] = await Promise.all([
    requiredSlots(ym),
    listConditions(ym),
    prisma.shiftRequestSubmission.findMany({ where: { periodId: period.id }, include: { days: true } }),
    prisma.shiftAssignment.findMany({ where: { periodId: period.id }, include: { employee: true } }),
    prisma.shiftPattern.findMany({ orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }] }),
    loadCalendar(dates[0], dates[dates.length - 1]),
    prisma.pairConstraint.findMany({ where: { yearMonth: ym } }),
  ]);
  const subByEmp = new Map(submissions.map((s) => [s.employeeId, s]));
  // 退職などで条件一覧にいないが配置が残っている人も表示する
  const staffIds = new Set(conditions.map((c) => c.employee.id));
  const extra = [...new Map(assignments.filter((a) => !staffIds.has(a.employeeId)).map((a) => [a.employeeId, a.employee])).values()];
  const rows = [...conditions.map((c) => ({ employee: c.employee, condition: c.value })), ...extra.map((e) => ({ employee: e, condition: null }))].map(
    ({ employee, condition }) => {
      const sub = subByEmp.get(employee.id);
      const req = new Map(sub?.days.map((d) => [d.date, d]));
      const mine = assignments.filter((a) => a.employeeId === employee.id);
      return {
        employee: { id: employee.id, name: employee.name, active: employee.active },
        condition,
        submitted: !!sub,
        comment: sub?.comment ?? "",
        days: dates.map((date) => {
          const r = req.get(date);
          const a = mine.find((x) => x.date === date);
          return {
            date,
            available: r?.availability === "OK",
            requestPatternId: r?.patternId ?? null,
            requestTime: r?.startTime && r.endTime ? `${r.startTime}-${r.endTime}` : null,
            assignment: a ? { id: a.id, patternId: a.patternId, startTime: a.startTime, endTime: a.endTime, source: a.source } : null,
          };
        }),
        total: mine.length,
      };
    },
  );
  const fill = slots.map((s) => ({
    ...s,
    assigned: assignments.filter((a) => a.date === s.date && a.patternId === s.patternId).length,
  }));
  return {
    period,
    dates: dates.map((d) => ({ date: d, closed: calendar.isClosed(d), holiday: calendar.isHoliday(d) })),
    patterns,
    rows,
    fill,
    pairs,
  };
}

/**
 * 手動で配置を変更（patternId = null で外す、"custom" で時間指定）。
 * 絶対条件に反する場合も店長判断として許可し、警告を返す（docs/05）
 */
export async function setAssignment(
  ym: YearMonth,
  date: string,
  employeeId: string,
  choice: { patternId: string } | { custom: { startTime: string; endTime: string } } | null,
) {
  const period = await getOrCreatePeriod(ym);
  assertEditable(period.status);
  if (!datesOfMonth(ym).includes(date)) throw new UserError("対象月以外の日付です");
  const where = { periodId_date_employeeId: { periodId: period.id, date, employeeId } };
  if (!choice) {
    await prisma.shiftAssignment.deleteMany({ where: { periodId: period.id, date, employeeId } });
    return { warnings: [] as string[] };
  }
  let patternId: string | null = null;
  let startTime: string;
  let endTime: string;
  if ("patternId" in choice) {
    const p = await prisma.shiftPattern.findUnique({ where: { id: choice.patternId } });
    if (!p) throw new UserError("シフト枠が見つかりません");
    patternId = p.id;
    startTime = p.startTime;
    endTime = p.endTime;
  } else {
    if (!isValidHm(choice.custom.startTime) || !isValidHm(choice.custom.endTime) || choice.custom.startTime === choice.custom.endTime) {
      throw new UserError("時刻が正しくありません");
    }
    ({ startTime, endTime } = choice.custom);
  }
  await prisma.shiftAssignment.upsert({
    where,
    create: { periodId: period.id, date, employeeId, patternId, startTime, endTime, source: "MANUAL" },
    update: { patternId, startTime, endTime, source: "MANUAL" },
  });
  if (period.status === "CLOSED") await prisma.shiftPeriod.update({ where: { id: period.id }, data: { status: "DRAFT" } });
  return { warnings: await checkAssignment(ym, period.id, date, employeeId) };
}

/** 手動配置が絶対条件に反していないか */
async function checkAssignment(ym: YearMonth, periodId: string, date: string, employeeId: string) {
  const warnings: string[] = [];
  const [sub, calendar, cond, count, pairs, sameDay] = await Promise.all([
    prisma.shiftRequestSubmission.findUnique({ where: { periodId_employeeId: { periodId, employeeId } }, include: { days: { where: { date } } } }),
    loadCalendar(date, date),
    prisma.monthlyCondition.findUnique({ where: { yearMonth_employeeId: { yearMonth: ym, employeeId } } }),
    prisma.shiftAssignment.count({ where: { periodId, employeeId } }),
    prisma.pairConstraint.findMany({ where: { yearMonth: ym, strength: "HARD", OR: [{ employeeAId: employeeId }, { employeeBId: employeeId }] }, include: { employeeA: true, employeeB: true } }),
    prisma.shiftAssignment.findMany({ where: { periodId, date } }),
  ]);
  if (calendar.isClosed(date)) warnings.push("店休日です");
  if (!sub) warnings.push("希望が未提出のスタッフです");
  else if (sub.days[0]?.availability !== "OK") warnings.push("本人が「出勤不可」の日です");
  if (cond?.maxDays !== null && cond?.maxDays !== undefined && count > cond.maxDays) warnings.push(`最大勤務日数（${cond.maxDays}日）を超えています`);
  for (const p of pairs) {
    const other = p.employeeAId === employeeId ? p.employeeB : p.employeeA;
    if (sameDay.some((a) => a.employeeId === other.id)) warnings.push(`${other.name}さんと「絶対に同じ日にしない」設定です`);
  }
  return warnings;
}
