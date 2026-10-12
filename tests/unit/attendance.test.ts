import { describe, expect, it } from "vitest";
import { summarize, totalsOf } from "@/lib/attendance/calc";
import { detectAnomalies, isStaleOpen, type AnomalyRules } from "@/lib/attendance/anomalies";
import { isHoliday, parseWeekdays } from "@/lib/calendar";
import { businessDateOf, formatTime, jstAt, parseJstLocal, shiftRangeOnBusinessDate, toJstLocal } from "@/lib/time";

const rules: AnomalyRules = {
  dayChangeHour: 6,
  openTime: "15:00",
  closeTime: "05:00",
  longWorkMinutes: 720,
  outOfHoursMarginMinutes: 120,
  missingClockOutHours: 16,
  shortWorkMinutes: 10,
  legalBreakCheckEnabled: true,
  holidayBreakWorkMinutes: 420,
  holidayBreakRequiredMinutes: 60,
};

/** "2026-10-12 20:00" のような JST 表記 → Date */
const t = (s: string) => parseJstLocal(s.replace(" ", "T"))!;
const now = t("2026-10-20 12:00");

function codes(session: Parameters<typeof detectAnomalies>[0], isHoliday = false) {
  return detectAnomalies(session, { rules, isHoliday, now }).map((a) => a.code);
}

describe("時刻ユーティリティ", () => {
  it("日付切替 06:00 で営業日を判定する（日跨ぎ）", () => {
    expect(businessDateOf(t("2026-10-12 20:00"), 6)).toBe("2026-10-12");
    expect(businessDateOf(t("2026-10-13 03:00"), 6)).toBe("2026-10-12");
    expect(businessDateOf(t("2026-10-13 05:59"), 6)).toBe("2026-10-12");
    expect(businessDateOf(t("2026-10-13 06:00"), 6)).toBe("2026-10-13");
  });

  it("JST の入力値と相互変換できる", () => {
    const d = jstAt("2026-10-12", 20 * 60 + 5);
    expect(toJstLocal(d)).toBe("2026-10-12T20:05");
    expect(parseJstLocal("2026-10-12T20:05")!.getTime()).toBe(d.getTime());
  });

  it("深夜開始のシフトは営業日の翌暦日として扱う", () => {
    expect(toJstLocal(shiftRangeOnBusinessDate("2026-10-12", "01:00", "05:00", 6).start)).toBe("2026-10-13T01:00");
    expect(toJstLocal(shiftRangeOnBusinessDate("2026-10-12", "20:00", "05:00", 6).end)).toBe("2026-10-13T05:00");
  });

  it("翌日の時刻は「翌」を付けて表示する", () => {
    expect(formatTime(t("2026-10-13 03:00"), "2026-10-12")).toBe("翌03:00");
    expect(formatTime(t("2026-10-12 20:00"), "2026-10-12")).toBe("20:00");
  });
});

describe("勤務時間の計算", () => {
  it("日跨ぎ・複数休憩の実働を計算する", () => {
    const s = summarize({
      businessDate: "2026-10-12",
      clockIn: t("2026-10-12 20:00"),
      clockOut: t("2026-10-13 05:00"),
      breaks: [
        { start: t("2026-10-12 23:00"), end: t("2026-10-12 23:30") },
        { start: t("2026-10-13 02:00"), end: t("2026-10-13 02:30") },
      ],
    });
    expect(s.spanMinutes).toBe(540);
    expect(s.breakMinutes).toBe(60);
    expect(s.workMinutes).toBe(480);
  });

  it("月合計：勤務日数は営業日単位、欠けた勤怠は実働に含めない", () => {
    const totals = totalsOf([
      { businessDate: "2026-10-01", clockIn: t("2026-10-01 18:00"), clockOut: t("2026-10-01 23:00"), breaks: [] },
      { businessDate: "2026-10-01", clockIn: t("2026-10-02 00:00"), clockOut: t("2026-10-02 02:00"), breaks: [] },
      { businessDate: "2026-10-02", clockIn: t("2026-10-02 18:00"), clockOut: null, breaks: [] },
    ]);
    expect(totals.workDays).toBe(2);
    expect(totals.workMinutes).toBe(420);
    expect(totals.incompleteCount).toBe(1);
  });
});

