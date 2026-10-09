import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { runDaily } from "@/server/cron";
import { issueLinkCode } from "@/server/line/link";
import { handleText } from "@/server/line/commands";
import { verifySignature } from "@/server/line/client";
import { dispatchPending } from "@/server/notify";
import { extendDeadline, openCollection, periodOverview } from "@/server/shifts/periods";
import { requestForm, submitRequest } from "@/server/shifts/requests";
import { publishPeriod } from "@/server/shifts/publish";
import { createStaffToken, verifyStaffToken } from "@/server/staff-link";
import { punch } from "@/server/punch";
import { makeEmployee, resetDb, t } from "../helpers";

beforeEach(resetDb);

async function linked(name: string, lineUserId: string, now = t("2026-10-10 12:00")) {
  const e = await makeEmployee(name);
  const code = await issueLinkCode(e.id, now);
  await handleText(lineUserId, code.code, name, now);
  return e;
}

describe("LINE連携", () => {
  it("連携コードで紐付く。全角数字も可。使用済み・期限切れは不可", async () => {
    const e = await makeEmployee("山田");
    const now = t("2026-10-10 12:00");
    const code = await issueLinkCode(e.id, now);
    const zenkaku = code.code.replace(/\d/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0xfee0));
    expect(await handleText("U1", ` ${zenkaku} `, "やまだ", now)).toContain("山田さんのLINE連携が完了");
    expect(await prisma.lineAccount.findFirst()).toMatchObject({ employeeId: e.id, lineUserId: "U1", displayName: "やまだ" });
    expect(await handleText("U2", code.code, "", now)).toContain("正しくない");

    const code2 = await issueLinkCode(e.id, now);
    expect(await handleText("U3", code2.code, "", t("2026-10-11 12:01"))).toContain("有効期限");
  });

  it("未連携ユーザーにはコード送信を案内", async () => {
    expect(await handleText("Unknown", "シフト確認")).toContain("連携コード");
  });

  it("署名検証", () => {
    process.env.LINE_CHANNEL_SECRET = "line-secret";
    const body = '{"events":[]}';
    const sig = createHmac("sha256", "line-secret").update(body).digest("base64");
    expect(verifySignature(body, sig)).toBe(true);
    expect(verifySignature(body + " ", sig)).toBe(false);
    expect(verifySignature(body, null)).toBe(false);
  });
});

describe("本人専用リンク", () => {
  it("改ざん・用途違い・期限切れは無効", () => {
    const now = t("2026-10-13 10:00");
    const token = createStaffToken("emp1", "submit", now);
    expect(verifyStaffToken(token, "submit", now)).toBe("emp1");
    expect(verifyStaffToken(token, "me", now)).toBeNull();
    expect(verifyStaffToken(token.slice(0, -2) + "xx", "submit", now)).toBeNull();
    expect(verifyStaffToken(token, "submit", t("2026-11-13 10:01"))).toBeNull();
  });
});

describe("シフト提出フロー（13日依頼 → 16日リマインド → 17日締切）", () => {
  it("cron は何度動いても二重送信しない", async () => {
    const a = await linked("A", "UA");
    await makeEmployee("B（LINE未連携）");

    const r1 = await runDaily(t("2026-10-13 10:00"));
    expect(r1.ym).toBe("2026-11");
    expect(r1.log.join()).toContain("受付開始・提出依頼 2件");
    await runDaily(t("2026-10-13 11:00"));
    expect(await prisma.notification.count({ where: { kind: "SHIFT_REQUEST" } })).toBe(2);

    const sent = await prisma.notification.findFirstOrThrow({ where: { employeeId: a.id } });
    expect(sent.status).toBe("SENT");
    expect(sent.body).toContain("/s/");
    expect(sent.body).toContain("10/17(土) 23:59");
    const skipped = await prisma.notification.findFirstOrThrow({ where: { employeeId: { not: a.id } } });
    expect(skipped).toMatchObject({ status: "SKIPPED", error: "LINE未連携" });

    const period = await prisma.shiftPeriod.findUniqueOrThrow({ where: { yearMonth: "2026-11" } });
    expect(period.status).toBe("COLLECTING");
  });

  it("12日以前は何もしない", async () => {
    await linked("A", "UA");
    await runDaily(t("2026-10-12 10:00"));
    expect(await prisma.shiftPeriod.count()).toBe(0);
  });

  it("リマインドは未提出者だけ。締切後は提出不可・自動で受付終了", async () => {
    const a = await linked("A", "UA");
    const b = await linked("B", "UB");
    await runDaily(t("2026-10-13 10:00"));

    await submitRequest(a.id, "2026-11", { days: [{ date: "2026-11-03", availability: "OK" }], comment: "" }, "STAFF", t("2026-10-14 10:00"));
    await runDaily(t("2026-10-16 10:00"));
    const reminders = await prisma.notification.findMany({ where: { kind: "SHIFT_REMINDER" } });
    expect(reminders.map((r) => r.employeeId)).toEqual([b.id]);

    // 締切 10/17 23:59 まで提出可
    await submitRequest(b.id, "2026-11", { days: [], comment: "" }, "STAFF", t("2026-10-17 23:59"));
    await expect(
      submitRequest(b.id, "2026-11", { days: [], comment: "" }, "STAFF", t("2026-10-18 00:00")),
    ).rejects.toThrow("提出期間外");
    // 管理者の代理入力はできる
    await submitRequest(b.id, "2026-11", { days: [{ date: "2026-11-05", availability: "OK" }], comment: "電話で聞いた" }, "ADMIN", t("2026-10-18 09:00"));

    await runDaily(t("2026-10-18 10:00"));
    expect((await prisma.shiftPeriod.findUniqueOrThrow({ where: { yearMonth: "2026-11" } })).status).toBe("CLOSED");

    const overview = await periodOverview("2026-11");
    expect(overview).toMatchObject({ submittedCount: 2, total: 2, rate: 100 });
  });

  it("未入力日・店休日は「不可」として保存される", async () => {
    const a = await makeEmployee("A");
    await prisma.calendarDay.create({ data: { date: "2026-11-10", isClosed: true } });
    await openCollection("2026-11", t("2026-10-13 10:00"));
    const r = await submitRequest(
      a.id,
      "2026-11",
      { days: [{ date: "2026-11-09", availability: "OK" }, { date: "2026-11-10", availability: "OK" }], comment: "" },
      "STAFF",
      t("2026-10-14 10:00"),
    );
    expect(r.okDays).toBe(1);
    const form = await requestForm(a.id, "2026-11", t("2026-10-14 10:00"));
    expect(form.days).toHaveLength(30);
    expect(form.days.find((d) => d.date === "2026-11-10")).toMatchObject({ closed: true, availability: "NG" });
    expect(form.days.find((d) => d.date === "2026-11-01")?.availability).toBe("NG");
  });

  it("不正な入力は拒否", async () => {
    const a = await makeEmployee("A");
    await openCollection("2026-11", t("2026-10-13 10:00"));
    const now = t("2026-10-14 10:00");
    await expect(submitRequest(a.id, "2026-11", { days: [{ date: "2026-12-01", availability: "OK" }], comment: "" }, "STAFF", now)).rejects.toThrow("対象月以外");
    await expect(
      submitRequest(a.id, "2026-11", { days: [{ date: "2026-11-01", availability: "OK", startTime: "25:00", endTime: "26:00" }], comment: "" }, "STAFF", now),
    ).rejects.toThrow("時刻");
  });

  it("締切延長で受付を再開できる", async () => {
    await makeEmployee("A");
    await openCollection("2026-11", t("2026-10-13 10:00"));
    await runDaily(t("2026-10-18 10:00"));
    const p = await extendDeadline("2026-11", "2026-10-19", t("2026-10-18 11:00"));
    expect(p.status).toBe("COLLECTING");
  });
});

