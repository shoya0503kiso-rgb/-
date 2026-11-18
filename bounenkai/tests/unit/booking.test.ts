import { describe, expect, it } from "vitest";
import { daySlots, isBookableDate, maxExtension, quote, tierFor } from "@/lib/booking";

const h = (hh: number, mm = 0) => hh * 60 + mm;

describe("料金", () => {
  it("仕様書の計算例", () => {
    expect(quote({ plan: "basic", people: 10, extensionHours: 0, hors: false })?.total).toBe(40000);
    expect(quote({ plan: "casino", people: 20, extensionHours: 1, hors: true })?.total).toBe(180000);
  });
  it("人数の段階", () => {
    expect(tierFor(14)?.price.basic).toBe(4000);
    expect(tierFor(15)?.price.basic).toBe(3800);
    expect(tierFor(19)?.price.casino).toBe(5300);
    expect(tierFor(20)?.price.casino).toBe(5000);
    expect(tierFor(7)).toBeNull();
    expect(tierFor(31)).toBeNull();
  });
  it("当日の人数で計算し直す（20名予約→15名）", () => {
    expect(quote({ plan: "basic", people: 15, extensionHours: 0, hors: false })?.total).toBe(15 * 3800);
  });
  it("延長は人数割引なし", () => {
    expect(quote({ plan: "basic", people: 25, extensionHours: 2, hors: false })?.extension).toBe(25 * 2500 * 2);
  });
  it("範囲外は null", () => {
    expect(quote({ plan: "basic", people: 5, extensionHours: 0, hors: false })).toBeNull();
  });
});

describe("延長の上限・枠", () => {
  it("閉店0:00まで", () => {
    expect(maxExtension(h(20), [])).toBe(2);
    expect(maxExtension(h(21), [])).toBe(1);
    expect(maxExtension(h(22), [])).toBe(0);
    expect(maxExtension(h(21, 30), [])).toBe(0);
    expect(maxExtension(h(17), [])).toBe(5);
  });
  it("前の組の終わり＋30分から", () => {
    const booked = [{ startMin: h(17), extensionHours: 0 }]; // 19:00終了
    expect(maxExtension(h(19), booked)).toBe(-1);
    expect(maxExtension(h(19, 30), booked)).toBe(2);
  });
  it("後ろの組のスタート30分前までに終わる", () => {
    const booked = [{ startMin: h(21), extensionHours: 0 }];
    expect(maxExtension(h(17), booked)).toBe(1); // 17:00〜20:30まで → 延長1時間（20:00終了）
    expect(maxExtension(h(18, 30), booked)).toBe(0); // 20:30終了
    expect(maxExtension(h(19), booked)).toBe(-1); // 21:00終了は間に合わない
  });
  it("1日2組まで", () => {
    const booked = [
      { startMin: h(17), extensionHours: 0 },
      { startMin: h(21), extensionHours: 0 },
    ];
    expect(daySlots(booked, 30).every((s) => !s.available)).toBe(true);
  });
  it("前の組の延長も考える", () => {
    const booked = [{ startMin: h(17), extensionHours: 2 }]; // 21:00終了
    expect(maxExtension(h(21), booked)).toBe(-1);
    expect(maxExtension(h(21, 30), booked)).toBe(0);
  });
});

describe("受付日", () => {
  const now = new Date("2026-11-18T03:00:00Z"); // JST 11/18 12:00
  it("2日後以降の11・12月", () => {
    expect(isBookableDate("2026-11-19", now)).toBe(false);
    expect(isBookableDate("2026-11-20", now)).toBe(true);
    expect(isBookableDate("2026-12-31", now)).toBe(true);
    expect(isBookableDate("2027-01-05", now)).toBe(false);
    expect(isBookableDate("2026-11-31", now)).toBe(false);
  });
  it("JSTの日付で判定（UTCでは前日の夜）", () => {
    const late = new Date("2026-11-18T16:00:00Z"); // JST 11/19 1:00
    expect(isBookableDate("2026-11-20", late)).toBe(false);
    expect(isBookableDate("2026-11-21", late)).toBe(true);
  });
});
