import Link from "next/link";
import { Badge, Card, Empty, LinkButton, PageHeader, TableWrap, td, th } from "@/components/ui";
import { formatDateJa, formatYearMonthJa } from "@/lib/time";
import { getSettings } from "@/server/settings";
import { PERIOD_STATUS_LABELS, formatDeadline, listPeriods, nextTargetMonth, publishDueDate } from "@/server/shifts/periods";

export default async function ShiftsPage() {
  const [periods, next, settings] = await Promise.all([listPeriods(), nextTargetMonth(), getSettings()]);
  return (
    <>
      <PageHeader
        title="シフト"
        description={`毎月${settings.requestNotifyDay}日に提出依頼 → ${settings.requestDeadlineDay}日締切 → ${settings.publishDay}日公開（設定で変更可）`}
        actions={
          <>
            <LinkButton variant="secondary" href="/admin/shifts/settings">シフト枠・必要人数</LinkButton>
            <LinkButton href={`/admin/shifts/${next}`}>{formatYearMonthJa(next)}のシフト</LinkButton>
          </>
        }
      />
      <Card>
        {periods.length === 0 ? (
          <Empty>まだシフト期間はありません。{settings.requestNotifyDay}日に自動で受付が始まります（手動で開始することもできます）。</Empty>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>対象月</th>
                  <th className={th}>状態</th>
                  <th className={th}>提出締切</th>
                  <th className={th}>公開予定</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id}>
                    <td className={td}>
                      <Link className="font-medium text-teal-800 underline" href={`/admin/shifts/${p.yearMonth}`}>{formatYearMonthJa(p.yearMonth)}</Link>
                    </td>
                    <td className={td}>
                      <Badge color={p.status === "PUBLISHED" ? "green" : p.status === "COLLECTING" ? "blue" : "amber"}>{PERIOD_STATUS_LABELS[p.status]}</Badge>
                    </td>
                    <td className={td}>{formatDeadline(p.deadline)}</td>
                    <td className={td}>{p.publishedAt ? `公開済 ${p.publishedAt.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}` : formatDateJa(publishDueDate(p.yearMonth, settings))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
