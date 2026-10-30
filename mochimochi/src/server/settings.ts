import "server-only";
import { randomBytes } from "node:crypto";
import { DEFAULT_PLACE_POINTS, DEFAULT_RANKS, DEFAULT_REWARDS } from "@/lib/defaults";
import { businessDate } from "@/lib/time";
import { prisma } from "./db";

export type Settings = Awaited<ReturnType<typeof getSettings>>;

/** 店舗設定（無ければ初期値で作り、ランク・順位ポイント・交換メニューの仮の値も入れる） */
export async function getSettings() {
  let s = await prisma.storeSetting.findUnique({ where: { id: 1 } });
  if (!s) {
    s = await prisma.storeSetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
    await ensureDefaults();
  }
  if (!s.qrDisplayKey) {
    return prisma.storeSetting.update({ where: { id: 1 }, data: { qrDisplayKey: randomBytes(18).toString("base64url") } });
  }
  return s;
}

/** 表示用（ロゴ・音声の本体は重いので除く） */
export async function getBrand() {
  const s = await getSettings();
  return {
    storeName: s.storeName,
    storeSubName: s.storeSubName,
    pointName: s.pointName,
    mochiLabel: s.mochiLabel,
    mochiWord: s.mochiWord,
    hasLogo: !!s.logoData,
    hasSound: !!s.mochiSoundData,
    logoUrl: `/brand/logo?v=${s.brandVersion}`,
    soundUrl: s.mochiSoundData ? `/brand/sound?v=${s.brandVersion}` : null,
  };
}

export type Brand = Awaited<ReturnType<typeof getBrand>>;

/** 今日の営業日 */
export async function today(now = new Date()) {
  const s = await getSettings();
  return businessDate(now, s.dayChangeHour);
}

/** 来店ランク（来店回数の少ない順） */
export async function getRankTiers() {
  return prisma.rankTier.findMany({ orderBy: { minVisits: "asc" } });
}

export function rankFor(visitCount: number, tiers: { name: string; minVisits: number; color: string }[]) {
  let current = tiers[0] ?? { name: "メンバー", minVisits: 0, color: "#94a3b8" };
  let next: (typeof tiers)[number] | null = null;
  for (const t of tiers) {
    if (visitCount >= t.minVisits) current = t;
    else {
      next = t;
      break;
    }
  }
  return { current, next, toNext: next ? next.minVisits - visitCount : 0 };
}

export async function ensureDefaults() {
  if ((await prisma.rankTier.count()) === 0) await prisma.rankTier.createMany({ data: DEFAULT_RANKS });
  if ((await prisma.placePointRule.count()) === 0) {
    await prisma.placePointRule.createMany({
      data: Object.entries(DEFAULT_PLACE_POINTS).flatMap(([game, pts]) => pts.map((points, i) => ({ game, place: i + 1, points }))),
    });
  }
  if ((await prisma.reward.count()) === 0) {
    await prisma.reward.createMany({ data: DEFAULT_REWARDS });
  }
}
