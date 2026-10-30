import { beforeEach, describe, expect, it } from "vitest";
import { addSubmarine, adjustPoints, createMatch, deleteMatch, handleRedemption, redeem } from "@/server/admin-ops";
import { checkIn, checkinCode } from "@/server/checkin";
import { prisma } from "@/server/db";
import { playChinchiro, playJanken } from "@/server/games";
import { verifyLineIdToken } from "@/server/line";
import { recordTaps } from "@/server/mochi";
import { gameRanking, myRankings, submarineRanking } from "@/server/rankings";
import { getSettings } from "@/server/settings";
import { jst, makeMember, resetDb, seq } from "../helpers";

const NIGHT = jst("2026-10-30 22:00"); // 営業日 2026-10-30
const LATE = jst("2026-10-31 03:00"); // 切替前なので同じ営業日
const NEXT = jst("2026-10-31 20:00"); // 営業日 2026-10-31

async function balance(id: string) {
  const m = await prisma.member.findUniqueOrThrow({ where: { id } });
  const sum = await prisma.pointTransaction.aggregate({ where: { memberId: id }, _sum: { amount: true } });
  // 残高と履歴の合計は常に一致する
  expect(sum._sum.amount ?? 0).toBe(m.points);
  return m.points;
}

beforeEach(async () => {
  await resetDb();
  await getSettings(); // 初期値（ランク・順位ポイント・交換メニュー）も入る
});

describe("QRチェックイン", () => {
  it("今日のコードで来店記録・スタンプ・ポイント。1営業日1回まで", async () => {
    const m = await makeMember();
    const s = await getSettings();
    const r = await checkIn(m.id, checkinCode("2026-10-30", s.qrSalt), null, NIGHT);
    expect(r).toMatchObject({ points: 10, stampCount: 1, visitCount: 1, cardCompleted: false });
    await expect(checkIn(m.id, checkinCode("2026-10-30", s.qrSalt), null, LATE)).rejects.toThrow("チェックイン済み");
    // 翌営業日は新しいコード。前日のコードは使えない
    await expect(checkIn(m.id, checkinCode("2026-10-30", s.qrSalt), null, NEXT)).rejects.toThrow("使えません");
    await checkIn(m.id, checkinCode("2026-10-31", s.qrSalt), null, NEXT);
    expect(await balance(m.id)).toBe(20);
  });

  it("QRを作り直すと前のコードは使えない", async () => {
    const m = await makeMember();
    const old = checkinCode("2026-10-30", "1");
    await prisma.storeSetting.update({ where: { id: 1 }, data: { qrSalt: "new" } });
    await expect(checkIn(m.id, old, null, NIGHT)).rejects.toThrow("使えません");
  });

  it("スタンプカード達成でボーナス・ランクアップ", async () => {
    const m = await makeMember("常連", { stampCount: 9, visitCount: 4 });
    const s = await getSettings();
    const r = await checkIn(m.id, checkinCode("2026-10-30", s.qrSalt), null, NIGHT);
    expect(r).toMatchObject({ cardCompleted: true, cardBonus: 100, stampCount: 10, rankName: "ブロンズ", rankUp: true });
    const after = await prisma.member.findUniqueOrThrow({ where: { id: m.id } });
    expect([after.stampCount, after.completedCards]).toEqual([0, 1]);
    expect(await balance(m.id)).toBe(110);
  });

  it("ポイント倍率デー（◯倍・来店◯pt）", async () => {
    const a = await makeMember("A");
    const s = await getSettings();
    await prisma.pointDay.create({ data: { date: "2026-10-30", mode: "multiply", value: 3 } });
    expect((await checkIn(a.id, checkinCode("2026-10-30", s.qrSalt), null, NIGHT)).points).toBe(30);
    await prisma.pointDay.create({ data: { date: "2026-10-31", mode: "fixed", value: 7 } });
    expect((await checkIn(a.id, checkinCode("2026-10-31", s.qrSalt), null, NEXT)).points).toBe(7);
  });

  it("位置情報チェック", async () => {
    const m = await makeMember();
    await prisma.storeSetting.update({ where: { id: 1 }, data: { geoEnabled: true, geoLat: 35.6812, geoLng: 139.7671, geoRadiusM: 300 } });
    const code = checkinCode("2026-10-30", "1");
    await expect(checkIn(m.id, code, null, NIGHT)).rejects.toThrow("位置情報");
    await expect(checkIn(m.id, code, { lat: 35.6751, lng: 139.763 }, NIGHT)).rejects.toThrow("お店の近く");
    await expect(checkIn(m.id, code, { lat: 35.6813, lng: 139.7672 }, NIGHT)).resolves.toMatchObject({ points: 10 });
  });
});

