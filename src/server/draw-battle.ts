// ミニゲーム「お絵描きバトル」の部屋。ログイン不要の公開API から使う。
// 対戦の計算はホストの端末が行い、サーバーは結果を保存して全員に配るだけ
import { randomBytes, randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { z } from "zod";
import { prisma } from "./db";
import { UserError } from "./errors";

export const MAX_PLAYERS = 8;
const ROOM_TTL_MS = 3 * 3600_000;
// 勤怠アプリと同じDBなので、公開ミニゲームの部屋数に上限を設ける
// 1部屋の保存量は 絵(15万文字)×8人 ほど。全体で最大200部屋＝約240MBに収まる
const MAX_ROOMS = 200;
const NEW_ROOMS_PER_IP_PER_HOUR = 20;
// 時間切れのあと、提出が届くのを待つ猶予
export const SUBMIT_GRACE_MS = 8000;
const COUNTDOWN_MS = 3000;
const BATTLE_LEAD_MS = 3000;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// 300px の手描きPNGは普通は数十KB。超えるときは端末側で縮小してから送る
export const MAX_DRAWING_CHARS = 150_000;

const NAME_HEAD = ["ポコ", "ガブ", "モチ", "ドド", "ピロ", "ザク", "ムニ", "ボヨ", "チビ", "ゴン", "フワ", "ギザ"];
const NAME_TAIL = ["リン", "ラス", "まる", "ドン", "すけ", "ゴラ", "ぴょん", "キング", "マン", "ザウルス"];

export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/);
export const codeSchema = z.string().regex(/^[A-Z0-9]{5}$/);
const dataUrl = z.string().max(MAX_DRAWING_CHARS).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);

export function randomName() {
  return NAME_HEAD[randomInt(NAME_HEAD.length)] + NAME_TAIL[randomInt(NAME_TAIL.length)];
}

/** キャラ名：制御文字を除き、空白をまとめて10文字まで。空ならランダムな名前 */
export function cleanName(raw: string) {
  const s = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
  return Array.from(s).slice(0, 10).join("") || randomName();
}

