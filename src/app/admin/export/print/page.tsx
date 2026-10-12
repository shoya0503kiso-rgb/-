import { totalsOf } from "@/lib/attendance/calc";
import { datesOfMonth, formatDuration, formatTime, formatYearMonthJa, isValidYearMonth, WEEKDAY_JA, weekdayOf } from "@/lib/time";
import { exportRows } from "@/server/attendance";
import { getSettings } from "@/server/settings";
import { PrintButton } from "./PrintButton";

export default async function PrintPage({ searchParams }: { searchParams: Promise<{ ym?: string; employeeId?: string }> }) {
  const sp = await searchParams;
  if (!sp.ym || !isValidYearMonth(sp.ym)) return <p>対象月が不正です</p>;
  const ym = sp.ym;
  const [rows, settings] = await Promise.all([exportRows(ym, sp.employeeId || undefined), getSettings()]);
  const byEmployee = new Map<string, typeof rows>();
  for (const r of rows) byEmployee.set(r.employee.id, [...(byEmployee.get(r.employee.id) ?? []), r]);
  const cell = "border border-slate-400 px-1.5 py-0.5";

  return (
    <div className="bg-white text-[11px] text-black">
      <div className="no-print mb-4 flex items-center gap-3">
        <PrintButton />
        <span className="text-sm text-slate-600">スタッフごとに改ページされます</span>
      </div>
      {byEmployee.size === 0 && <p>この月の勤怠はありません</p>}
      {[...byEmployee.values()].map((list) => {
        const t = totalsOf(list.map((r) => r.session));
        return (
          <section key={list[0].employee.id} className="mb-8 break-after-page">
            <h1 className="mb-1 text-base font-bold">勤怠記録　{formatYearMonthJa(ym)}　{list[0].employee.name}</h1>
            <p className="mb-2">{settings.storeName}　総勤務日数 {t.workDays}日　総勤務時間 {formatDuration(t.workMinutes)}　休憩合計 {formatDuration(t.breakMinutes)}</p>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  {["日付", "曜日", "出勤", "退勤", "休憩", "実働時間"].map((h) => <th key={h} className={cell}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {datesOfMonth(ym).flatMap((date) => {
                  const ss = list.filter((r) => r.session.businessDate === date);
                  const wd = WEEKDAY_JA[weekdayOf(date)];
                  if (ss.length === 0) return [<tr key={date}><td className={cell}>{date.slice(5)}</td><td className={cell}>{wd}</td><td className={cell} /><td className={cell} /><td className={cell} /><td className={cell} /></tr>];
                  return ss.map((r) => (
                    <tr key={r.session.id}>
                      <td className={cell}>{date.slice(5)}</td>
                      <td className={cell}>{wd}</td>
                      <td className={cell}>{formatTime(r.session.clockIn, date) || "打刻なし"}</td>
                      <td className={cell}>{formatTime(r.session.clockOut, date) || "打刻なし"}</td>
                      <td className={cell}>{formatDuration(r.summary.breakMinutes)}</td>
                      <td className={cell}>{formatDuration(r.summary.workMinutes)}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
