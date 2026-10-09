import { describe, expect, it } from "vitest";
import { estimatePay, nightMinutes, workRanges } from "@/lib/payroll";
import { parseJstLocal } from "@/lib/time";

const t = (s: string) => parseJstLocal(s.replace(" ", "T"))!;

describe("給与目安", () => {
  it("深夜（22:00〜翌5:00）の実働だけ割増。休憩中は除く", () => {
    const s = {
      businessDate: "2026-10-12",
      clockIn: t("2026-10-12 20:00"),
      clockOut: t("2026-10-13 05:30"),
      breaks: [{ start: t("2026-10-13 00:00"), end: t("2026-10-13 01:00") }],
    };
    // 実働 8.5h、深夜 22:00〜05:00 の7hから休憩1hを引いて6h
    expect(nightMinutes(workRanges(s))).toBe(360);
    const pay = estimatePay([s], 1200);
    expect(pay).toMatchObject({ workMinutes: 510, nightMinutes: 360, overtimeMinutes: 30 });
    expect(pay.base).toBe(10200);
    expect(pay.nightPremium).toBe(1800);
    expect(pay.overtimePremium).toBe(150);
    expect(pay.total).toBe(12150);
  });

  it("早朝（0:00〜5:00）開始も深夜として数える", () => {
    const s = { businessDate: "2026-10-12", clockIn: t("2026-10-13 03:00"), clockOut: t("2026-10-13 07:00"), breaks: [] };
    expect(nightMinutes(workRanges(s))).toBe(120);
  });

  it("日中のみ・未完了の勤怠", () => {
    const pay = estimatePay(
      [
        { businessDate: "2026-10-12", clockIn: t("2026-10-12 15:00"), clockOut: t("2026-10-12 21:00"), breaks: [] },
        { businessDate: "2026-10-13", clockIn: t("2026-10-13 15:00"), clockOut: null, breaks: [] },
      ],
      1100,
    );
    expect(pay).toMatchObject({ workMinutes: 360, nightMinutes: 0, overtimeMinutes: 0, total: 6600, incompleteCount: 1 });
  });
});