const newToken = () => randomBytes(24).toString("base64url");
const newCode = () => Array.from({ length: 5 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");

async function findRoom(code: string) {
  const room = await prisma.drawBattleRoom.findUnique({ where: { code }, include: { players: { orderBy: { seat: "asc" } } } });
  if (!room) throw new UserError("部屋が見つかりません。ルームコードを確かめてください");
  return room;
}
type Room = Awaited<ReturnType<typeof findRoom>>;

/** 参加中のプレイヤー（バトル中に抜けた人は除く。抜けた人の絵は対戦の再生のために残す） */
const active = (room: Room) => room.players.filter((p) => !p.leftAt);

function me(room: Room, token: string) {
  const p = active(room).find((x) => x.token === token);
  if (!p) throw new UserError("この部屋に参加していません");
  return p;
}

function hostOnly(room: Room, token: string) {
  const p = me(room, token);
  if (p.id !== room.hostId) throw new UserError("ホストだけが操作できます");
  return p;
}

/** 変更のたびに version を上げる（端末は version が変わったときだけ全体を受け取り直す） */
const bump = (now: Date) => ({ version: { increment: 1 }, updatedAt: now });

export async function createRoom(ip = "", now = new Date()) {
  await prisma.drawBattleRoom.deleteMany({ where: { updatedAt: { lt: new Date(now.getTime() - ROOM_TTL_MS) } } });
  const [all, recent] = await Promise.all([
    prisma.drawBattleRoom.count(),
    ip ? prisma.drawBattleRoom.count({ where: { ip, createdAt: { gte: new Date(now.getTime() - 3600_000) } } }) : Promise.resolve(0),
  ]);
  if (all >= MAX_ROOMS) throw new UserError("いま部屋がいっぱいです。しばらくしてからお試しください");
  if (recent >= NEW_ROOMS_PER_IP_PER_HOUR) throw new UserError("部屋を作りすぎです。しばらくしてからお試しください");
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    const token = newToken();
    try {
      const room = await prisma.drawBattleRoom.create({
        data: { code, hostId: "", ip: ip || null, createdAt: now, updatedAt: now, players: { create: { token, seat: 1, joinedAt: now } } },
        include: { players: true },
      });
      const host = room.players[0];
      await prisma.drawBattleRoom.update({ where: { code }, data: { hostId: host.id } });
      return { code, token, playerId: host.id };
    } catch (e) {
      // ルームコードがたまたま重なったら作り直す
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  throw new UserError("部屋を作れませんでした。もう一度お試しください");
}

/** 参加。すでに参加済みの token なら同じ席に戻る */
export async function joinRoom(code: string, token: string | undefined, now = new Date()) {
  const room = await findRoom(code);
  const already = token ? active(room).find((p) => p.token === token) : undefined;
  if (already) return { code, token: already.token, playerId: already.id };
  if (room.phase !== "lobby") throw new UserError("この部屋はもうゲームが始まっています");
  if (room.players.length >= MAX_PLAYERS) throw new UserError(`この部屋は満員です（${MAX_PLAYERS}人まで）`);
  const used = new Set(room.players.map((p) => p.seat));
  const seat = Array.from({ length: MAX_PLAYERS }, (_, i) => i + 1).find((s) => !used.has(s))!;
  const newT = newToken();
  try {
    const p = await prisma.drawBattlePlayer.create({ data: { roomCode: code, token: newT, seat, joinedAt: now } });
    await prisma.drawBattleRoom.update({ where: { code }, data: bump(now) });
    return { code, token: newT, playerId: p.id };
  } catch (e) {
    // 同時に参加して同じ席を取り合った
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new UserError("混み合っています。もう一度お試しください");
    throw e;
  }
}

/**
 * 退出（自分）またはホストによる取り消し。ホストが外せるのはロビーでのみ。
 * バトル中に抜けた人は、ほかの人の再生に絵が要るので印だけ付け、ロビーに戻るときに消す
 */
export async function leaveRoom(code: string, token: string, targetId: string | undefined, now = new Date()) {
  const room = await findRoom(code);
  const self = me(room, token);
  const target = targetId ?? self.id;
  if (target !== self.id && self.id !== room.hostId) throw new UserError("ホストだけが操作できます");
  if (target === room.hostId) throw new UserError("ホストは退出できません");
  if (target !== self.id && room.phase !== "lobby") throw new UserError("ゲーム中は外せません");
  if (room.phase === "battle") await prisma.drawBattlePlayer.updateMany({ where: { id: target, roomCode: code }, data: { leftAt: now } });
  else await prisma.drawBattlePlayer.deleteMany({ where: { id: target, roomCode: code } });
  await prisma.drawBattleRoom.update({ where: { code }, data: bump(now) });
}

export const settingsInput = z.object({ cpuFill: z.boolean(), drawSeconds: z.union([z.literal(60), z.literal(90)]) });

export async function updateSettings(code: string, token: string, s: z.infer<typeof settingsInput>, now = new Date()) {
  const room = await findRoom(code);
  hostOnly(room, token);
  if (room.phase !== "lobby") throw new UserError("ゲーム中は変更できません");
  await prisma.drawBattleRoom.update({ where: { code }, data: { cpuFill: s.cpuFill, drawSeconds: s.drawSeconds, ...bump(now) } });
}

export async function startDrawing(code: string, token: string, now = new Date()) {
  const room = await findRoom(code);
  hostOnly(room, token);
  if (room.phase !== "lobby") throw new UserError("もう始まっています");
  if (room.players.length < 2 && !room.cpuFill) throw new UserError("2人以上そろうか、CPUで埋めるをONにしてください");
  const drawEndsAt = new Date(now.getTime() + COUNTDOWN_MS + room.drawSeconds * 1000);
  await prisma.$transaction([
    prisma.drawBattlePlayer.updateMany({ where: { roomCode: code }, data: { name: null, drawing: null } }),
    prisma.drawBattleRoom.update({ where: { code }, data: { phase: "drawing", drawEndsAt, battle: null, ...bump(now) } }),
  ]);
}

export const submitInput = z.object({ name: z.string().max(60), drawing: dataUrl });

export async function submitDrawing(code: string, token: string, s: z.infer<typeof submitInput>, now = new Date()) {
  const room = await findRoom(code);
  const p = me(room, token);
  if (room.phase !== "drawing") throw new UserError("いまは提出できません");
  if (room.drawEndsAt && now.getTime() > room.drawEndsAt.getTime() + SUBMIT_GRACE_MS) throw new UserError("時間切れです");
  const name = cleanName(s.name);
  await prisma.drawBattlePlayer.update({ where: { id: p.id }, data: { name, drawing: s.drawing } });
  await prisma.drawBattleRoom.update({ where: { code }, data: bump(now) });
  return { name };
}

// ---- 対戦結果（ホストが計算して送る） ----
const turnSchema = z.object({ by: z.enum(["a", "b"]), dmg: z.number().int().min(0).max(999), crit: z.boolean(), miss: z.boolean() });
const matchSchema = z.object({
  a: z.string().max(40).nullable(),
  b: z.string().max(40).nullable(),
  winner: z.string().max(40).nullable(),
  turns: z.array(turnSchema).max(100),
});
// 能力はホストの端末の appraise() が決める（いまは全員同じ。後からAI鑑定に差し替えられる）
const stat = z.number().int().min(1).max(999);
const statsSchema = z.object({ hp: stat, attack: stat, defense: stat, speed: stat, luck: stat });
export const battleInput = z.object({
  entrants: z
    .array(z.object({ id: z.string().max(40), name: z.string().max(60), cpu: z.boolean(), img: dataUrl.optional(), stats: statsSchema }))
    .min(2)
    .max(MAX_PLAYERS),
  rounds: z.array(z.array(matchSchema).min(1).max(4)).min(1).max(3),
});
export type BattleInput = z.infer<typeof battleInput>;

/** 対戦表の中身を確かめる：出場者は重ならず、勝者は対戦した2人のどちらか、次の回戦は前の回戦の勝者どうし */
function assertBattle(room: Room, b: BattleInput) {
  const ids = b.entrants.map((e) => e.id);
  const bad = () => new UserError("対戦データが正しくありません");
  if (new Set(ids).size !== ids.length) throw bad();
  for (const e of b.entrants) {
    const human = room.players.find((p) => p.id === e.id);
    if (e.cpu ? human || !e.img : !human) throw bad();
    // 提出がなかった人の分だけ、ホストがCPUの絵で代わりを作る（提出済みの人の絵は上書きさせない）
    if (!e.cpu && !!human!.drawing === !!e.img) throw bad();
  }
  if (!active(room).every((p) => ids.includes(p.id))) throw bad();
  let alive: (string | null)[] = [...ids];
  for (const round of b.rounds) {
    const seen = round.flatMap((m) => [m.a, m.b]).filter((x): x is string => x !== null);
    const expected = alive.filter((x): x is string => x !== null);
    if (seen.length !== expected.length || !expected.every((x) => seen.includes(x))) throw bad();
    alive = round.map((m) => {
      if (m.a === null && m.b === null) throw bad();
      if (m.winner !== m.a && m.winner !== m.b) throw bad();
      if (m.a !== null && m.b !== null && m.turns.length === 0) throw bad();
      return m.winner;
    });
  }
  if (alive.length !== 1) throw bad();
}

export async function saveBattle(code: string, token: string, b: BattleInput, now = new Date()) {
  const room = await findRoom(code);
  hostOnly(room, token);
  if (room.phase !== "drawing") throw new UserError("いまは対戦を始められません");
  const allIn = active(room).every((p) => p.drawing);
  const timeUp = room.drawEndsAt && now.getTime() >= room.drawEndsAt.getTime() + SUBMIT_GRACE_MS;
  if (!allIn && !timeUp) throw new UserError("まだ全員そろっていません");
  assertBattle(room, b);
  // 参加者のキャラ名はサーバーに提出されたものを使う（未提出ならランダムな名前）
  const entrants = b.entrants.map((e) => (e.cpu ? { ...e, name: cleanName(e.name) } : { ...e, name: room.players.find((p) => p.id === e.id)!.name ?? randomName() }));
  const battle = JSON.stringify({ ...b, entrants, startAt: now.getTime() + BATTLE_LEAD_MS });
  // ホストの端末から二重に送られても、最初の1回だけ有効
  const r = await prisma.drawBattleRoom.updateMany({ where: { code, phase: "drawing" }, data: { phase: "battle", battle, ...bump(now) } });
  if (r.count === 0) throw new UserError("もう対戦が始まっています");
}

/** もう一度遊ぶ（同じメンバーでロビーに戻る） */
export async function backToLobby(code: string, token: string, now = new Date()) {
  const room = await findRoom(code);
  hostOnly(room, token);
  await prisma.$transaction([
    prisma.drawBattlePlayer.deleteMany({ where: { roomCode: code, leftAt: { not: null } } }),
    prisma.drawBattlePlayer.updateMany({ where: { roomCode: code }, data: { name: null, drawing: null } }),
    prisma.drawBattleRoom.update({ where: { code }, data: { phase: "lobby", drawEndsAt: null, battle: null, ...bump(now) } }),
  ]);
}

/** 端末に返す部屋の様子。version が since と同じなら中身は省く。token は本人のものしか返さない */
export async function roomView(code: string, token: string, since: number | undefined, joinUrl: string, now = new Date()) {
  const head = await prisma.drawBattleRoom.findUnique({ where: { code }, select: { version: true } });
  if (!head) throw new UserError("部屋が見つかりません。ルームコードを確かめてください");
  if (since !== undefined && since === head.version) return { same: true as const, version: head.version, serverNow: now.getTime() };
  const room = await findRoom(code);
  const self = me(room, token);
  // ホストは対戦を作るとき（能力の鑑定）に絵と名前を使うので、お絵描き中も受け取る
  const isHost = self.id === room.hostId;
  const showDrawings = room.phase === "battle" || (room.phase === "drawing" && isHost);
  return {
    same: false as const,
    version: room.version,
    serverNow: now.getTime(),
    code: room.code,
    phase: room.phase,
    cpuFill: room.cpuFill,
    drawSeconds: room.drawSeconds,
    drawEndsAt: room.drawEndsAt?.getTime() ?? null,
    submitGraceMs: SUBMIT_GRACE_MS,
    joinUrl,
    qr: room.phase === "lobby" ? await QRCode.toString(joinUrl, { type: "svg", margin: 1 }) : null,
    me: { id: self.id, seat: self.seat, isHost, submitted: !!self.drawing },
    players: active(room).map((p) => ({
      id: p.id,
      seat: p.seat,
      isHost: p.id === room.hostId,
      submitted: !!p.drawing,
      name: showDrawings ? p.name : null,
    })),
    battle: room.battle ? (JSON.parse(room.battle) as BattleInput & { startAt: number }) : null,
    drawings: showDrawings ? Object.fromEntries(room.players.filter((p) => p.drawing).map((p) => [p.id, p.drawing!])) : null,
  };
}