describe("シフト公開と通知", () => {
  async function setup() {
    const a = await linked("A", "UA");
    const b = await linked("B", "UB");
    await openCollection("2026-11", t("2026-10-13 10:00"));
    const period = await prisma.shiftPeriod.update({ where: { yearMonth: "2026-11" }, data: { status: "DRAFT" } });
    const assign = (employeeId: string, date: string) =>
      prisma.shiftAssignment.create({ data: { periodId: period.id, employeeId, date, startTime: "20:00", endTime: "05:00" } });
    return { a, b, period, assign };
  }

  it("初回公開は全員へ、再公開は変更があった人だけへ通知", async () => {
    const { a, b, assign } = await setup();
    await assign(a.id, "2026-11-01");
    await assign(b.id, "2026-11-02");
    const r1 = await publishPeriod("2026-11", { name: "店長" }, t("2026-10-20 12:00"));
    expect(r1).toEqual({ version: 1, notified: 2 });
    const msgA = await prisma.notification.findFirstOrThrow({ where: { kind: "SHIFT_PUBLISHED", employeeId: a.id } });
    expect(msgA.body).toContain("11/1(日) 20:00-翌05:00");

    await prisma.shiftAssignment.deleteMany({ where: { employeeId: b.id } });
    await assign(b.id, "2026-11-03");
    const r2 = await publishPeriod("2026-11", { name: "店長" }, t("2026-10-21 12:00"));
    expect(r2).toEqual({ version: 2, notified: 1 });
    const change = await prisma.notification.findFirstOrThrow({ where: { kind: "SHIFT_CHANGED" } });
    expect(change.employeeId).toBe(b.id);
    expect(change.body).toContain("＋追加\n11/3(火)");
    expect(change.body).toContain("－取消\n11/2(月)");

    await dispatchPending();
    expect(await prisma.notification.count({ where: { status: "SENT" } })).toBe(await prisma.notification.count());
  });

  it("LINEで確定シフト・勤務時間・提出リンクを確認できる", async () => {
    const { a, assign } = await setup();
    await assign(a.id, "2026-11-01");
    expect(await handleText("UA", "シフト確認", "", t("2026-10-20 12:00"))).toContain("公開されている確定シフトはまだありません");
    await publishPeriod("2026-11", { name: "店長" }, t("2026-10-20 12:00"));
    const shifts = await handleText("UA", "シフト確認", "", t("2026-10-20 12:00"));
    expect(shifts).toContain("2026年11月（1日）");
    expect(shifts).toContain("/me/");

    await punch({ employeeId: a.id, type: "CLOCK_IN", source: "KIOSK", now: t("2026-10-19 20:00") });
    await punch({ employeeId: a.id, type: "CLOCK_OUT", source: "KIOSK", now: t("2026-10-20 01:30") });
    expect(await handleText("UA", "勤務時間", "", t("2026-10-20 12:00"))).toContain("実働時間：5時間30分");

    expect(await handleText("UA", "シフト提出", "", t("2026-10-20 12:00"))).toContain("受付期間ではありません");
  });

  it("受付中は公開できない", async () => {
    await makeEmployee("A");
    await openCollection("2026-11", t("2026-10-13 10:00"));
    await expect(publishPeriod("2026-11", { name: "店長" })).rejects.toThrow("受付を終了してから");
  });
});
