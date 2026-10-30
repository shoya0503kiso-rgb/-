import { notFound } from "next/navigation";
import { Card, PageHeader, Stat, TableWrap, td, th } from "@/components/ui";
import { formatDateTime, monthOf } from "@/lib/time";
import { prisma } from "@/server/db";
import { KIND_LABEL } from "@/server/points";
import { myRankings } from "@/server/rankings";
import { getRankTiers, getSettings, rankFor, today } from "@/server/settings";
import { MemberPanels } from "./MemberPanels";

export default async function MemberDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await prisma.member.findUnique({ where: { id } });
  if (!member) notFound();
  const [s, tiers, date] = await Promise.all([getSettings(), getRankTiers(), today()]);
  const [txs, ranks, admins] = await Promise.all([
    prisma.pointTransaction.findMany({ where: { memberId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
    myRankings(id, monthOf(date)),
    prisma.adminUser.findMany({ select: { id: true, name: true } }),
  ]);
  const adminName = new Map(admins.map((a) => [a.id, a.name]));
  const rank = rankFor(member.visitCount, tiers);

  return (
    <div className="space-y-4">
      <PageHeader title={`${member.nickname} さん`} description={`登録 ${formatDateTime(member.createdAt)}${member.lineUserId ? "・LINE連携済み" : "・LINE未連携"}`} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={s.pointName} value={member.points.toLocaleString()} />
        <Stat label="ランク" value={rank.current.name} sub={`来店 ${member.visitCount}回`} />
        <Stat label="スタンプ" value={`${member.stampCount} / ${s.stampsPerCard}`} sub={`達成 ${member.completedCards}枚`} />
        <Stat label="累計もち" value={member.mochiTotal.toLocaleString()} />
      </div>
      <p className="text-sm text-slate-600">
        今月の順位：ダーツ {ranks.darts ? `${ranks.darts.rank}位` : "—"}／ポーカー {ranks.poker ? `${ranks.poker.rank}位` : "—"}／サブマリン{" "}
        {ranks.submarine ? `${ranks.submarine.rank}位（${ranks.submarine.value}杯）` : "—"}
      </p>
      <MemberPanels member={{ id: member.id, nickname: member.nickname, memo: member.memo, active: member.active }} />
      <Card title="ポイント履歴（直近100件）">
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>日時</th>
                <th className={th}>内容</th>
                <th className={`${th} text-right`}>増減</th>
                <th className={th}>メモ</th>
                <th className={th}>担当</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.id}>
                  <td className={td}>{formatDateTime(t.createdAt)}</td>
                  <td className={td}>{KIND_LABEL[t.kind] ?? t.kind}</td>
                  <td className={`${td} text-right font-bold ${t.amount > 0 ? "text-rose-600" : ""}`}>
                    {t.amount > 0 ? "+" : ""}
                    {t.amount.toLocaleString()}
                  </td>
                  <td className={td}>{t.note}</td>
                  <td className={td}>{t.adminId ? (adminName.get(t.adminId) ?? "") : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}
