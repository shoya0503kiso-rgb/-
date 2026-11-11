// 外部連携（うりあげ帳への人件費の同期など）向けの勤怠データ。読み取り専用
import { diffDays, isValidDateStr, toJstLocal, type DateStr } from "@/lib/time";
import { prisma } from "./db";
import { UserError } from "./errors";

const MAX_DAYS = 62;

/** JST の "YYYY-MM-DDTHH:MM" */
const local = (d: Date | null) => (d ? toJstLocal(d) : null);

export async function exportAttendance(from: DateStr, to: DateStr) {
  if (!isValidDateStr(from) || !isValidDateStr(to)) throw new UserError("from・to は YYYY-MM-DD で指定してください");
  if (diffDays(from, to) < 0 || diffDays(from, to) > MAX_DAYS) throw new UserError(`期間は${MAX_DAYS}日以内で指定してください`);
  const [employees, sessions] = await Promise.all([
    prisma.employee.findMany({
      select: { id: true, name: true, kana: true, hourlyWage: true, active: true },
      orderBy: [{ sortOrder: "asc" }, { kana: "asc" }],
    }),
    prisma.workSession.findMany({
      where: { deletedAt: null, businessDate: { gte: from, lte: to } },
      include: { breaks: true },
      orderBy: [{ businessDate: "asc" }, { clockIn: "asc" }],
    }),
  ]);
  return {
    from,
    to,
    employees,
    sessions: sessions.map((s) => ({
      id: s.id,
      employeeId: s.employeeId,
      businessDate: s.businessDate,
      clockIn: local(s.clockIn),
      clockOut: local(s.clockOut),
      breaks: [...s.breaks]
        .sort((a, b) => a.start.getTime() - b.start.getTime())
        .map((b) => ({ start: local(b.start), end: local(b.end) })),
    })),
  };
}
