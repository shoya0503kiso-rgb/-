import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { applyImport, previewImport } from "@/server/attendance-import";
import { createSession, monthlyAttendance } from "@/server/attendance";
import { guessEmployee, parseImportText } from "@/lib/attendance/import";
import { editor, makeEmployee, resetDb, t } from "../helpers";

beforeEach(resetDb);

describe("取り込みデータの読み取り", () => {
  it("日跨ぎ・退勤なし・休憩・見出し行・全角を読み取る", () => {
    const { rows, errors } = parseImportText(
      "名前,日付,出勤,退勤,休憩\nみる,2026-10-02,17:58,00:11,0\n山口,2026/10/9,16:49,,\nエレナ，２０２６－１０－０３，15:59，23:05，75\n変,2026-10-40,10:00,11:00,0\n長,2026-10-01,10:00,11:00,90",
    );
    expect(rows).toEqual([
      { line: 2, name: "みる", date: "2026-10-02", inMinutes: 17 * 60 + 58, outMinutes: 24 * 60 + 11, breakMinutes: 0 },
      { line: 3, name: "山口", date: "2026-10-09", inMinutes: 16 * 60 + 49, outMinutes: null, breakMinutes: 0 },
      { line: 4, name: "エレナ", date: "2026-10-03", inMinutes: 15 * 60 + 59, outMinutes: 23 * 60 + 5, breakMinutes: 75 },
    ]);
    expect(errors.map((e) => e.line)).toEqual([5, 6]);
  });

  it("名前の推測：カタカナとひらがな・ふりがなの一部で1人に決まるときだけ", () => {
    const emps = [
      { id: "1", name: "木曽 翔也", kana: "きそ しょうや" },
      { id: "2", name: "みる", kana: "" },
      { id: "3", name: "山口 太郎", kana: "" },
      { id: "4", name: "山口 花子", kana: "" },
    ];
    expect(guessEmployee("ショウヤ", emps)?.id).toBe("1");
    expect(guessEmployee("ミル", emps)?.id).toBe("2");
    expect(guessEmployee("山口", emps)).toBeNull();
    expect(guessEmployee("だれか", emps)).toBeNull();
  });
});

describe("勤怠の一括取り込み", () => {
  it("登録済みと重なる行・ファイル内の重複は取り込まず、休憩は合計どおり入る", async () => {
    const miru = await makeEmployee("みる");
    const elena = await makeEmployee("エレナ");
    await createSession(miru.id, { clockIn: t("2026-10-05 18:30"), clockOut: t("2026-10-05 23:50"), breaks: [] }, "打刻", editor);

    const text = [
      "みる,2026-10-02,17:58,00:11,0",
      "みる,2026-10-05,18:31,23:52,0", // 登録済み
      "みる,2026-10-02,18:00,00:00,0", // ファイル内で重複
      "エレナ,2026-10-03,15:59,23:05,75",
      "ちーちゃん,2026-10-10,15:00,00:06,105", // 従業員なし
    ].join("\n");
    const p = await previewImport(text);
    expect(p.rows.map((r) => r.status)).toEqual(["ok", "exists", "duplicate", "ok", "unmapped"]);
    expect(p.mapping).toEqual({ みる: miru.id, エレナ: elena.id, ちーちゃん: null });

    const r = await applyImport(text, p.mapping, editor);
    expect(r).toEqual({ created: 2, skipped: 3, failed: [] });
    const m = await monthlyAttendance(elena.id, "2026-10", t("2026-11-02 12:00"));
    expect(m.totals).toMatchObject({ workDays: 1, breakMinutes: 75, workMinutes: 7 * 60 + 6 - 75 });
    const rev = await prisma.attendanceRevision.findFirstOrThrow({ where: { session: { employeeId: elena.id } } });
    expect(rev.reason).toContain("一括取り込み");

    // もう一度取り込んでも二重にならない
    const again = await previewImport(text, p.mapping);
    expect(again.counts.ok).toBe(0);
  });

  it("名前の対応を手で指定できる・退勤なしは要確認として取り込む", async () => {
    const yama = await makeEmployee("山口 花子");
    const text = "ヤマグチ,2026-10-09,16:49,,";
    const p0 = await previewImport(text);
    expect(p0.counts.unmapped).toBe(1);
    const p = await previewImport(text, { ヤマグチ: yama.id });
    expect(p.rows[0]).toMatchObject({ status: "ok", warning: expect.stringContaining("退勤なし") });
    await applyImport(text, p.mapping, editor);
    const s = await prisma.workSession.findFirstOrThrow({ where: { employeeId: yama.id } });
    expect(s.clockOut).toBeNull();
    expect(s.businessDate).toBe("2026-10-09");
  });
});
