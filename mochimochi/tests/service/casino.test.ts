import { beforeEach, describe, expect, it } from "vitest";
import { adjustPoints } from "@/server/admin-ops";
import { announceAt, buyLottery, lotteryView, markPassUsed, passFor, passWinners, settleLottery, slotChanceResult, spinSlot, winningNumber } from "@/server/casino";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { buildReels, isTwoTwoTwo, lotteryRank, MAX_SLIP, pickOutcome, REEL_STRIPS, SLOT_SYMBOLS, slotReturnRate, STRIP_LEN } from "@/lib/slot";
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

const PAYS = { bar: 1, bell: 2, grape: 3, cherry: 5, chance: 50, skill: 100, cost: 3 };

describe("スロットの当たり方", () => {
  it("目押しが毎回成功しても、払い出しの期待値は 1 未満", () => {
    expect(slotReturnRate(PAYS, 1)).toBeLessThan(1);
    expect(slotReturnRate(PAYS, 0)).toBeGreaterThan(0.5);
  });
  it("確率表どおりに結果を選ぶ", () => {
    expect(pickOutcome(() => 0)).toBe("chance");
    expect(pickOutcome(() => 0.0084)).toBe("trump");
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
      for (const s of ["trump", "bar", "bell", "grape"] as const) expect(buildReels(s, rng)).toEqual([s, s, s]);
    }
  });
  it("リールの並びにはどの絵柄もあり、2 は1コマだけ", () => {
    for (const strip of REEL_STRIPS) {
      for (const s of SLOT_SYMBOLS) expect(strip).toContain(s);
      expect(strip.filter((s) => s === "two")).toHaveLength(1);
    }
    const twos = REEL_STRIPS.map((s) => s.indexOf("two"));
    expect(isTwoTwoTwo(twos)).toBe(true);
    expect(isTwoTwoTwo([twos[0], twos[1], (twos[2] + 1) % STRIP_LEN])).toBe(false);
    expect(isTwoTwoTwo([twos[0], twos[1]])).toBe(false);
  });
  it("ふだんの回は 2 に止めず、どこで押しても5コマ以内で止まる", () => {
    let r = 0;
    const rng = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 2000; i++) for (const o of ["miss", "cherry", "bell", "bar", "grape", "trump"] as const) expect(buildReels(o, rng)).not.toContain("two");
    for (const strip of REEL_STRIPS) {
      for (const target of SLOT_SYMBOLS.filter((x) => x !== "two")) {
        for (let base = 0; base < STRIP_LEN; base++) {
          let d = 0;
          while (strip[(base - d + STRIP_LEN * 2) % STRIP_LEN] !== target) d++;
          expect(d).toBeLessThanOrEqual(MAX_SLIP);
        }
      }
    }
  });
});

describe("スロット", () => {
  it("値段を引き、配当を払う。トランプちゃんそろいの次は無料", async () => {
    const m = await makeMember();
    await adjustPoints(m.id, 100, "テスト", "admin", NIGHT);
    const bell = await spinSlot(m.id, NIGHT, () => 0.0084 + 0.14 + 0.06 + 0.1 + 0.01); // ベル
    expect(bell).toMatchObject({ outcome: "bell", reels: ["bell", "bell", "bell"], payout: 2, free: false });
    const rep = await spinSlot(m.id, new Date(NIGHT.getTime() + 1000), () => 0.009); // トランプちゃん
    expect(rep).toMatchObject({ outcome: "trump", freeNext: true });
    const freeSpin = await spinSlot(m.id, new Date(NIGHT.getTime() + 2000), seq(0.99, 0.5, 0.5, 0.5));
    expect(freeSpin.free).toBe(true);
    expect(await balance(m.id)).toBe(100 - 3 + 2 - 3 + 0);
  });

  it("もちもちランプ：光った時点で50pt、222 目押し成功で +100pt（1回だけ）", async () => {
    const m = await makeMember();
    await adjustPoints(m.id, 100, "テスト", "admin", NIGHT);
    const c = await spinSlot(m.id, NIGHT, () => 0);
    expect(c).toMatchObject({ outcome: "chance", payout: 50 });
    const twos = REEL_STRIPS.map((s) => s.indexOf("two"));
    const ok = await slotChanceResult(m.id, c.spinId, twos, new Date(NIGHT.getTime() + 10_000));
    expect(ok).toMatchObject({ hit: true, bonus: 100 });
    await expect(slotChanceResult(m.id, c.spinId, twos, new Date(NIGHT.getTime() + 11_000))).rejects.toThrow("もう終わって");
    expect(await balance(m.id)).toBe(100 - 3 + 50 + 100);

    // 外したらボーナスなし。時間切れ・ほかの人の回・チャンスでない回は受け付けない
    const c2 = await spinSlot(m.id, NIGHT, () => 0);
    expect((await slotChanceResult(m.id, c2.spinId, [twos[0], twos[1], (twos[2] + 1) % STRIP_LEN], NIGHT)).bonus).toBe(0);
    const c3 = await spinSlot(m.id, NIGHT, () => 0);
    await expect(slotChanceResult(m.id, c3.spinId, twos, new Date(NIGHT.getTime() + 10 * 60_000))).rejects.toThrow("時間");
    const other = await makeMember("ほか");
    await expect(slotChanceResult(other.id, c3.spinId, twos, NIGHT)).rejects.toThrow("見つかりません");
    const normal = await spinSlot(m.id, NIGHT, seq(0.99, 0.5, 0.5, 0.5));
    await expect(slotChanceResult(m.id, normal.spinId, twos, NIGHT)).rejects.toThrow("見つかりません");
    await balance(m.id);
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
    expect(await balance(m.id)).toBe(1000 - 9);
  });
});