describe("デイリーゲーム", () => {
  it("じゃんけん：あいこはやり直し、勝ったらポイント、1日1回", async () => {
    const m = await makeMember();
    // 親の手：0.1 → グー
    const draw = await playJanken(m.id, "rock", NIGHT, seq(0.1));
    expect(draw.result).toBe("draw");
    const win = await playJanken(m.id, "paper", NIGHT, seq(0.1));
    expect(win).toMatchObject({ result: "win", points: 10 });
    await expect(playJanken(m.id, "paper", LATE, seq(0.1))).rejects.toThrow("もう遊びました");
    await expect(playChinchiro(m.id, LATE)).rejects.toThrow("もう遊びました");
    await expect(playJanken(m.id, "paper", NEXT, seq(0.5))).resolves.toMatchObject({ result: "lose", points: 0 });
    expect(await balance(m.id)).toBe(10);
  });

  it("チンチロ：役で勝つと役のポイント（倍率デーも反映）", async () => {
    const m = await makeMember();
    await prisma.pointDay.create({ data: { date: "2026-10-30", mode: "multiply", value: 2 } });
    const d = (n: number) => (n - 1) / 6 + 0.01;
    // 親 2,2,3（3の目）→ 子 4,5,6（シゴロ）
    const r = await playChinchiro(m.id, NIGHT, seq(d(2), d(2), d(3), d(4), d(5), d(6)));
    expect(r.result).toBe("win");
    expect(r.player.hand.name).toBe("シゴロ");
    expect(r.points).toBe(100);
    expect(await balance(m.id)).toBe(100);
  });
});

describe("もちもち連打", () => {
  it("タップ数を記録し、1日の当選上限を超えない", async () => {
    const m = await makeMember();
    await prisma.storeSetting.update({ where: { id: 1 }, data: { mochiWinOdds: 1, mochiWinPoints: 50, mochiDailyWinLimit: 1 } });
    const r1 = await recordTaps(m.id, 10, NIGHT, () => 0);
    expect(r1).toMatchObject({ accepted: 10, won: true, points: 50, total: 10, todayWins: 1 });
    const r2 = await recordTaps(m.id, 10, new Date(NIGHT.getTime() + 5000), () => 0);
    expect(r2).toMatchObject({ accepted: 10, won: false, total: 20 });
    // 翌営業日はまた当たる
    const r3 = await recordTaps(m.id, 5, NEXT, () => 0);
    expect(r3.won).toBe(true);
    expect(await balance(m.id)).toBe(100);
  });

  it("連打ツール対策：経過時間に対して多すぎるタップは受け付けない", async () => {
    const m = await makeMember();
    await recordTaps(m.id, 10, NIGHT, () => 0.99);
    const r = await recordTaps(m.id, 100, new Date(NIGHT.getTime() + 1000), () => 0.99);
    expect(r.accepted).toBeLessThanOrEqual(25);
    const big = await recordTaps(m.id, 5000, new Date(NIGHT.getTime() + 60_000), () => 0.99);
    expect(big.accepted).toBe(100);
  });
});

