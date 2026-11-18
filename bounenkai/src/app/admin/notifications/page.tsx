import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/server/auth";
import { recentNotifications } from "@/server/reservations";

const STATUS = { sent: { label: "送信済み", color: "green" }, mock: { label: "未設定のため送信なし", color: "amber" }, failed: { label: "送信失敗", color: "red" } } as const;

export default async function NotificationsPage() {
  await requireAdmin();
  const logs = await recentNotifications(100);
  return (
    <div className="space-y-4">
      <PageHeader
        title="通知履歴"
        description="予約が入ったときの LINE 通知と、お客さんへの確認メール（新しい順・最新100件）。LINE・メールの設定がまだのときは送らずにここだけに残ります。"
      />
      <Card>
        {logs.length === 0 ? (
          <Empty>まだ通知はありません</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {logs.map((l) => {
              const st = STATUS[l.status as keyof typeof STATUS] ?? { label: l.status, color: "gray" as const };
              return (
                <li key={l.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge color={l.channel === "line" ? "green" : "blue"}>{l.channel === "line" ? "LINE" : "メール"}</Badge>
                    <Badge color={st.color}>{st.label}</Badge>
                    <span className="text-slate-500">{l.createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</span>
                    {l.to && <span className="text-slate-500">宛先：{l.to}</span>}
                  </div>
                  {l.error && <p className="mt-1 text-sm text-red-700">{l.error}</p>}
                  <details className="mt-1">
                    <summary className="cursor-pointer text-sm text-slate-600">内容を見る</summary>
                    <pre className="mt-1 text-xs whitespace-pre-wrap text-slate-700">{l.body}</pre>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
