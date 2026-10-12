import { Card, PageHeader, TableWrap, td, th } from "@/components/ui";
import { businessDateOf, formatDuration, yearMonthOf } from "@/lib/time";
import { monthlyAnalytics } from "@/server/analytics";
import { getSettings } from "@/server/settings";

const label = (ym: string) => `${Number(ym.slice(5))}月`;

export default async function AnalyticsPage() {
  const settings = await getSettings();
  const ym = yearMonthOf(businessDateOf(new Date(), settings.dayChangeHour));
  const a = await monthlyAnalytics(ym, 6);
  const max = Math.max(1, ...a.byMonth.map((m) => m.workMinutes));
  return (
    <div className="space-y-5">
      <PageHeader title="勤怠分析" description="直近6か月の推移（今月は途中まで）。遅刻・打刻なしは公開済みシフトとの比較です" />

      <Card title="総実働時間（全スタッフ）">
        <div className="flex h-48 items-end gap-3 border-b border-slate-300 px-2" role="img" aria-label="月別の総実働時間">
          {a.byMonth.map((m) => (
            <div key={m.ym} className="group relative flex h-full flex-1 flex-col items-center justify-end">
              <span className="mb-1 text-xs text-slate-600 tabular-nums">{Math.round(m.workMinutes / 60)}h</span>
              <div className="w-full max-w-10 rounded-t bg-teal-700" style={{ height: `${(m.workMinutes / max) * 80}%`, minHeight: m.workMinutes ? 2 : 0 }} />
              <div className="pointer-events-none absolute bottom-full z-10 mb-6 hidden rounded-lg bg-slate-900 px-3 py-2 text-xs whitespace-nowrap text-white shadow group-hover:block">
                {label(m.ym)}：実働 {formatDuration(m.workMinutes)}・延べ {m.personDays}人日・{m.staffCount}人
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 px-2 pt-1">
          {a.byMonth.map((m) => <div key={m.ym} className="flex-1 text-center text-xs text-slate-600">{label(m.ym)}</div>)}
        </div>
        <TableWrap>
          <table className="mt-4 w-full">
            <thead>
              <tr>
                <th className={th}>月</th>
                <th className={th}>総実働</th>
                <th className={th}>延べ勤務</th>
                <th className={th}>出勤した人数</th>
                <th className={th}>遅刻</th>
                <th className={th}>シフトあり打刻なし</th>
              </tr>
            </thead>
            <tbody>
              {a.byMonth.map((m) => (
                <tr key={m.ym}>
                  <td className={td}>{label(m.ym)}</td>
                  <td className={td}>{formatDuration(m.workMinutes)}</td>
                  <td className={td}>{m.personDays}人日</td>
                  <td className={td}>{m.staffCount}人</td>
                  <td className={td}>{m.hasShifts ? `${m.late}回` : "—"}</td>
                  <td className={td}>{m.hasShifts ? `${m.noShow}回` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card title="スタッフ別 実働時間（勤務日数・遅刻）">
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>従業員</th>
                {a.months.map((m) => <th key={m} className={th}>{label(m)}</th>)}
              </tr>
            </thead>
            <tbody>
              {a.byStaff.map((r) => (
                <tr key={r.employee.id} className={r.employee.active ? "" : "text-slate-400"}>
                  <td className={td}>{r.employee.name}</td>
                  {r.months.map((m) => (
                    <td key={m.ym} className={td}>
                      {m.workDays ? (
                        <>
                          {formatDuration(m.workMinutes)}
                          <span className="ml-1 text-xs text-slate-500">{m.workDays}日{m.late ? `・遅刻${m.late}` : ""}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        <p className="mt-2 text-xs text-slate-500">遅刻などの実績は参考情報です。シフトの優先度・日数は店長が月次条件で決めます（自動では変えません）。</p>
      </Card>
    </div>
  );
}
