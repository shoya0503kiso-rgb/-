// Phase 2 レビュー指摘の回帰テスト
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { runDaily } from "@/server/cron";
import { handleText } from "@/server/line/commands";
import { issueLinkCode, linkByCode, unlinkLine } from "@/server/line/link";
import { dispatchPending, enqueue } from "@/server/notify";
import { punch } from "@/server/punch";
import { updateSettings } from "@/server/settings";
import { extendDeadline, getOrCreatePeriod, openCollection } from "@/server/shifts/periods";
import { publishPeriod } from "@/server/shifts/publish";
import { requestForm, submitRequest } from "@/server/shifts/requests";
import { getSettings } from "@/server/settings";
import { createStaffToken, resolveStaffToken } from "@/server/staff-link";
import { makeEmployee, resetDb, t } from "../helpers";

beforeEach(resetDb);

async function linked(name: string, lineUserId: string, now = t("2026-10-10 12:00")) {
  const e = await makeEmployee(name);
  const code = await issueLinkCode(e.id, now);
  await handleText(lineUserId, code.code, name, now);
  return prisma.employee.findUniqueOrThrow({ where: { id: e.id } });
}

describe("Phase 2 レビュー指摘", () => {
  it("A-1: 閉店後に片付けて遅く退勤しても勤怠は1件", async () => {
    const e = await makeEmployee("片付け");
    await punch({ employeeId: e.id, type: "CLOCK_IN", source: "KIOSK", now: t("2026-10-12 20:00") });
    await punch({ employeeId: e.id, type: "CLOCK_OUT", source: "KIOSK", now: t("2026-10-13 07:30") });
    const sessions = await prisma.workSession.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].clockOut).not.toBeNull();
  });

  it("B1: 締切を対象月に延長しても LINE から提出リンクが届き、リマインドも出る", async () => {
    const a = await linked("A", "UA");
    await openCollection("2026-11", t("2026-10-13 10:00"));
    await extendDeadline("2026-11", "2026-11-03", t("2026-10-16 10:00"));
    const reply = await handleText("UA", "シフト提出", "", t("2026-11-01 12:00"));
    expect(reply).toContain("2026年11月の希望シフト");
    await runDaily(t("2026-11-01 10:00"));
    expect(await prisma.notification.count({ where: { employeeId: a.id, dedupeKey: `SHIFT_REMINDER:2026-11:${a.id}` } })).toBe(1);
  });

  it("B2: 送信処理が同時に動いても同じ通知は1回だけ送る", async () => {
    const a = await linked("A", "UA");
    await enqueue({ employeeId: a.id, kind: "TEXT", title: "t", body: "b", dedupeKey: "x" });
    const [r1, r2] = await Promise.all([dispatchPending(), dispatchPending()]);
    expect(r1.sent + r2.sent).toBe(1);
    expect((await prisma.notification.findUniqueOrThrow({ where: { dedupeKey: "x" } })).attempts).toBe(1);
  });

  it("B3: 停止した枠を含む希望も出し直せる", async () => {
    const a = await makeEmployee("A");
    const p = await prisma.shiftPattern.create({ data: { name: "早番", startTime: "15:00", endTime: "23:00" } });
    await openCollection("2026-11", t("2026-10-13 10:00"));
    await submitRequest(a.id, "2026-11", { days: [{ date: "2026-11-02", availability: "OK", patternId: p.id }], comment: "" }, "STAFF", t("2026-10-14 10:00"));
    await prisma.shiftPattern.update({ where: { id: p.id }, data: { active: false } });
    const form = await requestForm(a.id, "2026-11", t("2026-10-15 10:00"));
    expect(form.removedPatternDays).toEqual(["2026-11-02"]);
    const days = form.days.filter((d) => d.availability).map((d) => ({ date: d.date, availability: d.availability!, patternId: d.patternId }));
    await expect(submitRequest(a.id, "2026-11", { days, comment: "" }, "STAFF", t("2026-10-15 10:00"))).resolves.toBeTruthy();
  });

  it("B5: 初回の確定通知が届いていない人には、再公開時に全文を送る", async () => {
    const a = await linked("A", "UA");
    const b = await linked("B", "UB");
    await openCollection("2026-11", t("2026-10-13 10:00"));
    const period = await prisma.shiftPeriod.update({ where: { yearMonth: "2026-11" }, data: { status: "DRAFT" } });
    await prisma.shiftAssignment.create({ data: { periodId: period.id, employeeId: b.id, date: "2026-11-02", startTime: "20:00", endTime: "05:00" } });
    await publishPeriod("2026-11", { name: "店長" }, t("2026-10-20 12:00"));
    // B への初回通知が失われたとする
    await prisma.notification.deleteMany({ where: { dedupeKey: `SHIFT_PUBLISHED:2026-11:v1:${b.id}` } });
    await publishPeriod("2026-11", { name: "店長" }, t("2026-10-21 12:00"));
    const toB = await prisma.notification.findFirstOrThrow({ where: { employeeId: b.id, kind: "SHIFT_PUBLISHED" } });
    expect(toB.body).toContain("11/2(月)");
    expect(await prisma.notification.count({ where: { employeeId: a.id, kind: { in: ["SHIFT_PUBLISHED", "SHIFT_CHANGED"] } } })).toBe(1);
  });

  it("B6: 受付前の期間は締切日の設定変更に追従。手動変更後は追従しない", async () => {
    await getOrCreatePeriod("2026-11");
    const s = await getSettings();
    const { id: _id, updatedAt: _u, ...rest } = s;
    void _id;
    void _u;
    await updateSettings({ ...rest, holidayWeekdays: [0, 6], requestDeadlineDay: 18, publishDay: 20 });
    const p = await getOrCreatePeriod("2026-11");
    expect(p.deadline.getTime()).toBe(t("2026-10-19 00:00").getTime());
    await extendDeadline("2026-11", "2026-10-25", t("2026-10-01 10:00"));
    await updateSettings({ ...rest, holidayWeekdays: [0, 6], requestDeadlineDay: 17 });
    expect((await getOrCreatePeriod("2026-11")).deadline.getTime()).toBe(t("2026-10-26 00:00").getTime());
  });

  it("B7: 連携コードの総当たりはロックされる", async () => {
    const e = await makeEmployee("A");
    const now = t("2026-10-10 12:00");
    const code = await issueLinkCode(e.id, now);
    const wrong = code.code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect((await linkByCode(wrong, "Uattacker", "", now)).ok).toBe(false);
    expect(await linkByCode(code.code, "Uattacker", "", now)).toEqual({ ok: false, reason: "locked" });
  });

  it("B8: 連携解除で発行済みリンクが無効。提出リンクは締切まで", async () => {
    const a = await linked("A", "UA");
    const now = t("2026-10-13 10:00");
    const token = createStaffToken(a, "me", now);
    expect(await resolveStaffToken(token, "me", now)).not.toBeNull();
    await unlinkLine(a.id);
    expect(await resolveStaffToken(token, "me", now)).toBeNull();

    const fresh = await prisma.employee.findUniqueOrThrow({ where: { id: a.id } });
    const submit = createStaffToken(fresh, "submit", now, t("2026-10-18 00:00"));
    expect(await resolveStaffToken(submit, "submit", t("2026-10-17 23:00"))).not.toBeNull();
    expect(await resolveStaffToken(submit, "submit", t("2026-10-18 00:01"))).toBeNull();
  });

  it("B9: 自動リマインドは1回だけ", async () => {
    await linked("A", "UA");
    for (const d of ["13", "14", "15", "16", "17"]) await runDaily(t(`2026-10-${d} 10:00`));
    expect(await prisma.notification.count({ where: { kind: "SHIFT_REMINDER" } })).toBe(1);
  });

  it("B10: 同じ連携コードを同時に使っても連携されるのは1人", async () => {
    const e = await makeEmployee("A");
    const now = t("2026-10-10 12:00");
    const code = await issueLinkCode(e.id, now);
    const rs = await Promise.all([linkByCode(code.code, "U1", "", now), linkByCode(code.code, "U2", "", now)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.lineAccount.count()).toBe(1);
  });

  it("B11: スタッフの提出で期間が勝手に作られない", async () => {
    const a = await makeEmployee("A");
    await expect(submitRequest(a.id, "2099-12", { days: [], comment: "" }, "STAFF")).rejects.toThrow("提出期間外");
    expect(await prisma.shiftPeriod.count()).toBe(0);
  });

  it("B14: 「勤務時間確認」は勤務時間を返す", async () => {
    await linked("A", "UA");
    expect(await handleText("UA", "勤務時間確認", "", t("2026-10-20 12:00"))).toContain("実働時間");
  });
});
