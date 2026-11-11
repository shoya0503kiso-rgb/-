// ミニゲーム「ラッキーアワー」の共有データ。ログイン不要の公開API から使う。
// 抽選の計算と演出は端末側（public/lucky-hour.html）で行い、サーバーは文書を保存して配るだけ
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
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
const SYNC_KEY = "_sync";
const FAIL_KEY = "lucky-hour-pin";
const SYNC_FAIL_KEY = "lucky-hour-sync";

export const pinSchema = z.string().regex(/^\d{4,8}$/, "PINは数字4〜8桁です");
export const holderSchema = z.string().regex(/^[A-Za-z0-9]{6,40}$/);

/** 全体の番号。since と同じなら文書は送らない */
/**
 * 画面（public/lucky-hour.html）の世代。画面の動きを変えたら上げる。
 * これより古い画面は書き込めず、毎時の自動抽選を止めた設定を受け取る（開きっぱなしの古いテレビが勝手に抽選しないように）。
 * 新しい画面は、サーバーの世代が自分より新しいと自分で読み込み直す
 */
export const CLIENT_REV = 3;
export const STALE_TITLE = "画面を読み込み直してください";

export async function view(since?: number, clientRev = 0) {
  const [meta, pin, sync] = await Promise.all([
    prisma.luckyHourDoc.findUnique({ where: { key: META_KEY } }),
    prisma.luckyHourDoc.findUnique({ where: { key: PIN_KEY }, select: { key: true } }),
    prisma.luckyHourDoc.findUnique({ where: { key: SYNC_KEY }, select: { updatedAt: true } }),
  ]);
  const version = meta?.version ?? 0;
  const base = { version, rev: CLIENT_REV, pinSet: !!pin, syncKeyAt: sync?.updatedAt.getTime() ?? null, now: Date.now() };
  const stale = clientRev < CLIENT_REV;
  if (since === version && !stale) return base;
  const rows = await prisma.luckyHourDoc.findMany({ where: { key: { in: [...DOC_KEYS] } } });
  const docs: Partial<Record<DocKey, unknown>> = {};
  for (const r of rows) {
    try { docs[r.key as DocKey] = JSON.parse(r.value); } catch { /* 壊れた文書は送らない */ }
  }
  if (stale) {
    // 古い画面には、毎時の自動抽選を止めて「読み込み直して」と見出しに出す設定を渡す
    const cfg = docs.config && typeof docs.config === "object" ? (docs.config as Record<string, unknown>) : {};
    docs.config = { ...cfg, auto: false, title: STALE_TITLE };
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

/* ---------- 箱カルテ連携：リングの入退店を受け取って参加者リストに反映する ---------- */

const sha = (s: string) => createHash("sha256").update(s).digest();

/** 連携キーを発行（作り直すと古いキーは使えなくなる）。キーそのものは保存せず、ハッシュだけ持つ */
export async function issueSyncKey() {
  const key = randomBytes(24).toString("base64url");
  const value = JSON.stringify({ hash: sha(key).toString("hex") });
  await prisma.luckyHourDoc.upsert({ where: { key: SYNC_KEY }, update: { value }, create: { key: SYNC_KEY, value } });
  return { key };
}

export async function checkSyncKey(key: string, ip: string, now = new Date()) {
  const row = await prisma.luckyHourDoc.findUnique({ where: { key: SYNC_KEY } });
  if (!row) throw new UserError("連携キーがまだ発行されていません");
  await assertNotLocked(SYNC_FAIL_KEY, ip, now);
  const want = Buffer.from((JSON.parse(row.value) as { hash: string }).hash, "hex");
  const got = sha(key);
  if (want.length !== got.length || !timingSafeEqual(want, got)) {
    await recordFailure(SYNC_FAIL_KEY, ip, now);
    throw new UserError("連携キーがちがいます");
  }
}

const memberSchema = z.object({ id: z.string().trim().min(1).max(64), name: z.string().trim().min(1).max(40) });
export const ringInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enter"), ...memberSchema.shape }),
  z.object({ action: z.literal("leave"), id: z.string().trim().min(1).max(64) }),
  z.object({ action: z.literal("sync"), members: z.array(memberSchema).max(60) }),
]);
export type RingInput = z.infer<typeof ringInput>;

type Player = { id: string; name: string; active: boolean; karteId?: string };
const cleanName = (raw: string) => Array.from(raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").replace(/\s+/g, " ").trim()).slice(0, 20).join("");
const newId = () => Date.now().toString(36) + randomBytes(4).toString("hex");

/** リングに入った人を着席にする。カルテIDで探し、なければ同じ名前の手入力の人に紐付け、それもなければ追加 */
function enter(list: Player[], id: string, name: string) {
  const n = cleanName(name) || "お客さま";
  const p = list.find(x => x.karteId === id) ?? list.find(x => !x.karteId && x.name === n);
  if (p) { p.karteId = id; p.name = n; p.active = true; }
  else list.push({ id: newId(), name: n, active: true, karteId: id });
}

export async function ringEvent(input: RingInput) {
  const row = await prisma.luckyHourDoc.findUnique({ where: { key: "players" } });
  let list: Player[] = [];
  try { const v = row ? (JSON.parse(row.value) as { list?: unknown }) : null; if (Array.isArray(v?.list)) list = v.list as Player[]; } catch { /* 壊れていたら空から */ }
  if (input.action === "enter") enter(list, input.id, input.name);
  // 退店した人はリストから外す（手入力で足した人はそのまま）
  if (input.action === "leave") list = list.filter(p => p.karteId !== input.id);
  if (input.action === "sync") {
    const ids = new Set(input.members.map(m => m.id));
    list = list.filter(p => !p.karteId || ids.has(p.karteId));
    for (const m of input.members) enter(list, m.id, m.name);
  }
  await writeDoc("players", { list });
  return { ok: true, seated: list.filter(p => p.active).length, linked: list.filter(p => p.karteId).length };
}
