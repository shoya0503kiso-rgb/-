// LINE トークのコマンド処理。勤怠・シフトのサービス関数だけを呼ぶ（LINEの都合を業務ロジックに持ち込まない）
import { addMonths, businessDateOf, formatDurationJa, formatYearMonthJa, yearMonthOf } from "@/lib/time";
import { monthlyAttendance } from "../attendance";
import { getSettings } from "../settings";
import { formatDeadline, getPeriod, isAcceptingRequests, nextTargetMonth } from "../shifts/periods";
import { myShifts } from "../shifts/staff";
import { staffUrl } from "../staff-link";
import { employeeByLineUser, linkByCode } from "./link";

export const HELP_TEXT =
  "【シフト管理くん】使い方\n" +
  "・「シフト提出」… 希望シフトの提出\n" +
  "・「シフト確認」… 確定シフトの確認\n" +
  "・「勤務時間」… 今月の勤務時間\n" +
  "※ 初めての方は、店長から受け取った6桁の連携コードを送ってください。";

const normalize = (s: string) =>
  s
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, "");

export async function handleText(lineUserId: string, input: string, displayName = "", now = new Date()): Promise<string> {
  const text = normalize(input);

  if (/^\d{6}$/.test(text)) {
    const employee = await linkByCode(text, lineUserId, displayName, now);
    if (!employee) return "連携コードが正しくないか、有効期限（24時間）が切れています。店長に新しいコードを発行してもらってください。";
    return `${employee.name}さんのLINE連携が完了しました！\nシフト提出のお知らせや確定シフトがこのトークに届きます。\n\n${HELP_TEXT}`;
  }

  const employee = await employeeByLineUser(lineUserId);
  if (!employee) {
    return "まだ従業員として連携されていません。店長から受け取った6桁の連携コードを送ってください。";
  }

  if (text.includes("提出")) {
    const ym = await nextTargetMonth(now);
    const period = await getPeriod(ym);
    if (!period || !isAcceptingRequests(period, now)) {
      return `現在、シフト希望の受付期間ではありません。\n（${formatYearMonthJa(ym)}分の受付は毎月中旬に案内します）`;
    }
    return `${formatYearMonthJa(ym)}の希望シフトを ${formatDeadline(period.deadline)} までに提出してください。\n\n▼提出はこちら（${employee.name}さん専用）\n${staffUrl(employee.id, "submit", now)}`;
  }

  if (text.includes("確認") || text.includes("シフト")) {
    const settings = await getSettings();
    const ym = yearMonthOf(businessDateOf(now, settings.dayChangeHour));
    const parts: string[] = [];
    for (const m of [ym, addMonths(ym, 1)]) {
      const s = await myShifts(employee.id, m);
      if (s.published) parts.push(`■${formatYearMonthJa(m)}（${s.items.length}日）\n${s.lines || "シフトはありません"}`);
    }
    if (parts.length === 0) return "公開されている確定シフトはまだありません。";
    return `${employee.name}さんの確定シフト\n\n${parts.join("\n\n")}\n\n▼詳細\n${staffUrl(employee.id, "me", now)}`;
  }

  if (text.includes("勤務") || text.includes("時間")) {
    const settings = await getSettings();
    const ym = yearMonthOf(businessDateOf(now, settings.dayChangeHour));
    const { totals } = await monthlyAttendance(employee.id, ym, now);
    return (
      `${employee.name}さんの${formatYearMonthJa(ym)}の勤務\n` +
      `勤務日数：${totals.workDays}日\n実働時間：${formatDurationJa(totals.workMinutes)}` +
      (totals.incompleteCount ? `\n※ 打刻が未完了の勤務が${totals.incompleteCount}件あります（勤務中を含む）` : "") +
      `\n\n▼詳細\n${staffUrl(employee.id, "me", now)}`
    );
  }

  return HELP_TEXT;
}
