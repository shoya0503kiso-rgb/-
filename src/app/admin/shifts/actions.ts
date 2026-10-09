"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth";
import { runAction, UserError } from "@/server/errors";
import { dispatchPending } from "@/server/notify";
import { closeCollection, extendDeadline, openCollection, sendReminders } from "@/server/shifts/periods";
import { submitRequest, type RequestDayInput } from "@/server/shifts/requests";
import { isValidDateStr, isValidYearMonth } from "@/lib/time";

function checkYm(ym: string) {
  if (!isValidYearMonth(ym)) throw new UserError("対象月が正しくありません");
}

function done(ym: string) {
  revalidatePath("/admin", "layout");
  revalidatePath(`/admin/shifts/${ym}`);
}

export async function openCollectionAction(ym: string) {
  await requireAdmin();
  const r = await runAction(async () => {
    checkYm(ym);
    const { queued } = await openCollection(ym);
    const sent = await dispatchPending();
    return `受付を開始しました（提出依頼 ${queued}件、送信 ${sent.sent}件・LINE未連携 ${sent.skipped}件）`;
  });
  done(ym);
  return r;
}

export async function remindAction(ym: string) {
  await requireAdmin();
  const r = await runAction(async () => {
    checkYm(ym);
    const { queued } = await sendReminders(ym);
    const sent = await dispatchPending();
    return queued ? `未提出者 ${queued}人にリマインドしました（送信 ${sent.sent}件・LINE未連携 ${sent.skipped}件）` : "今日のリマインドは送信済み、または未提出者はいません";
  });
  done(ym);
  return r;
}

export async function closeCollectionAction(ym: string) {
  await requireAdmin();
  const r = await runAction(async () => {
    checkYm(ym);
    await closeCollection(ym);
    return "受付を終了しました";
  });
  done(ym);
  return r;
}

export async function extendDeadlineAction(ym: string, date: string) {
  await requireAdmin();
  const r = await runAction(async () => {
    checkYm(ym);
    if (!isValidDateStr(date)) throw new UserError("日付が正しくありません");
    await extendDeadline(ym, date);
    return "締切を変更しました";
  });
  done(ym);
  return r;
}

export async function adminSubmitRequestAction(ym: string, employeeId: string, days: RequestDayInput[], comment: string) {
  await requireAdmin();
  const r = await runAction(async () => {
    checkYm(ym);
    const res = await submitRequest(employeeId, ym, { days, comment }, "ADMIN");
    return { okDays: res.okDays };
  }, "代理入力を保存しました");
  done(ym);
  return r;
}
