import { summarize } from "@/lib/attendance/calc";
import { businessDateOf, rangeOnDate, yearMonthOf } from "@/lib/time";
import { listOpenAnomalies, monthlyTotalsAll } from "./attendance";
import { prisma } from "./db";
import { kioskStatus } from "./punch";
import { getSettings } from "./settings";

export async function dashboard(now = new Date()) {
  const settings = await getSettings();
  const today = businessDateOf(now, settings.dayChangeHour);
  const ym = yearMonthOf(today);

  const [status, todaySessions, anomalies, totals, employees, todayShifts] = await Promise.all([
    kioskStatus(now),
    prisma.workSession.findMany({
      where: { businessDate: today, deletedAt: null },
      include: { breaks: true, employee: true },
      orderBy: { clockIn: "asc" },
    }),
    listOpenAnomalies({ now }),
    monthlyTotalsAll(ym),
    prisma.employee.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.shiftAssignment.findMany({
      where: { date: today, period: { status: "PUBLISHED" } },
      include: { employee: true },
      orderBy: { startTime: "asc" },
    }),
  ]);

  // 今日の出勤者（勤務中・休憩中・退勤済み）
  const onDuty = status.filter((s) => s.status !== "OFF");
  const finished = todaySessions
    .filter((s) => s.clockOut && !onDuty.some((d) => d.id === s.employeeId))
    .map((s) => ({ id: s.employeeId, name: s.employee.name, sessionId: s.id, clockIn: s.clockIn, clockOut: s.clockOut, workMinutes: summarize(s).workMinutes }));

  // 未打刻：確定シフトの開始時刻（＋猶予）を過ぎても出勤打刻がない
  const clockedIn = new Set(todaySessions.filter((s) => s.clockIn).map((s) => s.employeeId));
  const notClockedIn = todayShifts
    .filter((a) => !clockedIn.has(a.employeeId) && !onDuty.some((d) => d.id === a.employeeId))
    .filter((a) => now.getTime() > rangeOnDate(a.date, a.startTime, a.endTime).start.getTime() + settings.lateGraceMinutes * 60_000)
    .map((a) => ({ id: a.employeeId, name: a.employee.name, startTime: a.startTime, endTime: a.endTime }));

  const monthWork = employees.map((e) => ({ id: e.id, name: e.name, ...(totals.get(e.id) ?? { workMinutes: 0, workDays: 0, breakMinutes: 0, incompleteCount: 0 }) }));

  return {
    today,
    ym,
    onDuty,
    finished,
    notClockedIn,
    todayShifts: todayShifts.map((a) => ({ id: a.employeeId, name: a.employee.name, startTime: a.startTime, endTime: a.endTime })),
    anomalyCount: anomalies.length,
    anomalies: anomalies.slice(0, 5),
    monthWork,
    monthTotalMinutes: monthWork.reduce((s, e) => s + e.workMinutes, 0),
  };
}
