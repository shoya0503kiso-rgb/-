import { Alert, Badge, Card, Empty, PageHeader, TableWrap, td, th } from "@/components/ui";
import { prisma } from "@/server/db";
import { isLineConfigured } from "@/server/line/client";
import { NOTIFICATION_KIND_LABELS } from "@/server/notify";
import { LineActions } from "./LineActions";

const STATUS = { PENDING: ["未送信", "amber"], SENT: ["送信済", "green"], FAILED: ["失敗", "red"], SKIPPED: ["スキップ", "gray"] } as const;

export default async function LinePage() {
  const [employees, notifications] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, include: { lineAccount: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.notification.findMany({ include: { employee: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const linked = employees.filter((e) => e.lineAccount).length;
  return (
    <div className="space-y-5">
      <PageHeader title="LINE連携" description="公式アカウント「シフト管理くん」の連携状況と通知履歴" />
      {!isLineConfigured() && (
        <Alert kind="warn">
          LINEのアクセストークンが未設定のため<b>モック送信</b>（実際には送らず履歴に記録のみ）です。設定方法は docs/04-line.md を参照してください。
        </Alert>
      )}
      <Card title={`連携状況 ${linked} / ${employees.length}人`}>
        <div className="flex flex-wrap gap-2">
          {employees.map((e) => (
            <a key={e.id} href={`/admin/employees/${e.id}`}>
              <Badge color={e.lineAccount ? "teal" : "gray"}>{e.name}{e.lineAccount ? " ✓" : "（未連携）"}</Badge>
            </a>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">未連携のスタッフは、従業員画面で連携コードを発行してLINEで送ってもらってください。</p>
      </Card>
      <Card title="操作">
        <LineActions />
      </Card>
      <Card title="通知履歴（最新100件）">
        {notifications.length === 0 ? (
          <Empty>通知はまだありません</Empty>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>日時</th>
                  <th className={th}>宛先</th>
                  <th className={th}>種類</th>
                  <th className={th}>状態</th>
                  <th className={th}>内容</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((n) => {
                  const [label, color] = STATUS[n.status as keyof typeof STATUS] ?? [n.status, "gray"];
                  return (
                    <tr key={n.id} className="align-top">
                      <td className={td}>{n.createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className={td}>{n.employee?.name ?? "—"}</td>
                      <td className={td}>{NOTIFICATION_KIND_LABELS[n.kind] ?? n.kind}</td>
                      <td className={td}>
                        <Badge color={color}>{label}</Badge>
                        {n.error && <div className="text-xs text-slate-500">{n.error}</div>}
                      </td>
                      <td className={`${td} whitespace-normal`}>
                        <details>
                          <summary className="cursor-pointer">{n.title}</summary>
                          <pre className="mt-1 max-w-md font-sans text-xs whitespace-pre-wrap text-slate-600">{n.body}</pre>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
