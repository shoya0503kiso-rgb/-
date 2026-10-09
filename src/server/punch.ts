// 打刻処理。打刻はすべて PunchLog に記録し、WorkSession / BreakPeriod を更新する。
import { isStaleOpen } from "@/lib/attendance/anomalies";
import { businessDateOf, formatTime, truncateToMinute } from "@/lib/time";
import { prisma, type Tx } from "./db";
import { verifyPin } from "./employees";
import { UserError } from "./errors";
import { anomalyRulesOf, getSettings } from "./settings";

export type PunchType = "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END";
export type PunchSource = "KIOSK" | "ADMIN" | "LINE";

export const PUNCH_LABELS: Record<PunchType, string> = {
  CLOCK_IN: "出勤",
  CLOCK_OUT: "退勤",
  BREAK_START: "休憩開始",
  BREAK_END: "休憩終了",
};

export type WorkStatus = "OFF" | "WORKING" | "ON_BREAK";

/** 同じ打刻を連打したとみなす間隔 */
const DOUBLE_TAP_MS = 2 * 60 * 1000;
const PIN_LOCK_FAILURES = 5;
const PIN_LOCK_WINDOW_MS = 10 * 60 * 1000;
/** 退勤のない勤怠を探す範囲（これより古いものは必ず古い扱い） */
const OPEN_LOOKBACK_MS = 24 * 60 * 60 * 1000;

type Rules = ReturnType<typeof anomalyRulesOf>;

/**
 * 現在勤務中の勤怠。退勤漏れで古くなったもの（isStaleOpen）は除く。
 * includeStale = true（退勤打刻）なら、古くても24時間以内の勤怠を対象にする
 * （閉店後に片付けて遅く退勤した場合に勤怠が2件に割れないように）
 */
async function findOpenSession(tx: Tx, employeeId: string, now: Date, rules: Rules, includeStale = false) {
  const candidates = await tx.workSession.findMany({
    where: {
      employeeId,
      deletedAt: null,
      clockOut: null,
      clockIn: { not: null, gte: new Date(now.getTime() - OPEN_LOOKBACK_MS), lte: now },
    },
    orderBy: { clockIn: "desc" },
    include: { breaks: true },
  });
  const fresh = candidates.find((s) => !isStaleOpen({ businessDate: s.businessDate, clockIn: s.clockIn! }, rules, now));
  return fresh ?? (includeStale ? (candidates[0] ?? null) : null);
}

export interface PunchResult {
  type: PunchType;
  at: Date;
  employeeName: string;
  message: string;
  status: WorkStatus;
}

class Rejected extends Error {}

