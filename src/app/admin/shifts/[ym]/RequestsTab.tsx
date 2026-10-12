import Link from "next/link";
import { Badge, Card, Stat, TableWrap, td, th } from "@/components/ui";
import { addDays, jstDateStr } from "@/lib/time";
import { formatDeadline, isAcceptingRequests, periodOverview } from "@/server/shifts/periods";
import { PeriodActions } from "../PeriodActions";

export async function RequestsTab({ ym }: { ym: string }) {
  const o = await periodOverview(ym);
  const accepting = isAcceptingRequests(o.period);
  const deadlineDate = addDays(jstDateStr(o.period.deadline), -1);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="提出率" value={`${o.rate}%`} sub={`${o.submittedCount} / ${o.total}人`} tone={o.rate === 100 ? "good" : "default"} />
        <Stat label="未提出" value={`${o.total - o.submittedCount}人`} tone={accepting && o.total > o.submittedCount ? "alert" : "default"} />
        <Stat label="締切" value={<span className="text-lg">{formatDeadline(o.period.deadline)}</span>} sub={accepting ? "受付中" : "受付していません"} />
      </div>
      <Card title="受付操作">
        <PeriodActions ym={ym} status={o.period.status} accepting={accepting} deadlineDate={deadlineDate} />
      </Card>
      <Card title="スタッフ別">
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>従業員</th>
                <th className={th}>提出</th>
                <th className={th}>出勤可</th>
                <th className={th}>LINE</th>
                <th className={th}>メモ</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {o.rows.map((r) => (
                <tr key={r.employee.id}>
                  <td className={td}>{r.employee.name}</td>
                  <td className={td}>
                    {r.submission ? (
                      <span className="flex items-center gap-1">
                        <Badge color="green">提出済</Badge>
                        {r.submission.submittedBy === "ADMIN" && <Badge>代理</Badge>}
                      </span>
                    ) : (
                      <Badge color="red">未提出</Badge>
                    )}
                  </td>
                  <td className={td}>{r.submission ? `${r.okDays}日` : "—"}</td>
                  <td className={td}>{r.employee.lineAccount ? <Badge color="teal">連携済</Badge> : <span className="text-xs text-slate-400">未連携</span>}</td>
                  <td className={`${td} max-w-60 truncate`} title={r.submission?.comment}>{r.submission?.comment}</td>
                  <td className={td}>
                    <Link className="text-sm text-teal-800 underline" href={`/admin/shifts/${ym}/requests/${r.employee.id}`}>
                      {r.submission ? "確認・修正" : "代理入力"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}

