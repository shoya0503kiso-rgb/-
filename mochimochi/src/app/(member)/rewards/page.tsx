import { Panel } from "@/components/member/Panel";
import { formatDateTime } from "@/lib/time";
import { prisma } from "@/server/db";
import { requireMember } from "@/server/member-auth";
import { getSettings } from "@/server/settings";
import { RedeemButton } from "./RedeemButton";

export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const member = await requireMember("/rewards");
  const [s, rewards, tickets] = await Promise.all([
    getSettings(),
    prisma.reward.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { cost: "asc" }] }),
    prisma.redemption.findMany({ where: { memberId: member.id, status: "pending" }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">ポイント交換</h1>
      <p className="text-sm text-slate-600">
        いまの {s.pointName}：<b className="text-lg text-rose-600">{member.points.toLocaleString()}</b> pt
      </p>

      {tickets.length > 0 && (
        <Panel title="🎫 未使用のチケット（スタッフに見せてください）">
          <ul className="space-y-2">
            {tickets.map((t) => (
              <li key={t.id} className="rounded-xl border-2 border-dashed border-rose-300 bg-rose-50 p-3">
                <div className="font-bold">{t.rewardName}</div>
                <div className="mt-1 flex justify-between text-xs text-slate-600">
                  <span>No. {t.id.slice(-6).toUpperCase()}</span>
                  <span>{formatDateTime(t.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="交換できるもの">
        {rewards.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">準備中です</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rewards.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{r.name}</div>
                  {r.description && <div className="text-xs text-slate-500">{r.description}</div>}
                  <div className="text-sm text-rose-600">{r.cost.toLocaleString()} pt</div>
                </div>
                <RedeemButton id={r.id} name={r.name} cost={r.cost} disabled={member.points < r.cost} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="text-center text-xs text-slate-500">交換したチケットは、お店でスタッフに見せて使ってください</p>
    </div>
  );
}
