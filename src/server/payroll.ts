// 給与目安（P-27）。勤怠データから計算するだけで保存しない
import { estimatePay } from "@/lib/payroll";
import { datesOfMonth, type YearMonth } from "@/lib/time";
import { prisma } from "./db";

function monthRange(ym: YearMonth) {
  const d = datesOfMonth(ym);
  return { gte: d[0], lte: d[d.length - 1] };
}

export async function payrollFor(employeeId: string, ym: YearMonth) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee?.hourlyWage) return null;
  const sessions = await prisma.workSession.findMany({
    where: { employeeId, deletedAt: null, businessDate: monthRange(ym) },
    include: { breaks: true },
  });
  return { wage: employee.hourlyWage, ...estimatePay(sessions, employee.hourlyWage) };
}

export async function payrollForMonth(ym: YearMonth) {
  const [employees, sessions] = await Promise.all([
    prisma.employee.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }] }),
    prisma.workSession.findMany({ where: { deletedAt: null, businessDate: monthRange(ym) }, include: { breaks: true } }),
  ]);
  return employees
    .filter((e) => e.active || sessions.some((s) => s.employeeId === e.id))
    .map((e) => {
      const mine = sessions.filter((s) => s.employeeId === e.id);
      return { employee: e, estimate: e.hourlyWage ? estimatePay(mine, e.hourlyWage) : null };
    });
}