describe("ランキング・結果入力", () => {
  it("順位に応じてポイント付与・月間ランキング（同点は同順位）・取り消し", async () => {
    const [a, b, c] = await Promise.all([makeMember("A"), makeMember("B"), makeMember("C")]);
    const m1 = await createMatch({ game: "darts", date: "2026-10-30", title: "", entries: [{ memberId: a.id, place: 1 }, { memberId: b.id, place: 2 }, { memberId: c.id, place: 9 }] }, "admin");
    await createMatch({ game: "darts", date: "2026-10-31", title: "", entries: [{ memberId: b.id, place: 2 }] }, "admin");
    await createMatch({ game: "darts", date: "2026-11-01", title: "", entries: [{ memberId: c.id, place: 1 }] }, "admin");
    const oct = await gameRanking("darts", "2026-10");
    expect(oct.map((r) => [r.nickname, r.rank, r.value])).toEqual([
      ["A", 1, 100],
      ["B", 1, 100],
    ]);
    expect((await gameRanking("darts", "all")).find((r) => r.nickname === "C")?.value).toBe(100);
    expect(await gameRanking("poker", "2026-10")).toEqual([]);
    expect(await balance(a.id)).toBe(100);
    await deleteMatch(m1.id, "admin", NIGHT);
    expect(await balance(a.id)).toBe(0);
    expect((await gameRanking("darts", "2026-10")).map((r) => r.nickname)).toEqual(["B"]);
  });

  it("使ってしまったポイントがあると結果を取り消せない", async () => {
    const a = await makeMember("A");
    const m1 = await createMatch({ game: "poker", date: "2026-10-30", title: "", entries: [{ memberId: a.id, place: 1 }] }, "admin");
    await adjustPoints(a.id, -60, "テスト", "admin", NIGHT);
    await expect(deleteMatch(m1.id, "admin", NIGHT)).rejects.toThrow("取り消せません");
    expect(await prisma.match.count()).toBe(1);
    expect(await balance(a.id)).toBe(40);
  });

  it("同じ会員の重複・順位の不正は登録しない", async () => {
    const a = await makeMember("A");
    await expect(createMatch({ game: "darts", date: "2026-10-30", title: "", entries: [{ memberId: a.id, place: 1 }, { memberId: a.id, place: 2 }] }, "x")).rejects.toThrow("2回");
    await expect(createMatch({ game: "darts", date: "2026-13-01", title: "", entries: [{ memberId: a.id, place: 1 }] }, "x")).rejects.toThrow("日付");
  });

  it("サブマリンは月ごと。0杯からは減らせない", async () => {
    const [a, b] = await Promise.all([makeMember("A"), makeMember("B")]);
    await addSubmarine(a.id, 1, "admin", NIGHT);
    await addSubmarine(a.id, 1, "admin", LATE);
    await addSubmarine(b.id, 1, "admin", NIGHT);
    await addSubmarine(b.id, -1, "admin", NIGHT);
    await expect(addSubmarine(b.id, -1, "admin", NIGHT)).rejects.toThrow("杯数は0");
    // 11/1 の営業日 → 11月に数える
    await addSubmarine(b.id, 1, "admin", jst("2026-11-01 21:00"));
    expect((await submarineRanking("2026-10")).map((r) => [r.nickname, r.value])).toEqual([["A", 2]]);
    expect((await submarineRanking("2026-11")).map((r) => [r.nickname, r.value])).toEqual([["B", 1]]);
    expect((await myRankings(a.id, "2026-10")).submarine).toEqual({ rank: 1, value: 2, of: 1 });
  });
});

describe("ポイント", () => {
  it("手動の付与・減算（残高はマイナスにしない）", async () => {
    const a = await makeMember();
    await adjustPoints(a.id, 50, "誕生日", "admin", NIGHT);
    await expect(adjustPoints(a.id, -51, "ミス", "admin", NIGHT)).rejects.toThrow("足りません");
    await expect(adjustPoints(a.id, 10, " ", "admin", NIGHT)).rejects.toThrow("理由");
    await adjustPoints(a.id, -50, "ミス", "admin", NIGHT);
    expect(await balance(a.id)).toBe(0);
  });

  it("交換 → 提供済み / 取消でポイントを戻す（二重処理しない）", async () => {
    const a = await makeMember("A", {});
    await adjustPoints(a.id, 1000, "テスト", "admin", NIGHT);
    const reward = await prisma.reward.findFirstOrThrow({ orderBy: { cost: "asc" } });
    const r1 = await redeem(a.id, reward.id, NIGHT);
    const r2 = await redeem(a.id, reward.id, NIGHT);
    expect(await balance(a.id)).toBe(1000 - reward.cost * 2);
    await handleRedemption(r1.id, "done", "admin", NIGHT);
    await handleRedemption(r2.id, "cancel", "admin", NIGHT);
    await expect(handleRedemption(r2.id, "cancel", "admin", NIGHT)).rejects.toThrow("処理済み");
    expect(await balance(a.id)).toBe(1000 - reward.cost);
    await adjustPoints(a.id, -(1000 - reward.cost), "テスト", "admin", NIGHT);
    await expect(redeem(a.id, reward.id, NIGHT)).rejects.toThrow("足りません");
  });
});

describe("LINE ログイン（IDトークン検証）", () => {
  it("LINE のサーバーで検証してユーザーIDを得る", async () => {
    process.env.LINE_LOGIN_CHANNEL_ID = "12345";
    const calls: string[] = [];
    const fake = (async (_url: string, init: RequestInit) => {
      calls.push(String(init.body));
      return new Response(JSON.stringify({ sub: "U123", name: "もち太" }), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(verifyLineIdToken("tok", fake)).resolves.toEqual({ userId: "U123", name: "もち太" });
    expect(calls[0]).toContain("client_id=12345");
    const bad = (async () => new Response("{}", { status: 400 })) as unknown as typeof fetch;
    await expect(verifyLineIdToken("tok", bad)).rejects.toThrow("確認できません");
    delete process.env.LINE_LOGIN_CHANNEL_ID;
  });
});
