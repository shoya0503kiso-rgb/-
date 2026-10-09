import { describe, expect, it } from "vitest";
import { generateShifts, type GenAvailability, type GenInput, type GenSlot, type GenStaff } from "@/lib/shift/generate";
import { datesOfMonth } from "@/lib/time";

const dates = datesOfMonth("2026-11");
const EARLY = { id: "early", start: "15:00", end: "23:00" };
const LATE = { id: "late", start: "20:00", end: "05:00" };

function slots(required: { early: number; late: number }, ds = dates): GenSlot[] {
  return ds.flatMap((date) => [
    { date, patternId: EARLY.id, startTime: EARLY.start, endTime: EARLY.end, required: required.early },
    { date, patternId: LATE.id, startTime: LATE.start, endTime: LATE.end, required: required.late },
  ]);
}

const any: GenAvailability = { patternId: null, startTime: null, endTime: null };

function staff(id: string, availDates: string[], extra: Partial<GenStaff> = {}): GenStaff {
  return {
    id,
    name: id,
    available: new Map(availDates.map((d) => [d, any])),
    priority: "MID",
    volume: "NORMAL",
    maxDays: null,
    minDays: null,
    fillAll: false,
    ...extra,
  };
}

function base(over: Partial<GenInput>): GenInput {
  return { slots: slots({ early: 1, late: 1 }), staff: [], pairs: [], fixed: [], maxConsecutiveDays: 5, seed: 1, ...over };
}

const daysOf = (r: ReturnType<typeof generateShifts>, id: string) => r.assignments.filter((a) => a.employeeId === id).map((a) => a.date);

describe("自動シフト生成：絶対条件", () => {
  const team = ["A", "B", "C", "D", "E"].map((id, i) => staff(id, dates.filter((_, j) => (j + i) % 5 !== 0)));

  it("出勤不可日に入れない・1日1枠・必要人数を超えない", () => {
    const r = generateShifts(base({ staff: team }));
    for (const s of team) for (const d of daysOf(r, s.id)) expect(s.available.has(d)).toBe(true);
    for (const s of team) expect(new Set(daysOf(r, s.id)).size).toBe(daysOf(r, s.id).length);
    for (const d of dates) {
      expect(r.assignments.filter((a) => a.date === d && a.patternId === "early").length).toBeLessThanOrEqual(1);
      expect(r.assignments.filter((a) => a.date === d && a.patternId === "late").length).toBeLessThanOrEqual(1);
    }
    expect(r.shortages).toEqual([]);
  });

  it("最大勤務日数を超えない（絶対）", () => {
    const s = team.map((t) => ({ ...t, maxDays: 8 }));
    const r = generateShifts(base({ staff: s }));
    for (const t of s) expect(daysOf(r, t.id).length).toBeLessThanOrEqual(8);
    // 5人×8日=40 < 必要60人日 → 不足が出る（他の絶対条件は破らない）
    expect(r.shortages.length).toBeGreaterThan(0);
  });

  it("「絶対NG」ペアは同じ日にしない", () => {
    const r = generateShifts(base({ staff: team, pairs: [{ a: "A", b: "B", strength: "HARD" }] }));
    const a = new Set(daysOf(r, "A"));
    expect(daysOf(r, "B").some((d) => a.has(d))).toBe(false);
  });

  it("候補者がいない枠は不足として報告する", () => {
    const r = generateShifts(base({ slots: slots({ early: 1, late: 1 }, ["2026-11-01"]), staff: [staff("A", ["2026-11-01"])] }));
    // A は1日1枠なので、2枠のうち1枠は必ず不足になる
    expect(r.shortages).toHaveLength(1);
    expect(r.shortages[0]).toMatchObject({ date: "2026-11-01", required: 1, assigned: 0, candidates: ["A"] });
  });

  it("枠指定の希望はその枠だけ", () => {
    const only = staff("L", dates);
    only.available = new Map(dates.map((d) => [d, { patternId: "late", startTime: null, endTime: null }]));
    const r = generateShifts(base({ staff: [only, staff("X", dates)] }));
    expect(r.assignments.filter((a) => a.employeeId === "L").every((a) => a.patternId === "late")).toBe(true);
  });

  it("希望時間に収まらない枠には入れない", () => {
    const s = staff("T", dates);
    s.available = new Map(dates.map((d) => [d, { patternId: null, startTime: "15:00", endTime: "23:00" }]));
    const r = generateShifts(base({ staff: [s, staff("X", dates)] }));
    expect(r.assignments.filter((a) => a.employeeId === "T").every((a) => a.patternId === "early")).toBe(true);
  });

  it("店休日（枠なし）には入れない", () => {
    const open = dates.filter((d) => d !== "2026-11-10");
    const r = generateShifts(base({ slots: slots({ early: 1, late: 1 }, open), staff: team }));
    expect(r.assignments.some((a) => a.date === "2026-11-10")).toBe(false);
  });
});

describe("自動シフト生成：希望条件", () => {
  it("同じ入力なら同じ結果（再現性）", () => {
    const team = ["A", "B", "C", "D"].map((id) => staff(id, dates));
    const a = generateShifts(base({ staff: team }));
    const b = generateShifts(base({ staff: team }));
    expect(a.assignments).toEqual(b.assignments);
  });

  it("多め の人は 少なめ の人より多く入る", () => {
    const team = [staff("MORE", dates, { volume: "MORE" }), staff("N1", dates), staff("N2", dates), staff("LESS", dates, { volume: "LESS" })];
    const r = generateShifts(base({ staff: team }));
    expect(daysOf(r, "MORE").length).toBeGreaterThan(daysOf(r, "LESS").length);
    expect(r.shortages).toEqual([]);
  });

  it("最低勤務日数はできるだけ満たし、無理なら理由を出す", () => {
    const few = staff("FEW", dates.slice(0, 3), { minDays: 5 });
    const r = generateShifts(base({ staff: [few, staff("A", dates), staff("B", dates), staff("C", dates)] }));
    expect(daysOf(r, "FEW")).toHaveLength(3);
    expect(r.staff.find((s) => s.id === "FEW")!.notes[0]).toContain("出勤可が3日のみ");
  });

  it("「なるべく別の日」のペアは避けられるなら同じ日にしない", () => {
    const team = ["A", "B", "C", "D"].map((id) => staff(id, dates));
    const r = generateShifts(base({ staff: team, pairs: [{ a: "A", b: "B", strength: "SOFT" }] }));
    const a = new Set(daysOf(r, "A"));
    expect(daysOf(r, "B").filter((d) => a.has(d))).toHaveLength(0);
  });

  it("手動配置は固定して残す", () => {
    const team = ["A", "B", "C"].map((id) => staff(id, dates));
    const fixed = [{ date: "2026-11-05", employeeId: "C", patternId: "early", startTime: "15:00", endTime: "23:00" }];
    const r = generateShifts(base({ staff: team, fixed }));
    expect(r.assignments).toContainEqual({ ...fixed[0], fixed: true });
    expect(r.assignments.filter((a) => a.date === "2026-11-05" && a.patternId === "early")).toHaveLength(1);
  });

  it("できるだけ全部入れる の人は出勤可の日に多く入る", () => {
    const team = [staff("ALL", dates.slice(0, 10), { fillAll: true }), ...["A", "B", "C", "D"].map((id) => staff(id, dates))];
    const r = generateShifts(base({ staff: team }));
    expect(daysOf(r, "ALL").length).toBe(10);
  });
});
