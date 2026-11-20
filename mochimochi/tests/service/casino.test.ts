import { beforeEach, describe, expect, it } from "vitest";
import { adjustPoints } from "@/server/admin-ops";
import { buyLottery, lotteryView, settleLottery, spinSlot, winningNumber } from "@/server/casino";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { buildReels, lotteryRank, pickOutcome, SLOT_RETURN_RATE, SLOT_SYMBOLS, slotMultiplier } from "@/lib/slot";
import { jst, makeMember, resetDb, seq } from "../helpers";

const NIGHT = jst("2026-11-20 22:00"); // 営業日 2026-11-20
const NEXT = jst("2026-11-21 21:00"); // 営業日 2026-11-21

async function balance(id: string) {
  const m = await prisma.member.findUniqueOrThrow({ where: { id } });
  const sum = await prisma.pointTransaction.aggregate({ where: { memberId: id }, _sum: { amount: true } });
  expect(sum._sum.amount ?? 0).toBe(m.points);
  return m.points;
}

beforeEach(async () => {
  await resetDb();
  await getSettings();
});

describe("スロットの当たり方", () => {
  it("払い出しの期待値は 1 未満（ポイントが増え続けない）", () => {
    expect(SLOT_RETURN_RATE).toBeGreaterThan(0.8);
    expect(SLOT_RETURN_RATE).toBeLessThan(1);
  });
  it("確率表どおりに結果を選ぶ", () => {
    expect(pickOutcome(() => 0)).toBe("trump");
    expect(pickOutcome(() => 0.0021)).toBe("two");
    expect(pickOutcome(() => 0.99)).toBe("miss");
  });
  it("リールの絵柄は結果と食い違わない", () => {
    let r = 0;
    const rng = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 3000; i++) {
      const miss = buildReels("miss", rng);
      expect(miss[0]).not.toBe("cherry");
      expect(miss[0] === miss[1] && miss[1] === miss[2]).toBe(false);
      const ch = buildReels("cherry", rng);
      expect(ch[0]).toBe("cherry");
      expect(ch[1] === ch[2] && ch[1] === "cherry").toBe(false);
      for (const s of SLOT_SYMBOLS) if (s !== "cherry") expect(buildReels(s, rng)).toEqual([s, s, s]);
    }
    expect(slotMultiplier("miss")).toBe(0);
  });
});

describe("スロット", () => {
  it("1回ごとに値段を引き、当たれば払い出す", async () => {
    const m = await makeMember();
    await adjustPoints(m.id, 100, "テスト", "admin", NIGHT);
    const hit = await spinSlot(m.id, NIGHT, () => 0); // トランプちゃん揃い
    expect(hit).toMatchObject({ outcome: "trump", reels: ["trump", "trump", "trump"], payout: 500 });
    const miss = await spinSlot(m.id, NIGHT, seq(0.99, 0.5, 0.5, 0.5));
    expect(miss.payout).toBe(0);
    expect(await balance(m.id)).toBe(100 - 10 + 500 - 10);
  });

  it("ポイントが足りない・1日の上限・お休み中は回せない", async () => {
    const m = await makeMember();
    await expect(spinSlot(m.id, NIGHT)).rejects.toThrow("ポイントが足りません");
    await adjustPoints(m.id, 1000, "テスト", "admin", NIGHT);
    await prisma.storeSetting.update({ where: { id: 1 }, data: { slotDailyLimit: 2 } });
    await spinSlot(m.id, NIGHT, seq(0.99));
    await spinSlot(m.id, NIGHT, seq(0.99));
    await expect(spinSlot(m.id, NIGHT, seq(0.99))).rejects.toThrow("今日はもう2回");
    await expect(spinSlot(m.id, NEXT, seq(0.99))).resolves.toMatchObject({ spinsToday: 1 });
    await prisma.storeSetting.update({ where: { id: 1 }, data: { slotEnabled: false } });
    await expect(spinSlot(m.id, NEXT)).rejects.toThrow("お休み");
    expect(await prisma.slotSpin.count()).toBe(3);
    expect(await balance(m.id)).toBe(1000 - 30);
  });
});

describe("宝くじ", () => {
  it("等の判定は下の桁から", () => {
    expect(lotteryRank("1234", "1234")).toBe(1);
    expect(lotteryRank("9234", "1234")).toBe(2);
    expect(lotteryRank("9934", "1234")).toBe(3);
    expect(lotteryRank("9994", "1234")).toBe(4);
    expect(lotteryRank("1239", "1234")).toBe(0);
  });

  it("買う → 抽選日が終わるまで判定しない → 翌日に当たりを1回だけ払う", async () => {
    const m = await makeMember();
    await adjustPoints(m.id, 100, "テスト", "admin", NIGHT);
    const win = winningNumber("2026-11-20");
    expect(win).toMatch(/^\d{4}$/);
    // 1枚目を1等の番号、2枚目を外れの番号にする
    const toRng = (num: string) => () => Number(num) / 10000 + 0.00001;
    const lose = String((Number(win[3]) + 1) % 10);
    await buyLottery(m.id, 1, NIGHT, toRng(win));
    await buyLottery(m.id, 1, NIGHT, toRng(`000${lose}`));
    expect(await settleLottery(m.id, NIGHT)).toEqual({ settled: 0, won: 0 });
    const r = await settleLottery(m.id, NEXT);
    expect(r.won).toBe(10000);
    expect(await settleLottery(m.id, NEXT)).toEqual({ settled: 0, won: 0 });
    expect(await balance(m.id)).toBe(100 - 20 + 10000);
    const view = await lotteryView(m.id, NEXT);
    expect(view.draws[0]).toMatchObject({ date: "2026-11-20", winning: win });
    expect(view.draws[0].tickets.map((t) => t.rank).sort()).toEqual([0, 1]);
  });

  it("1日の枚数・ポイント不足", async () => {
    const m = await makeMember();
    await expect(buyLottery(m.id, 1, NIGHT)).rejects.toThrow("ポイントが足りません");
    await adjustPoints(m.id, 1000, "テスト", "admin", NIGHT);
    await buyLottery(m.id, 8, NIGHT);
    await expect(buyLottery(m.id, 3, NIGHT)).rejects.toThrow("あと2枚");
    await buyLottery(m.id, 2, NIGHT);
    await expect(buyLottery(m.id, 1, NIGHT)).rejects.toThrow("もう買えません");
    await expect(buyLottery(m.id, 1, NEXT)).resolves.toHaveLength(1);
  });
});
