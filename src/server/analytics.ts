// 勤怠分析（月別推移・スタッフ別）
import { totalsOf } from "@/lib/attendance/calc";
import { addMonths, datesOfMonth, type YearMonth } from "@/lib/time";
import { prisma } from "./db";
import { referenceStats } from "./shifts/conditions";

export async function monthlyAnalytics(endYm: YearMonth, months = 6) {
  const list = Array.from({ length: months }, (_, i) => addMonths(endYm, i - months + 1));
  const first = datesOfMonth(list[0])[0];
  const lastDates = datesOfMonth(endYm);
  const [employees, sessions] = await Promise.all([
    prisma.employee.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }] }),
    prisma.workSession.findMany({
      where: { deletedAt: null, businessDate: { gte: first, lte: lastDates[lastDates.length - 1] } },
      include: { breaks: true },
    }),
  ]);
  // 遅刻・打刻なしは「翌月の参考情報」と同じ集計を使う
  const late = await Promise.all(list.map((m) => referenceStats(addMonths(m, 1))));

  const byMonth = list.map((ym, i) => {
    const ss = sessions.filter((s) => s.businessDate.startsWith(ym));
    const t = totalsOf(ss);
    const stats = [...late[i].stats.values()];
    return {
      ym,
      workMinutes: t.workMinutes,
      staffCount: new Set(ss.map((s) => s.employeeId)).size,
      personDays: new Set(ss.map((s) => `${s.employeeId}|${s.businessDate}`)).size,
      late: stats.reduce((a, s) => a + s.late, 0),
      noShow: stats.reduce((a, s) => a + s.noShow, 0),
      hasShifts: late[i].hasShifts,
    };
  });

  const byStaff = employees
    .map((e) => ({
      employee: { id: e.id, name: e.name, active: e.active },
      months: list.map((ym, i) => {
        const t = totalsOf(sessions.filter((s) => s.employeeId === e.id && s.businessDate.startsWith(ym)));
        const st = late[i].stats.get(e.id);
        return { ym, workMinutes: t.workMinutes, workDays: t.workDays, late: st?.late ?? 0 };
      }),
    }))
    .filter((r) => r.employee.active || r.months.some((m) => m.workDays > 0));

  return { months: list, byMonth, byStaff };
}
