import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { dashboard } from "@/server/dashboard";
import { punch } from "@/server/punch";
import { addPair, copyFromPreviousMonth, listConditions, referenceStats, saveConditions } from "@/server/shifts/conditions";
import { boardData, runGeneration, setAssignment } from "@/server/shifts/board";
import { createPattern, requiredSlots, saveStaffingRules, setStaffingOverride } from "@/server/shifts/patterns";
import { closeCollection, openCollection } from "@/server/shifts/periods";
import { hasUnpublishedChanges, publishPeriod } from "@/server/shifts/publish";
import { submitRequest } from "@/server/shifts/requests";
import { datesOfMonth } from "@/lib/time";
import { makeEmployee, resetDb, t } from "../helpers";

beforeEach(resetDb);

const YM = "2026-11";
const admin = { name: "店長" };

async function setupStore() {
  const early = await createPattern({ name: "早番", startTime: "15:00", endTime: "23:00", sortOrder: 0 });
  const late = await createPattern({ name: "遅番", startTime: "20:00", endTime: "05:00", sortOrder: 1 });
  const rules: Record<number, Record<string, number>> = {};
  for (let w = 0; w < 7; w++) rules[w] = { [early.id]: 1, [late.id]: 1 };
  await saveStaffingRules(rules);
  await prisma.calendarDay.create({ data: { date: "2026-11-10", isClosed: true } });
  const staff = await Promise.all(["A", "B", "C", "D", "E"].map((n) => makeEmployee(n)));
  await openCollection(YM, t("2026-10-13 10:00"));
  const dates = datesOfMonth(YM);
  for (const [i, e] of staff.entries()) {
    const days = dates.filter((_, j) => (i + j) % 5 !== 0).map((date) => ({ date, availability: "OK" as const }));
    await submitRequest(e.id, YM, { days, comment: "" }, "STAFF", t("2026-10-14 10:00"));
  }
  await closeCollection(YM);
  return { early, late, staff };
}

describe("シフト枠・必要人数", () => {
  it("曜日の必要人数・特定日の上書き・店休日を反映", async () => {
    const { early } = await setupStore();
    await setStaffingOverride("2026-11-21", early.id, 3);
    const slots = await requiredSlots(YM);
    expect(slots.some((s) => s.date === "2026-11-10")).toBe(false);
    expect(slots.find((s) => s.date === "2026-11-21" && s.patternId === early.id)?.required).toBe(3);
    expect(slots.find((s) => s.date === "2026-11-22" && s.patternId === early.id)?.required).toBe(1);
  });
});

describe("月次条件", () => {
  it("初期値は固定プロフィールの基本条件。前月コピーで翌月に引き継げる", async () => {
    const e = await makeEmployee("基本", { baseMaxDays: 12, baseMinDays: 4 });
    const [row] = await listConditions("2026-10");
    expect(row.value).toMatchObject({ maxDays: 12, minDays: 4, priority: "MID", volume: "NORMAL" });
    await saveConditions("2026-10", [{ ...row.value, volume: "LESS", memo: "今月は遅刻が複数回あったため少なめ" }]);
    const other = await makeEmployee("相手");
    await addPair("2026-10", e.id, other.id, "SOFT", "");
    expect(await copyFromPreviousMonth(YM)).toEqual({ copied: 1, pairs: 1 });
    const next = await listConditions(YM);
    expect(next.find((r) => r.employee.id === e.id)!.value).toMatchObject({ volume: "LESS", memo: "今月は遅刻が複数回あったため少なめ" });
    // 固定プロフィールは変わらない
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: e.id } })).baseMaxDays).toBe(12);
  });

  it("最低 > 最大 は保存できない", async () => {
    const e = await makeEmployee("X");
    const [row] = await listConditions(YM);
    await expect(saveConditions(YM, [{ ...row.value, employeeId: e.id, minDays: 10, maxDays: 5 }])).rejects.toThrow("最低日数");
  });
});

