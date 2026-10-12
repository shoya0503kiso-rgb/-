import { describe, expect, it } from "vitest";
import { suggestConditions, type ModelCall, type StaffRef } from "@/server/ai/conditions-assist";

const base = { priority: "MID", volume: "NORMAL", maxDays: null, minDays: null, fillAll: false, memo: "" } as const;
const staff: StaffRef[] = [
  { id: "a", name: "山田", current: { ...base, employeeId: "a" } },
  { id: "b", name: "田中", current: { ...base, employeeId: "b" } },
  { id: "c", name: "佐藤", current: { ...base, employeeId: "c" } },
];

describe("AI補助：店長の指示 → 月次条件の案", () => {
  it("指示どおりの変更だけを案にし、不正な値・一覧にない人は捨てる", async () => {
    let prompt = "";
    const call: ModelCall = async (_s, user) => {
      prompt = user;
      return {
        conditions: [
          { employeeId: "a", priority: null, volume: "MORE", maxDays: null, minDays: null, fillAll: null, memo: "今月は多め" },
          { employeeId: "b", priority: null, volume: null, maxDays: 99, minDays: null, fillAll: null, memo: null },
          { employeeId: "zzz", priority: "HIGH", volume: null, maxDays: null, minDays: null, fillAll: null, memo: null },
          { employeeId: "c", priority: null, volume: null, maxDays: 3, minDays: 5, fillAll: null, memo: null },
        ],
        pairs: [
          { a: "a", b: "b", strength: "HARD", memo: "" },
          { a: "a", b: "a", strength: "SOFT", memo: "" },
        ],
        unresolved: ["鈴木さんが一覧にいません"],
      };
    };
    const r = await suggestConditions(staff, "山田は今月多め。田中は99日。佐藤と…", call);
    expect(prompt).toContain("山田は今月多め");
    expect(r.changes).toEqual([{ employeeId: "a", name: "山田", before: staff[0].current, after: { ...staff[0].current, volume: "MORE", memo: "今月は多め" } }]);
    expect(r.pairs).toEqual([{ a: "a", b: "b", strength: "HARD", memo: "", aName: "山田", bName: "田中" }]);
    expect(r.unresolved).toEqual(["鈴木さんが一覧にいません", "佐藤さん：最低日数が最大日数を超えるため反映しませんでした"]);
  });

  it("空の指示・拒否は利用者向けのエラー", async () => {
    await expect(suggestConditions(staff, "  ", async () => null)).rejects.toThrow("指示を入力");
    await expect(suggestConditions(staff, "山田多め", async () => null)).rejects.toThrow("案を作れませんでした");
  });
});
