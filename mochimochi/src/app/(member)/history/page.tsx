import { Panel } from "@/components/member/Panel";
import { formatDateTime } from "@/lib/time";
import { prisma } from "@/server/db";
import { requireMember } from "@/server/member-auth";
import { KIND_LABEL } from "@/server/points";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const member = await requireMember("/history");
  const txs = await prisma.pointTransaction.findMany({ where: { memberId: member.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">ポイント履歴</h1>
      <Panel>
        {txs.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">まだ履歴がありません</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {txs.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{KIND_LABEL[t.kind] ?? t.kind}</div>
                  <div className="truncate text-xs text-slate-500">
                    {formatDateTime(t.createdAt)} {t.note}
                  </div>
                </div>
                <span className={`shrink-0 font-bold ${t.amount > 0 ? "text-rose-600" : "text-slate-600"}`}>
                  {t.amount > 0 ? "+" : ""}
                  {t.amount.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="text-center text-xs text-slate-500">直近100件を表示しています</p>
    </div>
  );
}
