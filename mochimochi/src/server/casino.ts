import "server-only";
import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Rng } from "@/lib/games";
import { buildReels, isTwoTwoTwo, lotteryRank, pickOutcome, slotPayout, type SlotPays } from "@/lib/slot";
import { businessDate } from "@/lib/time";
import { prisma } from "./db";
import { UserError } from "./errors";
import { secureRng } from "./games";
import { changePoints } from "./points";
import { getSettings } from "./settings";

// スロットと宝くじ（どちらもポイントで遊ぶ。結果はすべてサーバーで決める）

// ───── スロット ─────

/** 目押しチャンスの結果を受け付ける時間 */
const CHANCE_WINDOW_MS = 3 * 60_000;

export function slotPays(s: { slotPayBar: number; slotPayBell: number; slotPayGrape: number; slotPayCherry: number; slotChanceBonus: number; slotSkillBonus: number; slotCost: number }): SlotPays {
  return { bar: s.slotPayBar, bell: s.slotPayBell, grape: s.slotPayGrape, cherry: s.slotPayCherry, chance: s.slotChanceBonus, skill: s.slotSkillBonus, cost: s.slotCost };
}

export async function slotStatus(memberId: string, now = new Date()) {
  const s = await getSettings();
  const date = businessDate(now, s.dayChangeHour);
  const [member, spins, last] = await Promise.all([
    prisma.member.findUniqueOrThrow({ where: { id: memberId } }),
    prisma.slotSpin.count({ where: { memberId, businessDate: date } }),
    prisma.slotSpin.findFirst({ where: { memberId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
  ]);
  return {
    enabled: s.slotEnabled,
    cost: s.slotCost,
    limit: s.slotDailyLimit,
    spinsToday: spins,
    points: member.points,
    /** 前の回がとらんぷちゃん揃い＝次の1回は無料 */
    freeNext: last?.outcome === "trump",
    pays: slotPays(s),
  };
}

/** 1回まわす。結果はここで決まる（チャンスのときは目押しの結果をあとで slotChanceResult に送る） */
export async function spinSlot(memberId: string, now = new Date(), rng: Rng = secureRng) {
  const s = await getSettings();
  if (!s.slotEnabled) throw new UserError("スロットはいまお休み中です");
  const date = businessDate(now, s.dayChangeHour);
  const outcome = pickOutcome(rng);
  const reels = buildReels(outcome, rng);
  const payout = slotPayout(outcome, slotPays(s));
  const spin = await prisma.$transaction(async (tx) => {
    const spins = await tx.slotSpin.count({ where: { memberId, businessDate: date } });
    if (s.slotDailyLimit > 0 && spins >= s.slotDailyLimit) throw new UserError(`今日はもう${s.slotDailyLimit}回まわしました。また明日！`);
    const last = await tx.slotSpin.findFirst({ where: { memberId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    const free = last?.outcome === "trump";
    if (!free) {
      await changePoints(tx, { memberId, amount: -s.slotCost, kind: "slot", businessDate: date }).catch((e) => {
        throw e instanceof UserError ? new UserError(`ポイントが足りません（1回 ${s.slotCost}pt）`) : e;
      });
    }
    const created = await tx.slotSpin.create({
      data: { memberId, businessDate: date, cost: free ? 0 : s.slotCost, free, outcome, reels: reels.join(","), payout, createdAt: now },
    });
    await changePoints(tx, { memberId, amount: payout, kind: "slot_win", note: outcome === "chance" ? "もちもちランプ" : outcome, businessDate: date });
    return created;
  });
  const st = await slotStatus(memberId, now);
  return {
    spinId: spin.id,
    outcome,
    reels,
    payout,
    free: spin.free,
    freeNext: outcome === "trump",
    points: st.points,
    spinsToday: st.spinsToday,
    limit: st.limit,
  };
}

/** 目押しチャンスの結果。3つとも「2」で止めていたら追加ボーナス（1回のチャンスに1度だけ） */
export async function slotChanceResult(memberId: string, spinId: string, stops: number[], now = new Date()) {
  const s = await getSettings();
  const spin = await prisma.slotSpin.findUnique({ where: { id: spinId } });
  if (!spin || spin.memberId !== memberId || spin.outcome !== "chance") throw new UserError("目押しチャンスが見つかりません");
  if (now.getTime() - spin.createdAt.getTime() > CHANCE_WINDOW_MS) throw new UserError("目押しの時間が過ぎました");
  const hit = isTwoTwoTwo(stops);
  const bonus = hit ? s.slotSkillBonus : 0;
  let paid = false;
  await prisma.$transaction(async (tx) => {
    const r = await tx.slotSpin.updateMany({ where: { id: spinId, skill: null }, data: { skill: hit ? "hit" : "miss", payout: { increment: bonus } } });
    if (r.count === 0) throw new UserError("この目押しチャンスはもう終わっています");
    paid = true;
    await changePoints(tx, { memberId, amount: bonus, kind: "slot_win", note: "222 目押し成功", businessDate: spin.businessDate });
  });
  const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });
  return { hit, bonus: paid ? bonus : 0, points: member.points };
}

// ───── 宝くじ ─────

export type LotteryPass = "VIP" | "PLATINUM";
export const PASS_LABEL: Record<LotteryPass, string> = { VIP: "VIPパス", PLATINUM: "プラチナパス" };

/** 4桁一致 = VIPパス、下3桁一致 = プラチナパス。それ以外は外れ */
export function passFor(rank: number): LotteryPass | null {
  return rank === 1 ? "VIP" : rank === 2 ? "PLATINUM" : null;
}

/** その抽選日の当選番号（4桁）。発表の時刻までは使わない */
export function winningNumber(drawDate: string) {
  const mac = createHmac("sha256", process.env.SESSION_SECRET ?? "").update(`lottery:${drawDate}`).digest();
  return String(mac.readUInt32BE(0) % 10000).padStart(4, "0");
}

/** 発表の時刻：買った営業日の次の日の drawHour 時（JST） */
export function announceAt(drawDate: string, drawHour: number) {
  const [y, m, d] = drawDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, drawHour - 9, 0, 0));
}

const isTicketNumber = (n: string) => /^\d{4}$/.test(n);

/** 自分で選んだ番号で買う。1日 lotteryMaxTickets 枚まで、同じ番号は1枚まで */
export async function buyLottery(memberId: string, numbers: string[], now = new Date()) {
  const s = await getSettings();
  if (!s.lotteryEnabled) throw new UserError("宝くじはいまお休み中です");
  const nums = numbers.map((n) => String(n).trim());
  if (nums.length === 0 || nums.length > 10) throw new UserError("番号を選んでください");
  if (!nums.every(isTicketNumber)) throw new UserError("番号は0〜9の4桁で選んでください");
  if (new Set(nums).size !== nums.length) throw new UserError("同じ番号は1枚しか買えません");
  const date = businessDate(now, s.dayChangeHour);
  try {
    return await prisma.$transaction(async (tx) => {
      const mine = await tx.lotteryTicket.findMany({ where: { memberId, drawDate: date }, select: { number: true } });
      if (mine.length + nums.length > s.lotteryMaxTickets) {
        throw new UserError(mine.length >= s.lotteryMaxTickets ? `今日の宝くじは${s.lotteryMaxTickets}枚まで。もう買えません` : `今日はあと${s.lotteryMaxTickets - mine.length}枚まで買えます`);
      }
      const dup = nums.find((n) => mine.some((t) => t.number === n));
      if (dup) throw new UserError(`${dup} はもう買っています。同じ番号は1枚までです`);
      await changePoints(tx, { memberId, amount: -s.lotteryPrice * nums.length, kind: "lottery", note: nums.join("・"), businessDate: date }).catch((e) => {
        throw e instanceof UserError ? new UserError(`ポイントが足りません（1枚 ${s.lotteryPrice}pt）`) : e;
      });
      const tickets = [];
      for (const number of nums) tickets.push(await tx.lotteryTicket.create({ data: { memberId, drawDate: date, number, price: s.lotteryPrice } }));
      return tickets.map((t) => ({ id: t.id, number: t.number }));
    });
  } catch (e) {
    // 同時に同じ番号を送ったときは一意制約で止まる
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new UserError("同じ番号は1枚しか買えません");
    throw e;
  }
}

/**
 * 発表の時刻を過ぎた券を判定して、当たりにパスを付ける（何度呼んでも同じ結果）。
 * 画面を開いたときに呼ぶので、抽選のための定期実行はいらない
 */
export async function settleLottery(memberId: string, now = new Date()) {
  const s = await getSettings();
  const open = await prisma.lotteryTicket.findMany({ where: { memberId, settledAt: null } });
  const passes: LotteryPass[] = [];
  let settled = 0;
  for (const t of open) {
    if (now < announceAt(t.drawDate, s.lotteryDrawHour)) continue;
    const rank = lotteryRank(t.number, winningNumber(t.drawDate));
    const pass = passFor(rank);
    const r = await prisma.lotteryTicket.updateMany({ where: { id: t.id, settledAt: null }, data: { settledAt: now, rank, pass } });
    if (r.count === 1) {
      settled++;
      if (pass) passes.push(pass);
    }
  }
  return { settled, passes };
}

export async function lotteryView(memberId: string, now = new Date()) {
  await settleLottery(memberId, now);
  const s = await getSettings();
  const today = businessDate(now, s.dayChangeHour);
  const [member, tickets, owned] = await Promise.all([
    prisma.member.findUniqueOrThrow({ where: { id: memberId } }),
    prisma.lotteryTicket.findMany({ where: { memberId }, orderBy: [{ drawDate: "desc" }, { createdAt: "asc" }], take: 60 }),
    prisma.lotteryTicket.findMany({ where: { memberId, pass: { not: null }, passUsedAt: null }, orderBy: { drawDate: "desc" } }),
  ]);
  const byDate = new Map<string, typeof tickets>();
  for (const t of tickets) byDate.set(t.drawDate, [...(byDate.get(t.drawDate) ?? []), t]);
  const draws = [...byDate.entries()].map(([date, ts]) => {
    const at = announceAt(date, s.lotteryDrawHour);
    const revealed = now >= at;
    return {
      date,
      announceAt: at.toISOString(),
      revealed,
      // 発表前の当選番号は渡さない
      winning: revealed ? winningNumber(date) : null,
      tickets: ts.map((t) => ({ id: t.id, number: t.number, rank: revealed ? (t.rank ?? 0) : null, pass: revealed ? (t.pass as LotteryPass | null) : null })),
    };
  });
  return {
    enabled: s.lotteryEnabled,
    price: s.lotteryPrice,
    max: s.lotteryMaxTickets,
    drawHour: s.lotteryDrawHour,
    points: member.points,
    today,
    todayAnnounceAt: announceAt(today, s.lotteryDrawHour).toISOString(),
    todayTickets: (byDate.get(today) ?? []).map((t) => ({ id: t.id, number: t.number })),
    /** 今日より前に買った分（発表前・発表後） */
    draws: draws.filter((d) => d.date !== today).slice(0, 7),
    passes: owned.map((t) => ({ id: t.id, pass: t.pass as LotteryPass, drawDate: t.drawDate, number: t.number })),
  };
}

/** 管理画面：当たったパスの一覧（未使用が先） */
export async function passWinners() {
  const rows = await prisma.lotteryTicket.findMany({
    where: { pass: { not: null } },
    include: { member: { select: { id: true, nickname: true } } },
    orderBy: [{ passUsedAt: { sort: "asc", nulls: "first" } }, { drawDate: "desc" }],
    take: 200,
  });
  return rows;
}

export async function markPassUsed(ticketId: string, adminId: string, used: boolean, now = new Date()) {
  const r = await prisma.lotteryTicket.updateMany({
    where: { id: ticketId, pass: { not: null } },
    data: used ? { passUsedAt: now, passUsedBy: adminId } : { passUsedAt: null, passUsedBy: null },
  });
  if (r.count === 0) throw new UserError("パスが見つかりません");
}
