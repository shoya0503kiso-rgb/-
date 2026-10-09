import Link from "next/link";
import { Badge, Card, Empty, PageHeader, TableWrap, td, th } from "@/components/ui";
import { formatDateJa, formatDuration, formatTime } from "@/lib/time";
import { listOpenAnomalies } from "@/server/attendance";

export default async function AnomaliesPage() {
  const items = await listOpenAnomalies();
  return (
    <>
      <PageHeader title={`要確認勤怠 ${items.length}件`} description="自動チェックで不自然と判定された勤怠です。修正するか、問題なければ「確認済み」にしてください。" />
      <Card>
        {items.length === 0 ? (
          <Empty>要確認の勤怠はありません 🎉</Empty>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>日付</th>
                  <th className={th}>従業員</th>
                  <th className={th}>出勤〜退勤</th>
                  <th className={th}>実働/休憩</th>
                  <th className={th}>内容</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.sessionId} className="align-top">
                    <td className={td}>
                      <Link className="text-teal-800 underline" href={`/admin/attendance/${i.sessionId}`}>{formatDateJa(i.businessDate)}</Link>
                    </td>
                    <td className={td}>{i.employeeName}</td>
                    <td className={td}>{formatTime(i.clockIn, i.businessDate) || "—"}〜{formatTime(i.clockOut, i.businessDate) || "—"}</td>
                    <td className={td}>{formatDuration(i.workMinutes) || "—"} / {formatDuration(i.breakMinutes)}</td>
                    <td className={`${td} whitespace-normal`}>
                      <div className="space-y-1">
                        {i.anomalies.map((a) => (
                          <div key={a.code}>
                            <Badge color="red">{a.label}</Badge>
                            <div className="text-xs text-slate-600">{a.detail}</div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
