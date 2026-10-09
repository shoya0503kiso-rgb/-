// 毎日の定期処理（P-19）。何度実行しても結果が同じになるよう作る（通知は dedupeKey で一意）
import { businessDateOf, type YearMonth } from "@/lib/time";
import { prisma } from "./db";
import { dispatchPending } from "./notify";
import { getSettings } from "./settings";
import { closeCollection, getPeriod, isAcceptingRequests, nextTargetMonth, openCollection, sendReminders } from "./shifts/periods";

export async function runDaily(now = new Date()) {
  const settings = await getSettings();
  const day = Number(businessDateOf(now, settings.dayChangeHour).slice(8, 10));
  const ym: YearMonth = await nextTargetMonth(now);
  const log: string[] = [];

  // 締切を過ぎた受付を終了（対象月に関係なく）
  const expired = await prisma.shiftPeriod.findMany({ where: { status: "COLLECTING", deadline: { lte: now } } });
  for (const p of expired) {
    await closeCollection(p.yearMonth);
    log.push(`${p.yearMonth}: 受付終了`);
  }

  let period = await getPeriod(ym);
  // 提出依頼（依頼日〜締切日の間に一度だけ。手動で開始済みなら何もしない）
  if (day >= settings.requestNotifyDay && day <= settings.requestDeadlineDay && (!period || period.status === "PREPARING")) {
    try {
      const r = await openCollection(ym, now);
      period = r.period;
      log.push(`${ym}: 受付開始・提出依頼 ${r.queued}件`);
    } catch (e) {
      log.push(`${ym}: 受付開始できません（${e instanceof Error ? e.message : e}）`);
    }
  }

  // 未提出者リマインド
  if (period && day >= settings.requestReminderDay && isAcceptingRequests(period, now)) {
    const r = await sendReminders(ym, now);
    if (r.queued) log.push(`${ym}: リマインド ${r.queued}件`);
  }

  const sent = await dispatchPending();
  log.push(`送信: 成功${sent.sent}（うちモック${sent.mocked}）/ スキップ${sent.skipped} / 失敗${sent.failed}`);
  return { ym, log };
}
