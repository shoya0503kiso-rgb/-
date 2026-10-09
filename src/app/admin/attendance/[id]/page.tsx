import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Card, PageHeader, TableWrap, td, th } from "@/components/ui";
import { formatDateJa, formatDuration, formatTime, toJstLocal, yearMonthOf } from "@/lib/time";
import { getSessionDetail } from "@/server/attendance";
import { PUNCH_LABELS, type PunchType } from "@/server/punch";
import { AckButton } from "../AckButton";
import { SessionForm } from "../SessionForm";

type Snapshot = { businessDate: string; clockIn: string; clockOut: string; breaks: { start: string; end: string }[] } | null;

function describe(json: string) {
  const s = JSON.parse(json) as Snapshot;
  if (!s) return "—";
  const t = (v: string) => v.replace("T", " ");
  const breaks = s.breaks.map((b) => `${t(b.start).slice(11)}〜${t(b.end).slice(11) || "?"}`).join(", ");
  return `出勤 ${t(s.clockIn) || "なし"} / 退勤 ${t(s.clockOut) || "なし"} / 休憩 ${breaks || "なし"}`;
}

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSessionDetail(id);
  if (!s) notFound();
  const back = `/admin/attendance?employeeId=${s.employeeId}&ym=${yearMonthOf(s.businessDate)}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${s.employee.name}　${formatDateJa(s.businessDate)}`}
        description={<Link href={back} className="text-teal-700 underline">← 月次勤怠に戻る</Link>}
      />
      {s.deletedAt && <Alert kind="warn">この勤怠は削除されています（履歴のみ表示）</Alert>}

      <div className="grid gap-3 sm:grid-cols-4">
        <Card><div className="text-xs text-slate-500">出勤</div><div className="text-xl font-bold">{formatTime(s.clockIn, s.businessDate) || "—"}</div></Card>
        <Card><div className="text-xs text-slate-500">退勤</div><div className="text-xl font-bold">{formatTime(s.clockOut, s.businessDate) || "—"}</div></Card>
        <Card><div className="text-xs text-slate-500">休憩</div><div className="text-xl font-bold">{formatDuration(s.summary.breakMinutes)}</div></Card>
        <Card><div className="text-xs text-slate-500">実働</div><div className="text-xl font-bold">{formatDuration(s.summary.workMinutes) || "—"}</div></Card>
      </div>

      {s.anomalies.length > 0 && (
        <Card title="要確認">
          <ul className="space-y-3">
            {s.anomalies.map((a) => (
              <li key={a.code} className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Badge color={a.acked ? "gray" : "red"}>{a.label}</Badge>
                  <p className="mt-1 text-sm text-slate-700">{a.detail}</p>
                </div>
                {a.acked ? <span className="text-sm text-slate-500">確認済み</span> : <AckButton sessionId={s.id} code={a.code} />}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">時刻を修正すると自動で再判定されます。問題がない場合は「確認済みにする」を押してください。</p>
        </Card>
      )}

      {!s.deletedAt && (
        <Card title="修正">
          <SessionForm
            key={s.version}
            sessionId={s.id}
            employeeId={s.employeeId}
            version={s.version}
            initial={{
              clockIn: toJstLocal(s.clockIn),
              clockOut: toJstLocal(s.clockOut),
              breaks: s.breaks.map((b) => ({ start: toJstLocal(b.start), end: toJstLocal(b.end) })),
            }}
          />
        </Card>
      )}

      <Card title="修正履歴">
        {s.revisions.length === 0 ? (
          <p className="text-sm text-slate-500">修正履歴はありません（打刻のまま）</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {s.revisions.map((r) => (
              <li key={r.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap gap-2 text-slate-600">
                  <Badge color={r.action === "DELETE" ? "red" : r.action === "CREATE" ? "blue" : "amber"}>
                    {{ CREATE: "追加", UPDATE: "修正", DELETE: "削除" }[r.action] ?? r.action}
                  </Badge>
                  {r.editedAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}　{r.editorName}
                </div>
                <div className="mt-1">理由：{r.reason}</div>
                <div className="mt-1 text-slate-500">修正前：{describe(r.before)}</div>
                <div className="text-slate-900">修正後：{describe(r.after)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="打刻ログ">
        {s.punches.length === 0 ? (
          <p className="text-sm text-slate-500">打刻ログはありません（管理者が追加した勤怠）</p>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr><th className={th}>種類</th><th className={th}>時刻</th><th className={th}>経路</th></tr>
              </thead>
              <tbody>
                {s.punches.map((p) => (
                  <tr key={p.id}>
                    <td className={td}>{PUNCH_LABELS[p.type as PunchType] ?? p.type}</td>
                    <td className={td}>{formatTime(p.at, s.businessDate)}</td>
                    <td className={td}>{p.source === "KIOSK" ? "店舗iPad" : p.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        {s.acks.length > 0 && (
          <div className="mt-4 text-sm text-slate-600">
            確認済み記録：
            {s.acks.map((a) => (
              <div key={a.id}>・{a.ackedAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} {a.ackedBy}{a.note && `「${a.note}」`}</div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
