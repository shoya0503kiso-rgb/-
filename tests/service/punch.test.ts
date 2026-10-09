import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { kioskStatus, punch } from "@/server/punch";
import { setEmployeePin } from "@/server/employees";
import {
  acknowledgeAnomaly,
  createSession,
  deleteSession,
  listOpenAnomalies,
  monthlyAttendance,
  updateSession,
} from "@/server/attendance";
import { buildCsv, buildXlsx } from "@/server/export";
import { editor, makeEmployee, resetDb, t } from "../helpers";

beforeEach(resetDb);

const p = (employeeId: string, type: Parameters<typeof punch>[0]["type"], at: string, pin?: string) =>
  punch({ employeeId, type, source: "KIOSK", now: t(at), pin });

describe("打刻", () => {
  it("出勤→休憩→休憩終了→退勤（日跨ぎ）で1件の勤怠になる", async () => {
    const e = await makeEmployee("山田");
    await p(e.id, "CLOCK_IN", "2026-10-12 20:00");
    await p(e.id, "BREAK_START", "2026-10-12 23:00");
    await p(e.id, "BREAK_END", "2026-10-12 23:45");
    const r = await p(e.id, "CLOCK_OUT", "2026-10-13 03:30");
    expect(r.status).toBe("OFF");

    const sessions = await prisma.workSession.findMany({ include: { breaks: true } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].businessDate).toBe("2026-10-12");
    const month = await monthlyAttendance(e.id, "2026-10", t("2026-10-20 12:00"));
    expect(month.totals).toMatchObject({ workDays: 1, workMinutes: 7 * 60 + 30 - 45, breakMinutes: 45 });
    expect(await prisma.punchLog.count({ where: { result: "OK" } })).toBe(4);
  });

  it("秒は切り捨てて記録する", async () => {
    const e = await makeEmployee("秒");
    await punch({ employeeId: e.id, type: "CLOCK_IN", source: "KIOSK", now: new Date(t("2026-10-12 20:00").getTime() + 45_000) });
    const s = await prisma.workSession.findFirstOrThrow();
    expect(s.clockIn!.getTime()).toBe(t("2026-10-12 20:00").getTime());
  });

  it("状態に合わない打刻は拒否し、ログには残す", async () => {
    const e = await makeEmployee("佐藤");
    await expect(p(e.id, "BREAK_START", "2026-10-12 20:00")).rejects.toThrow("出勤打刻がありません");
    await p(e.id, "CLOCK_IN", "2026-10-12 20:00");
    await expect(p(e.id, "CLOCK_IN", "2026-10-12 20:05")).rejects.toThrow("すでに出勤中");
    await expect(p(e.id, "BREAK_END", "2026-10-12 20:10")).rejects.toThrow("休憩中ではありません");
    expect(await prisma.punchLog.count({ where: { result: "REJECTED" } })).toBe(3);
  });

  it("連打は拒否する（退勤のみの連打で勤怠が2件にならない）", async () => {
    const e = await makeEmployee("連打");
    await p(e.id, "CLOCK_OUT", "2026-10-13 03:00");
    await expect(p(e.id, "CLOCK_OUT", "2026-10-13 03:01")).rejects.toThrow("打刻済み");
    expect(await prisma.workSession.count()).toBe(1);
  });

  it("休憩中に退勤すると休憩も終了し、要確認になる", async () => {
    const e = await makeEmployee("鈴木");
    await p(e.id, "CLOCK_IN", "2026-10-13 18:00");
    await p(e.id, "BREAK_START", "2026-10-13 21:00");
    const r = await p(e.id, "CLOCK_OUT", "2026-10-13 22:00");
    expect(r.message).toContain("休憩も終了");
    const items = await listOpenAnomalies({ now: t("2026-10-20 12:00") });
    expect(items[0].anomalies.map((a) => a.code)).toContain("BREAK_AUTO_ENDED");
  });

  it("退勤のみの打刻は出勤なし勤怠として要確認", async () => {
    const e = await makeEmployee("田中");
    await p(e.id, "CLOCK_OUT", "2026-10-13 03:00");
    const s = await prisma.workSession.findFirstOrThrow();
    expect(s).toMatchObject({ clockIn: null, businessDate: "2026-10-12" });
    const items = await listOpenAnomalies({ now: t("2026-10-20 12:00") });
    expect(items[0].anomalies.map((a) => a.code)).toEqual(["MISSING_CLOCK_IN"]);
  });

  it("退勤し忘れの翌日でも新しく出勤できる（古い勤怠は要確認）", async () => {
    const e = await makeEmployee("高橋");
    await p(e.id, "CLOCK_IN", "2026-10-12 18:00");
    await p(e.id, "CLOCK_IN", "2026-10-13 18:00");
    const items = await listOpenAnomalies({ now: t("2026-10-13 18:30") });
    expect(items.map((i) => [i.businessDate, i.anomalies[0].code])).toEqual([["2026-10-12", "MISSING_CLOCK_OUT"]]);
    const status = await kioskStatus(t("2026-10-13 18:30"));
    expect(status[0].status).toBe("WORKING");
  });

  it("前日の退勤し忘れ（16時間以内）でも翌日に出勤できる", async () => {
    const e = await makeEmployee("翌日");
    await p(e.id, "CLOCK_IN", "2026-10-12 22:00");
    await p(e.id, "CLOCK_IN", "2026-10-13 13:30");
    expect(await prisma.workSession.count()).toBe(2);
  });

  it("閉店後まで続く長時間勤務は1件のまま退勤できる", async () => {
    const e = await makeEmployee("長時間");
    await p(e.id, "CLOCK_IN", "2026-10-13 13:00");
    await p(e.id, "CLOCK_OUT", "2026-10-14 06:30");
    const sessions = await prisma.workSession.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].clockOut).not.toBeNull();
  });

  it("勤務中に退職扱いにされても退勤はできる（出勤はできない）", async () => {
    const e = await makeEmployee("途中退職");
    await p(e.id, "CLOCK_IN", "2026-10-13 18:00");
    await prisma.employee.update({ where: { id: e.id }, data: { active: false } });
    expect((await kioskStatus(t("2026-10-13 20:00"))).map((k) => k.name)).toContain("途中退職");
    await p(e.id, "CLOCK_OUT", "2026-10-13 23:00");
    await expect(p(e.id, "CLOCK_IN", "2026-10-14 18:00")).rejects.toThrow("見つかりません");
  });

  it("同時打刻でも勤務中の勤怠は1件だけ", async () => {
    const e = await makeEmployee("同時");
    const results = await Promise.allSettled([1, 2, 3].map(() => p(e.id, "CLOCK_IN", "2026-10-13 18:00")));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.workSession.count()).toBe(1);
  });

  it("PIN設定者はPINが必要。5回間違えるとロック", async () => {
    const e = await makeEmployee("PIN");
    await setEmployeePin(e.id, "1234");
    await expect(p(e.id, "CLOCK_IN", "2026-10-12 18:00")).rejects.toThrow("PINが違います");
    await p(e.id, "CLOCK_IN", "2026-10-12 18:00", "1234");
    for (let i = 0; i < 4; i++) await expect(p(e.id, "BREAK_START", "2026-10-12 19:00", "0000")).rejects.toThrow("PINが違います");
    await expect(p(e.id, "BREAK_START", "2026-10-12 19:00", "1234")).rejects.toThrow("10分間");
  });

  it("退職者は打刻できない", async () => {
    const e = await makeEmployee("退職", { active: false });
    await expect(p(e.id, "CLOCK_IN", "2026-10-12 18:00")).rejects.toThrow("見つかりません");
  });
});

