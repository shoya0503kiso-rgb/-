import type { StoreSetting } from "@prisma/client";
import { z } from "zod";
import type { AnomalyRules } from "@/lib/attendance/anomalies";
import { isHoliday, parseWeekdays, type CalendarOverride, type HolidayRule } from "@/lib/calendar";
import { isValidHm, type DateStr } from "@/lib/time";
import { prisma } from "./db";
import { UserError } from "./errors";

export async function getSettings(): Promise<StoreSetting> {
  const s = await prisma.storeSetting.findUnique({ where: { id: 1 } });
  return s ?? prisma.storeSetting.create({ data: { id: 1 } });
}

export function anomalyRulesOf(s: StoreSetting): AnomalyRules {
  return {
    dayChangeHour: s.dayChangeHour,
    openTime: s.openTime,
    closeTime: s.closeTime,
    longWorkMinutes: s.longWorkMinutes,
    outOfHoursMarginMinutes: s.outOfHoursMarginMinutes,
    missingClockOutHours: s.missingClockOutHours,
    shortWorkMinutes: s.shortWorkMinutes,
    legalBreakCheckEnabled: s.legalBreakCheckEnabled,
    holidayBreakWorkMinutes: s.holidayBreakWorkMinutes,
    holidayBreakRequiredMinutes: s.holidayBreakRequiredMinutes,
  };
}

export function holidayRuleOf(s: StoreSetting): HolidayRule {
  return { holidayWeekdays: parseWeekdays(s.holidayWeekdays), includePublic: s.holidayIncludesPublic };
}

/** 期間内の店舗カレンダー個別指定を取得し、休日判定関数を返す */
export async function loadCalendar(from: DateStr, to: DateStr, settings?: StoreSetting) {
  const s = settings ?? (await getSettings());
  const rows = await prisma.calendarDay.findMany({ where: { date: { gte: from, lte: to } } });
  const map = new Map<string, CalendarOverride>(rows.map((r) => [r.date, r]));
  const rule = holidayRuleOf(s);
  return {
    isHoliday: (date: DateStr) => isHoliday(date, rule, map.get(date)),
    isClosed: (date: DateStr) => map.get(date)?.isClosed ?? false,
    override: (date: DateStr) => map.get(date),
  };
}

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const hm = z.string().refine(isValidHm, "時刻は HH:MM 形式で入力してください");

export const settingsSchema = z.object({
  storeName: z.string().trim().min(1).max(50),
  dayChangeHour: int(0, 12),
  openTime: hm,
  closeTime: hm,
  longWorkMinutes: int(60, 24 * 60),
  outOfHoursMarginMinutes: int(0, 12 * 60),
  missingClockOutHours: int(1, 48),
  shortWorkMinutes: int(0, 120),
  legalBreakCheckEnabled: z.boolean(),
  holidayWeekdays: z.array(int(0, 6)),
  holidayIncludesPublic: z.boolean(),
  holidayBreakWorkMinutes: int(0, 24 * 60),
  holidayBreakRequiredMinutes: int(0, 24 * 60),
  lateGraceMinutes: int(0, 120),
  maxConsecutiveDays: int(1, 31),
  requestNotifyDay: int(1, 28),
  requestReminderDay: int(1, 28),
  requestDeadlineDay: int(1, 28),
  publishDay: int(1, 28),
});

export type SettingsInput = z.input<typeof settingsSchema>;

export async function updateSettings(input: SettingsInput) {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
  const v = parsed.data;
  if (!(v.requestNotifyDay < v.requestDeadlineDay && v.requestDeadlineDay < v.publishDay)) {
    throw new UserError("提出依頼日 < 締切日 < 公開日 の順に設定してください");
  }
  if (v.requestReminderDay < v.requestNotifyDay || v.requestReminderDay > v.requestDeadlineDay) {
    throw new UserError("リマインド日は提出依頼日〜締切日の間に設定してください");
  }
  const data = { ...v, holidayWeekdays: [...new Set(v.holidayWeekdays)].sort().join(",") };
  return prisma.storeSetting.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
}

export async function setCalendarDay(date: DateStr, input: { isClosed: boolean; isHoliday: boolean | null; note: string }) {
  if (!input.isClosed && input.isHoliday === null && !input.note) {
    await prisma.calendarDay.deleteMany({ where: { date } });
    return;
  }
  await prisma.calendarDay.upsert({ where: { date }, create: { date, ...input }, update: input });
}
