import { beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { createSession } from "@/server/attendance";
import { createEmployee, officialName, updateEmployee } from "@/server/employees";
import { buildCsv, buildXlsx } from "@/server/export";
import { listEmployees } from "@/server/employees";
import { editor, resetDb, t } from "../helpers";

beforeEach(resetDb);

describe("表示名と本名", () => {
  it("社労士提出用の出力（CSV・Excel）は本名、未入力なら表示名", async () => {
    const base = { hourlyWage: "", baseMaxDays: "", baseMinDays: "", breakCheckExemptFrom: "" };
    const tako = await createEmployee({ ...base, name: "たこ", legalName: "伊木 拓海" });
    const miru = await createEmployee({ ...base, name: "みる" });
    for (const e of [tako, miru]) {
      await createSession(e.id, { clockIn: t("2026-10-02 17:30"), clockOut: t("2026-10-03 00:00"), breaks: [] }, "t", editor);
    }
    const csv = await buildCsv("2026-10");
    expect(csv).toContain("伊木 拓海,2026-10-02");
    expect(csv).toContain("みる,2026-10-02");
    expect(csv).not.toContain("たこ");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildXlsx("2026-10")) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(expect.arrayContaining(["伊木 拓海", "みる"]));

    // 管理画面・打刻画面の名前は表示名のまま
    expect((await listEmployees()).map((e) => e.name).sort()).toEqual(["たこ", "みる"]);
    expect(officialName({ name: "たこ", legalName: "  " })).toBe("たこ");

    await updateEmployee(tako.id, { ...base, name: "たこ", legalName: "" });
    expect(await buildCsv("2026-10")).toContain("たこ,2026-10-02");
  });
});
