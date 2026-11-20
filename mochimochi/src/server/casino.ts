import "server-only";
import { createHmac } from "node:crypto";
import type { Rng } from "@/lib/games";
import { buildReels, lotteryRank, pickOutcome, randomTicketNumber, slotMultiplier, type SlotSymbol } from "@/lib/slot";
import { businessDate } from "@/lib/time";
import { prisma } from "./db";
import { UserError } from "./errors";
import { secureRng } from "./games";
import { changePoints } from "./points";
import { getSettings } from "./settings";

// スロットと宝くじ（どちらもポイントで遊ぶ。結果はすべてサーバーで決める）

// ───── スロット ─────

export async function slotStatus(memberId: string, now = new Date()) {
  const s = await getSettings();
  const date = businessDate(now, s.dayChangeHour);
  const [member, spins, last] = await Promise.all([
    prisma.member.findUniqueOrThrow({ where: { id: memberId } }),
    prisma.slotSpin.count({ where: { memberId, businessDate: date } }),
    prisma.slotSpin.findFirst({ where: { memberId }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    enabled: s.slotEnabled,
    cost: s.slotCost,
    limit: s.slotDailyLimit,
    spinsToday: spins,
    points: member.points,
    lastReels: (last?.reels.split(",") ?? ["trump", "two", "bar"]) as SlotSymbol[],
  };
}

export async function spinSlot(memberId: string, now = new Date(), rng: Rng = secureRng) {
  const s = await getSettings();
  if (!s.slotEnabled) throw new UserError("スロットはいまお休み中です");
  const date = businessDate(now, s.dayChangeHour);
  const outcome = pickOutcome(rng);
  const reels = buildReels(outcome, rng);
  const payout = s.slotCost * slotMultiplier(outcome);
  await prisma.$transaction(async (tx) => {
    const spins = await tx.slotSpin.count({ where: { memberId, businessDate: date } });
    if (spins >= s.slotDailyLimit) throw new UserError(`今日はもう${s.slotDailyLimit}回まわしました。また明日！`);
    await changePoints(tx, { memberId, amount: -s.slotCost, kind: "slot", businessDate: date }).catch((e) => {
      throw e instanceof UserError ? new UserError(`ポイントが足りません（1回 ${s.slotCost}pt）`) : e;
    });
    await tx.slotSpin.create({ data: { memberId, businessDate: date, cost: s.slotCost, outcome, reels: reels.join(","), payout } });
    await changePoints(tx, { memberId, amount: payout, kind: "slot_win", note: outcome, businessDate: date });
  });
  const st = await slotStatus(memberId, now);
  return { reels, outcome, payout, points: st.points, spinsToday: st.spinsToday, limit: st.limit };
}

// ───── 宝くじ ─────

/** その抽選日の当選番号（4桁）。抽選日が終わるまでは使わない */
export function winningNumber(drawDate: string) {
  const mac = createHmac("sha256", process.env.SESSION_SECRET ?? "").update(`lottery:${drawDate}`).digest();
  return String(mac.readUInt32BE(0) % 10000).padStart(4, "0");
}

export async function buyLottery(memberId: string, count: number, now = new Date(), rng: Rng = secureRng) {
  const s = await getSettings();
  if (!s.lotteryEnabled) throw new UserError("宝くじはいまお休み中です");
  const n = Math.floor(Number(count));
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new UserError("枚数を選んでください");
  const date = businessDate(now, s.dayChangeHour);
  return prisma.$transaction(async (tx) => {
    const have = await tx.lotteryTicket.count({ where: { memberId, drawDate: date } });
    if (have + n > s.lotteryMaxTickets) {
      throw new UserError(have >= s.lotteryMaxTickets ? `今日の宝くじは${s.lotteryMaxTickets}枚まで。もう買えません` : `今日はあと${s.lotteryMaxTickets - have}枚まで買えます`);
    }
    await changePoints(tx, { memberId, amount: -s.lotteryPrice * n, kind: "lottery", note: `${n}枚`, businessDate: date }).catch((e) => {
      throw e instanceof UserError ? new UserError(`ポイントが足りません（1枚 ${s.lotteryPrice}pt）`) : e;
    });
    const tickets = [];
    for (let i = 0; i < n; i++) {
      tickets.push(await tx.lotteryTicket.create({ data: { memberId, drawDate: date, number: randomTicketNumber(rng), price: s.lotteryPrice } }));
    }
    return tickets.map((t) => ({ id: t.id, number: t.number }));
  });
}

export function prizeFor(rank: number, s: { lotteryPrize1: number; lotteryPrize2: number; lotteryPrize3: number; lotteryPrize4: number }) {
  return [0, s.lotteryPrize1, s.lotteryPrize2, s.lotteryPrize3, s.lotteryPrize4][rank] ?? 0;
}

/**
 * 抽選が終わった券を判定して、当たりのポイントを入れる（何度呼んでも二重には入らない）。
 * 画面を開いたときに呼ぶので、抽選のための定期実行はいらない
 */
export async function settleLottery(memberId: string, now = new Date()) {
  const s = await getSettings();
  const today = businessDate(now, s.dayChangeHour);
  const open = await prisma.lotteryTicket.findMany({ where: { memberId, settledAt: null, drawDate: { lt: today } } });
  let won = 0;
  for (const t of open) {
    const rank = lotteryRank(t.number, winningNumber(t.drawDate));
    const prize = prizeFor(rank, s);
    await prisma.$transaction(async (tx) => {
      const r = await tx.lotteryTicket.updateMany({ where: { id: t.id, settledAt: null }, data: { settledAt: now, rank, prize } });
      if (r.count === 1 && prize > 0) {
        await changePoints(tx, { memberId, amount: prize, kind: "lottery_win", note: `${t.drawDate} ${rank}等 ${t.number}`, businessDate: today });
        won += prize;
      }
    });
  }
  return { settled: open.length, won };
}

export async function lotteryView(memberId: string, now = new Date()) {
  await settleLottery(memberId, now);
  const s = await getSettings();
  const today = businessDate(now, s.dayChangeHour);
  const [member, todays, past] = await Promise.all([
    prisma.member.findUniqueOrThrow({ where: { id: memberId } }),
    prisma.lotteryTicket.findMany({ where: { memberId, drawDate: today }, orderBy: { createdAt: "asc" } }),
    prisma.lotteryTicket.findMany({ where: { memberId, drawDate: { lt: today } }, orderBy: [{ drawDate: "desc" }, { createdAt: "asc" }], take: 100 }),
  ]);
  // 自分が買った抽選日ごとにまとめる（新しい順）
  const draws = new Map<string, { date: string; winning: string; tickets: { id: string; number: string; rank: number; prize: number }[] }>();
  for (const t of past) {
    if (!draws.has(t.drawDate)) draws.set(t.drawDate, { date: t.drawDate, winning: winningNumber(t.drawDate), tickets: [] });
    draws.get(t.drawDate)!.tickets.push({ id: t.id, number: t.number, rank: t.rank ?? 0, prize: t.prize });
  }
  return {
    enabled: s.lotteryEnabled,
    price: s.lotteryPrice,
    max: s.lotteryMaxTickets,
    prizes: [s.lotteryPrize1, s.lotteryPrize2, s.lotteryPrize3, s.lotteryPrize4],
    dayChangeHour: s.dayChangeHour,
    points: member.points,
    today,
    todayTickets: todays.map((t) => ({ id: t.id, number: t.number })),
    draws: [...draws.values()].slice(0, 7),
  };
}
