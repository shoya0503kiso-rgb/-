import "server-only";
import { prisma } from "./db";

export type GameKind = "darts" | "poker";
export const GAME_LABEL: Record<GameKind, string> = { darts: "ダーツ", poker: "ポーカー" };
export const isGameKind = (s: string): s is GameKind => s === "darts" || s === "poker";

export interface RankingRow {
  rank: number;
  memberId: string;
  nickname: string;
  value: number;
}

/** 同点は同じ順位（1, 1, 3 …） */
function toRows(totals: Map<string, number>, names: Map<string, string>): RankingRow[] {
  // 同点はニックネーム順（表示順を毎回同じにする）
  const sorted = [...totals.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || (names.get(a[0]) ?? "").localeCompare(names.get(b[0]) ?? "", "ja"));
  let prev = Number.NaN;
  let rank = 0;
  return sorted.map(([memberId, value], i) => {
    if (value !== prev) rank = i + 1;
    prev = value;
    return { rank, memberId, nickname: names.get(memberId) ?? "（退会）", value };
  });
}

async function nicknames(ids: string[]) {
  const ms = await prisma.member.findMany({ where: { id: { in: ids }, active: true }, select: { id: true, nickname: true } });
  return new Map(ms.map((m) => [m.id, m.nickname]));
}

/** ダーツ・ポーカー：期間内に獲得した順位ポイントの合計。month = "YYYY-MM" または "all" */
export async function gameRanking(game: GameKind, month: string) {
  const entries = await prisma.matchEntry.findMany({
    where: { match: { game, ...(month === "all" ? {} : { date: { startsWith: month } }) } },
    select: { memberId: true, points: true },
  });
  const totals = new Map<string, number>();
  for (const e of entries) totals.set(e.memberId, (totals.get(e.memberId) ?? 0) + e.points);
  const names = await nicknames([...totals.keys()]);
  return toRows(new Map([...totals].filter(([id]) => names.has(id))), names);
}

/** サブマリン：その月の杯数（毎月リセット） */
export async function submarineRanking(month: string) {
  const logs = await prisma.submarineLog.groupBy({ by: ["memberId"], where: { month }, _sum: { delta: true } });
  const totals = new Map(logs.map((l) => [l.memberId, l._sum.delta ?? 0]));
  const names = await nicknames([...totals.keys()]);
  return toRows(new Map([...totals].filter(([id]) => names.has(id))), names);
}

export async function myRankings(memberId: string, month: string) {
  const [darts, poker, submarine] = await Promise.all([gameRanking("darts", month), gameRanking("poker", month), submarineRanking(month)]);
  const find = (rows: RankingRow[]) => {
    const r = rows.find((x) => x.memberId === memberId);
    return r ? { rank: r.rank, value: r.value, of: rows.length } : null;
  };
  return { darts: find(darts), poker: find(poker), submarine: find(submarine) };
}