describe("自動生成 → 編集 → 公開", () => {
  it("受付中は生成できない", async () => {
    await createPattern({ name: "通し", startTime: "15:00", endTime: "23:00" });
    await makeEmployee("A");
    await openCollection(YM, t("2026-10-13 10:00"));
    await expect(runGeneration(YM, admin, { keepManual: true })).rejects.toThrow("受付中");
  });

  it("希望と条件から案を作り、絶対条件を守る", async () => {
    const { staff } = await setupStore();
    const [a, b] = staff;
    const conds = await listConditions(YM);
    await saveConditions(
      YM,
      conds.map((c) => (c.employee.id === a.id ? { ...c.value, maxDays: 6 } : c.value)),
    );
    await addPair(YM, a.id, b.id, "HARD", "");
    const report = await runGeneration(YM, admin, { keepManual: true });
    expect(report.shortages).toEqual([]);

    const assignments = await prisma.shiftAssignment.findMany();
    const days = (id: string) => assignments.filter((x) => x.employeeId === id).map((x) => x.date);
    expect(days(a.id).length).toBeLessThanOrEqual(6);
    expect(days(b.id).some((d) => days(a.id).includes(d))).toBe(false);
    expect(assignments.some((x) => x.date === "2026-11-10")).toBe(false);
    const subs = await prisma.shiftRequestDay.findMany({ where: { availability: "NG" }, include: { submission: true } });
    for (const x of assignments) {
      expect(subs.some((s) => s.date === x.date && s.submission.employeeId === x.employeeId)).toBe(false);
    }
    expect((await prisma.shiftPeriod.findUniqueOrThrow({ where: { yearMonth: YM } })).status).toBe("DRAFT");
  });

  it("手動配置は再生成で残り、不可の日に入れると警告", async () => {
    const { early, staff } = await setupStore();
    await runGeneration(YM, admin, { keepManual: true });
    const ngDay = (await prisma.shiftRequestDay.findFirstOrThrow({
      where: { availability: "NG", submission: { employeeId: staff[0].id }, date: { not: "2026-11-10" } },
    })).date;
    const r = await setAssignment(YM, ngDay, staff[0].id, { patternId: early.id });
    expect(r.warnings).toContain("本人が「出勤不可」の日です");
    await runGeneration(YM, admin, { keepManual: true });
    expect(await prisma.shiftAssignment.findFirst({ where: { date: ngDay, employeeId: staff[0].id, source: "MANUAL" } })).not.toBeNull();
    await runGeneration(YM, admin, { keepManual: false });
    expect(await prisma.shiftAssignment.findFirst({ where: { date: ngDay, employeeId: staff[0].id } })).toBeNull();
  });

  it("公開後の編集は「未通知の変更」になり、ダッシュボードは公開済みの内容を表示", async () => {
    const { staff } = await setupStore();
    await runGeneration(YM, admin, { keepManual: true });
    await publishPeriod(YM, admin, t("2026-10-20 12:00"));
    expect(await hasUnpublishedChanges(YM)).toBe(false);

    const board = await boardData(YM);
    const day = board.rows.find((r) => r.employee.id === staff[0].id)!.days.find((d) => d.assignment)!;
    await setAssignment(YM, day.date, staff[0].id, null);
    expect(await hasUnpublishedChanges(YM)).toBe(true);
    expect((await prisma.shiftPeriod.findUniqueOrThrow({ where: { yearMonth: YM } })).status).toBe("PUBLISHED");

    // ダッシュボード（その日の営業中）は最後に公開した内容
    const d = await dashboard(t(`${day.date} 16:00`));
    expect(d.todayShifts.some((s) => s.id === staff[0].id)).toBe(true);
  });

  it("前月の遅刻・シフトあり打刻なしを参考情報として集計（自動では条件を変えない）", async () => {
    const { staff } = await setupStore();
    await runGeneration(YM, admin, { keepManual: true });
    await publishPeriod(YM, admin, t("2026-10-20 12:00"));
    const mine = await prisma.shiftAssignment.findMany({ where: { employeeId: staff[0].id }, orderBy: { date: "asc" } });
    const [first, second] = mine;
    // 1回目：開始10分後に出勤（遅刻）、2回目：打刻なし
    const start = (a: typeof first) => t(`${a.date} ${a.startTime}`);
    await punch({ employeeId: staff[0].id, type: "CLOCK_IN", source: "KIOSK", now: new Date(start(first).getTime() + 10 * 60_000) });
    await punch({ employeeId: staff[0].id, type: "CLOCK_OUT", source: "KIOSK", now: new Date(start(first).getTime() + 5 * 3600_000) });
    const stats = await referenceStats("2026-12", new Date(start(second).getTime() + 24 * 3600_000));
    expect(stats.stats.get(staff[0].id)).toMatchObject({ late: 1, noShow: 1, workDays: 1 });
    const cond = (await listConditions("2026-12")).find((c) => c.employee.id === staff[0].id)!;
    expect(cond.saved).toBe(false);
  });
});

describe("Phase 4：給与目安・分析", () => {
  it("LINE で給与目安を確認できる（時給未設定なら案内）", async () => {
    const { handleText } = await import("@/server/line/commands");
    const { issueLinkCode } = await import("@/server/line/link");
    const e = await makeEmployee("給与", { hourlyWage: 1200 });
    const code = await issueLinkCode(e.id, t("2026-10-10 12:00"));
    await handleText("UP", code.code, "", t("2026-10-10 12:00"));
    await punch({ employeeId: e.id, type: "CLOCK_IN", source: "KIOSK", now: t("2026-10-12 20:00") });
    await punch({ employeeId: e.id, type: "CLOCK_OUT", source: "KIOSK", now: t("2026-10-13 01:00") });
    // 実働5h=6000円、深夜3h×1200×25%=900円
    expect(await handleText("UP", "給与目安", "", t("2026-10-20 12:00"))).toContain("約 6,900円");
    await prisma.employee.update({ where: { id: e.id }, data: { hourlyWage: null } });
    expect(await handleText("UP", "給与目安", "", t("2026-10-20 12:00"))).toContain("時給が登録されていない");
  });

  it("月別分析", async () => {
    const { monthlyAnalytics } = await import("@/server/analytics");
    const e = await makeEmployee("分析");
    await punch({ employeeId: e.id, type: "CLOCK_IN", source: "KIOSK", now: t("2026-10-12 20:00") });
    await punch({ employeeId: e.id, type: "CLOCK_OUT", source: "KIOSK", now: t("2026-10-13 01:00") });
    const a = await monthlyAnalytics("2026-10", 3);
    expect(a.months).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(a.byMonth[2]).toMatchObject({ workMinutes: 300, personDays: 1, staffCount: 1 });
    expect(a.byStaff.find((r) => r.employee.id === e.id)!.months[2]).toMatchObject({ workMinutes: 300, workDays: 1 });
  });
});
