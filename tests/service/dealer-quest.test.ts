import { beforeEach, describe, expect, it } from "vitest";
import { cleanName, leaderboard, scoreInput, submitScore, type ScoreInput } from "@/server/dealer-quest";
import { resetDb } from "../helpers";

beforeEach(resetDb);

const score = (playerId: string, tables: number, extra: Partial<ScoreInput> = {}): ScoreInput => ({
  playerId: playerId.padEnd(20, "0"), name: playerId, tables, cards: tables * 16 + 3, rate: 90, perfectRate: 30, maxCombo: 10, ...extra,
});

describe("ディーラークエストのランキング", () => {
  it("テーブル数→パーフェクト率→枚数の順に並び、playerId は返さない", async () => {
    await submitScore(score("aaa", 3));
    await submitScore(score("bbb", 5));
    await submitScore(score("ccc", 5, { perfectRate: 60 }));
    const board = await leaderboard("ccc".padEnd(20, "0"));
    expect(board.total).toBe(3);
    expect(board.rows.map((r) => [r.rank, r.name, r.me])).toEqual([[1, "ccc", true], [2, "bbb", false], [3, "aaa", false]]);
    expect(JSON.stringify(board)).not.toContain("aaa0000");
  });

  it("自己ベストを下回る記録では上書きせず、名前だけ更新する", async () => {
    await submitScore(score("aaa", 4));
    const r = await submitScore(score("aaa", 2, { name: "新しい名前" }));
    expect(r.improved).toBe(false);
    const board = await leaderboard();
    expect(board.rows[0]).toMatchObject({ tables: 4, name: "新しい名前" });
  });

  it("テーブル数と枚数が矛盾する記録は受け付けない", async () => {
    await expect(submitScore(score("aaa", 5, { cards: 40 }))).rejects.toThrow("記録が正しくありません");
    await expect(submitScore(score("aaa", 1, { cards: 40 }))).rejects.toThrow("記録が正しくありません");
    expect(scoreInput.safeParse({ ...score("aaa", 0), cards: 0 }).success).toBe(false);
  });

  it("同じ接続元からの新規登録は1時間20人まで（既存プレイヤーの更新は制限しない）", async () => {
    for (let i = 0; i < 20; i++) await submitScore(score(`ip${i}x`, 1), "1.2.3.4");
    await expect(submitScore(score("ip20x", 1), "1.2.3.4")).rejects.toThrow("登録が多すぎます");
    await expect(submitScore(score("ip0x", 2), "1.2.3.4")).resolves.toMatchObject({ improved: true });
    await expect(submitScore(score("other", 1), "5.6.7.8")).resolves.toMatchObject({ improved: true });
  });

  it("名前は12文字まで、空なら既定名、制御文字は除く", () => {
    expect(cleanName("  ")).toBe("名無しのディーラー");
    expect(cleanName("a\u0000b\u202ec")).toBe("abc");
    expect(cleanName("１２３４５６７８９０１２３４")).toHaveLength(12);
  });
});
