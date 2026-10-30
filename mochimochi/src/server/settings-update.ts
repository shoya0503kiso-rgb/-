import "server-only";
import { z } from "zod";
import { prisma } from "./db";
import { UserError } from "./errors";
import type { GameKind } from "./rankings";

const int = (min: number, max: number, label: string) =>
  z.coerce.number().int(`${label}は整数で入れてください`).min(min, `${label}は${min}以上にしてください`).max(max, `${label}は${max}以下にしてください`);

const numbersSchema = z.object({
  dayChangeHour: int(0, 12, "営業日の切替時刻"),
  checkinPoints: int(0, 100000, "来店ポイント"),
  stampsPerCard: int(1, 50, "スタンプの数"),
  stampCardBonus: int(0, 1000000, "カード達成ボーナス"),
  jankenWinPoints: int(0, 100000, "じゃんけんのポイント"),
  chinchiroWinPoints: int(0, 100000, "チンチロのポイント"),
  chinchiroBigWinPoints: int(0, 100000, "チンチロ役のポイント"),
  mochiWinOdds: int(1, 100000000, "もちもちの当選確率"),
  mochiWinPoints: int(0, 1000000, "もちもちの当選ポイント"),
  mochiDailyWinLimit: int(0, 1000, "もちもちの1日の当選上限"),
  guestSignupEnabled: z.boolean(),
  geoEnabled: z.boolean(),
  geoLat: z.union([z.coerce.number().min(-90).max(90), z.null()]),
  geoLng: z.union([z.coerce.number().min(-180).max(180), z.null()]),
  geoRadiusM: int(30, 10000, "位置情報の範囲"),
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "入力を確認してください");
  return r.data;
}

export async function updateNumbers(input: unknown) {
  const d = parse(numbersSchema, input);
  if (d.geoEnabled && (d.geoLat == null || d.geoLng == null)) throw new UserError("位置情報チェックを使うには、お店の緯度・経度を入れてください");
  await prisma.storeSetting.update({ where: { id: 1 }, data: d });
}

const text = (max: number, label: string, required = true) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(required ? z.string().min(1, `${label}を入れてください`).max(max, `${label}は${max}文字までです`) : z.string().max(max, `${label}は${max}文字までです`));

const brandSchema = z.object({
  storeName: text(40, "店名"),
  storeSubName: text(60, "サブタイトル", false),
  pointName: text(20, "ポイントの名前"),
  mochiLabel: text(10, "連打ボタンの文字"),
  mochiWord: text(10, "鳴らす言葉"),
});

export async function updateBrand(input: unknown) {
  const d = parse(brandSchema, input);
  await prisma.storeSetting.update({ where: { id: 1 }, data: d });
}

// アップロードはサーバーアクションの上限（2MB）に収まるサイズに制限する。SVG はスクリプトを含められるので受け付けない
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const SOUND_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/ogg", "audio/webm"];

function checkDataUrl(dataUrl: string, types: string[], maxBytes: number, label: string) {
  const m = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m || !types.includes(m[1])) throw new UserError(`${label}の形式に対応していません`);
  if (Math.floor((m[2].length * 3) / 4) > maxBytes) throw new UserError(`${label}は${Math.round(maxBytes / 1024)}KBまでにしてください`);
  return dataUrl;
}

export async function updateAsset(kind: "logo" | "sound", dataUrl: string | null) {
  const data =
    kind === "logo"
      ? { logoData: dataUrl === null ? null : checkDataUrl(dataUrl, LOGO_TYPES, 1024 * 1024, "ロゴ画像") }
      : { mochiSoundData: dataUrl === null ? null : checkDataUrl(dataUrl, SOUND_TYPES, 1024 * 1024, "音声ファイル") };
  // brandVersion を上げてブラウザのキャッシュを切り替える
  await prisma.storeSetting.update({ where: { id: 1 }, data: { ...data, brandVersion: { increment: 1 } } });
}

const rankSchema = z
  .array(z.object({ name: text(20, "ランク名"), minVisits: int(0, 100000, "必要な来店回数"), color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "色が正しくありません") }))
  .min(1, "ランクを1つ以上入れてください")
  .max(30);

export async function updateRanks(input: unknown) {
  const ranks = parse(rankSchema, input).sort((a, b) => a.minVisits - b.minVisits);
  if (ranks[0].minVisits !== 0) throw new UserError("一番下のランクは来店0回にしてください");
  if (new Set(ranks.map((r) => r.minVisits)).size !== ranks.length) throw new UserError("必要な来店回数が同じランクがあります");
  await prisma.$transaction([prisma.rankTier.deleteMany(), prisma.rankTier.createMany({ data: ranks })]);
}

const placeSchema = z.array(int(0, 1000000, "ポイント")).max(50);

/** 順位ごとのポイント（配列の i 番目 = i+1 位） */
export async function updatePlacePoints(game: GameKind, input: unknown) {
  const pts = parse(placeSchema, input);
  await prisma.$transaction([
    prisma.placePointRule.deleteMany({ where: { game } }),
    prisma.placePointRule.createMany({ data: pts.map((points, i) => ({ game, place: i + 1, points })) }),
  ]);
}
