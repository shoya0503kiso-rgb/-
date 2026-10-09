// シフト枠と必要人数（P-18）
import { z } from "zod";
import type { GenSlot } from "@/lib/shift/generate";
import { datesOfMonth, isValidHm, weekdayOf, type YearMonth } from "@/lib/time";
import { prisma } from "../db";
import { UserError } from "../errors";
import { loadCalendar } from "../settings";

const patternSchema = z.object({
  name: z.string().trim().min(1, "枠の名前を入力してください").max(20),
  startTime: z.string().refine(isValidHm, "開始時刻が正しくありません"),
  endTime: z.string().refine(isValidHm, "終了時刻が正しくありません"),
  sortOrder: z.coerce.number().int().default(0),
});

export type PatternInput = z.input<typeof patternSchema>;

function parse(input: PatternInput) {
  const r = patternSchema.safeParse(input);
  if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "入力内容を確認してください");
  if (r.data.startTime === r.data.endTime) throw new UserError("開始と終了が同じ時刻です");
  return r.data;
}

export function listPatterns(opts: { includeInactive?: boolean } = {}) {
  return prisma.shiftPattern.findMany({
    where: opts.includeInactive ? {} : { active: true },
    orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }],
    include: { rules: true },
  });
}

export function createPattern(input: PatternInput) {
  return prisma.shiftPattern.create({ data: parse(input) });
}

export function updatePattern(id: string, input: PatternInput & { active?: boolean }) {
  return prisma.shiftPattern.update({ where: { id }, data: { ...parse(input), ...(input.active === undefined ? {} : { active: input.active }) } });
}

/** 曜日ごとの必要人数をまとめて保存（counts[weekday][patternId]） */
export async function saveStaffingRules(counts: Record<number, Record<string, number>>) {
  const ops = [];
  for (const [w, byPattern] of Object.entries(counts)) {
    const weekday = Number(w);
    if (!(weekday >= 0 && weekday <= 6)) throw new UserError("曜日が正しくありません");
    for (const [patternId, raw] of Object.entries(byPattern)) {
      const requiredCount = Number(raw);
      if (!Number.isInteger(requiredCount) || requiredCount < 0 || requiredCount > 50) throw new UserError("必要人数は0〜50で入力してください");
      ops.push(
        prisma.staffingRule.upsert({
          where: { weekday_patternId: { weekday, patternId } },
          create: { weekday, patternId, requiredCount },
          update: { requiredCount },
        }),
      );
    }
  }
  await prisma.$transaction(ops);
}

/** 特定日の必要人数（null で解除） */
export async function setStaffingOverride(date: string, patternId: string, requiredCount: number | null) {
  if (requiredCount === null) {
    await prisma.staffingOverride.deleteMany({ where: { date, patternId } });
    return;
  }
  if (!Number.isInteger(requiredCount) || requiredCount < 0 || requiredCount > 50) throw new UserError("必要人数は0〜50で入力してください");
  await prisma.staffingOverride.upsert({
    where: { date_patternId: { date, patternId } },
    create: { date, patternId, requiredCount },
    update: { requiredCount },
  });
}

export function listOverrides(ym: YearMonth) {
  const dates = datesOfMonth(ym);
  return prisma.staffingOverride.findMany({
    where: { date: { gte: dates[0], lte: dates[dates.length - 1] } },
    include: { pattern: true },
    orderBy: { date: "asc" },
  });
}

/** 月の「日×枠」ごとの必要人数（店休日は除く） */
export async function requiredSlots(ym: YearMonth): Promise<GenSlot[]> {
  const dates = datesOfMonth(ym);
  const [patterns, overrides, calendar] = await Promise.all([
    listPatterns(),
    prisma.staffingOverride.findMany({ where: { date: { gte: dates[0], lte: dates[dates.length - 1] } } }),
    loadCalendar(dates[0], dates[dates.length - 1]),
  ]);
  const ov = new Map(overrides.map((o) => [`${o.date}|${o.patternId}`, o.requiredCount]));
  const slots: GenSlot[] = [];
  for (const date of dates) {
    if (calendar.isClosed(date)) continue;
    for (const p of patterns) {
      const rule = p.rules.find((r) => r.weekday === weekdayOf(date));
      const required = ov.get(`${date}|${p.id}`) ?? rule?.requiredCount ?? 0;
      slots.push({ date, patternId: p.id, startTime: p.startTime, endTime: p.endTime, required });
    }
  }
  return slots;
}
