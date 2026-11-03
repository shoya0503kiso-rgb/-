// 日付・営業日の計算（すべて JST 基準）
const JST_OFFSET_MS = 9 * 3600_000;

/** JST の年月日・時 */
export function jstParts(d: Date) {
  const j = new Date(d.getTime() + JST_OFFSET_MS);
  return { y: j.getUTCFullYear(), m: j.getUTCMonth() + 1, d: j.getUTCDate(), h: j.getUTCHours(), min: j.getUTCMinutes() };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function ymd(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** 営業日 "YYYY-MM-DD"。切替時刻（dayChangeHour 時）より前は前日扱い（深夜営業のため） */
export function businessDate(now: Date, dayChangeHour: number) {
  const p = jstParts(new Date(now.getTime() - dayChangeHour * 3600_000));
  return ymd(p.y, p.m, p.d);
}

/** "YYYY-MM-DD" → "YYYY-MM" */
export const monthOf = (date: string) => date.slice(0, 7);

export function isValidDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function isValidMonth(s: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/** 月を n ずらす */
export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
}

/** 月の日数と1日の曜日（0=日） */
export function monthInfo(month: string) {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return { y, m, days, firstWeekday };
}

export function weekdayOf(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** "2026-10-30" → "10/30(金)" */
export function formatDate(date: string) {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}(${WEEKDAYS[weekdayOf(date)]})`;
}

export function formatMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${y}年${m}月`;
}

/** Date → "10/30 21:05"（JST） */
export function formatDateTime(d: Date) {
  const p = jstParts(d);
  return `${p.m}/${p.d} ${pad(p.h)}:${pad(p.min)}`;
}
