// 給与目安の計算（DB非依存）。P-27
// 時給 × 実働 ＋ 深夜割増（22:00〜翌5:00 の実働に25%）＋ 時間外割増（1勤務 8時間を超えた実働に25%）。
// 交通費・週40時間超の割増・休日割増・控除は含まない「目安」。最終的な給与計算は社労士の確認による。
import { summarize, type SessionLike } from "./attendance/calc";
import { jstAt, jstDateStr, addDays } from "./time";

const MIN = 60_000;
const NIGHT_START = 22 * 60;
const NIGHT_END = 29 * 60; // 翌5:00
export const NIGHT_RATE = 0.25;
export const OVERTIME_RATE = 0.25;
export const DAILY_LIMIT_MINUTES = 8 * 60;

type Range = [number, number]; // epoch ms

function subtract(base: Range, cuts: Range[]): Range[] {
  let parts: Range[] = [base];
  for (const [cs, ce] of cuts) {
    parts = parts.flatMap(([s, e]) => {
      if (ce <= s || cs >= e) return [[s, e] as Range];
      const out: Range[] = [];
      if (cs > s) out.push([s, cs]);
      if (ce < e) out.push([ce, e]);
      return out;
    });
  }
  return parts;
}

/** 実際に働いていた時間帯（出勤〜退勤から休憩を除いたもの） */
export function workRanges(s: SessionLike): Range[] {
  if (!s.clockIn || !s.clockOut || s.clockOut <= s.clockIn) return [];
  const breaks = s.breaks.filter((b) => b.end).map((b) => [b.start.getTime(), b.end!.getTime()] as Range);
  return subtract([s.clockIn.getTime(), s.clockOut.getTime()], breaks);
}

/** 22:00〜翌5:00 に含まれる分数 */
export function nightMinutes(ranges: Range[]): number {
  let total = 0;
  for (const [s, e] of ranges) {
    // 範囲が触れうる暦日ごとに、前日22時〜当日5時・当日22時〜翌5時を数える
    const firstDay = addDays(jstDateStr(new Date(s)), -1);
    for (let d = firstDay; jstAt(d, 0).getTime() <= e; d = addDays(d, 1)) {
      const ns = jstAt(d, NIGHT_START).getTime();
      const ne = jstAt(d, NIGHT_END).getTime();
      total += Math.max(0, Math.min(e, ne) - Math.max(s, ns));
    }
  }
  return Math.round(total / MIN);
}

export interface PayEstimate {
  workMinutes: number;
  nightMinutes: number;
  overtimeMinutes: number;
  base: number;
  nightPremium: number;
  overtimePremium: number;
  total: number;
  /** 出勤/退勤が欠けていて計算に含めなかった勤怠の数 */
  incompleteCount: number;
}

export function estimatePay(sessions: SessionLike[], hourlyWage: number): PayEstimate {
  let workMinutes = 0;
  let night = 0;
  let overtime = 0;
  let incompleteCount = 0;
  for (const s of sessions) {
    const sum = summarize(s);
    if (sum.workMinutes === null || sum.workMinutes < 0) {
      incompleteCount++;
      continue;
    }
    workMinutes += sum.workMinutes;
    night += nightMinutes(workRanges(s));
    overtime += Math.max(0, sum.workMinutes - DAILY_LIMIT_MINUTES);
  }
  const perMinute = hourlyWage / 60;
  const base = Math.floor(workMinutes * perMinute);
  const nightPremium = Math.floor(night * perMinute * NIGHT_RATE);
  const overtimePremium = Math.floor(overtime * perMinute * OVERTIME_RATE);
  return {
    workMinutes,
    nightMinutes: night,
    overtimeMinutes: overtime,
    base,
    nightPremium,
    overtimePremium,
    total: base + nightPremium + overtimePremium,
    incompleteCount,
  };
}
