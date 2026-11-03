import "server-only";
import { businessDate, isValidDate, monthOf } from "@/lib/time";
import { prisma } from "./db";
import { UserError } from "./errors";
import { changePoints } from "./points";
import { GAME_LABEL, type GameKind } from "./rankings";
import { getSettings } from "./settings";

async function todayDate(now: Date) {
  const s = await getSettings();
  return businessDate(now, s.dayChangeHour);
}

// ───── 会員 ─────

export async function searchMembers(q: string, take = 50) {
  const query = q.trim();
  return prisma.member.findMany({
    where: query ? { OR: [{ nickname: { contains: query } }, { id: query }] } : {},
    orderBy: query ? { nickname: "asc" } : { updatedAt: "desc" },
    take,
  });
}

/** 手動のポイント付与・減算（理由と担当者を履歴に残す） */
export async function adjustPoints(memberId: string, amount: number, note: string, adminId: string, now = new Date()) {
  if (!Number.isInteger(amount) || amount === 0) throw new UserError("ポイントは0以外の整数で入れてください");
  if (Math.abs(amount) > 1_000_000) throw new UserError("一度に変更できるのは100万ポイントまでです");
  if (!note.trim()) throw new UserError("理由を入れてください");
  const date = await todayDate(now);
  await prisma.$transaction((tx) => changePoints(tx, { memberId, amount, kind: "manual", note: note.trim(), businessDate: date, adminId }));
}

// ───── ダーツ・ポーカーの結果 ─────

export async function placePoints(game: GameKind) {
  const rules = await prisma.placePointRule.findMany({ where: { game }, orderBy: { place: "asc" } });
  return new Map(rules.map((r) => [r.place, r.points]));
}

/** 結果入力 → 順位に応じてポイント（＝ランキングの点数）を自動付与 */
export async function createMatch(
  input: { game: GameKind; date: string; title: string; entries: { memberId: string; place: number }[] },
  adminId: string,
) {
  if (!isValidDate(input.date)) throw new UserError("日付を正しく入れてください");
  const entries = input.entries.filter((e) => e.memberId);
  if (entries.length === 0) throw new UserError("参加者を1人以上入れてください");
  if (new Set(entries.map((e) => e.memberId)).size !== entries.length) throw new UserError("同じ会員が2回入っています");
  if (entries.some((e) => !Number.isInteger(e.place) || e.place < 1 || e.place > 999)) throw new UserError("順位は1以上の数字で入れてください");
  const table = await placePoints(input.game);
  const label = `${GAME_LABEL[input.game]}${input.title ? `「${input.title}」` : ""}`;
  return prisma.$transaction(async (tx) => {
    const match = await tx.match.create({ data: { game: input.game, date: input.date, title: input.title.trim(), adminId } });
    for (const e of entries) {
      const points = table.get(e.place) ?? 0;
      await tx.matchEntry.create({ data: { matchId: match.id, memberId: e.memberId, place: e.place, points } });
      await changePoints(tx, { memberId: e.memberId, amount: points, kind: input.game, note: `${label} ${e.place}位`, businessDate: input.date, adminId });
    }
    return match;
  });
}

/** 結果の取り消し（付与したポイントも戻す） */
export async function deleteMatch(matchId: string, adminId: string, now = new Date()) {
  const date = await todayDate(now);
  await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id: matchId }, include: { entries: true } });
    if (!match) throw new UserError("結果が見つかりません");
    for (const e of match.entries) {
      await changePoints(tx, {
        memberId: e.memberId,
        amount: -e.points,
        kind: match.game as GameKind,
        note: `${GAME_LABEL[match.game as GameKind]}結果の取り消し（${match.date}）`,
        businessDate: date,
        adminId,
      }).catch(() => {
        throw new UserError("ポイントを使ってしまった会員がいるため取り消せません。会員画面で手動調整してください");
      });
    }
    await tx.match.delete({ where: { id: matchId } });
  });
}

// ───── サブマリン ─────

export async function addSubmarine(memberId: string, delta: 1 | -1, adminId: string, now = new Date()) {
  const month = monthOf(await todayDate(now));
  if (delta < 0) {
    const sum = await prisma.submarineLog.aggregate({ where: { memberId, month }, _sum: { delta: true } });
    if ((sum._sum.delta ?? 0) <= 0) throw new UserError("今月の杯数は0です");
  }
  await prisma.submarineLog.create({ data: { memberId, month, delta, adminId } });
  const sum = await prisma.submarineLog.aggregate({ where: { memberId, month }, _sum: { delta: true } });
  return { month, count: sum._sum.delta ?? 0 };
}

export async function submarineCounts(month: string) {
  const logs = await prisma.submarineLog.groupBy({ by: ["memberId"], where: { month }, _sum: { delta: true } });
  return new Map(logs.map((l) => [l.memberId, l._sum.delta ?? 0]));
}

// ───── ポイント交換 ─────

export async function redeem(memberId: string, rewardId: string, now = new Date()) {
  const reward = await prisma.reward.findUnique({ where: { id: rewardId } });
  if (!reward || !reward.active) throw new UserError("この交換はいまは利用できません");
  const date = await todayDate(now);
  return prisma.$transaction(async (tx) => {
    await changePoints(tx, { memberId, amount: -reward.cost, kind: "redeem", note: reward.name, businessDate: date });
    return tx.redemption.create({ data: { memberId, rewardName: reward.name, cost: reward.cost } });
  });
}

export async function handleRedemption(id: string, action: "done" | "cancel", adminId: string, now = new Date()) {
  const date = await todayDate(now);
  await prisma.$transaction(async (tx) => {
    const r = await tx.redemption.updateMany({
      where: { id, status: "pending" },
      data: { status: action === "done" ? "done" : "cancelled", handledAt: now, handledBy: adminId },
    });
    if (r.count === 0) throw new UserError("すでに処理済みです");
    if (action === "cancel") {
      const red = await tx.redemption.findUniqueOrThrow({ where: { id } });
      await changePoints(tx, { memberId: red.memberId, amount: red.cost, kind: "refund", note: red.rewardName, businessDate: date, adminId });
    }
  });
}
