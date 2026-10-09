// シフト案の生成・編集（AIが案を作る → 店長が確認・修正 → 公開。要件12）
import { fitsTime, generateShifts, type GenAvailability, type GenResult, type GenStaff } from "@/lib/shift/generate";
import { addDays, addMonths, datesOfMonth, isValidHm, type YearMonth } from "@/lib/time";
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
  const activePatternIds = new Set(slots.map((s) => s.patternId));
  const prior = await priorMonthDates(ym);
  const staff: GenStaff[] = conditions.map(({ employee, value }) => {
    const available = new Map<string, GenAvailability>();
    for (const d of subByEmp.get(employee.id)?.days ?? []) {
      // 停止した枠を希望していた日は「どの枠でも可」として扱う（提出画面の表示と合わせる）
      const patternId = d.patternId && activePatternIds.has(d.patternId) ? d.patternId : null;
      if (d.availability === "OK") available.set(d.date, { patternId, startTime: d.startTime, endTime: d.endTime });
    }
    return { id: employee.id, name: employee.name, available, ...value, priorDates: prior.get(employee.id) ?? [] };
  });
  return {
    period,
    input: {
      slots,
      staff,
      pairs: pairs.map((p) => ({ a: p.employeeAId, b: p.employeeBId, strength: p.strength as "HARD" | "SOFT" })),
      // 時間指定の手動配置も、時刻が同じ枠があればその枠の人数に数える
      fixed: manual.map((m) => ({
        date: m.date,
        employeeId: m.employeeId,
        patternId: m.patternId ?? matchPattern(slots, m.date, m.startTime, m.endTime),
        startTime: m.startTime,
        endTime: m.endTime,
      })),
      maxConsecutiveDays: settings.maxConsecutiveDays,
      dayChangeHour: settings.dayChangeHour,
      seed: 20260101,
    },
  };
}

function matchPattern(slots: { date: string; patternId: string; startTime: string; endTime: string }[], date: string, start: string, end: string) {
  return slots.find((s) => s.date === date && s.startTime === start && s.endTime === end)?.patternId ?? null;
}