export async function punch(params: {
  employeeId: string;
  type: PunchType;
  source: PunchSource;
  deviceId?: string;
  pin?: string;
  now?: Date;
}): Promise<PunchResult> {
  const settings = await getSettings();
  const rules = anomalyRulesOf(settings);
  const at = truncateToMinute(params.now ?? new Date());
  const employee = await prisma.employee.findUnique({ where: { id: params.employeeId } });
  if (!employee) throw new UserError("従業員が見つかりません");

  const log = (result: "OK" | "REJECTED", message: string, sessionId?: string, tx: Tx = prisma) =>
    tx.punchLog.create({
      data: {
        employeeId: employee.id,
        type: params.type,
        at,
        source: params.source,
        deviceId: params.deviceId,
        sessionId,
        result,
        message,
      },
    });

  if (employee.pinHash) {
    const recentFailures = await prisma.punchLog.count({
      where: {
        employeeId: employee.id,
        result: "REJECTED",
        message: "PIN不一致",
        createdAt: { gte: new Date(Date.now() - PIN_LOCK_WINDOW_MS) },
      },
    });
    if (recentFailures >= PIN_LOCK_FAILURES) {
      throw new UserError("PINを続けて間違えたため、10分間打刻できません。管理者に連絡してください。");
    }
    if (!(await verifyPin(employee.pinHash, params.pin))) {
      await log("REJECTED", "PIN不一致");
      throw new UserError("PINが違います");
    }
  }

  const reject = (message: string): never => {
    throw new Rejected(message);
  };

  try {
    return await prisma.$transaction(async (tx) => {
      // 同じ従業員の同時打刻を直列化する（行ロック）
      await tx.employee.update({ where: { id: employee.id }, data: { updatedAt: new Date() } });

      // 連打防止：直前の成功打刻と同じ種類なら拒否
      const last = await tx.punchLog.findFirst({
        where: { employeeId: employee.id, result: "OK" },
        orderBy: { createdAt: "desc" },
      });
      if (last && last.type === params.type && Math.abs(at.getTime() - last.at.getTime()) < DOUBLE_TAP_MS) {
        reject(`${PUNCH_LABELS[params.type]}は打刻済みです（${formatTime(last.at)}）`);
      }

      const open = await findOpenSession(tx, employee.id, at, rules, params.type === "CLOCK_OUT");
      const openBreak = open?.breaks.find((b) => !b.end);
      // 退職・休止にされたスタッフも、勤務中なら退勤・休憩はできる
      if (!employee.active && (!open || params.type === "CLOCK_IN")) reject("従業員が見つかりません");

      const done = async (sessionId: string, status: WorkStatus, message: string): Promise<PunchResult> => {
        await log("OK", "", sessionId, tx);
        return { type: params.type, at, employeeName: employee.name, message, status };
      };
      // 打刻で勤怠が変わったら version を上げる（確認済みの再判定・管理者の同時編集検知のため）
      const touch = (id: string, data: { clockOut?: Date } = {}) =>
        tx.workSession.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
      const label = `${employee.name}さん ${PUNCH_LABELS[params.type]} ${formatTime(at)}`;

      switch (params.type) {
        case "CLOCK_IN": {
          if (open) return reject(`すでに出勤中です（${formatTime(open.clockIn)} 出勤）`);
          const s = await tx.workSession.create({
            data: { employeeId: employee.id, businessDate: businessDateOf(at, settings.dayChangeHour), clockIn: at },
          });
          return done(s.id, "WORKING", label);
        }
        case "BREAK_START": {
          if (!open) return reject("出勤打刻がありません。先に出勤を押してください。");
          if (openBreak) return reject("すでに休憩中です");
          await tx.breakPeriod.create({ data: { sessionId: open.id, start: at } });
          await touch(open.id);
          return done(open.id, "ON_BREAK", label);
        }
        case "BREAK_END": {
          if (!open || !openBreak) return reject("休憩中ではありません");
          await tx.breakPeriod.update({ where: { id: openBreak.id }, data: { end: at } });
          await touch(open.id);
          return done(open.id, "WORKING", label);
        }
        case "CLOCK_OUT": {
          if (open) {
            if (openBreak) await tx.breakPeriod.update({ where: { id: openBreak.id }, data: { end: at, autoEnded: true } });
            await touch(open.id, { clockOut: at });
            return done(open.id, "OFF", openBreak ? `${label}（休憩も終了しました）` : label);
          }
          // 出勤打刻なしの退勤：記録して要確認にする（P-07）
          const s = await tx.workSession.create({
            data: { employeeId: employee.id, businessDate: businessDateOf(at, settings.dayChangeHour), clockOut: at },
          });
          return done(s.id, "OFF", `${label}（出勤打刻がないため管理者に確認を依頼しました）`);
        }
      }
    });
  } catch (e) {
    if (e instanceof Rejected) {
      await log("REJECTED", e.message);
      throw new UserError(e.message);
    }
    throw e;
  }
}

export interface KioskEmployee {
  id: string;
  name: string;
  kana: string;
  hasPin: boolean;
  status: WorkStatus;
  since: Date | null;
  /** 未出勤だが、24時間以内に退勤していない勤務がある（その出勤時刻）。退勤ボタンで閉じられる */
  pendingSince: Date | null;
}

/** 打刻画面に表示する従業員と現在の状態（勤務中なら退職扱いでも表示する） */
export async function kioskStatus(now = new Date()): Promise<KioskEmployee[]> {
  const settings = await getSettings();
  const rules = anomalyRulesOf(settings);
  const [employees, openSessions] = await Promise.all([
    prisma.employee.findMany({ orderBy: [{ sortOrder: "asc" }, { kana: "asc" }, { name: "asc" }] }),
    prisma.workSession.findMany({
      where: { deletedAt: null, clockOut: null, clockIn: { not: null, gte: new Date(now.getTime() - OPEN_LOOKBACK_MS), lte: now } },
      include: { breaks: { where: { end: null } } },
      orderBy: { clockIn: "desc" },
    }),
  ]);
  const byEmployee = new Map<string, (typeof openSessions)[number]>();
  const pending = new Map<string, Date>();
  for (const s of openSessions) {
    if (isStaleOpen({ businessDate: s.businessDate, clockIn: s.clockIn! }, rules, now)) {
      if (!pending.has(s.employeeId)) pending.set(s.employeeId, s.clockIn!);
      continue;
    }
    if (!byEmployee.has(s.employeeId)) byEmployee.set(s.employeeId, s);
  }
  return employees
    .filter((e) => e.active || byEmployee.has(e.id))
    .map((e) => {
      const s = byEmployee.get(e.id);
      const br = s?.breaks[0];
      return {
        id: e.id,
        name: e.name,
        kana: e.kana,
        hasPin: !!e.pinHash,
        status: !s ? "OFF" : br ? "ON_BREAK" : "WORKING",
        since: br ? br.start : (s?.clockIn ?? null),
        pendingSince: s ? null : (pending.get(e.id) ?? null),
      };
    });
}
