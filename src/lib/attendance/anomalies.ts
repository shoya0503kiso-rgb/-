// 勤怠異常の判定（DB非依存）。結果は保存せず毎回計算する。
import { businessDateOf, diffMinutes, formatDurationJa, jstAt, parseHm } from "../time";
import { summarize, type SessionLike } from "./calc";

export type AnomalyCode =
  | "MISSING_CLOCK_OUT"
  | "MISSING_CLOCK_IN"
  | "BREAK_NOT_ENDED"
  | "BREAK_AUTO_ENDED"
  | "TIME_INCONSISTENT"
  | "LONG_WORK"
  | "SHORT_WORK"
  | "OUT_OF_HOURS"
  | "BREAK_SHORT_LEGAL"
  | "HOLIDAY_BREAK";

export const ANOMALY_LABELS: Record<AnomalyCode, string> = {
  MISSING_CLOCK_OUT: "退勤打刻なし",
  MISSING_CLOCK_IN: "出勤打刻なし（退勤のみ）",
  BREAK_NOT_ENDED: "休憩終了なし",
  BREAK_AUTO_ENDED: "休憩終了を押さずに退勤",
  TIME_INCONSISTENT: "時刻の矛盾",
  LONG_WORK: "勤務時間が長すぎる",
  SHORT_WORK: "勤務時間が短すぎる",
  OUT_OF_HOURS: "営業時間外の打刻",
  BREAK_SHORT_LEGAL: "休憩不足",
  HOLIDAY_BREAK: "休憩時間を確認してください（休日）",
};

export interface AnomalyRules {
  dayChangeHour: number;
  openTime: string;
  closeTime: string;
  longWorkMinutes: number;
  outOfHoursMarginMinutes: number;
  missingClockOutHours: number;
  shortWorkMinutes: number;
  legalBreakCheckEnabled: boolean;
  holidayBreakWorkMinutes: number;
  holidayBreakRequiredMinutes: number;
}

export interface Anomaly {
  code: AnomalyCode;
  label: string;
  detail: string;
}

export interface DetectContext {
  rules: AnomalyRules;
  /** 営業日が店舗ルール上の休日か */
  isHoliday: boolean;
  now: Date;
}

/** 営業日の営業時間（閉店が開店以前なら翌日。開店が日付切替より前なら翌日扱い） */
export function businessHours(date: string, rules: Pick<AnomalyRules, "openTime" | "closeTime" | "dayChangeHour">) {
  let open = parseHm(rules.openTime);
  if (open < rules.dayChangeHour * 60) open += 1440;
  let close = parseHm(rules.closeTime);
  while (close <= open) close += 1440;
  return { open: jstAt(date, open), close: jstAt(date, close) };
}

