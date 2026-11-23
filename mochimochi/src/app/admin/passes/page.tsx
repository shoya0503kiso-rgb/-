import Link from "next/link";
import { Badge, Card, Empty, PageHeader, TableWrap, td, th } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/time";
import { PASS_LABEL, passWinners, type LotteryPass } from "@/server/casino";
import { PassUseButton } from "./PassUseButton";

export const dynamic = "force-dynamic";

export default async function PassesPage() {
  const rows = await passWinners();
  return (
    <div className="space-y-4">
      <PageHeader
        title="宝くじのパス"
        description="宝くじで当たったパス（4桁一致＝VIPパス、下3桁一致＝プラチナパス）。お客さんがお店で見せたら「使用済み」にしてください。パスの内容はお客さんのアプリには出していません"
      />
      <Card>
        {rows.length === 0 ? (
          <Empty>まだ当たりはありません</Empty>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>パス</th>
                  <th className={th}>会員</th>
                  <th className={th}>番号</th>
                  <th className={th}>購入日</th>
                  <th className={th}>状態</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.passUsedAt ? "opacity-50" : ""}>
                    <td className={td}>
                      <Badge color={r.pass === "VIP" ? "amber" : "gray"}>{PASS_LABEL[r.pass as LotteryPass]}</Badge>
                    </td>
                    <td className={td}>
                      <Link href={`/admin/members/${r.member.id}`} className="font-bold text-rose-700 hover:underline">
                        {r.member.nickname}
                      </Link>
                    </td>
                    <td className={`${td} font-mono`}>{r.number}</td>
                    <td className={td}>{formatDate(r.drawDate)}</td>
                    <td className={td}>{r.passUsedAt ? `使用済み（${formatDateTime(r.passUsedAt)}）` : "未使用"}</td>
                    <td className={td}>
                      <PassUseButton id={r.id} used={!!r.passUsedAt} />
                    </td>
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
