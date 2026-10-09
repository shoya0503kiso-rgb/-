"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth";
import { runAction, UserError } from "@/server/errors";
import { dispatchPending } from "@/server/notify";
import { closeCollection, extendDeadline, openCollection, sendReminders } from "@/server/shifts/periods";
import { submitRequest, type RequestDayInput } from "@/server/shifts/requests";
import { isValidDateStr, isValidYearMonth } from "@/lib/time";
import { addPair, copyFromPreviousMonth, removePair, saveConditions, type ConditionValue } from "@/server/shifts/conditions";
import { runGeneration, setAssignment } from "@/server/shifts/board";
import { createPattern, saveStaffingRules, setStaffingOverride, updatePattern, type PatternInput } from "@/server/shifts/patterns";
import { publishPeriod } from "@/server/shifts/publish";

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
    const { queued } = await sendReminders(ym, new Date(), { manual: true });
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
    const r = await extendDeadline(ym, date);
    const sent = r.queued ? await dispatchPending() : null;
    return r.queued ? `締切を変更し、未提出者 ${r.queued}人に知らせました（送信 ${sent!.sent}件）` : "締切を変更しました";
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

// ───── Phase 3：枠・必要人数、月次条件、生成・編集・公開 ─────

export async function savePatternAction(id: string | null, input: PatternInput & { active?: boolean }) {
  await requireAdmin();
  const r = await runAction(async () => {
    if (!id) {
      await createPattern(input);
      return;
    }
    const { moved } = await updatePattern(id, input);
    return moved ? `保存しました。今日以降のこの枠の配置 ${moved}件の時刻も変更しました（公開済みの月は「変更を公開・通知」で知らせてください）` : undefined;
  }, "保存しました");
  revalidatePath("/admin/shifts", "layout");
  return r;
}

export async function saveStaffingRulesAction(counts: Record<number, Record<string, number>>) {
  await requireAdmin();
  const r = await runAction(() => saveStaffingRules(counts), "必要人数を保存しました");
  revalidatePath("/admin/shifts", "layout");
  return r;
}

export async function setOverrideAction(date: string, patternId: string, count: number | null) {
  await requireAdmin();
  const r = await runAction(async () => {
    if (!isValidDateStr(date)) throw new UserError("日付が正しくありません");
    await setStaffingOverride(date, patternId, count);
  }, "保存しました");
  revalidatePath("/admin/shifts", "layout");
  return r;
}

export async function saveConditionsAction(ym: string, values: ConditionValue[]) {
  await requireAdmin();
  const r = await runAction(async () => {
    checkYm(ym);
    await saveConditions(ym, values);
  }, "月次条件を保存しました");
  done(ym);
  return r;
}

export async function copyConditionsAction(ym: string) {
  await requireAdmin();
  const r = await runAction(async () => {
    checkYm(ym);
    const c = await copyFromPreviousMonth(ym);
    return `前月から ${c.copied}人分の条件と ${c.pairs}件の相性条件をコピーしました（今月分が既にある人はそのまま）`;
  });
  done(ym);
  return r;
}

export async function addPairAction(ym: string, a: string, b: string, strength: "HARD" | "SOFT", memo: string) {
  await requireAdmin();
  const r = await runAction(async () => {
    checkYm(ym);
    await addPair(ym, a, b, strength, memo);
  }, "相性条件を追加しました");
  done(ym);
  return r;
}

export async function removePairAction(ym: string, id: string) {
  await requireAdmin();
  const r = await runAction(() => removePair(id), "削除しました");
  done(ym);
  return r;
}

export async function generateAction(ym: string, keepManual: boolean) {
  const admin = await requireAdmin();
  const r = await runAction(async () => {
    checkYm(ym);
    const rep = await runGeneration(ym, admin, { keepManual });
    return rep.shortages.length
      ? `シフト案を作成しました。不足が ${rep.shortages.length}枠 あります（下のレポートを確認してください）`
      : "シフト案を作成しました。必要人数はすべて満たしています";
  });
  done(ym);
  return r;
}

export async function setAssignmentAction(
  ym: string,
  date: string,
  employeeId: string,
  choice: { patternId: string } | { custom: { startTime: string; endTime: string } } | null,
) {
  await requireAdmin();
  const r = await runAction(async () => {
    checkYm(ym);
    return (await setAssignment(ym, date, employeeId, choice)).warnings;
  });
  done(ym);
  return r;
}

export async function publishAction(ym: string) {
  const admin = await requireAdmin();
  const r = await runAction(async () => {
    checkYm(ym);
    const p = await publishPeriod(ym, admin);
    const sent = await dispatchPending();
    return p.version === 1
      ? `公開しました。全員（${p.notified}人）に確定シフトを通知しました（送信 ${sent.sent}件・LINE未連携 ${sent.skipped}件）`
      : `変更を公開しました。変更があった ${p.notified}人に通知しました`;
  });
  done(ym);
  return r;
}