/** 前月の公開済みシフトの最後の7日間の勤務日（月をまたぐ連勤の判定用） */
async function priorMonthDates(ym: YearMonth) {
  const prev = await prisma.shiftPeriod.findUnique({
    where: { yearMonth: addMonths(ym, -1) },
    include: { publications: { orderBy: { version: "desc" }, take: 1 } },
  });
  const map = new Map<string, string[]>();
  const pub = prev?.publications[0];
  if (!pub) return map;
  const from = addDays(`${ym}-01`, -7);
  for (const a of JSON.parse(pub.snapshot) as { date: string; employeeId: string }[]) {
    if (a.date >= from) map.set(a.employeeId, [...(map.get(a.employeeId) ?? []), a.date]);
  }
  return map;
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
    assigned: assignments.filter(
      (a) => a.date === s.date && (a.patternId === s.patternId || (!a.patternId && a.startTime === s.startTime && a.endTime === s.endTime)),
    ).length,
  }));
  return {
    period,
    dates: dates.map((d) => ({ date: d, closed: calendar.isClosed(d), holiday: calendar.isHoliday(d) })),
    patterns,
    rows,
    fill,
    pairs,
    violations: await findViolations(ym),
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

/** 手動配置が絶対条件・本人の希望に反していないか */
async function checkAssignment(ym: YearMonth, periodId: string, date: string, employeeId: string) {
  const warnings: string[] = [];
  const settings = await getSettings();
  const [sub, calendar, cond, count, pairs, sameDay, mine] = await Promise.all([
    prisma.shiftRequestSubmission.findUnique({ where: { periodId_employeeId: { periodId, employeeId } }, include: { days: { where: { date } } } }),
    loadCalendar(date, date),
    prisma.monthlyCondition.findUnique({ where: { yearMonth_employeeId: { yearMonth: ym, employeeId } } }),
    prisma.shiftAssignment.count({ where: { periodId, employeeId } }),
    prisma.pairConstraint.findMany({ where: { yearMonth: ym, strength: "HARD", OR: [{ employeeAId: employeeId }, { employeeBId: employeeId }] }, include: { employeeA: true, employeeB: true } }),
    prisma.shiftAssignment.findMany({ where: { periodId, date } }),
    prisma.shiftAssignment.findUnique({ where: { periodId_date_employeeId: { periodId, date, employeeId } }, include: { pattern: true } }),
  ]);
  if (calendar.isClosed(date)) warnings.push("店休日です");
  const req = sub?.days[0];
  if (!sub) warnings.push("希望が未提出のスタッフです");
  else if (req?.availability !== "OK") warnings.push("本人が「出勤不可」の日です");
  else if (mine) {
    if (req.patternId && mine.patternId !== req.patternId) {
      const wanted = await prisma.shiftPattern.findUnique({ where: { id: req.patternId } });
      if (wanted?.active) warnings.push(`本人の希望は「${wanted.name}」です`);
    }
    if (req.startTime && req.endTime && !fitsTime(mine, { patternId: null, startTime: req.startTime, endTime: req.endTime }, settings.dayChangeHour)) {
      warnings.push(`本人の希望時間（${req.startTime}〜${req.endTime}）から外れています`);
    }
  }
  if (cond?.maxDays !== null && cond?.maxDays !== undefined && count > cond.maxDays) warnings.push(`最大勤務日数（${cond.maxDays}日）を超えています`);
  for (const p of pairs) {
    const other = p.employeeAId === employeeId ? p.employeeB : p.employeeA;
    if (sameDay.some((a) => a.employeeId === other.id)) warnings.push(`${other.name}さんと「絶対に同じ日にしない」設定です`);
  }
  return warnings;
}

/**
 * 公開前チェック：今の配置が絶対条件に反していないか（生成後に店休日・NGペア・最大日数を変えた場合など）
 */
export async function findViolations(ym: YearMonth) {
  const period = await prisma.shiftPeriod.findUnique({ where: { yearMonth: ym } });
  if (!period) return [];
  const dates = datesOfMonth(ym);
  const [assignments, submissions, conditions, pairs, calendar, patterns] = await Promise.all([
    prisma.shiftAssignment.findMany({ where: { periodId: period.id }, include: { employee: true } }),
    prisma.shiftRequestSubmission.findMany({ where: { periodId: period.id }, include: { days: true } }),
    prisma.monthlyCondition.findMany({ where: { yearMonth: ym } }),
    prisma.pairConstraint.findMany({ where: { yearMonth: ym, strength: "HARD" }, include: { employeeA: true, employeeB: true } }),
    loadCalendar(dates[0], dates[dates.length - 1]),
    prisma.shiftPattern.findMany(),
  ]);
  const out: { date: string; employeeName: string; message: string }[] = [];
  const req = new Map(submissions.flatMap((s) => s.days.map((d) => [`${s.employeeId}|${d.date}`, d] as const)));
  const submitted = new Set(submissions.map((s) => s.employeeId));
  const pattern = new Map(patterns.map((p) => [p.id, p]));
  for (const a of assignments) {
    const name = a.employee.name;
    if (calendar.isClosed(a.date)) out.push({ date: a.date, employeeName: name, message: "店休日に配置されています" });
    const r = req.get(`${a.employeeId}|${a.date}`);
    if (!submitted.has(a.employeeId)) out.push({ date: a.date, employeeName: name, message: "希望未提出のスタッフです" });
    else if (r?.availability !== "OK") out.push({ date: a.date, employeeName: name, message: "本人が「出勤不可」の日です" });
    if (a.patternId && pattern.get(a.patternId) && !pattern.get(a.patternId)!.active) out.push({ date: a.date, employeeName: name, message: "停止中の枠です" });
  }
  for (const c of conditions) {
    if (c.maxDays === null) continue;
    const n = assignments.filter((a) => a.employeeId === c.employeeId).length;
    const name = assignments.find((a) => a.employeeId === c.employeeId)?.employee.name;
    if (n > c.maxDays && name) out.push({ date: "", employeeName: name, message: `最大勤務日数（${c.maxDays}日）を超えて${n}日です` });
  }
  for (const p of pairs) {
    const aDates = new Set(assignments.filter((a) => a.employeeId === p.employeeAId).map((a) => a.date));
    for (const b of assignments.filter((a) => a.employeeId === p.employeeBId && aDates.has(a.date))) {
      out.push({ date: b.date, employeeName: `${p.employeeA.name}・${p.employeeB.name}`, message: "「絶対に同じ日にしない」ペアが同じ日です" });
    }
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}
