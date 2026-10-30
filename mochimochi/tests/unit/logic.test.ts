import { describe, expect, it } from "vitest";
import { evalChinchiro, judgeChinchiro, judgeJanken, rollChinchiro } from "@/lib/games";
import { distanceMeters } from "@/lib/geo";
import { addMonths, businessDate, isValidDate } from "@/lib/time";
import { seq } from "../helpers";

describe("営業日", () => {
  it("切替時刻より前は前日扱い（JST）", () => {
    expect(businessDate(new Date("2026-10-30T20:59:00Z"), 6)).toBe("2026-10-30"); // JST 10/31 05:59
    expect(businessDate(new Date("2026-10-30T21:00:00Z"), 6)).toBe("2026-10-31"); // JST 10/31 06:00
    expect(businessDate(new Date("2026-10-30T15:00:00Z"), 0)).toBe("2026-10-31"); // JST 10/31 00:00
  });
  it("月の計算・日付チェック", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-02-28")).toBe(true);
  });
});

describe("じゃんけん", () => {
  it("勝ち負けあいこ", () => {
    expect(judgeJanken("rock", "scissors")).toBe("win");
    expect(judgeJanken("rock", "paper")).toBe("lose");
    expect(judgeJanken("paper", "paper")).toBe("draw");
  });
});

describe("チンチロ", () => {
  it("役の強さ", () => {
    const pin = evalChinchiro([1, 1, 1]);
    const zoro6 = evalChinchiro([6, 6, 6]);
    const shigoro = evalChinchiro([6, 4, 5]);
    const me6 = evalChinchiro([3, 3, 6]);
    const me1 = evalChinchiro([1, 5, 5]);
    const menashi = evalChinchiro([1, 3, 5]);
    const hifumi = evalChinchiro([3, 1, 2]);
    const order = [pin, zoro6, shigoro, me6, me1, menashi, hifumi];
    for (let i = 0; i < order.length - 1; i++) expect(order[i].score).toBeGreaterThan(order[i + 1].score);
    expect(me6.name).toBe("6の目");
    expect(me1.name).toBe("1の目");
    expect([pin.big, zoro6.big, shigoro.big, me6.big]).toEqual([true, true, true, false]);
    expect(judgeChinchiro(me6, evalChinchiro([6, 2, 2]))).toBe("draw");
  });
  it("目なしは3回まで振り直す", () => {
    // 1回目 1,3,5（目なし）→ 2回目 2,2,4（4の目）で止まる。rng は 0〜1 → 出目 floor(x*6)+1
    const d = (n: number) => (n - 1) / 6 + 0.01;
    const r = rollChinchiro(seq(d(1), d(3), d(5), d(2), d(2), d(4)));
    expect(r.rolls).toEqual([
      [1, 3, 5],
      [2, 2, 4],
    ]);
    expect(r.hand.name).toBe("4の目");
    const none = rollChinchiro(seq(d(1), d(3), d(5)));
    expect(none.rolls).toHaveLength(3);
    expect(none.hand.name).toBe("目なし");
  });
});

it("距離", () => {
  // 東京駅〜有楽町駅 約 0.7km
  const m = distanceMeters(35.6812, 139.7671, 35.6751, 139.763);
  expect(m).toBeGreaterThan(600);
  expect(m).toBeLessThan(900);
});

describe("LINE（LIFF）から開いたときの行き先", () => {
  it("liff.state の行き先へ。外部サイトには飛ばさない", async () => {
    const { liffStateTarget } = await import("@/lib/paths");
    expect(liffStateTarget("/checkin?c=abc123")).toBe("/checkin?c=abc123");
    expect(liffStateTarget(undefined)).toBe("/me");
    expect(liffStateTarget("//evil.example.com/x")).toBe("/me");
    expect(liffStateTarget("https://evil.example.com")).toBe("/me");
    expect(liffStateTarget("/\\evil.example.com")).toBe("/me");
  });
});
