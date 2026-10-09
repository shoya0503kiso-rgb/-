// 日本時間（JST, UTC+9, 夏時間なし）の日付・時刻ユーティリティ。
// DB には UTC の Date を保存し、日付の判定・表示はすべてここを通して JST で行う。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MINUTES = 24 * 60;

/** YYYY-MM-DD */
export type DateStr = string;
/** YYYY-MM */
export type YearMonth = string;

export const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

const pad = (n: number) => String(n).padStart(2, "0");

export function toDateStr(y: number, m: number, d: number): DateStr {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function jstParts(date: Date) {
  const t = new Date(date.getTime() + JST_OFFSET_MS);
  return {
    year: t.getUTCFullYear(),
    month: t.getUTCMonth() + 1,
    day: t.getUTCDate(),
    hour: t.getUTCHours(),
    minute: t.getUTCMinutes(),
    weekday: t.getUTCDay(),
  };
}

/** JST の暦日 */
export function jstDateStr(date: Date): DateStr {
  const p = jstParts(date);
  return toDateStr(p.year, p.month, p.day);
}

/** 打刻時刻から帰属する営業日を求める（日付切替時刻より前は前日扱い） */
export function businessDateOf(at: Date, dayChangeHour: number): DateStr {
  return jstDateStr(new Date(at.getTime() - dayChangeHour * 60 * MINUTE_MS));
}

/** 分単位に切り捨て（打刻は1分単位で扱う：P-09） */
export function truncateToMinute(date: Date): Date {
  return new Date(Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS);
}

/** "HH:MM" → 0時からの分 */
export function parseHm(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) throw new Error(`時刻の形式が不正です: ${hm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 47 || min > 59) throw new Error(`時刻の形式が不正です: ${hm}`);
  return h * 60 + min;
}

export function isValidHm(hm: string): boolean {
  try {
    const v = parseHm(hm);
    return v < DAY_MINUTES;
  } catch {
    return false;
  }
}

/** 指定日の JST 0:00 から minutes 分後の時刻（1440 以上なら翌日） */
export function jstAt(date: DateStr, minutes: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - JST_OFFSET_MS + minutes * MINUTE_MS);
}

/** datetime-local 入力値（"YYYY-MM-DDTHH:MM"、JST）→ Date */
export function parseJstLocal(value: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return jstAt(m[1], Number(m[2]) * 60 + Number(m[3]));
}

/** Date → datetime-local 入力値（JST） */
export function toJstLocal(date: Date | null | undefined): string {
  if (!date) return "";
  const p = jstParts(date);
  return `${toDateStr(p.year, p.month, p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function addDays(date: DateStr, n: number): DateStr {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return toDateStr(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function weekdayOf(date: DateStr): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function yearMonthOf(date: DateStr): YearMonth {
  return date.slice(0, 7);
}

export function isValidYearMonth(ym: string): boolean {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

export function isValidDateStr(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonthCount(y, mo);
}

function daysInMonthCount(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 月の全日付 */
export function datesOfMonth(ym: YearMonth): DateStr[] {
  const [y, m] = ym.split("-").map(Number);
  const n = daysInMonthCount(y, m);
  return Array.from({ length: n }, (_, i) => toDateStr(y, m, i + 1));
}

export function addMonths(ym: YearMonth, n: number): YearMonth {
  const [y, m] = ym.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
}

export function diffMinutes(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MINUTE_MS);
}

/** "21:03"。基準日（営業日）より後の暦日なら "翌03:00" */
export function formatTime(date: Date | null | undefined, baseDate?: DateStr): string {
  if (!date) return "";
  const p = jstParts(date);
  const hm = `${pad(p.hour)}:${pad(p.minute)}`;
  if (!baseDate) return hm;
  const ds = toDateStr(p.year, p.month, p.day);
  if (ds === baseDate) return hm;
  if (ds === addDays(baseDate, 1)) return `翌${hm}`;
  return `${Number(ds.slice(5, 7))}/${Number(ds.slice(8, 10))} ${hm}`;
}

/** 分 → "7:35" */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "";
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  return `${sign}${Math.floor(abs / 60)}:${pad(abs % 60)}`;
}

/** 分 → "7時間35分" */
export function formatDurationJa(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

/** "10/12(日)" */
export function formatDateJa(date: DateStr): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}(${WEEKDAY_JA[weekdayOf(date)]})`;
}

export function formatYearMonthJa(ym: YearMonth): string {
  return `${ym.slice(0, 4)}年${Number(ym.slice(5, 7))}月`;
}

/** シフト等の "HH:MM"〜"HH:MM"（終了 ≦ 開始なら翌日）を具体的な時刻に */
export function rangeOnDate(date: DateStr, start: string, end: string): { start: Date; end: Date } {
  const s = parseHm(start);
  let e = parseHm(end);
  if (e <= s) e += DAY_MINUTES;
  return { start: jstAt(date, s), end: jstAt(date, e) };
}

/** "20:00"〜"05:00" → "20:00-翌05:00" */
export function formatHmRange(start: string, end: string): string {
  return parseHm(end) <= parseHm(start) ? `${start}-翌${end}` : `${start}-${end}`;
}
