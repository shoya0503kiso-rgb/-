import holidayJp from "@holiday-jp/holiday_jp";
import { weekdayOf, type DateStr } from "./time";

export interface HolidayRule {
  /** 休日扱いの曜日（0=日 … 6=土） */
  holidayWeekdays: number[];
  /** 国民の祝日を休日に含めるか */
  includePublic: boolean;
}

/** 店舗カレンダーの個別指定 */
export interface CalendarOverride {
  isClosed: boolean;
  /** null = 自動判定 */
  isHoliday: boolean | null;
  note?: string;
}

export function parseWeekdays(csv: string): number[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-6]$/.test(s))
    .map(Number);
}

export function publicHolidayName(date: DateStr): string | null {
  const h = (holidayJp.holidays as Record<string, { name: string }>)[date];
  return h ? h.name : null;
}

/** 店舗独自ルール上の「休日」か（P-12） */
export function isHoliday(date: DateStr, rule: HolidayRule, override?: CalendarOverride | null): boolean {
  if (override && override.isHoliday !== null) return override.isHoliday;
  if (rule.holidayWeekdays.includes(weekdayOf(date))) return true;
  return rule.includePublic && publicHolidayName(date) !== null;
}
