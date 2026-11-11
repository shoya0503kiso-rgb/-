import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createSession } from "@/server/attendance";
import { exportAttendance } from "@/server/attendance-export";
import { GET } from "@/app/api/export/attendance/route";
import { editor, makeEmployee, resetDb, t } from "../helpers";

beforeEach(resetDb);
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("外部連携用の勤怠データ", () => {
  it("営業日の範囲で、JSTの時刻・休憩・時給を返す（削除済みは含めない）", async () => {
    const e = await makeEmployee("つばさ", { hourlyWage: 1200 });
    await createSession(
      e.id,
      { clockIn: t("2026-11-10 14:00"), clockOut: t("2026-11-11 00:00"), breaks: [{ start: t("2026-11-10 18:30"), end: t("2026-11-10 19:30") }] },
      "t",
      editor,
    );
    await createSession(e.id, { clockIn: t("2026-11-12 17:30"), clockOut: null, breaks: [] }, "t", editor);
    const r = await exportAttendance("2026-11-10", "2026-11-11");
    expect(r.employees).toEqual([expect.objectContaining({ id: e.id, name: "つばさ", hourlyWage: 1200, active: true })]);
    expect(r.sessions).toEqual([
      {
        id: expect.any(String),
        employeeId: e.id,
        businessDate: "2026-11-10",
        clockIn: "2026-11-10T14:00",
        clockOut: "2026-11-11T00:00",
        breaks: [{ start: "2026-11-10T18:30", end: "2026-11-10T19:30" }],
      },
    ]);
    await expect(exportAttendance("2026-11-10", "2027-03-01")).rejects.toThrow("62日以内");
  });

  it("CRON_SECRET がないと読めない", async () => {
    const req = (auth?: string) =>
      new NextRequest("http://x/api/export/attendance?from=2026-11-10", { headers: auth ? { authorization: auth } : {} });
    expect((await GET(req("Bearer x"))).status).toBe(401);
    process.env.CRON_SECRET = "s3cret-s3cret";
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer wrong-wrong-"))).status).toBe(401);
    const ok = await GET(req("Bearer s3cret-s3cret"));
    expect(ok.status).toBe(200);
    expect((await ok.json()).from).toBe("2026-11-10");
    expect((await GET(new NextRequest("http://x/api/export/attendance?from=bad", { headers: { authorization: "Bearer s3cret-s3cret" } }))).status).toBe(400);
  });
});
