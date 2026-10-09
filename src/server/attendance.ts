// 勤怠の参照・修正・異常判定
import type { BreakPeriod, WorkSession } from "@prisma/client";
import { detectAnomalies, type Anomaly } from "@/lib/attendance/anomalies";
import { summarize, totalsOf } from "@/lib/attendance/calc";
import { businessDateOf, datesOfMonth, toJstLocal, truncateToMinute, type DateStr, type YearMonth } from "@/lib/time";
import { prisma } from "./db";
import { UserError } from "./errors";
import { anomalyRulesOf, getSettings, loadCalendar } from "./settings";

type SessionWithBreaks = WorkSession & { breaks: BreakPeriod[] };

export interface Editor {
  adminId: string;
  name: string;
}

const monthRange = (ym: YearMonth) => {
  const dates = datesOfMonth(ym);
  return { gte: dates[0], lte: dates[dates.length - 1] };
};

function sortBreaks<T extends { start: Date }>(breaks: T[]) {
  return [...breaks].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** 判定コンテキスト付きで勤怠を評価する */
async function evaluator(from: DateStr, to: DateStr, now = new Date()) {
  const settings = await getSettings();
  const calendar = await loadCalendar(from, to, settings);
  const rules = anomalyRulesOf(settings);
  return (s: SessionWithBreaks): Anomaly[] =>
    detectAnomalies(s, { rules, isHoliday: calendar.isHoliday(s.businessDate), now });
}

// ───── 月次勤怠 ─────

export async function monthlyAttendance(employeeId: string, ym: YearMonth, now = new Date()) {
  const range = monthRange(ym);
  const sessions = await prisma.workSession.findMany({
    where: { employeeId, deletedAt: null, businessDate: range },
    include: { breaks: true, acks: true },
    orderBy: [{ businessDate: "asc" }, { clockIn: "asc" }, { clockOut: "asc" }],
  });
  const evaluate = await evaluator(range.gte, range.lte, now);
  const calendar = await loadCalendar(range.gte, range.lte);
  const rows = sessions.map((s) => {
    const anomalies = evaluate(s);
    const acked = new Set(s.acks.filter((a) => a.sessionVersion === s.version).map((a) => a.code));
    return {
      session: { ...s, breaks: sortBreaks(s.breaks) },
      summary: summarize(s),
      anomalies: anomalies.map((a) => ({ ...a, acked: acked.has(a.code) })),
    };
  });
  return {
    days: datesOfMonth(ym).map((date) => ({
      date,
      isHoliday: calendar.isHoliday(date),
      rows: rows.filter((r) => r.session.businessDate === date),
    })),
    totals: totalsOf(sessions),
  };
}

/** 全スタッフの月合計（一覧・ダッシュボード用） */
export async function monthlyTotalsAll(ym: YearMonth) {
  const sessions = await prisma.workSession.findMany({
    where: { deletedAt: null, businessDate: monthRange(ym) },
    include: { breaks: true },
  });
  const byEmployee = new Map<string, SessionWithBreaks[]>();
  for (const s of sessions) byEmployee.set(s.employeeId, [...(byEmployee.get(s.employeeId) ?? []), s]);
  return new Map([...byEmployee].map(([id, list]) => [id, totalsOf(list)]));
}

// ───── 修正（履歴保存） ─────

export interface SessionInput {
  clockIn: Date | null;
  clockOut: Date | null;
  breaks: { start: Date; end: Date | null }[];
}

function snapshot(s: { businessDate: string; clockIn: Date | null; clockOut: Date | null; breaks: { start: Date; end: Date | null }[] } | null) {
  if (!s) return "null";
  return JSON.stringify({
    businessDate: s.businessDate,
    clockIn: toJstLocal(s.clockIn),
    clockOut: toJstLocal(s.clockOut),
    breaks: sortBreaks(s.breaks).map((b) => ({ start: toJstLocal(b.start), end: toJstLocal(b.end) })),
  });
}

function normalize(input: SessionInput, dayChangeHour: number) {
  const clockIn = input.clockIn ? truncateToMinute(input.clockIn) : null;
  const clockOut = input.clockOut ? truncateToMinute(input.clockOut) : null;
  if (!clockIn && !clockOut) throw new UserError("出勤か退勤のどちらかは入力してください");
  if (clockIn && clockOut && clockOut <= clockIn) {
    throw new UserError("退勤は出勤より後の時刻にしてください（日跨ぎの場合は翌日の日付を指定）");
  }
  const breaks = sortBreaks(
    input.breaks.map((b) => ({ start: truncateToMinute(b.start), end: b.end ? truncateToMinute(b.end) : null })),
  );
  for (const [i, b] of breaks.entries()) {
    if (b.end && b.end < b.start) throw new UserError("休憩の終了は開始より後にしてください");
    if (clockIn && b.start < clockIn) throw new UserError("休憩は出勤より後にしてください");
    if (clockOut && (b.end ?? b.start) > clockOut) throw new UserError("休憩は退勤より前にしてください");
    const prev = breaks[i - 1];
    if (prev && (!prev.end || b.start < prev.end)) throw new UserError("休憩の時間が重なっています");
  }
  const businessDate = businessDateOf((clockIn ?? clockOut)!, dayChangeHour);
  return { clockIn, clockOut, breaks, businessDate };
}

export async function getSessionDetail(id: string, now = new Date()) {
  const s = await prisma.workSession.findUnique({
    where: { id },
    include: {
      breaks: true,
      employee: true,
      revisions: { orderBy: { editedAt: "desc" } },
      acks: { orderBy: { ackedAt: "desc" } },
      punches: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!s) return null;
  const evaluate = await evaluator(s.businessDate, s.businessDate, now);
  const acked = new Set(s.acks.filter((a) => a.sessionVersion === s.version).map((a) => a.code));
  return {
    ...s,
    breaks: sortBreaks(s.breaks),
    summary: summarize(s),
    anomalies: s.deletedAt ? [] : evaluate(s).map((a) => ({ ...a, acked: acked.has(a.code) })),
  };
}

function requireReason(reason: string) {
  if (!reason.trim()) throw new UserError("修正理由を入力してください");
  return reason.trim();
}

export async function createSession(employeeId: string, input: SessionInput, reason: string, editor: Editor) {
  const why = requireReason(reason);
  const settings = await getSettings();
  const v = normalize(input, settings.dayChangeHour);
  return prisma.$transaction(async (tx) => {
    const s = await tx.workSession.create({
      data: {
        employeeId,
        businessDate: v.businessDate,
        clockIn: v.clockIn,
        clockOut: v.clockOut,
        breaks: { create: v.breaks },
      },
    });
    await tx.attendanceRevision.create({
      data: {
        sessionId: s.id,
        action: "CREATE",
        editedBy: editor.adminId,
        editorName: editor.name,
        reason: why,
        before: "null",
        after: snapshot(v),
      },
    });
    return s;
  });
}

export async function updateSession(id: string, input: SessionInput, reason: string, editor: Editor) {
  const why = requireReason(reason);
  const settings = await getSettings();
  const v = normalize(input, settings.dayChangeHour);
  return prisma.$transaction(async (tx) => {
    const before = await tx.workSession.findUnique({ where: { id }, include: { breaks: true } });
    if (!before || before.deletedAt) throw new UserError("勤怠が見つかりません");
    const after = snapshot(v);
    if (snapshot(before) === after) throw new UserError("変更がありません");
    await tx.breakPeriod.deleteMany({ where: { sessionId: id } });
    const s = await tx.workSession.update({
      where: { id },
      data: {
        businessDate: v.businessDate,
        clockIn: v.clockIn,
        clockOut: v.clockOut,
        version: { increment: 1 },
        breaks: { create: v.breaks },
      },
    });
    await tx.attendanceRevision.create({
      data: {
        sessionId: id,
        action: "UPDATE",
        editedBy: editor.adminId,
        editorName: editor.name,
        reason: why,
        before: snapshot(before),
        after,
      },
    });
    return s;
  });
}

export async function deleteSession(id: string, reason: string, editor: Editor) {
  const why = requireReason(reason);
  return prisma.$transaction(async (tx) => {
    const before = await tx.workSession.findUnique({ where: { id }, include: { breaks: true } });
    if (!before || before.deletedAt) throw new UserError("勤怠が見つかりません");
    await tx.workSession.update({ where: { id }, data: { deletedAt: new Date(), version: { increment: 1 } } });
    await tx.attendanceRevision.create({
      data: {
        sessionId: id,
        action: "DELETE",
        editedBy: editor.adminId,
        editorName: editor.name,
        reason: why,
        before: snapshot(before),
        after: "null",
      },
    });
  });
}

// ───── 要確認勤怠 ─────

export interface AnomalyItem {
  sessionId: string;
  employeeId: string;
  employeeName: string;
  businessDate: string;
  clockIn: Date | null;
  clockOut: Date | null;
  workMinutes: number | null;
  breakMinutes: number;
  anomalies: Anomaly[];
}

/** 未確認の要確認勤怠（新しい順）。from を省略すると全期間 */
export async function listOpenAnomalies(opts: { from?: DateStr; now?: Date } = {}): Promise<AnomalyItem[]> {
  const now = opts.now ?? new Date();
  const sessions = await prisma.workSession.findMany({
    where: { deletedAt: null, ...(opts.from ? { businessDate: { gte: opts.from } } : {}) },
    include: { breaks: true, acks: true, employee: true },
    orderBy: [{ businessDate: "desc" }, { clockIn: "desc" }],
  });
  if (sessions.length === 0) return [];
  const from = sessions[sessions.length - 1].businessDate;
  const evaluate = await evaluator(from, sessions[0].businessDate, now);
  const items: AnomalyItem[] = [];
  for (const s of sessions) {
    const acked = new Set(s.acks.filter((a) => a.sessionVersion === s.version).map((a) => a.code));
    const open = evaluate(s).filter((a) => !acked.has(a.code));
    if (open.length === 0) continue;
    const sum = summarize(s);
    items.push({
      sessionId: s.id,
      employeeId: s.employeeId,
      employeeName: s.employee.name,
      businessDate: s.businessDate,
      clockIn: s.clockIn,
      clockOut: s.clockOut,
      workMinutes: sum.workMinutes,
      breakMinutes: sum.breakMinutes,
      anomalies: open,
    });
  }
  return items;
}

/** 確認済みにする（P-14）。勤怠が修正されると無効になり再判定される */
export async function acknowledgeAnomaly(sessionId: string, code: string, note: string, editor: Editor) {
  const s = await prisma.workSession.findUnique({ where: { id: sessionId } });
  if (!s || s.deletedAt) throw new UserError("勤怠が見つかりません");
  await prisma.anomalyAck.upsert({
    where: { sessionId_code_sessionVersion: { sessionId, code, sessionVersion: s.version } },
    create: { sessionId, code, sessionVersion: s.version, ackedBy: editor.name, note: note.trim() },
    update: { ackedBy: editor.name, note: note.trim(), ackedAt: new Date() },
  });
}

// ───── 出力用 ─────

export async function exportRows(ym: YearMonth, employeeId?: string) {
  const sessions = await prisma.workSession.findMany({
    where: { deletedAt: null, businessDate: monthRange(ym), ...(employeeId ? { employeeId } : {}) },
    include: { breaks: true, employee: true },
    orderBy: [{ employee: { sortOrder: "asc" } }, { employee: { name: "asc" } }, { businessDate: "asc" }, { clockIn: "asc" }],
  });
  return sessions.map((s) => ({ employee: s.employee, session: s, summary: summarize(s) }));
}