describe("休日判定", () => {
  const rule = { holidayWeekdays: parseWeekdays("0,6"), includePublic: true };
  it("土日祝を休日とする", () => {
    expect(isHoliday("2026-10-10", rule)).toBe(true); // 土
    expect(isHoliday("2026-10-12", rule)).toBe(true); // スポーツの日
    expect(isHoliday("2026-10-13", rule)).toBe(false); // 火
  });
  it("個別指定が優先される", () => {
    expect(isHoliday("2026-10-13", rule, { isClosed: false, isHoliday: true })).toBe(true);
    expect(isHoliday("2026-10-10", rule, { isClosed: false, isHoliday: false })).toBe(false);
  });
});

describe("勤怠異常チェック", () => {
  it("正常な勤務は異常なし", () => {
    expect(
      codes({
        businessDate: "2026-10-13",
        clockIn: t("2026-10-13 18:00"),
        clockOut: t("2026-10-14 02:00"),
        breaks: [{ start: t("2026-10-13 22:00"), end: t("2026-10-13 23:00") }],
      }),
    ).toEqual([]);
  });

  it("要件例：休日 10/12 勤務7時間35分・休憩0分 → 休憩時間を確認", () => {
    const s = {
      businessDate: "2026-10-12",
      clockIn: t("2026-10-12 16:00"),
      clockOut: t("2026-10-12 23:35"),
      breaks: [],
    };
    const result = detectAnomalies(s, { rules, isHoliday: true, now });
    expect(result.map((a) => a.code)).toEqual(["HOLIDAY_BREAK"]);
    expect(result[0].label).toContain("休憩時間を確認してください");
  });

  it("平日は休日ルールの対象外（一般の休憩基準のみ）", () => {
    const s = { businessDate: "2026-10-13", clockIn: t("2026-10-13 16:00"), clockOut: t("2026-10-13 23:35"), breaks: [] };
    expect(codes(s, false)).toEqual(["BREAK_SHORT_LEGAL"]);
  });

  it("休日でも休憩60分以上 or 実働7時間未満なら対象外", () => {
    const base = { businessDate: "2026-10-12", clockIn: t("2026-10-12 16:00") };
    expect(
      codes({ ...base, clockOut: t("2026-10-13 00:35"), breaks: [{ start: t("2026-10-12 20:00"), end: t("2026-10-12 21:00") }] }, true),
    ).toEqual([]);
    expect(codes({ ...base, clockOut: t("2026-10-12 22:00"), breaks: [{ start: t("2026-10-12 19:00"), end: t("2026-10-12 19:45") }] }, true)).toEqual([]);
  });

  it("一般の休憩基準：法定は「超」で判定（6時間ちょうどは対象外）", () => {
    const base = { businessDate: "2026-10-13", clockIn: t("2026-10-13 17:00"), breaks: [] };
    expect(codes({ ...base, clockOut: t("2026-10-13 23:00") })).toEqual([]);
    expect(codes({ ...base, clockOut: t("2026-10-13 23:01") })).toEqual(["BREAK_SHORT_LEGAL"]);
  });

  it("退勤打刻なし：閉店＋2時間（翌07:00）までは勤務中、過ぎたら要確認", () => {
    const s = { businessDate: "2026-10-19", clockIn: t("2026-10-19 18:00"), clockOut: null, breaks: [] };
    expect(detectAnomalies(s, { rules, isHoliday: false, now: t("2026-10-20 06:59") })).toEqual([]);
    expect(detectAnomalies(s, { rules, isHoliday: false, now: t("2026-10-20 07:01") }).map((a) => a.code)).toEqual([
      "MISSING_CLOCK_OUT",
    ]);
  });

  it("勤務中の古さ判定：長時間勤務は閉店後まで、前日の打ち忘れは翌日には古い", () => {
    const r = { ...rules };
    expect(isStaleOpen({ businessDate: "2026-10-13", clockIn: t("2026-10-13 13:00") }, r, t("2026-10-14 06:30"))).toBe(false);
    expect(isStaleOpen({ businessDate: "2026-10-12", clockIn: t("2026-10-12 22:00") }, r, t("2026-10-13 13:30"))).toBe(true);
  });

  it("退勤だけ存在する", () => {
    expect(codes({ businessDate: "2026-10-12", clockIn: null, clockOut: t("2026-10-13 02:00"), breaks: [] })).toEqual([
      "MISSING_CLOCK_IN",
    ]);
  });

  it("勤務時間が長すぎる", () => {
    const s = {
      businessDate: "2026-10-13",
      clockIn: t("2026-10-13 15:00"),
      clockOut: t("2026-10-14 04:00"),
      breaks: [{ start: t("2026-10-13 20:00"), end: t("2026-10-13 21:00") }],
    };
    expect(codes(s)).toEqual(["LONG_WORK"]);
  });

  it("営業時間と大きく外れた打刻", () => {
    const s = { businessDate: "2026-10-13", clockIn: t("2026-10-13 10:00"), clockOut: t("2026-10-13 14:00"), breaks: [] };
    expect(codes(s)).toEqual(["OUT_OF_HOURS"]);
  });

  it("日跨ぎの計算異常（退勤が出勤より前・日付の不一致）", () => {
    // 管理者が翌日の日付を付け忘れたケース
    expect(codes({ businessDate: "2026-10-13", clockIn: t("2026-10-13 20:00"), clockOut: t("2026-10-13 03:00"), breaks: [] })).toContain(
      "TIME_INCONSISTENT",
    );
    expect(codes({ businessDate: "2026-10-11", clockIn: t("2026-10-13 20:00"), clockOut: t("2026-10-14 03:00"), breaks: [] })).toContain(
      "TIME_INCONSISTENT",
    );
    // 日付切替時刻の設定変更による1日のずれは許容
    expect(codes({ businessDate: "2026-10-12", clockIn: t("2026-10-13 05:30"), clockOut: t("2026-10-13 06:00"), breaks: [] })).not.toContain(
      "TIME_INCONSISTENT",
    );
  });

  it("休憩中のまま退勤・休憩が退勤後まで続く", () => {
    const out = t("2026-10-13 23:00");
    expect(
      codes({ businessDate: "2026-10-13", clockIn: t("2026-10-13 18:00"), clockOut: out, breaks: [{ start: t("2026-10-13 22:30"), end: out, autoEnded: true }] }),
    ).toEqual(["BREAK_AUTO_ENDED"]);
    // 休憩終了と退勤が同じ分でも、自動終了でなければ誤検知しない
    expect(
      codes({ businessDate: "2026-10-13", clockIn: t("2026-10-13 18:00"), clockOut: out, breaks: [{ start: t("2026-10-13 22:30"), end: out }] }),
    ).toEqual([]);
    expect(
      codes({
        businessDate: "2026-10-13",
        clockIn: t("2026-10-13 18:00"),
        clockOut: out,
        breaks: [{ start: t("2026-10-13 22:30"), end: t("2026-10-13 23:30") }],
      }),
    ).toContain("TIME_INCONSISTENT");
  });

  it("短すぎる勤務（誤打刻）", () => {
    expect(codes({ businessDate: "2026-10-13", clockIn: t("2026-10-13 18:00"), clockOut: t("2026-10-13 18:03"), breaks: [] })).toEqual([
      "SHORT_WORK",
    ]);
  });
});
