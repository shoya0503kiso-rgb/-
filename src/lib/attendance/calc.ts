// 勤務時間の計算（DB非依存）。時刻は分単位に切り捨て済みである前提（P-09）。
import { diffMinutes } from "../time";

export interface BreakLike {
  start: Date;
  end: Date | null;
  /** 休憩中のまま退勤したため自動終了した */
  autoEnded?: boolean;
}

export interface SessionLike {
  businessDate: string;
  clockIn: Date | null;
  clockOut: Date | null;
  breaks: BreakLike[];
}

export interface SessionSummary {
  /** 出勤〜退勤（拘束時間）。どちらか欠けていれば null */
  spanMinutes: number | null;
  /** 休憩合計（終了済みの休憩のみ） */
  breakMinutes: number;
  /** 実働 = 拘束 − 休憩。計算できなければ null */
  workMinutes: number | null;
  /** 勤務中（退勤なし） */
  isOpen: boolean;
  /** 休憩中（終了していない休憩あり） */
  onBreak: boolean;
}

export function summarize(s: SessionLike): SessionSummary {
  const breakMinutes = s.breaks.reduce(
    (sum, b) => (b.end ? sum + Math.max(0, diffMinutes(b.start, b.end)) : sum),
    0,
  );
  const spanMinutes = s.clockIn && s.clockOut ? diffMinutes(s.clockIn, s.clockOut) : null;
  const workMinutes = spanMinutes === null ? null : spanMinutes - breakMinutes;
  return {
    spanMinutes,
    breakMinutes,
    workMinutes,
    isOpen: !!s.clockIn && !s.clockOut,
    onBreak: !s.clockOut && s.breaks.some((b) => !b.end),
  };
}

export interface MonthTotals {
  /** 実働合計（計算可能な勤務のみ） */
  workMinutes: number;
  breakMinutes: number;
  /** 勤務日数（勤怠が1件以上ある営業日の数） */
  workDays: number;
  /** 出勤/退勤が欠けていて実働に含められなかった件数 */
  incompleteCount: number;
}

export function totalsOf(sessions: SessionLike[]): MonthTotals {
  let workMinutes = 0;
  let breakMinutes = 0;
  let incompleteCount = 0;
  const days = new Set<string>();
  for (const s of sessions) {
    const sum = summarize(s);
    days.add(s.businessDate);
    if (sum.workMinutes === null) {
      incompleteCount++;
    } else {
      workMinutes += sum.workMinutes;
      breakMinutes += sum.breakMinutes;
    }
  }
  return { workMinutes, breakMinutes, workDays: days.size, incompleteCount };
}
