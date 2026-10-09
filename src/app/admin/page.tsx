import Link from "next/link";
import { Badge, Card, Empty, Stat, TableWrap, td, th } from "@/components/ui";
import { formatDateJa, formatDuration, formatHmRange, formatTime, formatYearMonthJa } from "@/lib/time";
import { PERIOD_STATUS_LABELS, formatDeadline } from "@/server/shifts/periods";
import { dashboard } from "@/server/dashboard";

export default async function AdminHome() {
  const d = await dashboard();
  const hm = (date: Date | null) => formatTime(date, d.today);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold sm:text-2xl">ダッシュボード</h1>
        <span className="text-sm text-slate-600">営業日 {formatDateJa(d.today)}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="要確認勤怠" value={`${d.anomalyCount}件`} href="/admin/anomalies" tone={d.anomalyCount > 0 ? "alert" : "good"} sub={d.anomalyCount > 0 ? "タップして確認" : "問題なし"} />
        <Stat label="今日の出勤者" value={`${d.onDuty.length + d.finished.length}人`} sub={`勤務中 ${d.onDuty.length}人`} />
        <Stat label="未打刻" value={`${d.notClockedIn.length}人`} tone={d.notClockedIn.length > 0 ? "alert" : "default"} sub="シフト開始を過ぎて出勤なし" />
        <Stat label={`${formatYearMonthJa(d.ym)}の総実働`} value={formatDuration(d.monthTotalMinutes)} href={`/admin/attendance?ym=${d.ym}`} sub="全スタッフ合計" />
      </div>

      {d.lineFailed > 0 && (
        <Link href="/admin/line" className="block rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          LINE送信失敗 {d.lineFailed}件 — タップして確認・再送
        </Link>
      )}

      <Card
        title={`${formatYearMonthJa(d.shift.ym)}のシフト`}
        actions={<Link className="text-sm text-teal-700 underline" href={`/admin/shifts/${d.shift.ym}`}>シフト画面へ</Link>}
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="状態" value={<span className="text-lg">{PERIOD_STATUS_LABELS[d.shift.status]}</span>} />
          <Stat label="シフト提出率" value={`${d.shift.rate}%`} sub={`${d.shift.submittedCount} / ${d.shift.total}人`} tone={d.shift.rate === 100 ? "good" : "default"} />
          <Stat label="提出締切" value={<span className="text-lg">{formatDeadline(d.shift.deadline)}</span>} sub={d.shift.accepting ? "受付中" : "受付していません"} />
          <Stat label="次回シフト作成期限" value={<span className="text-lg">{formatDateJa(d.shift.publishDue)}</span>} sub="公開予定日" />
        </div>
        {d.shift.notSubmitted.length > 0 && d.shift.status !== "PREPARING" && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-red-700">シフト未提出者 {d.shift.notSubmitted.length}人：</span>
            {d.shift.notSubmitted.map((e) => (
              <Badge key={e.id} color="red">{e.name}</Badge>
            ))}
          </div>
        )}
      </Card>

      {d.anomalyCount > 0 && (
        <Card title={<span className="text-red-700">要確認勤怠 {d.anomalyCount}件</span>} actions={<Link className="text-sm text-teal-700 underline" href="/admin/anomalies">すべて見る</Link>}>
          <ul className="divide-y divide-slate-100">
            {d.anomalies.map((a) => (
              <li key={a.sessionId}>
                <Link href={`/admin/attendance/${a.sessionId}`} className="flex flex-wrap items-center gap-2 py-2 hover:bg-slate-50">
                  <span className="w-24 text-sm text-slate-600">{formatDateJa(a.businessDate)}</span>
                  <span className="font-medium">{a.employeeName}</span>
                  {a.anomalies.map((x) => (
                    <Badge key={x.code} color="red">{x.label}</Badge>
                  ))}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="今日の出勤者">
          {d.onDuty.length + d.finished.length === 0 ? (
            <Empty>まだ出勤者はいません</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.onDuty.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2">
                  <span className="font-medium">{e.name}</span>
                  <span className="flex items-center gap-2 text-sm">
                    <Badge color={e.status === "WORKING" ? "green" : "amber"}>{e.status === "WORKING" ? "勤務中" : "休憩中"}</Badge>
                    {hm(e.since)}〜
                  </span>
                </li>
              ))}
              {d.finished.map((e) => (
                <li key={e.sessionId} className="flex items-center justify-between py-2">
                  <span className="font-medium">{e.name}</span>
                  <span className="flex items-center gap-2 text-sm text-slate-600">
                    <Badge>退勤済</Badge>
                    {hm(e.clockIn)}〜{hm(e.clockOut)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="今日のシフト・未打刻">
          {d.todayShifts.length === 0 ? (
            <Empty>今日の確定シフトはありません</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.todayShifts.map((s) => {
                const missing = d.notClockedIn.some((n) => n.id === s.id);
                return (
                  <li key={s.id} className="flex items-center justify-between py-2">
                    <span className="font-medium">{s.name}</span>
                    <span className="flex items-center gap-2 text-sm">
                      {missing && <Badge color="red">未打刻</Badge>}
                      {formatHmRange(s.startTime, s.endTime)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card title={`${formatYearMonthJa(d.ym)}の勤務状況`} actions={<Link className="text-sm text-teal-700 underline" href={`/admin/attendance?ym=${d.ym}`}>月次勤怠へ</Link>}>
        {d.monthWork.length === 0 ? (
          <Empty>従業員が登録されていません</Empty>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>従業員</th>
                  <th className={th}>勤務日数</th>
                  <th className={th}>実働合計</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {d.monthWork.map((e) => (
                  <tr key={e.id}>
                    <td className={td}>
                      <Link className="text-teal-800 underline" href={`/admin/attendance?employeeId=${e.id}&ym=${d.ym}`}>{e.name}</Link>
                    </td>
                    <td className={td}>{e.workDays}日</td>
                    <td className={td}>{formatDuration(e.workMinutes)}</td>
                    <td className={td}>{e.incompleteCount > 0 && <Badge color="amber">未完了 {e.incompleteCount}件</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
