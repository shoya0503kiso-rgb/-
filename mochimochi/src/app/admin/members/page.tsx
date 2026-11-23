import { formatMemberNo } from "@/lib/member-no";
import { ensureMemberNos } from "@/server/member-no";
import Link from "next/link";
import { Card, Empty, Input, PageHeader, TableWrap, td, th } from "@/components/ui";
import { searchMembers } from "@/server/admin-ops";
import { getRankTiers, rankFor } from "@/server/settings";
import { NewMemberButton } from "./NewMemberButton";

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  await ensureMemberNos();
  const [members, tiers] = await Promise.all([searchMembers(q, 200), getRankTiers()]);
  return (
    <div className="space-y-4">
      <PageHeader title="会員" description="ニックネームか会員番号で検索。会員を開くとポイントの付与・減算や引き継ぎコードの発行ができます" actions={<NewMemberButton />} />
      <form className="flex gap-2">
        <Input name="q" defaultValue={q} placeholder="ニックネーム・会員番号（例：12）" className="max-w-sm" />
        <button className="rounded-lg bg-rose-500 px-4 font-bold text-white">検索</button>
      </form>
      <Card>
        {members.length === 0 ? (
          <Empty>会員が見つかりません</Empty>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>会員番号</th>
                  <th className={th}>ニックネーム</th>
                  <th className={th}>ランク</th>
                  <th className={`${th} text-right`}>ポイント</th>
                  <th className={`${th} text-right`}>来店</th>
                  <th className={th}>最終来店</th>
                  <th className={th}>LINE</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className={m.active ? "" : "opacity-50"}>
                    <td className={`${td} font-mono text-slate-500`}>{formatMemberNo(m.memberNo)}</td>
                    <td className={td}>
                      <Link href={`/admin/members/${m.id}`} className="font-bold text-rose-700 hover:underline">
                        {m.nickname}
                      </Link>
                      {!m.active && <span className="ml-1 text-xs">（停止中）</span>}
                    </td>
                    <td className={td}>{rankFor(m.visitCount, tiers).current.name}</td>
                    <td className={`${td} text-right`}>{m.points.toLocaleString()}</td>
                    <td className={`${td} text-right`}>{m.visitCount}</td>
                    <td className={td}>{m.lastVisitDate ?? "—"}</td>
                    <td className={td}>{m.lineUserId ? "連携済" : "—"}</td>
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
