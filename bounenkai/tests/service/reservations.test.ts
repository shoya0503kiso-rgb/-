import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { cancelReservation, changePeople, createReservation, dayAvailability } from "@/server/reservations";

const now = new Date("2026-11-18T03:00:00Z");
const base = {
  groupType: "company",
  representative: "山田 太郎",
  companyName: "テスト株式会社",
  people: 20,
  phone: "090-1234-5678",
  email: "taro@example.com",
  date: "2026-12-04",
  startMin: 17 * 60,
  plan: "casino",
  extensionHours: 1,
  hors: true,
};

beforeEach(async () => {
  await prisma.notificationLog.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.dayLock.deleteMany();
});

describe("予約", () => {
  it("予約すると金額を計算し、LINE・メールを（未設定なので）記録する", async () => {
    const r = await createReservation(base, now);
    expect(r.estimate).toBe(180000);
    expect(r.code).toMatch(/^[A-Z0-9]{6}$/);
    const logs = await prisma.notificationLog.findMany();
    expect(logs.map((l) => `${l.channel}:${l.status}`).sort()).toEqual(["email:mock", "line:mock"]);
    const line = logs.find((l) => l.channel === "line")!;
    for (const s of ["12月4日", "17:00", "カジノプラン", "20名", "1時間", "あり", "180,000円", "山田 太郎", "テスト株式会社", "090-1234-5678"]) {
      expect(line.body).toContain(s);
    }
    const mail = logs.find((l) => l.channel === "email")!;
    expect(mail.body).toContain("キャンセル規定");
  });

  it("埋まった時間・はみ出す延長は断る", async () => {
    await createReservation(base, now); // 17:00〜20:00
    await expect(createReservation({ ...base, startMin: 20 * 60, extensionHours: 0 }, now)).rejects.toThrow("埋まって");
    await expect(createReservation({ ...base, startMin: 20 * 60 + 30, extensionHours: 2 }, now)).rejects.toThrow("最大1時間");
    const ok = await createReservation({ ...base, startMin: 20 * 60 + 30, extensionHours: 1 }, now);
    expect(ok.id).toBeTruthy();
    await expect(createReservation({ ...base, startMin: 22 * 60, extensionHours: 0 }, now)).rejects.toThrow();
  });

  it("同時に申し込まれても枠を超えない", async () => {
    const results = await Promise.allSettled([
      createReservation({ ...base, startMin: 19 * 60, extensionHours: 0 }, now),
      createReservation({ ...base, startMin: 19 * 60, extensionHours: 0 }, now),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("入力チェック", async () => {
    await expect(createReservation({ ...base, people: 7 }, now)).rejects.toThrow("8〜30名");
    await expect(createReservation({ ...base, companyName: "" }, now)).rejects.toThrow("会社名");
    await expect(createReservation({ ...base, date: "2026-11-19" }, now)).rejects.toThrow("受け付けていません");
    await expect(createReservation({ ...base, startMin: 17 * 60 + 15 }, now)).rejects.toThrow("スタート時間");
    await expect(createReservation({ ...base, email: "x" }, now)).rejects.toThrow("メール");
    const f = await createReservation({ ...base, groupType: "friends", companyName: "消える" }, now);
    expect(f.companyName).toBe("");
  });

  it("キャンセルすると枠が空く・人数変更で金額を計算し直す", async () => {
    const r = await createReservation({ ...base, extensionHours: 0, hors: false, plan: "basic" }, now);
    await changePeople(r.id, 15);
    expect((await prisma.reservation.findUnique({ where: { id: r.id } }))!.estimate).toBe(15 * 3800);
    await cancelReservation(r.id, now);
    const day = await dayAvailability(base.date, now);
    expect(day.slots.every((s) => s.available)).toBe(true);
  });
});
