import { describe, expect, it } from "vitest";
import { IMG } from "@/lib/brand-images";
import { DEFAULT_RANKS } from "@/lib/defaults";
import { rankTheme } from "@/lib/rank-theme";
import { rankFor } from "@/server/settings";
import { distanceMeters } from "@/lib/geo";
import { addMonths, businessDate, isValidDate } from "@/lib/time";

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

describe("ランクとホームのカード", () => {
  const tiers = DEFAULT_RANKS;
  it("来店回数でランクが決まり、何番目か（level）でカードの見た目が決まる", () => {
    expect([0, 14, 15, 29, 30, 99, 100].map((v) => rankFor(v, tiers).current.name)).toEqual(["おこめ", "おこめ", "しらたま", "しらたま", "だいふく", "だいふく", "かがみもち"]);
    expect([0, 15, 30, 100].map((v) => rankFor(v, tiers).level)).toEqual([0, 1, 2, 3]);
    expect(rankFor(15, tiers)).toMatchObject({ toNext: 15, next: { name: "だいふく" } });
    expect([0, 1, 2, 3, 7].map((l) => rankTheme(l).img)).toEqual([...IMG.rankIcons, IMG.rankIcons[3]]);
  });
});
