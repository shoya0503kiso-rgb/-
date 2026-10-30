import "server-only";
import type { Rng } from "@/lib/games";
import { businessDate } from "@/lib/time";
import { prisma } from "./db";
import { secureRng } from "./games";
import { changePoints } from "./points";
import { getSettings } from "./settings";

/** 1回の送信で受け付けるタップ数の上限と、1秒あたりの上限（連打ツール対策） */
export const MAX_TAPS_PER_REQUEST = 100;
export const MAX_TAPS_PER_SECOND = 20;

export async function mochiStatus(memberId: string, now = new Date()) {
  const s = await getSettings();
  const date = businessDate(now, s.dayChangeHour);
  const [member, day] = await Promise.all([
    prisma.member.findUniqueOrThrow({ where: { id: memberId } }),
    prisma.mochiDaily.findUnique({ where: { memberId_businessDate: { memberId, businessDate: date } } }),
  ]);
  return { total: member.mochiTotal, todayTaps: day?.taps ?? 0, todayWins: day?.wins ?? 0, winLimit: s.mochiDailyWinLimit };
}

/**
 * まとめて送られたタップを記録し、1タップごとに抽選する。
 * 前回の送信からの経過時間で受け付ける数を制限する
 */
export async function recordTaps(memberId: string, requested: number, now = new Date(), rng: Rng = secureRng) {
  const s = await getSettings();
  const date = businessDate(now, s.dayChangeHour);
  const n = Math.max(0, Math.min(MAX_TAPS_PER_REQUEST, Math.floor(Number(requested) || 0)));
  const key = { memberId_businessDate: { memberId, businessDate: date } };
  const day = await prisma.mochiDaily.upsert({ where: key, update: {}, create: { memberId, businessDate: date } });
  // その日最初の送信は5秒分まで
  const elapsedSec = day.lastTapAt ? Math.max(0, (now.getTime() - day.lastTapAt.getTime()) / 1000) : 5;
  const accepted = Math.min(n, Math.ceil(elapsedSec * MAX_TAPS_PER_SECOND));
  if (accepted === 0) return { accepted: 0, won: false, points: 0, ...(await mochiStatus(memberId, now)) };

  const odds = Math.max(1, s.mochiWinOdds);
  let hit = false;
  for (let i = 0; i < accepted && !hit; i++) hit = rng() < 1 / odds;

  let points = 0;
  let stale = false;
  await prisma.$transaction(async (tx) => {
    // 同時に送られたときは先に記録した方だけ受け付ける（速度制限のすり抜け防止）
    const r = await tx.mochiDaily.updateMany({
      where: { memberId, businessDate: date, lastTapAt: day.lastTapAt },
      data: { taps: { increment: accepted }, lastTapAt: now },
    });
    if (r.count === 0) {
      stale = true;
      return;
    }
    await tx.member.update({ where: { id: memberId }, data: { mochiTotal: { increment: accepted } } });
    if (hit && s.mochiWinPoints > 0) {
      // 1日の当選上限（同時送信でも超えないよう条件付きで加算）
      const r = await tx.mochiDaily.updateMany({
        where: { memberId, businessDate: date, wins: { lt: s.mochiDailyWinLimit } },
        data: { wins: { increment: 1 } },
      });
      if (r.count === 1) {
        points = s.mochiWinPoints;
        await changePoints(tx, { memberId, amount: points, kind: "mochi", businessDate: date });
      }
    }
  });
  return { accepted: stale ? 0 : accepted, won: points > 0, points, ...(await mochiStatus(memberId, now)) };
}
