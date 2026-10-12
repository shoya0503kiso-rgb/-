import Link from "next/link";
import { AutoSubmitForm } from "@/components/AutoSubmitForm";
import { Badge, Card, Empty, LinkButton, PageHeader, Select, Stat, TableWrap, cx, td, th } from "@/components/ui";
import {
  addMonths,
  businessDateOf,
  formatDateJa,
  formatDuration,
  formatTime,
  formatYearMonthJa,
  isValidYearMonth,
  yearMonthOf,
} from "@/lib/time";
import { monthlyAttendance, monthlyTotalsAll } from "@/server/attendance";
import { listEmployees } from "@/server/employees";
import { getSettings } from "@/server/settings";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ employeeId?: string; ym?: string }> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  const ym = sp.ym && isValidYearMonth(sp.ym) ? sp.ym : yearMonthOf(businessDateOf(new Date(), settings.dayChangeHour));
  const employees = await listEmployees({ includeInactive: true });
  const employee = employees.find((e) => e.id === sp.employeeId);
  const q = (params: { employeeId?: string; ym?: string }) =>
    `/admin/attendance?${new URLSearchParams({ ...(employee ? { employeeId: employee.id } : {}), ym, ...params } as Record<string, string>)}`;

  const filter = (
    <AutoSubmitForm className="flex flex-wrap items-center gap-2" action="/admin/attendance">
      <Select name="employeeId" defaultValue={employee?.id ?? ""} className="w-auto">
        <option value="">全スタッフ（月合計）</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
            {e.active ? "" : "（退職）"}
          </option>
        ))}
      </Select>
      <input type="hidden" name="ym" value={ym} />
      <div className="flex items-center gap-1">
        <LinkButton variant="secondary" size="sm" href={q({ ym: addMonths(ym, -1) })}>◀ 前月</LinkButton>
        <span className="px-2 font-bold">{formatYearMonthJa(ym)}</span>
        <LinkButton variant="secondary" size="sm" href={q({ ym: addMonths(ym, 1) })}>翌月 ▶</LinkButton>
      </div>
    </AutoSubmitForm>
  );

  if (!employee) {
    const totals = await monthlyTotalsAll(ym);
    return (
      <>
        <PageHeader title="月次勤怠" description="スタッフを選ぶと日別の勤怠を表示します" />
        <div className="mb-4">{filter}</div>
        <Card title={`${formatYearMonthJa(ym)} 全スタッフ`}>
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>従業員</th>
                  <th className={th}>総勤務日数</th>
                  <th className={th}>総勤務時間（実働）</th>
                  <th className={th}>休憩合計</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {employees
                  .filter((e) => e.active || totals.has(e.id))
                  .map((e) => {
                    const t = totals.get(e.id);
                    return (
                      <tr key={e.id}>
                        <td className={td}>
                          <Link className="font-medium text-teal-800 underline" href={`/admin/attendance?employeeId=${e.id}&ym=${ym}`}>{e.name}</Link>
                        </td>
                        <td className={td}>{t?.workDays ?? 0}日</td>
                        <td className={td}>{formatDuration(t?.workMinutes ?? 0)}</td>
                        <td className={td}>{formatDuration(t?.breakMinutes ?? 0)}</td>
                        <td className={td}>{t && t.incompleteCount > 0 && <Badge color="amber">未完了 {t.incompleteCount}件</Badge>}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      </>
    );
  }

  const month = await monthlyAttendance(employee.id, ym);
  return (
    <>
      <PageHeader
        title={`${employee.name}さんの勤怠`}
        actions={
          <>
            <LinkButton variant="secondary" href={`/api/admin/export?ym=${ym}&employeeId=${employee.id}&format=xlsx`} prefetch={false}>Excel</LinkButton>
            <LinkButton href={`/admin/attendance/new?employeeId=${employee.id}`}>＋ 勤怠を追加</LinkButton>
          </>
        }
      />
      <div className="mb-4">{filter}</div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="総勤務時間（実働）" value={formatDuration(month.totals.workMinutes)} />
        <Stat label="総勤務日数" value={`${month.totals.workDays}日`} />
        <Stat label="休憩合計" value={formatDuration(month.totals.breakMinutes)} />
        <Stat label="未完了の勤怠" value={`${month.totals.incompleteCount}件`} tone={month.totals.incompleteCount ? "alert" : "default"} sub="出勤/退勤が欠けている" />
      </div>
      <Card>
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>日付</th>
                <th className={th}>出勤</th>
                <th className={th}>退勤</th>
                <th className={th}>休憩</th>
                <th className={th}>実働</th>
                <th className={th}>確認</th>
              </tr>
            </thead>
            <tbody>
              {month.days.map((day) => {
                const dateCell = (
                  <td className={cx(td, day.isHoliday && "text-red-700")}>
                    {formatDateJa(day.date)}
                  </td>
                );
                if (day.rows.length === 0) {
                  return (
                    <tr key={day.date} className="text-slate-400">
                      {dateCell}
                      <td className={td} colSpan={4}></td>
                      <td className={td}>
                        <Link className="text-xs text-slate-400 hover:text-teal-700" href={`/admin/attendance/new?employeeId=${employee.id}&date=${day.date}`}>＋追加</Link>
                      </td>
                    </tr>
                  );
                }
                return day.rows.map((r, i) => {
                  const open = r.anomalies.filter((a) => !a.acked);
                  return (
                    <tr key={r.session.id} className={open.length ? "bg-red-50/60" : ""}>
                      {i === 0 ? dateCell : <td className={td}></td>}
                      <td className={td}>
                        <Link className="text-teal-800 underline" href={`/admin/attendance/${r.session.id}`}>{formatTime(r.session.clockIn, day.date) || "—"}</Link>
                      </td>
                      <td className={td}>{formatTime(r.session.clockOut, day.date) || (r.summary.isOpen ? <Badge color="green">勤務中</Badge> : "—")}</td>
                      <td className={td}>{formatDuration(r.summary.breakMinutes)}</td>
                      <td className={cx(td, "font-medium")}>{formatDuration(r.summary.workMinutes)}</td>
                      <td className={td}>
                        <div className="flex flex-wrap gap-1">
                          {open.map((a) => (
                            <Link key={a.code} href={`/admin/attendance/${r.session.id}`}>
                              <Badge color="red">{a.label}</Badge>
                            </Link>
                          ))}
                          {r.anomalies.some((a) => a.acked) && <Badge color="gray">確認済</Badge>}
                        </div>
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td className={td}>合計</td>
                <td className={td} colSpan={2}>{month.totals.workDays}日</td>
                <td className={td}>{formatDuration(month.totals.breakMinutes)}</td>
                <td className={td}>{formatDuration(month.totals.workMinutes)}</td>
                <td className={td}></td>
              </tr>
            </tfoot>
          </table>
        </TableWrap>
        {month.days.every((d) => d.rows.length === 0) && <Empty>この月の勤怠はありません</Empty>}
      </Card>
      <p className="mt-2 text-xs text-slate-500">赤い日付は休日（店舗ルール上の休日）。「翌」は日付を跨いだ時刻です。</p>
    </>
  );
}
