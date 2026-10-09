// LINE トークのコマンド処理。勤怠・シフトのサービス関数だけを呼ぶ（LINEの都合を業務ロジックに持ち込まない）
import { addMonths, businessDateOf, formatDurationJa, formatYearMonthJa, yearMonthOf } from "@/lib/time";
import { monthlyAttendance } from "../attendance";
import { payrollFor } from "../payroll";
import { getSettings } from "../settings";
import { activeRequestMonth, formatDeadline, getPeriod, isAcceptingRequests } from "../shifts/periods";
import { myShifts } from "../shifts/staff";
import { staffUrl } from "../staff-link";
import { employeeByLineUser, linkByCode } from "./link";

export const HELP_TEXT =
  "【シフト管理くん】使い方\n" +
  "・「シフト提出」… 希望シフトの提出\n" +
  "・「シフト確認」… 確定シフトの確認\n" +
  "・「勤務時間」… 今月の勤務時間\n" +
  "・「給与目安」… 今月の給与の目安\n" +
  "※ 初めての方は、店長から受け取った6桁の連携コードを送ってください。";

const normalize = (s: string) =>
  s
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, "");

export async function handleText(lineUserId: string, input: string, displayName = "", now = new Date()): Promise<string> {
  const text = normalize(input);

  if (/^\d{6}$/.test(text)) {
    const r = await linkByCode(text, lineUserId, displayName, now);
    if (!r.ok && r.reason === "locked") return "連携コードを続けて間違えたため、しばらく受け付けられません。時間をおいて店長に確認してください。";
    if (!r.ok) return "連携コードが正しくないか、有効期限（24時間）が切れています。店長に新しいコードを発行してもらってください。";
    const employee = r.employee;
    return `${employee.name}さんのLINE連携が完了しました！\nシフト提出のお知らせや確定シフトがこのトークに届きます。\n\n${HELP_TEXT}`;
  }

  const employee = await employeeByLineUser(lineUserId);
  if (!employee) {
    return "まだ従業員として連携されていません。店長から受け取った6桁の連携コードを送ってください。";
  }

  if (text.includes("提出")) {
    const ym = await activeRequestMonth(now);
    const period = await getPeriod(ym);
    if (!period || !isAcceptingRequests(period, now)) {
      return `現在、シフト希望の受付期間ではありません。\n（${formatYearMonthJa(ym)}分の受付は毎月中旬に案内します）`;
    }
    return `${formatYearMonthJa(ym)}の希望シフトを ${formatDeadline(period.deadline)} までに提出してください。\n\n▼提出はこちら（${employee.name}さん専用）\n${staffUrl(employee, "submit", now, period.deadline)}`;
  }

  if (text.includes("給与") || text.includes("給料")) {
    const settings = await getSettings();
    const ym = yearMonthOf(businessDateOf(now, settings.dayChangeHour));
    const p = await payrollFor(employee.id, ym);
    if (!p) return "時給が登録されていないため、給与目安を計算できません。店長に確認してください。";
    return (
      `${employee.name}さんの${formatYearMonthJa(ym)}の給与目安（${formatDurationJa(p.workMinutes)}勤務）\n` +
      `約 ${p.total.toLocaleString("ja-JP")}円\n` +
      `（基本 ${p.base.toLocaleString("ja-JP")}円＋深夜・時間外割増 ${(p.nightPremium + p.overtimePremium).toLocaleString("ja-JP")}円）\n` +
      "※ 交通費・控除などは含まない目安です。確定額は給与明細で確認してください。"
    );
  }

  // 「勤務時間確認」のような入力は勤務時間を優先する
  if (text.includes("勤務") || text.includes("時間")) {
    const settings = await getSettings();
    const ym = yearMonthOf(businessDateOf(now, settings.dayChangeHour));
    const { totals } = await monthlyAttendance(employee.id, ym, now);
    return (
      `${employee.name}さんの${formatYearMonthJa(ym)}の勤務\n` +
      `勤務日数：${totals.workDays}日\n実働時間：${formatDurationJa(totals.workMinutes)}` +
      (totals.incompleteCount ? `\n※ 打刻が未完了の勤務が${totals.incompleteCount}件あります（勤務中を含む）` : "") +
      `\n\n▼詳細\n${staffUrl(employee, "me", now)}`
    );
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
    return `${employee.name}さんの確定シフト\n\n${parts.join("\n\n")}\n\n▼詳細\n${staffUrl(employee, "me", now)}`;
  }

  return HELP_TEXT;
}