describe("勤怠修正と履歴", () => {
  it("修正すると修正前後が履歴に残り、確認済みが無効になる", async () => {
    const e = await makeEmployee("修正");
    await p(e.id, "CLOCK_IN", "2026-10-12 16:00");
    await p(e.id, "CLOCK_OUT", "2026-10-12 23:35");
    const s = await prisma.workSession.findFirstOrThrow();
    const now = t("2026-10-20 12:00");

    let items = await listOpenAnomalies({ now });
    expect(items[0].anomalies.map((a) => a.code)).toEqual(["HOLIDAY_BREAK"]);

    await acknowledgeAnomaly(s.id, "HOLIDAY_BREAK", "本人確認済み", editor);
    expect(await listOpenAnomalies({ now })).toHaveLength(0);

    await expect(updateSession(s.id, { clockIn: s.clockIn, clockOut: s.clockOut, breaks: [] }, "", editor)).rejects.toThrow(
      "修正理由",
    );
    // 休憩を30分だけ追加 → まだ不足、確認済みは無効化され再表示
    await updateSession(
      s.id,
      { clockIn: s.clockIn, clockOut: s.clockOut, breaks: [{ start: t("2026-10-12 19:00"), end: t("2026-10-12 19:30") }] },
      "休憩の打刻漏れ",
      editor,
    );
    items = await listOpenAnomalies({ now });
    expect(items[0].anomalies.map((a) => a.code)).toEqual(["HOLIDAY_BREAK"]);

    const revs = await prisma.attendanceRevision.findMany();
    expect(revs).toHaveLength(1);
    expect(JSON.parse(revs[0].before).breaks).toEqual([]);
    expect(JSON.parse(revs[0].after).breaks).toEqual([{ start: "2026-10-12T19:00", end: "2026-10-12T19:30" }]);
    expect(revs[0]).toMatchObject({ editorName: "テスト店長", reason: "休憩の打刻漏れ" });
  });

  it("不正な時刻は保存できない", async () => {
    const e = await makeEmployee("不正");
    await expect(
      createSession(e.id, { clockIn: t("2026-10-12 20:00"), clockOut: t("2026-10-12 03:00"), breaks: [] }, "手入力", editor),
    ).rejects.toThrow("退勤は出勤より後");
    await expect(
      createSession(
        e.id,
        {
          clockIn: t("2026-10-12 20:00"),
          clockOut: t("2026-10-13 03:00"),
          breaks: [
            { start: t("2026-10-12 22:00"), end: t("2026-10-12 23:00") },
            { start: t("2026-10-12 22:30"), end: t("2026-10-12 23:30") },
          ],
        },
        "手入力",
        editor,
      ),
    ).rejects.toThrow("重なって");
  });

  it("同じ時間帯の勤怠は二重に追加できない", async () => {
    const e = await makeEmployee("重複");
    await p(e.id, "CLOCK_IN", "2026-10-13 18:00");
    await p(e.id, "CLOCK_OUT", "2026-10-13 23:00");
    await expect(
      createSession(e.id, { clockIn: t("2026-10-13 18:00"), clockOut: t("2026-10-13 23:00"), breaks: [] }, "手入力", editor),
    ).rejects.toThrow("重なっています");
  });

  it("画面を開いた後に打刻されたら修正を上書きしない", async () => {
    const e = await makeEmployee("競合");
    await p(e.id, "CLOCK_IN", "2026-10-13 18:00");
    const opened = await prisma.workSession.findFirstOrThrow();
    await p(e.id, "CLOCK_OUT", "2026-10-13 23:00");
    await expect(
      updateSession(opened.id, { clockIn: t("2026-10-13 17:55"), clockOut: null, breaks: [] }, "出勤時刻の修正", editor, opened.version),
    ).rejects.toThrow("更新されました");
    expect((await prisma.workSession.findFirstOrThrow()).clockOut).not.toBeNull();
  });

  it("手動追加・削除（論理削除）も履歴に残る", async () => {
    const e = await makeEmployee("追加");
    const s = await createSession(
      e.id,
      { clockIn: t("2026-10-14 01:00"), clockOut: t("2026-10-14 04:00"), breaks: [] },
      "打刻忘れ",
      editor,
    );
    expect(s.businessDate).toBe("2026-10-13");
    await deleteSession(s.id, "重複", editor);
    expect((await monthlyAttendance(e.id, "2026-10")).totals.workDays).toBe(0);
    expect((await prisma.attendanceRevision.findMany()).map((r) => r.action).sort()).toEqual(["CREATE", "DELETE"]);
  });
});

