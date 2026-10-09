import Link from "next/link";
import { AutoSubmitForm } from "@/components/AutoSubmitForm";
import { Alert, Badge, Card, Input, PageHeader, TableWrap, td, th } from "@/components/ui";
import { businessDateOf, formatDuration, formatYearMonthJa, isValidYearMonth, yearMonthOf } from "@/lib/time";
import { payrollForMonth } from "@/server/payroll";
import { getSettings } from "@/server/settings";

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  const ym = sp.ym && isValidYearMonth(sp.ym) ? sp.ym : yearMonthOf(businessDateOf(new Date(), settings.dayChangeHour));
  const rows = await payrollForMonth(ym);
  const total = rows.reduce((s, r) => s + (r.estimate?.total ?? 0), 0);
  return (
    <>
      <PageHeader title="給与目安" description="時給 × 実働 ＋ 深夜割増（22:00〜翌5:00 25%）＋ 時間外割増（1勤務8時間超 25%）の概算です" />
      <div className="mb-4">
        <Alert kind="warn">交通費・週40時間超・休日の割増、控除は含みません。実際の給与計算は社労士の確認によります（P-27）。</Alert>
      </div>
      <Card title={`${formatYearMonthJa(ym)}　合計 ${yen(total)}`} actions={<AutoSubmitForm action="/admin/payroll"><Input type="month" name="ym" defaultValue={ym} className="w-auto" /></AutoSubmitForm>}>
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>従業員</th>
                <th className={th}>時給</th>
                <th className={th}>実働</th>
                <th className={th}>深夜</th>
                <th className={th}>8h超</th>
                <th className={`${th} text-right`}>基本</th>
                <th className={`${th} text-right`}>割増</th>
                <th className={`${th} text-right`}>目安合計</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ employee: e, estimate: p }) => (
                <tr key={e.id}>
                  <td className={td}>
                    <Link className="text-teal-800 underline" href={`/admin/attendance?employeeId=${e.id}&ym=${ym}`}>{e.name}</Link>
                    {p?.incompleteCount ? <span className="ml-1"><Badge color="amber">未完了 {p.incompleteCount}件</Badge></span> : null}
                  </td>
                  {p ? (
                    <>
                      <td className={td}>{yen(e.hourlyWage!)}</td>
                      <td className={td}>{formatDuration(p.workMinutes)}</td>
                      <td className={td}>{formatDuration(p.nightMinutes)}</td>
                      <td className={td}>{formatDuration(p.overtimeMinutes)}</td>
                      <td className={`${td} text-right`}>{yen(p.base)}</td>
                      <td className={`${td} text-right`}>{yen(p.nightPremium + p.overtimePremium)}</td>
                      <td className={`${td} text-right font-bold`}>{yen(p.total)}</td>
                    </>
                  ) : (
                    <td className={td} colSpan={7}>
                      <Link className="text-sm text-slate-500 underline" href={`/admin/employees/${e.id}`}>時給が未設定です</Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </>
  );
}
