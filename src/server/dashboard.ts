import { summarize } from "@/lib/attendance/calc";
import { addMonths, businessDateOf, shiftRangeOnBusinessDate, yearMonthOf } from "@/lib/time";
import { listOpenAnomalies, monthlyTotalsAll } from "./attendance";
import { prisma } from "./db";
import { kioskStatus } from "./punch";
import { getSettings } from "./settings";
import { failedCount } from "./notify";
import { publishedShiftsOn } from "./shifts/staff";
import { isAcceptingRequests, nextTargetMonth, periodOverview, publishDueDate } from "./shifts/periods";

export async function dashboard(now = new Date()) {
  const settings = await getSettings();
  const today = businessDateOf(now, settings.dayChangeHour);
  const ym = yearMonthOf(today);

  const [status, todaySessions, anomalies, totals, employees, todayShiftsRaw] = await Promise.all([
    kioskStatus(now),
    prisma.workSession.findMany({
      where: { businessDate: today, deletedAt: null },
      include: { breaks: true, employee: true },
      orderBy: { clockIn: "asc" },
    }),
    listOpenAnomalies({ now, from: `${addMonths(ym, -2)}-01` }),
    monthlyTotalsAll(ym),
    prisma.employee.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    publishedShiftsOn(today),
  ]);
  const nameOf = new Map(employees.map((e) => [e.id, e.name]));
  const todayShifts = todayShiftsRaw
    .map((a) => ({ ...a, employee: { name: nameOf.get(a.employeeId) ?? "（退職）" } }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // 今日の出勤者（勤務中・休憩中・退勤済み）
  const onDuty = status.filter((s) => s.status !== "OFF");
  const finished = todaySessions
    .filter((s) => s.clockOut && !onDuty.some((d) => d.id === s.employeeId))
    .map((s) => ({ id: s.employeeId, name: s.employee.name, sessionId: s.id, clockIn: s.clockIn, clockOut: s.clockOut, workMinutes: summarize(s).workMinutes }));

  // 未打刻：確定シフトの開始時刻（＋猶予）を過ぎても出勤打刻がない
  const clockedIn = new Set(todaySessions.filter((s) => s.clockIn).map((s) => s.employeeId));
  const notClockedIn = todayShifts
    .filter((a) => !clockedIn.has(a.employeeId) && !onDuty.some((d) => d.id === a.employeeId))
    .filter((a) => now.getTime() > shiftRangeOnBusinessDate(a.date, a.startTime, a.endTime, settings.dayChangeHour).start.getTime() + settings.lateGraceMinutes * 60_000)
    .map((a) => ({ id: a.employeeId, name: a.employee.name, startTime: a.startTime, endTime: a.endTime }));

  const monthWork = employees.map((e) => ({ id: e.id, name: e.name, ...(totals.get(e.id) ?? { workMinutes: 0, workDays: 0, breakMinutes: 0, incompleteCount: 0 }) }));

  // シフト：次に作る月の提出状況と期限
  const shiftYm = await nextTargetMonth(now);
  const overview = await periodOverview(shiftYm);
  const shift = {
    ym: shiftYm,
    status: overview.period.status,
    accepting: isAcceptingRequests(overview.period, now),
    deadline: overview.period.deadline,
    publishDue: publishDueDate(shiftYm, settings),
    rate: overview.rate,
    submittedCount: overview.submittedCount,
    total: overview.total,
    notSubmitted: overview.rows.filter((r) => !r.submission).map((r) => ({ id: r.employee.id, name: r.employee.name })),
  };

  return {
    today,
    shift,
    lineFailed: await failedCount(),
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
