"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth";
import { acknowledgeAnomaly, createSession, deleteSession, updateSession } from "@/server/attendance";
import { runAction, UserError } from "@/server/errors";
import { parseJstLocal } from "@/lib/time";

export interface SessionFormValue {
  clockIn: string;
  clockOut: string;
  breaks: { start: string; end: string }[];
  reason: string;
}

function toInput(v: SessionFormValue) {
  const parse = (s: string, label: string) => {
    if (!s) return null;
    const d = parseJstLocal(s);
    if (!d) throw new UserError(`${label}の日時が正しくありません`);
    return d;
  };
  return {
    clockIn: parse(v.clockIn, "出勤"),
    clockOut: parse(v.clockOut, "退勤"),
    breaks: v.breaks
      .filter((b) => b.start || b.end)
      .map((b) => {
        const start = parse(b.start, "休憩開始");
        if (!start) throw new UserError("休憩開始を入力してください");
        return { start, end: parse(b.end, "休憩終了") };
      }),
  };
}

export async function saveSessionAction(sessionId: string | null, employeeId: string, value: SessionFormValue, version?: number) {
  const admin = await requireAdmin();
  const r = await runAction(async () => {
    const input = toInput(value);
    if (sessionId) {
      await updateSession(sessionId, input, value.reason, admin, version);
      return { id: sessionId };
    }
    const s = await createSession(employeeId, input, value.reason, admin);
    return { id: s.id };
  }, "保存しました");
  revalidatePath("/admin", "layout");
  return r;
}

export async function deleteSessionAction(sessionId: string, reason: string, version?: number) {
  const admin = await requireAdmin();
  const r = await runAction(() => deleteSession(sessionId, reason, admin, version), "削除しました");
  revalidatePath("/admin", "layout");
  return r;
}

export async function ackAnomalyAction(sessionId: string, code: string, note: string) {
  const admin = await requireAdmin();
  const r = await runAction(() => acknowledgeAnomaly(sessionId, code, note, admin), "確認済みにしました");
  revalidatePath("/admin", "layout");
  return r;
}