describe("出力", () => {
  it("CSV は BOM 付きで、日跨ぎは「翌」表記", async () => {
    const e = await makeEmployee("出力, 太郎");
    await p(e.id, "CLOCK_IN", "2026-10-12 20:00");
    await p(e.id, "CLOCK_OUT", "2026-10-13 03:00");
    const csv = await buildCsv("2026-10");
    expect(csv.startsWith("﻿従業員名,日付,曜日,出勤,退勤,休憩,実働時間,備考")).toBe(true);
    expect(csv).toContain('"出力, 太郎",2026-10-12,月,20:00,翌03:00,0:00,7:00,');
    expect(csv).toContain('【月合計】従業員名,総勤務日数,総勤務時間,休憩合計\r\n"出力, 太郎",1,7:00,0:00');
  });

  it("CSV は数式として解釈される名前を無害化する", async () => {
    const e = await makeEmployee("=HYPERLINK(1)");
    await p(e.id, "CLOCK_IN", "2026-10-12 20:00");
    await p(e.id, "CLOCK_OUT", "2026-10-13 03:00");
    expect(await buildCsv("2026-10")).toContain("\n'=HYPERLINK(1),");
  });

  it("Excel を生成できる", async () => {
    const e = await makeEmployee("エクセル");
    await p(e.id, "CLOCK_IN", "2026-10-12 20:00");
    await p(e.id, "CLOCK_OUT", "2026-10-13 03:00");
    const buf = await buildXlsx("2026-10");
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });
});
