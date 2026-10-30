import { Card, Empty, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/time";
import { prisma } from "@/server/db";
import { RedemptionButtons, RewardEditor } from "./RewardsClient";

export default async function RewardsAdmin() {
  const [pending, recent, rewards] = await Promise.all([
    prisma.redemption.findMany({ where: { status: "pending" }, include: { member: true }, orderBy: { createdAt: "asc" } }),
    prisma.redemption.findMany({ where: { status: { not: "pending" } }, include: { member: true }, orderBy: { handledAt: "desc" }, take: 20 }),
    prisma.reward.findMany({ orderBy: [{ sortOrder: "asc" }, { cost: "asc" }] }),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="ポイント交換" description="※交換の中身は仮置きです。お客さんがチケットを見せたら「提供済み」に。間違いは「取消」でポイントを戻せます" />
      <Card title={`未処理のチケット（${pending.length}件）`}>
        {pending.length === 0 ? (
          <Empty>ありません</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <span className="font-bold">{r.member.nickname}</span>　{r.rewardName}
                  <span className="ml-2 text-xs text-slate-500">
                    No. {r.id.slice(-6).toUpperCase()}・{formatDateTime(r.createdAt)}
                  </span>
                </div>
                <RedemptionButtons id={r.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <RewardEditor rewards={rewards.map((r) => ({ id: r.id, name: r.name, cost: r.cost, description: r.description, active: r.active, sortOrder: r.sortOrder }))} />
      <Card title="最近の処理">
        {recent.length === 0 ? (
          <Empty>まだありません</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {recent.map((r) => (
              <li key={r.id} className="py-1.5">
                {r.handledAt && formatDateTime(r.handledAt)}　{r.member.nickname}　{r.rewardName}　
                <span className={r.status === "done" ? "text-emerald-700" : "text-slate-500"}>{r.status === "done" ? "提供済み" : "取消"}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
