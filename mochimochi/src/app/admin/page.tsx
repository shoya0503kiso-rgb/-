import Link from "next/link";
import { Card, LinkButton, PageHeader, Stat } from "@/components/ui";
import { formatDate, monthOf } from "@/lib/time";
import { prisma } from "@/server/db";
import { pointDayLabel } from "@/server/points";
import { today } from "@/server/settings";

export default async function AdminHome() {
  const date = await today();
  const [visits, members, pending, pointDay, events, plays] = await Promise.all([
    prisma.visit.findMany({ where: { businessDate: date }, include: { member: true }, orderBy: { createdAt: "desc" } }),
    prisma.member.count({ where: { active: true } }),
    prisma.redemption.count({ where: { status: "pending" } }),
    prisma.pointDay.findUnique({ where: { date } }),
    prisma.event.findMany({ where: { date: { gte: date } }, orderBy: [{ date: "asc" }, { startTime: "asc" }], take: 5 }),
    prisma.gamePlay.count({ where: { businessDate: date } }),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader
        title={`今日（${formatDate(date)}）`}
        description={pointDay ? `🎉 今日は ${pointDayLabel(pointDay)}` : undefined}
        actions={
          <>
            <LinkButton href="/admin/qr">来店QRを表示</LinkButton>
            <LinkButton href="/admin/submarine" variant="secondary">
              サブマリン +1
            </LinkButton>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="今日の来店" value={`${visits.length}人`} />
        <Stat label="今日のゲーム" value={`${plays}回`} />
        <Stat label="会員数" value={`${members}人`} href="/admin/members" />
        <Stat label="交換チケット（未処理）" value={`${pending}件`} href="/admin/rewards" tone={pending ? "alert" : "default"} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="今日チェックインした人">
          {visits.length === 0 ? (
            <p className="text-sm text-slate-500">まだいません</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {visits.map((v) => (
                <li key={v.id} className="flex justify-between py-1.5">
                  <Link href={`/admin/members/${v.memberId}`} className="text-rose-700 hover:underline">
                    {v.member.nickname}
                  </Link>
                  <span className="text-slate-500">来店{v.member.visitCount}回</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="これからのイベント" actions={<Link href={`/admin/calendar?m=${monthOf(date)}`} className="text-sm text-rose-700">カレンダー ›</Link>}>
          {events.length === 0 ? (
            <p className="text-sm text-slate-500">登録されていません</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {events.map((e) => (
                <li key={e.id} className="py-1.5">
                  <span className="mr-2 font-bold">{formatDate(e.date)}</span>
                  {e.title}
                  {e.startTime && <span className="ml-1 text-slate-500">{e.startTime}〜</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