export function detectAnomalies(s: SessionLike, ctx: DetectContext): Anomaly[] {
  const { rules, now } = ctx;
  const out: Anomaly[] = [];
  const add = (code: AnomalyCode, detail: string) => out.push({ code, label: ANOMALY_LABELS[code], detail });
  const sum = summarize(s);

  // 打刻の欠け
  if (!s.clockIn && s.clockOut) {
    add("MISSING_CLOCK_IN", "退勤打刻だけがあります。出勤時刻を入力してください。");
  }
  if (s.clockIn && !s.clockOut && diffMinutes(s.clockIn, now) > rules.missingClockOutHours * 60) {
    add("MISSING_CLOCK_OUT", `出勤から${rules.missingClockOutHours}時間以上、退勤打刻がありません。`);
  }
  if (!s.clockIn && !s.clockOut) {
    add("TIME_INCONSISTENT", "出勤・退勤とも記録がありません。");
  }

  // 時刻の矛盾（日跨ぎ計算の異常を含む）
  const problems: string[] = [];
  if (s.clockIn && s.clockOut && s.clockOut.getTime() <= s.clockIn.getTime()) {
    problems.push("退勤が出勤より前（または同時刻）です");
  }
  if (s.clockIn && businessDateOf(s.clockIn, rules.dayChangeHour) !== s.businessDate) {
    problems.push("勤務日と出勤時刻の日付が一致しません");
  }
  if (!s.clockIn && s.clockOut && businessDateOf(s.clockOut, rules.dayChangeHour) !== s.businessDate) {
    problems.push("勤務日と退勤時刻の日付が一致しません");
  }
  const sorted = [...s.breaks].sort((a, b) => a.start.getTime() - b.start.getTime());
  sorted.forEach((b, i) => {
    if (b.end && b.end.getTime() < b.start.getTime()) problems.push("休憩の終了が開始より前です");
    if (s.clockIn && b.start.getTime() < s.clockIn.getTime()) problems.push("休憩が出勤より前に始まっています");
    if (s.clockOut && (b.end ?? b.start).getTime() > s.clockOut.getTime()) problems.push("休憩が退勤より後まで続いています");
    const prev = sorted[i - 1];
    if (prev && prev.end && b.start.getTime() < prev.end.getTime()) problems.push("休憩が重複しています");
  });
  if (sum.workMinutes !== null && sum.workMinutes < 0) problems.push("実働時間がマイナスです");
  if (problems.length) add("TIME_INCONSISTENT", [...new Set(problems)].join("。") + "。");

  // 休憩の打刻漏れ
  if (s.clockOut && s.breaks.some((b) => !b.end)) {
    add("BREAK_NOT_ENDED", "終了時刻のない休憩があります。");
  }
  if (s.clockOut && s.breaks.some((b) => b.end && b.end.getTime() === s.clockOut!.getTime())) {
    add("BREAK_AUTO_ENDED", "休憩中のまま退勤したため、退勤時刻で休憩を終了しました。休憩時間を確認してください。");
  }

  // 長さ
  if (sum.spanMinutes !== null && sum.spanMinutes > 0) {
    if (sum.spanMinutes > rules.longWorkMinutes) {
      add("LONG_WORK", `拘束時間 ${formatDurationJa(sum.spanMinutes)}（基準 ${formatDurationJa(rules.longWorkMinutes)}）`);
    }
    if (sum.spanMinutes < rules.shortWorkMinutes) {
      add("SHORT_WORK", `拘束時間 ${formatDurationJa(sum.spanMinutes)}。誤打刻の可能性があります。`);
    }
  }

  // 営業時間外
  const hours = businessHours(s.businessDate, rules);
  const margin = rules.outOfHoursMarginMinutes;
  const outside: string[] = [];
  if (s.clockIn && diffMinutes(s.clockIn, hours.open) > margin) outside.push("開店より大幅に早い出勤");
  if (s.clockOut && diffMinutes(hours.close, s.clockOut) > margin) outside.push("閉店より大幅に遅い退勤");
  if (outside.length) add("OUT_OF_HOURS", outside.join("、") + `（営業時間 ${rules.openTime}〜${rules.closeTime}）`);

  // 休憩不足
  if (sum.workMinutes !== null && sum.workMinutes > 0) {
    const holidayHit =
      ctx.isHoliday &&
      sum.workMinutes >= rules.holidayBreakWorkMinutes &&
      sum.breakMinutes < rules.holidayBreakRequiredMinutes;
    if (holidayHit) {
      add(
        "HOLIDAY_BREAK",
        `休日勤務 実働${formatDurationJa(sum.workMinutes)}・休憩${formatDurationJa(sum.breakMinutes)}（休日に実働${formatDurationJa(rules.holidayBreakWorkMinutes)}以上の場合は休憩${formatDurationJa(rules.holidayBreakRequiredMinutes)}以上）`,
      );
    } else if (rules.legalBreakCheckEnabled) {
      const required = sum.workMinutes > 480 ? 60 : sum.workMinutes > 360 ? 45 : 0;
      if (sum.breakMinutes < required) {
        add(
          "BREAK_SHORT_LEGAL",
          `実働${formatDurationJa(sum.workMinutes)}に対し休憩${formatDurationJa(sum.breakMinutes)}（目安 ${required}分以上）`,
        );
      }
    }
  }

  return out;
}
