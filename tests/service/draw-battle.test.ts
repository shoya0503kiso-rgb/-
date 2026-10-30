import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  backToLobby, cleanName, createRoom, joinRoom, leaveRoom, roomView, saveBattle, startDrawing, submitDrawing, updateSettings,
  type BattleInput,
} from "@/server/draw-battle";
import { resetDb } from "../helpers";

beforeEach(resetDb);

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const URL = "http://localhost/drawing-battle?room=X";
const at = (ms: number) => new Date(Date.UTC(2026, 9, 30, 12) + ms);

async function roomWith(n: number) {
  const host = await createRoom("1.1.1.1", at(0));
  const others = [];
  for (let i = 1; i < n; i++) others.push(await joinRoom(host.code, undefined, at(0)));
  return { host, others };
}

/** a 対 b の一発勝負（a が勝つ） */
const duel = (a: string, b: string, extra: Partial<BattleInput> = {}): BattleInput => ({
  hp: 100,
  entrants: [{ id: a, name: "", cpu: false }, { id: b, name: "", cpu: false }],
  rounds: [[{ a, b, winner: a, turns: [{ by: "a", dmg: 100, crit: false, miss: false }] }]],
  ...extra,
});

describe("お絵描きバトルの部屋", () => {
  it("作成→参加→開始→提出→対戦で、全員に同じ対戦結果と絵が配られる", async () => {
    const { host, others: [guest] } = await roomWith(2);
    await updateSettings(host.code, host.token, { cpuFill: false, drawSeconds: 90 }, at(0));
    await startDrawing(host.code, host.token, at(1000));
    const drawing = await roomView(host.code, guest.token, undefined, URL, at(2000));
    expect(drawing).toMatchObject({ phase: "drawing", drawSeconds: 90, drawEndsAt: at(1000 + 3000 + 90_000).getTime() });

    await submitDrawing(host.code, host.token, { name: "  ドラゴン  ", drawing: PNG }, at(5000));
    await expect(saveBattle(host.code, host.token, duel(host.playerId, guest.playerId), at(6000))).rejects.toThrow("まだ全員そろっていません");
    const { name } = await submitDrawing(host.code, guest.token, { name: "", drawing: PNG }, at(7000));
    expect(name.length).toBeGreaterThan(0);

    await saveBattle(host.code, host.token, duel(host.playerId, guest.playerId), at(8000));
    const v = await roomView(host.code, guest.token, undefined, URL, at(9000));
    if (v.same) throw new Error("unexpected");
    expect(v.phase).toBe("battle");
    expect(v.battle!.startAt).toBe(at(8000).getTime() + 3000);
    expect(v.battle!.entrants.map((e) => e.name)).toEqual(["ドラゴン", name]);
    expect(v.drawings).toEqual({ [host.playerId]: PNG, [guest.playerId]: PNG });
    // 本人以外の token は返さない
    expect(JSON.stringify(v)).not.toContain(host.token);
  });

  it("version が変わっていなければ中身を返さない", async () => {
    const { host } = await roomWith(1);
    const v1 = await roomView(host.code, host.token, undefined, URL, at(0));
    if (v1.same) throw new Error("unexpected");
    expect(await roomView(host.code, host.token, v1.version, URL, at(0))).toMatchObject({ same: true });
    await joinRoom(host.code, undefined, at(0));
    expect(await roomView(host.code, host.token, v1.version, URL, at(0))).toMatchObject({ same: false });
  });

  it("参加は8人まで。同じ token なら同じ席に戻る。始まった部屋には入れない", async () => {
    const { host, others } = await roomWith(8);
    await expect(joinRoom(host.code, undefined)).rejects.toThrow("満員");
    expect((await joinRoom(host.code, others[0].token)).playerId).toBe(others[0].playerId);
    await leaveRoom(host.code, others[0].token, undefined);
    await startDrawing(host.code, host.token);
    await expect(joinRoom(host.code, undefined)).rejects.toThrow("始まっています");
  });

  it("ホスト以外は設定・開始・対戦の保存ができない。ホストは他の人を外せる", async () => {
    const { host, others: [a, b] } = await roomWith(3);
    await expect(updateSettings(host.code, a.token, { cpuFill: true, drawSeconds: 60 })).rejects.toThrow("ホストだけ");
    await expect(startDrawing(host.code, a.token)).rejects.toThrow("ホストだけ");
    await expect(leaveRoom(host.code, a.token, b.playerId)).rejects.toThrow("ホストだけ");
    await leaveRoom(host.code, host.token, b.playerId);
    expect(await prisma.drawBattlePlayer.count()).toBe(2);
    await expect(leaveRoom(host.code, a.token, host.playerId)).rejects.toThrow("ホストだけ");
  });

  it("1人で始められるのは CPU で埋めるときだけ", async () => {
    const { host } = await roomWith(1);
    await updateSettings(host.code, host.token, { cpuFill: false, drawSeconds: 60 });
    await expect(startDrawing(host.code, host.token)).rejects.toThrow("2人以上");
    await updateSettings(host.code, host.token, { cpuFill: true, drawSeconds: 60 });
    await startDrawing(host.code, host.token, at(0));
    await submitDrawing(host.code, host.token, { name: "ぼく", drawing: PNG }, at(1000));
    const battle: BattleInput = {
      hp: 100,
      entrants: [{ id: host.playerId, name: "", cpu: false }, { id: "cpu1", name: "らくがきン", cpu: true, img: PNG }],
      rounds: [[{ a: "cpu1", b: host.playerId, winner: host.playerId, turns: [{ by: "b", dmg: 100, crit: true, miss: false }] }]],
    };
    await saveBattle(host.code, host.token, battle, at(2000));
  });

  it("時間切れなら未提出の人がいても対戦を始められる（代わりの絵が必要）", async () => {
    const { host, others: [guest] } = await roomWith(2);
    await startDrawing(host.code, host.token, at(0));
    await submitDrawing(host.code, host.token, { name: "a", drawing: PNG }, at(1000));
    const late = at(3000 + 60_000 + 8000);
    await expect(submitDrawing(host.code, guest.token, { name: "b", drawing: PNG }, at(3000 + 60_000 + 9000))).rejects.toThrow("時間切れ");
    await expect(saveBattle(host.code, host.token, duel(host.playerId, guest.playerId), late)).rejects.toThrow("対戦データが正しくありません");
    const withSub = duel(host.playerId, guest.playerId);
    withSub.entrants[1].img = PNG;
    await saveBattle(host.code, host.token, withSub, late);
    // 二重送信は2回目を断る
    await expect(saveBattle(host.code, host.token, withSub, late)).rejects.toThrow();
  });

  it("矛盾した対戦表は受け付けない", async () => {
    const { host, others } = await roomWith(3);
    await updateSettings(host.code, host.token, { cpuFill: false, drawSeconds: 60 });
    await startDrawing(host.code, host.token, at(0));
    for (const p of [host, ...others]) await submitDrawing(host.code, p.token, { name: "x", drawing: PNG }, at(1000));
    const [a, b, c] = [host.playerId, others[0].playerId, others[1].playerId];
    const t = [{ by: "a" as const, dmg: 100, crit: false, miss: false }];
    const entrants = [a, b, c].map((id) => ({ id, name: "", cpu: false }));
    const good: BattleInput = {
      hp: 100, entrants,
      rounds: [[{ a, b, winner: b, turns: t }, { a: c, b: null, winner: c, turns: [] }], [{ a: b, b: c, winner: c, turns: t }]],
    };
    const bad = (rounds: BattleInput["rounds"]) => saveBattle(host.code, host.token, { ...good, rounds }, at(2000));
    // 負けた人が次の回戦に出ている
    await expect(bad([good.rounds[0], [{ a, b: c, winner: c, turns: t }]])).rejects.toThrow("正しくありません");
    // 対戦していない人が勝者
    await expect(bad([[{ a, b, winner: c, turns: t }, good.rounds[0][1]], good.rounds[1]])).rejects.toThrow("正しくありません");
    // 出場していない人がいる
    await expect(saveBattle(host.code, host.token, { ...good, entrants: entrants.slice(0, 2) }, at(2000))).rejects.toThrow("正しくありません");
    await saveBattle(host.code, host.token, good, at(2000));
  });

  it("もう一度遊ぶとロビーに戻り、提出した絵は消える", async () => {
    const { host, others: [guest] } = await roomWith(2);
    await startDrawing(host.code, host.token, at(0));
    await submitDrawing(host.code, host.token, { name: "a", drawing: PNG }, at(1000));
    await submitDrawing(host.code, guest.token, { name: "b", drawing: PNG }, at(1000));
    await saveBattle(host.code, host.token, duel(host.playerId, guest.playerId), at(2000));
    await backToLobby(host.code, host.token, at(3000));
    const v = await roomView(host.code, guest.token, undefined, URL, at(3000));
    expect(v).toMatchObject({ phase: "lobby", battle: null, drawings: null });
    expect(await prisma.drawBattlePlayer.count({ where: { drawing: { not: null } } })).toBe(0);
  });

  it("12時間たった部屋は消え、同じ接続元からの部屋作りは1時間30回まで", async () => {
    await createRoom("9.9.9.9", at(0));
    await createRoom("2.2.2.2", at(13 * 3600_000));
    expect(await prisma.drawBattleRoom.count()).toBe(1);
    for (let i = 0; i < 29; i++) await createRoom("2.2.2.2", at(13 * 3600_000));
    await expect(createRoom("2.2.2.2", at(13 * 3600_000))).rejects.toThrow("作りすぎ");
    await expect(createRoom("3.3.3.3", at(13 * 3600_000))).resolves.toBeTruthy();
  });

  it("キャラ名は10文字まで、空ならランダム", () => {
    expect(cleanName("１２３４５６７８９０１２")).toHaveLength(10);
    expect(cleanName("   ").length).toBeGreaterThan(1);
  });
});
