"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth";
import { runDaily } from "@/server/cron";
import { runAction } from "@/server/errors";
import { dispatchPending, retryFailed } from "@/server/notify";

export async function dispatchAction() {
  await requireAdmin();
  const r = await runAction(async () => {
    const s = await dispatchPending();
    return `送信 ${s.sent}件（モック ${s.mocked}）・スキップ ${s.skipped}件・失敗 ${s.failed}件`;
  });
  revalidatePath("/admin/line");
  return r;
}

export async function runDailyAction() {
  await requireAdmin();
  const r = await runAction(async () => (await runDaily()).log.join("\n"));
  revalidatePath("/admin", "layout");
  return r;
}

export async function retryFailedAction() {
  await requireAdmin();
  const r = await runAction(async () => {
    const n = await retryFailed();
    const s = await dispatchPending();
    return `失敗した ${n}件を再送しました：送信 ${s.sent}件・失敗 ${s.failed}件`;
  });
  revalidatePath("/admin", "layout");
  return r;
}
