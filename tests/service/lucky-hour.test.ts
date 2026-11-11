import { beforeEach, describe, expect, it } from "vitest";
import { acquireLock, checkPin, checkSyncKey, issueSyncKey, ringEvent, setPin, view, writeDoc } from "@/server/lucky-hour";
import { resetDb } from "../helpers";

type View = { version: number; pinSet: boolean; docs?: Record<string, unknown> };

beforeEach(resetDb);

const at = (ms: number) => new Date(Date.UTC(2026, 10, 4, 12) + ms);

describe("ラッキーアワーの共有データ", () => {
  it("PINは最初の1回だけ決められ、違うPINは通らない", async () => {
    expect((await view()).pinSet).toBe(false);
    await expect(checkPin("1234", "1.1.1.1", at(0))).rejects.toThrow("まだ決まっていません");
    await setPin("1234");
    await expect(setPin("9999")).rejects.toThrow("もう決まっています");
    await expect(checkPin("1234", "1.1.1.1", at(0))).resolves.toBeUndefined();
    await expect(checkPin("4321", "1.1.1.1", at(0))).rejects.toThrow("PINがちがいます");
    expect((await view()).pinSet).toBe(true);
  });

  it("続けて間違えると15分止まる", async () => {
    await setPin("1234");
    for (let i = 0; i < 5; i++) await expect(checkPin("0000", "2.2.2.2", at(i))).rejects.toThrow("PINがちがいます");
    await expect(checkPin("0000", "2.2.2.2", at(10))).rejects.toThrow("15分間");
  });

  it("書いた文書が配られ、番号が同じなら送り直さない", async () => {
    const first = (await view()) as View;
    expect(first).toMatchObject({ version: 0, docs: {} });
    const { version } = await writeDoc("players", { list: [{ id: "a", name: "たかし", active: true }] });
    await writeDoc("config", { title: "毎時ラッキーアワー", prizes: [] });
    const v2 = (await view(version)) as View;
    expect(v2.version).toBe(version + 1);
    expect(v2.docs).toMatchObject({ players: { list: [{ name: "たかし" }] }, config: { title: "毎時ラッキーアワー" } });
    expect(((await view(v2.version)) as View).docs).toBeUndefined();
  });

  it("配列や大きすぎる内容は保存しない", async () => {
    await expect(writeDoc("draw", [] as unknown)).rejects.toThrow("正しくありません");
    await expect(writeDoc("history", { items: "x".repeat(200_001) })).rejects.toThrow("大きすぎます");
  });

  it("自動抽選のロックは1台だけが取れ、期限が切れたら別の端末が取れる", async () => {
    expect(await acquireLock("tvAAAAAA", 8000, at(0))).toEqual({ acquired: true });
    expect(await acquireLock("tvBBBBBB", 8000, at(1000))).toEqual({ acquired: false });
    expect(await acquireLock("tvAAAAAA", 8000, at(2000))).toEqual({ acquired: true });
    expect(await acquireLock("tvBBBBBB", 8000, at(11_000))).toEqual({ acquired: true });
  });
});

describe("箱カルテ連携（リングの入退店）", () => {
  const players = async () => (((await view()) as View).docs?.players as { list: { name: string; active: boolean; karteId?: string }[] }).list;

  it("連携キーは発行したものだけが通り、作り直すと古いキーは使えない", async () => {
    await expect(checkSyncKey("x", "3.3.3.3", at(0))).rejects.toThrow("まだ発行されていません");
    const { key } = await issueSyncKey();
    await expect(checkSyncKey(key, "3.3.3.3", at(0))).resolves.toBeUndefined();
    await expect(checkSyncKey("ちがう", "3.3.3.3", at(0))).rejects.toThrow("ちがいます");
    const { key: key2 } = await issueSyncKey();
    await expect(checkSyncKey(key, "3.3.3.3", at(1))).rejects.toThrow("ちがいます");
    await expect(checkSyncKey(key2, "3.3.3.3", at(1))).resolves.toBeUndefined();
  });

  it("入店で着席に追加、退店で外れる。手入力の人には同じ名前なら紐付き、退店後も手入力の人は残る", async () => {
    await writeDoc("players", { list: [{ id: "m1", name: "ゆうこ", active: false }, { id: "m2", name: "まさる", active: true }] });
    await ringEvent({ action: "enter", id: "K1", name: " たかし " });
    await ringEvent({ action: "enter", id: "K2", name: "ゆうこ" });
    expect(await players()).toEqual([
      { id: "m1", name: "ゆうこ", active: true, karteId: "K2" },
      { id: "m2", name: "まさる", active: true },
      expect.objectContaining({ name: "たかし", active: true, karteId: "K1" }),
    ]);
    await ringEvent({ action: "enter", id: "K1", name: "たかし" });
    expect((await players()).filter(p => p.karteId === "K1")).toHaveLength(1);
    await ringEvent({ action: "leave", id: "K1" });
    await ringEvent({ action: "leave", id: "K9" });
    expect((await players()).map(p => p.name)).toEqual(["ゆうこ", "まさる"]);
  });

  it("sync はリングにいる全員で置きかえ、いないカルテの人だけ外す", async () => {
    await ringEvent({ action: "enter", id: "K1", name: "たかし" });
    await ringEvent({ action: "enter", id: "K2", name: "ゆうこ" });
    await writeDoc("players", { list: [...(await players()), { id: "m", name: "手入力さん", active: true }] });
    const r = await ringEvent({ action: "sync", members: [{ id: "K2", name: "ゆうこ" }, { id: "K3", name: "えりか" }] });
    expect((await players()).map(p => p.name)).toEqual(["ゆうこ", "手入力さん", "えりか"]);
    expect(r).toMatchObject({ seated: 3, linked: 2 });
  });
});
