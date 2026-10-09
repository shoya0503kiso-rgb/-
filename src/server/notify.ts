// 通知アウトボックス。業務処理は enqueue するだけで、送信は dispatchPending が行う（LINEと疎結合）。
import { prisma } from "./db";
import { push, text } from "./line/client";

export type NotificationKind = "SHIFT_REQUEST" | "SHIFT_REMINDER" | "SHIFT_PUBLISHED" | "SHIFT_CHANGED" | "TEXT";

export const NOTIFICATION_KIND_LABELS: Record<string, string> = {
  SHIFT_REQUEST: "提出依頼",
  SHIFT_REMINDER: "提出リマインド",
  SHIFT_PUBLISHED: "確定シフト",
  SHIFT_CHANGED: "シフト変更",
  TEXT: "お知らせ",
};

const MAX_ATTEMPTS = 3;
/** 送信中のまま止まった通知（処理が途中で落ちた）を再送対象にするまでの時間 */
const SENDING_TIMEOUT_MS = 10 * 60 * 1000;

/** 通知を積む。同じ dedupeKey が既にあれば何もしない（二重送信防止） */
export async function enqueue(n: { employeeId: string; kind: NotificationKind; title: string; body: string; dedupeKey: string }) {
  const exists = await prisma.notification.findUnique({ where: { dedupeKey: n.dedupeKey } });
  if (exists) return { created: false, notification: exists };
  try {
    return { created: true, notification: await prisma.notification.create({ data: n }) };
  } catch {
    // 同時実行で先に作られた場合
    const again = await prisma.notification.findUnique({ where: { dedupeKey: n.dedupeKey } });
    if (again) return { created: false, notification: again };
    throw new Error("通知の登録に失敗しました");
  }
}

/** 未送信・失敗（上限未満）の通知を送信する */
export async function dispatchPending(limit = 200) {
  const pending = await prisma.notification.findMany({
    where: {
      OR: [
        { status: "PENDING" },
        { status: "FAILED", attempts: { lt: MAX_ATTEMPTS } },
        { status: "SENDING", createdAt: { lt: new Date(Date.now() - SENDING_TIMEOUT_MS) } },
      ],
    },
    include: { employee: { include: { lineAccount: true } } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const result = { sent: 0, skipped: 0, failed: 0, mocked: 0 };
  for (const n of pending) {
    // 同時に動いた別の送信処理と同じ通知を二重に送らないよう、1件ずつ確保してから送る
    const claimed = await prisma.notification.updateMany({
      where: { id: n.id, status: n.status, attempts: n.attempts },
      data: { status: "SENDING" },
    });
    if (claimed.count !== 1) continue;
    const lineUserId = n.employee?.lineAccount?.lineUserId;
    if (!n.employee || !n.employee.active || !lineUserId) {
      await prisma.notification.update({
        where: { id: n.id },
        data: { status: "SKIPPED", error: !n.employee?.active ? "在籍していません" : "LINE未連携" },
      });
      result.skipped++;
      continue;
    }
    try {
      const r = await push(lineUserId, [text(n.body)]);
      await prisma.notification.update({
        where: { id: n.id },
        data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, error: r.mocked ? "モック送信（LINE未設定）" : "" },
      });
      result.sent++;
      if (r.mocked) result.mocked++;
    } catch (e) {
      await prisma.notification.update({
        where: { id: n.id },
        data: { status: "FAILED", attempts: { increment: 1 }, error: String(e instanceof Error ? e.message : e).slice(0, 500) },
      });
      result.failed++;
    }
  }
  return result;
}

/** 送信失敗（再送上限に達したものを含む）を未送信に戻す */
export async function retryFailed() {
  const r = await prisma.notification.updateMany({ where: { status: "FAILED" }, data: { status: "PENDING", attempts: 0 } });
  return r.count;
}

export function failedCount() {
  return prisma.notification.count({ where: { status: "FAILED" } });
}
