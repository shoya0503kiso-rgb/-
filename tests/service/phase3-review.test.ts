// Phase 3 レビュー指摘の回帰テスト
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { dispatchPending, enqueue } from "@/server/notify";
import { punch } from "@/server/punch";
import { boardData, findViolations, runGeneration, setAssignment } from "@/server/shifts/board";
import { createPattern, saveStaffingRules, updatePattern } from "@/server/shifts/patterns";
import { closeCollection, openCollection } from "@/server/shifts/periods";
import { publishPeriod } from "@/server/shifts/publish";
import { submitRequest } from "@/server/shifts/requests";
import { addPair } from "@/server/shifts/conditions";
import { makeEmployee, resetDb, t } from "../helpers";

beforeEach(resetDb);
const YM = "2026-11";
const admin = { name: "店長" };

async function oneDayStore() {
  const late = await createPattern({ name: "遅番", startTime: "20:00", endTime: "05:00" });
  const rules: Record<number, Record<string, number>> = {};
  for (let w = 0; w < 7; w++) rules[w] = { [late.id]: 0 };
  await saveStaffingRules(rules);
  await prisma.staffingOverride.create({ data: { date: "2026-11-02", patternId: late.id, requiredCount: 1 } });
  return late;
}

describe("Phase 3 レビュー指摘", () => {
  it("A-1: 古い通知でも同時送信で二重に送らない", async () => {
    const e = await makeEmployee("A");
    await prisma.lineAccount.create({ data: { employeeId: e.id, lineUserId: "UA" } });
    const { notification } = await enqueue({ employeeId: e.id, kind: "TEXT", title: "t", body: "b", dedupeKey: "old" });
    await prisma.notification.update({ where: { id: notification.id }, data: { createdAt: new Date(Date.now() - 3600_000) } });
    const [r1, r2] = await Promise.all([dispatchPending(), dispatchPending()]);
    expect(r1.sent + r2.sent).toBe(1);
  });

  it("A-4: 前日の退勤忘れの翌晩に「退勤だけ」を押しても前日に付かない", async () => {
    const e = await makeEmployee("A");
    await punch({ employeeId: e.id, type: "CLOCK_IN", source: "KIOSK", now: t("2026-10-12 23:30") });
    await punch({ employeeId: e.id, type: "CLOCK_OUT", source: "KIOSK", now: t("2026-10-13 22:00") });
    expect(await prisma.workSession.count()).toBe(2);
  });

  it("B2: 停止した枠を希望していた日も「どの枠でも可」として生成に使う", async () => {
    const late = await oneDayStore();
    const old = await createPattern({ name: "旧枠", startTime: "15:00", endTime: "23:00" });
    const a = await makeEmployee("A");
    await openCollection(YM, t("2026-10-13 10:00"));
    await submitRequest(a.id, YM, { days: [{ date: "2026-11-02", availability: "OK", patternId: old.id }], comment: "" }, "STAFF", t("2026-10-14 10:00"));
    await updatePattern(old.id, { name: "旧枠", startTime: "15:00", endTime: "23:00", active: false });
    await closeCollection(YM);
    const rep = await runGeneration(YM, admin, { keepManual: true });
    expect(rep.shortages).toEqual([]);
    expect((await prisma.shiftAssignment.findFirstOrThrow()).patternId).toBe(late.id);
  });

  it("B4/B10: 生成後に店休日にした日は公開前チェックに出る。配置0件は公開できない", async () => {
    await oneDayStore();
    const a = await makeEmployee("A");
    await openCollection(YM, t("2026-10-13 10:00"));
    await submitRequest(a.id, YM, { days: [{ date: "2026-11-02", availability: "OK" }], comment: "" }, "STAFF", t("2026-10-14 10:00"));
    await closeCollection(YM);
    await expect(publishPeriod(YM, admin)).rejects.toThrow("配置が1件もありません");
    await runGeneration(YM, admin, { keepManual: true });
    await prisma.calendarDay.create({ data: { date: "2026-11-02", isClosed: true } });
    expect((await findViolations(YM)).map((v) => v.message)).toContain("店休日に配置されています");
  });

  it("B4: 生成後に追加した絶対NGペアも検出", async () => {
    const late = await oneDayStore();
    const [a, b] = [await makeEmployee("A"), await makeEmployee("B")];
    await openCollection(YM, t("2026-10-13 10:00"));
    await closeCollection(YM);
    await setAssignment(YM, "2026-11-02", a.id, { patternId: late.id });
    await setAssignment(YM, "2026-11-02", b.id, { patternId: late.id });
    await addPair(YM, a.id, b.id, "HARD", "");
    expect((await findViolations(YM)).some((v) => v.message.includes("絶対に同じ日にしない"))).toBe(true);
  });

  it("B5: 枠の時刻を変えると今後の配置の時刻も変わる", async () => {
    const late = await oneDayStore();
    const a = await makeEmployee("A");
    await openCollection(YM, t("2026-10-13 10:00"));
    await closeCollection(YM);
    await setAssignment(YM, "2026-11-02", a.id, { patternId: late.id });
    const r = await updatePattern(late.id, { name: "遅番", startTime: "21:00", endTime: "05:00" });
    expect(r.moved).toBe(1);
    expect((await prisma.shiftAssignment.findFirstOrThrow()).startTime).toBe("21:00");
  });

  it("B8/B9: 時間指定の配置も同じ時刻の枠の人数に数える。希望外の枠は警告", async () => {
    const late = await oneDayStore();
    const early = await createPattern({ name: "早番", startTime: "15:00", endTime: "23:00" });
    const a = await makeEmployee("A");
    await openCollection(YM, t("2026-10-13 10:00"));
    await submitRequest(a.id, YM, { days: [{ date: "2026-11-02", availability: "OK", patternId: early.id }], comment: "" }, "STAFF", t("2026-10-14 10:00"));
    await closeCollection(YM);
    const w = await setAssignment(YM, "2026-11-02", a.id, { custom: { startTime: "20:00", endTime: "05:00" } });
    expect(w.warnings).toContain("本人の希望は「早番」です");
    const board = await boardData(YM);
    expect(board.fill.find((f) => f.date === "2026-11-02" && f.patternId === late.id)?.assigned).toBe(1);
  });
});
