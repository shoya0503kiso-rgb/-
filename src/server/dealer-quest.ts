// ミニゲーム「ディーラークエスト」のランキング。ログイン不要の公開API から使う
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./db";
import { UserError } from "./errors";

const CARDS_PER_TABLE = 16;
const BOARD_SIZE = 50;
// 勤怠アプリと同じDBなので、公開ミニゲームの行数に上限を設ける
const MAX_PLAYERS = 10_000;
const NEW_PER_IP_PER_HOUR = 20;
export const DEFAULT_NAME = "名無しのディーラー";

export const scoreInput = z.object({
  playerId: z.string().regex(/^[A-Za-z0-9-]{16,64}$/),
  name: z.string().max(40),
  tables: z.number().int().min(1).max(500),
  cards: z.number().int().min(0).max(10_000),
  rate: z.number().int().min(0).max(100),
  perfectRate: z.number().int().min(0).max(100),
  maxCombo: z.number().int().min(0).max(10_000),
});
export type ScoreInput = z.infer<typeof scoreInput>;

type Score = Pick<ScoreInput, "tables" | "cards" | "perfectRate">;

/** 表示名：制御文字を除き、空白をまとめて12文字まで。空なら既定名 */
export function cleanName(raw: string) {
  const s = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
  return Array.from(s).slice(0, 12).join("") || DEFAULT_NAME;
}

/** a が b より上なら正。テーブル数 → パーフェクト率 → 配った枚数 */
export function compareScore(a: Score, b: Score) {
  return a.tables - b.tables || a.perfectRate - b.perfectRate || a.cards - b.cards;
}

/** 完成テーブル数と配った枚数が矛盾する記録は受け付けない */
function assertPlausible(s: ScoreInput) {
  const cleanCards = s.tables * CARDS_PER_TABLE;
  if (s.cards < cleanCards || s.cards >= cleanCards + CARDS_PER_TABLE) throw new UserError("記録が正しくありません");
  if (s.maxCombo > s.cards) throw new UserError("記録が正しくありません");
}

async function rankOf(row: { playerId: string; tables: number; perfectRate: number; cards: number; achievedAt: Date }) {
  const ahead = await prisma.dealerQuestScore.count({
    where: {
      OR: [
        { tables: { gt: row.tables } },
        { tables: row.tables, perfectRate: { gt: row.perfectRate } },
        { tables: row.tables, perfectRate: row.perfectRate, cards: { gt: row.cards } },
        { tables: row.tables, perfectRate: row.perfectRate, cards: row.cards, achievedAt: { lt: row.achievedAt } },
        { tables: row.tables, perfectRate: row.perfectRate, cards: row.cards, achievedAt: row.achievedAt, playerId: { lt: row.playerId } },
      ],
    },
  });
  return ahead + 1;
}

/** 新しいプレイヤーの登録を、全体の件数と接続元ごとの回数で制限する */
async function assertCanCreate(ip: string, now: Date) {
  const [all, recent] = await Promise.all([
    prisma.dealerQuestScore.count(),
    ip ? prisma.dealerQuestScore.count({ where: { ip, createdAt: { gte: new Date(now.getTime() - 3600_000) } } }) : Promise.resolve(0),
  ]);
  if (all >= MAX_PLAYERS) throw new UserError("ランキングの登録数が上限に達しています");
  if (recent >= NEW_PER_IP_PER_HOUR) throw new UserError("登録が多すぎます。しばらくしてからお試しください");
}

/** ベストを更新したときだけ記録を書き換える。名前は毎回最新にする */
export async function submitScore(input: ScoreInput, ip = "", now = new Date()) {
  assertPlausible(input);
  const name = cleanName(input.name);
  const { playerId, tables, cards, rate, perfectRate, maxCombo } = input;
  let prev = await prisma.dealerQuestScore.findUnique({ where: { playerId } });
  let row;
  if (!prev) {
    await assertCanCreate(ip, now);
    try {
      row = await prisma.dealerQuestScore.create({ data: { playerId, name, tables, cards, rate, perfectRate, maxCombo, ip: ip || null, achievedAt: now, createdAt: now } });
      return { improved: true, best: { tables: row.tables }, rank: await rankOf(row) };
    } catch (e) {
      // 同じプレイヤーの同時送信：先に作られた行に対して更新として扱う
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      prev = await prisma.dealerQuestScore.findUniqueOrThrow({ where: { playerId } });
    }
  }
  let improved = true;
  if (compareScore(input, prev) > 0) {
    row = await prisma.dealerQuestScore.update({ where: { playerId }, data: { name, tables, cards, rate, perfectRate, maxCombo, achievedAt: now } });
  } else {
    improved = false;
    row = prev.name === name ? prev : await prisma.dealerQuestScore.update({ where: { playerId }, data: { name } });
  }
  return { improved, best: { tables: row.tables }, rank: await rankOf(row) };
}

/** 上位50件。playerId は返さず、本人の行だけ me を付ける */
export async function leaderboard(playerId?: string) {
  const [top, total, mine] = await Promise.all([
    prisma.dealerQuestScore.findMany({
      orderBy: [{ tables: "desc" }, { perfectRate: "desc" }, { cards: "desc" }, { achievedAt: "asc" }, { playerId: "asc" }],
      take: BOARD_SIZE,
    }),
    prisma.dealerQuestScore.count(),
    playerId ? prisma.dealerQuestScore.findUnique({ where: { playerId } }) : null,
  ]);
  const view = (r: (typeof top)[number], rank: number) => ({
    rank, name: r.name, tables: r.tables, cards: r.cards, rate: r.rate, perfectRate: r.perfectRate, maxCombo: r.maxCombo,
    me: r.playerId === playerId,
  });
  const rows = top.map((r, i) => view(r, i + 1));
  if (mine && !rows.some((r) => r.me)) rows.push(view(mine, await rankOf(mine)));
  return { total, rows };
}
