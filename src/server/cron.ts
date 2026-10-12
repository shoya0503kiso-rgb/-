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

  const period = await getPeriod(ym);
  // 提出依頼（依頼日〜締切日の間に一度だけ。手動で開始済みなら何もしない）
  if (day >= settings.requestNotifyDay && day <= settings.requestDeadlineDay && (!period || period.status === "PREPARING")) {
    try {
      const r = await openCollection(ym, now);
      log.push(`${ym}: 受付開始・提出依頼 ${r.queued}件`);
    } catch (e) {
      log.push(`${ym}: 受付開始できません（${e instanceof Error ? e.message : e}）`);
    }
  }

  // 未提出者リマインド（期間につき1回。締切延長で月をまたいだ受付中の期間も対象）
  const collecting = await prisma.shiftPeriod.findMany({ where: { status: "COLLECTING" } });
  for (const p of collecting) {
    if (!isAcceptingRequests(p, now)) continue;
    const dueByDay = p.yearMonth === ym ? day >= settings.requestReminderDay : true;
    if (!dueByDay) continue;
    const r = await sendReminders(p.yearMonth, now);
    if (r.queued) log.push(`${p.yearMonth}: リマインド ${r.queued}件`);
  }

  const sent = await dispatchPending();
  log.push(`送信: 成功${sent.sent}（うちモック${sent.mocked}）/ スキップ${sent.skipped} / 失敗${sent.failed}`);
  return { ym, log };
}
