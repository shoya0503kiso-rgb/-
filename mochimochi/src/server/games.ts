import "server-only";
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { HAND_LABEL, HANDS, judgeChinchiro, judgeJanken, randomHand, rollChinchiro, type Hand, type Rng } from "@/lib/games";
import { businessDate } from "@/lib/time";
import { prisma } from "./db";
import { UserError } from "./errors";
import { applyPointDay, changePoints } from "./points";
import { getSettings } from "./settings";

/** 暗号学的に安全な乱数（0以上1未満） */
export const secureRng: Rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

export async function todaysPlay(memberId: string, now = new Date()) {
  const s = await getSettings();
  const date = businessDate(now, s.dayChangeHour);
  return prisma.gamePlay.findUnique({ where: { memberId_businessDate: { memberId, businessDate: date } } });
}

async function record(
  memberId: string,
  date: string,
  game: string,
  result: "win" | "lose" | "draw",
  detail: object,
  basePoints: number,
  label: string,
) {
  const pointDay = await prisma.pointDay.findUnique({ where: { date } });
  const points = result === "win" ? applyPointDay(basePoints, pointDay, "game") : 0;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.gamePlay.create({ data: { memberId, businessDate: date, game, result, detail: JSON.stringify(detail), points } });
      await changePoints(tx, { memberId, amount: points, kind: "game", note: label, businessDate: date });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new UserError("今日のゲームはもう遊びました。また明日！");
    }
    throw e;
  }
  return points;
}

async function assertNotPlayed(memberId: string, date: string) {
  const played = await prisma.gamePlay.findUnique({ where: { memberId_businessDate: { memberId, businessDate: date } } });
  if (played) throw new UserError("今日のゲームはもう遊びました。また明日！");
}

/** じゃんけん。あいこは記録せず、もう一度出せる */
export async function playJanken(memberId: string, hand: string, now = new Date(), rng: Rng = secureRng) {
  if (!HANDS.includes(hand as Hand)) throw new UserError("手を選んでください");
  const s = await getSettings();
  const date = businessDate(now, s.dayChangeHour);
  await assertNotPlayed(memberId, date);
  const house = randomHand(rng);
  const result = judgeJanken(hand as Hand, house);
  if (result === "draw") return { result, house, points: 0 };
  const points = await record(memberId, date, "janken", result, { player: hand, house }, s.jankenWinPoints, `じゃんけん（${HAND_LABEL[hand as Hand]}）`);
  return { result, house, points };
}

/** チンチロ（お客さん vs 親）。引き分け（同じ強さ）は「わかれ」でポイントなし */
export async function playChinchiro(memberId: string, now = new Date(), rng: Rng = secureRng) {
  const s = await getSettings();
  const date = businessDate(now, s.dayChangeHour);
  await assertNotPlayed(memberId, date);
  const house = rollChinchiro(rng);
  const player = rollChinchiro(rng);
  const result = judgeChinchiro(player.hand, house.hand);
  const base = player.hand.big ? s.chinchiroBigWinPoints : s.chinchiroWinPoints;
  const points = await record(memberId, date, "chinchiro", result, { player, house }, base, `チンチロ（${player.hand.name}）`);
  return { result, player, house, points };
}