describe("宝くじ", () => {
  it("等の判定は下の桁から。4桁=VIP、下3桁=プラチナ", () => {
    expect(lotteryRank("1234", "1234")).toBe(1);
    expect(lotteryRank("9234", "1234")).toBe(2);
    expect(lotteryRank("9934", "1234")).toBe(3);
    expect(lotteryRank("1239", "1234")).toBe(0);
    expect([1, 2, 3, 4, 0].map(passFor)).toEqual(["VIP", "PLATINUM", null, null, null]);
  });

  it("発表は買った日の次の日の22時（JST）", () => {
    expect(announceAt("2026-11-20", 22).toISOString()).toBe("2026-11-21T13:00:00.000Z");
    expect(announceAt("2026-11-30", 22).toISOString()).toBe("2026-12-01T13:00:00.000Z");
  });

  it("選んだ番号で買う → 22時までは判定しない・番号も見せない → 22時を過ぎたらパス", async () => {
    const m = await makeMember();
    await adjustPoints(m.id, 100, "テスト", "admin", NIGHT);
    const win = winningNumber("2026-11-20");
    const plat = `${(Number(win[0]) + 1) % 10}${win.slice(1)}`;
    const miss = `${win.slice(0, 3)}${(Number(win[3]) + 1) % 10}`;
    await buyLottery(m.id, [win, plat], NIGHT);
    await buyLottery(m.id, [miss], NIGHT);
    const before = jst("2026-11-21 21:59");
    expect(await settleLottery(m.id, before)).toEqual({ settled: 0, passes: [] });
    const v1 = await lotteryView(m.id, jst("2026-11-21 20:00"));
    expect(v1.draws[0]).toMatchObject({ date: "2026-11-20", revealed: false, winning: null });
    expect(v1.draws[0].tickets.every((t) => t.rank === null && t.pass === null)).toBe(true);
    const after = jst("2026-11-21 22:00");
    const r = await settleLottery(m.id, after);
    expect(r.settled).toBe(3);
    expect(r.passes.sort()).toEqual(["PLATINUM", "VIP"]);
    expect(await settleLottery(m.id, after)).toEqual({ settled: 0, passes: [] });
    const v2 = await lotteryView(m.id, after);
    expect(v2.draws[0]).toMatchObject({ revealed: true, winning: win });
    expect(v2.passes.map((p) => p.pass).sort()).toEqual(["PLATINUM", "VIP"]);
    // パスにポイントは付かない（買った分だけ減る）
    expect(await balance(m.id)).toBe(100 - 30);
  });

  it("1日3枚まで・同じ番号は1枚まで・番号は4桁", async () => {
    const m = await makeMember();
    await expect(buyLottery(m.id, ["1234"], NIGHT)).rejects.toThrow("ポイントが足りません");
    await adjustPoints(m.id, 1000, "テスト", "admin", NIGHT);
    await expect(buyLottery(m.id, ["123"], NIGHT)).rejects.toThrow("4桁");
    await expect(buyLottery(m.id, ["12a4"], NIGHT)).rejects.toThrow("4桁");
    await expect(buyLottery(m.id, ["1111", "1111"], NIGHT)).rejects.toThrow("同じ番号");
    await buyLottery(m.id, ["1111"], NIGHT);
    await expect(buyLottery(m.id, ["1111"], NIGHT)).rejects.toThrow("もう買っています");
    await buyLottery(m.id, ["2222", "3333"], NIGHT);
    await expect(buyLottery(m.id, ["4444"], NIGHT)).rejects.toThrow("もう買えません");
    // 次の日はまた買える（同じ番号でもよい）
    await expect(buyLottery(m.id, ["1111"], NEXT)).resolves.toHaveLength(1);
    expect(await balance(m.id)).toBe(1000 - 40);
  });

  it("パスを使用済みにする（スタッフ）", async () => {
    const m = await makeMember();
    await adjustPoints(m.id, 100, "テスト", "admin", NIGHT);
    await buyLottery(m.id, [winningNumber("2026-11-20")], NIGHT);
    await settleLottery(m.id, jst("2026-11-21 23:00"));
    const [row] = await passWinners();
    expect(row).toMatchObject({ pass: "VIP", passUsedAt: null });
    await markPassUsed(row.id, "admin", true);
    expect((await lotteryView(m.id, jst("2026-11-21 23:00"))).passes).toHaveLength(0);
    await markPassUsed(row.id, "admin", false);
    expect((await passWinners())[0].passUsedAt).toBeNull();
  });
});
