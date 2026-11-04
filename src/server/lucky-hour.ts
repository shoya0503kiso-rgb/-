// ミニゲーム「ラッキーアワー」の共有データ。ログイン不要の公開API から使う。
// 抽選の計算と演出は端末側（public/lucky-hour.html）で行い、サーバーは文書を保存して配るだけ
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./db";
import { UserError } from "./errors";
import { assertNotLocked, recordFailure } from "./rate-limit";

export const DOC_KEYS = ["config", "players", "draw", "history", "tv"] as const;
export type DocKey = (typeof DOC_KEYS)[number];
// 履歴100件＋景品の設定で数十KB。余裕を見て1文書200KBまで
export const MAX_DOC_CHARS = 200_000;
const LOCK_KEY = "_lock";
const PIN_KEY = "_pin";
const META_KEY = "_meta";
const FAIL_KEY = "lucky-hour-pin";

export const pinSchema = z.string().regex(/^\d{4,8}$/, "PINは数字4〜8桁です");
export const holderSchema = z.string().regex(/^[A-Za-z0-9]{6,40}$/);

/** 全体の番号。since と同じなら文書は送らない */
export async function view(since?: number) {
  const [meta, pin] = await Promise.all([
    prisma.luckyHourDoc.findUnique({ where: { key: META_KEY } }),
    prisma.luckyHourDoc.findUnique({ where: { key: PIN_KEY }, select: { key: true } }),
  ]);
  const version = meta?.version ?? 0;
  const base = { version, pinSet: !!pin, now: Date.now() };
  if (since === version) return base;
  const rows = await prisma.luckyHourDoc.findMany({ where: { key: { in: [...DOC_KEYS] } } });
  const docs: Partial<Record<DocKey, unknown>> = {};
  for (const r of rows) {
    try { docs[r.key as DocKey] = JSON.parse(r.value); } catch { /* 壊れた文書は送らない */ }
  }
  return { ...base, docs };
}

// 同じPINを毎回 bcrypt で照合しないよう、照合済みの組み合わせを少しの間だけ覚えておく
const verified = new Map<string, number>();
const VERIFIED_MS = 10 * 60_000;

export async function checkPin(pin: string, ip: string, now = new Date()) {
  const row = await prisma.luckyHourDoc.findUnique({ where: { key: PIN_KEY } });
  if (!row) throw new UserError("スタッフPINがまだ決まっていません");
  const { hash } = JSON.parse(row.value) as { hash: string };
  const memo = `${hash}:${pin}`;
  if ((verified.get(memo) ?? 0) > now.getTime()) return;
  await assertNotLocked(FAIL_KEY, ip, now);
  if (!(await bcrypt.compare(pin, hash))) {
    await recordFailure(FAIL_KEY, ip, now);
    throw new UserError("PINがちがいます");
  }
  verified.set(memo, now.getTime() + VERIFIED_MS);
}

/** 最初の1回だけ。すでに決まっているときは変えられない（変えるときはDBの _pin 行を消す） */
export async function setPin(pin: string) {
  const hash = await bcrypt.hash(pin, 10);
  try {
    await prisma.luckyHourDoc.create({ data: { key: PIN_KEY, value: JSON.stringify({ hash }) } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new UserError("スタッフPINはもう決まっています");
    throw e;
  }
}

async function bumpVersion() {
  const meta = await prisma.luckyHourDoc.upsert({
    where: { key: META_KEY },
    update: { version: { increment: 1 } },
    create: { key: META_KEY, value: "{}", version: 1 },
  });
  return meta.version;
}

export async function writeDoc(key: DocKey, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new UserError("保存する内容が正しくありません");
  const json = JSON.stringify(value);
  if (json.length > MAX_DOC_CHARS) throw new UserError("保存する内容が大きすぎます");
  const version = await bumpVersion();
  await prisma.luckyHourDoc.upsert({ where: { key }, update: { value: json, version }, create: { key, value: json, version } });
  return { version };
}

/**
 * 自動抽選の二重実行を防ぐ短いロック。テレビ画面が2台開いていても、同じ時刻の抽選を作るのは1台だけ。
 * 期限切れか、同じ持ち主なら取れる。取り合いは version の比較で1台に決める
 */
export async function acquireLock(holder: string, ttlMs: number, now = new Date()) {
  const until = now.getTime() + Math.min(Math.max(ttlMs, 1000), 30_000);
  const row = await prisma.luckyHourDoc.findUnique({ where: { key: LOCK_KEY } });
  const value = JSON.stringify({ holder, until });
  if (!row) {
    try {
      await prisma.luckyHourDoc.create({ data: { key: LOCK_KEY, value, version: 1 } });
      return { acquired: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { acquired: false };
      throw e;
    }
  }
  const cur = JSON.parse(row.value) as { holder: string; until: number };
  if (cur.holder !== holder && cur.until > now.getTime()) return { acquired: false };
  const { count } = await prisma.luckyHourDoc.updateMany({ where: { key: LOCK_KEY, version: row.version }, data: { value, version: row.version + 1 } });
  return { acquired: count === 1 };
}
