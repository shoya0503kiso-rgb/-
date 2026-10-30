import Link from "next/link";
import { Panel } from "@/components/member/Panel";
import { StampCard } from "@/components/member/StampCard";
import { IMG } from "@/lib/brand-images";
import { formatMonth, monthOf } from "@/lib/time";
import { prisma } from "@/server/db";
import { requireMember } from "@/server/member-auth";
import { pointDayLabel } from "@/server/points";
import { myRankings } from "@/server/rankings";
import { getRankTiers, getSettings, rankFor, today } from "@/server/settings";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function MyPage() {
  const member = await requireMember("/me");
  const [s, tiers, date] = await Promise.all([getSettings(), getRankTiers(), today()]);
  const month = monthOf(date);
  const [ranks, visitedToday, playedToday, pointDay, pending] = await Promise.all([
    myRankings(member.id, month),
    prisma.visit.findUnique({ where: { memberId_businessDate: { memberId: member.id, businessDate: date } } }),
    prisma.gamePlay.findUnique({ where: { memberId_businessDate: { memberId: member.id, businessDate: date } } }),
    prisma.pointDay.findUnique({ where: { date } }),
    prisma.redemption.count({ where: { memberId: member.id, status: "pending" } }),
  ]);
  const rank = rankFor(member.visitCount, tiers);

  return (
    <div className="space-y-4">
      {pointDay && (
        <div className="rounded-2xl bg-gradient-to-r from-amber-400 to-rose-400 px-4 py-3 text-center font-bold text-white shadow">
          🎉 今日は {pointDayLabel(pointDay)}！
        </div>
      )}

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-neutral-900 via-neutral-800 to-rose-950 p-5 text-white shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={IMG.tigerChip} alt="" className="pointer-events-none absolute -right-3 -bottom-4 w-32 opacity-95" />
        <div className="relative flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs opacity-80">ニックネーム</div>
            <div className="truncate text-lg font-bold">{member.nickname} さん</div>
          </div>
          <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-bold" style={{ color: rank.current.color }}>
            {rank.current.name}
          </span>
        </div>
        <div className="relative mt-4 text-xs opacity-80">{s.pointName}</div>
        <div className="relative text-4xl font-extrabold tracking-tight text-rose-400">
          {member.points.toLocaleString()}
          <span className="ml-1 text-base font-bold text-white">pt</span>
        </div>
        <div className="relative mt-3 flex flex-wrap gap-x-4 gap-y-1 pr-24 text-xs opacity-90">
          <span>来店 {member.visitCount}回</span>
          {rank.next ? (
            <span>
              あと{rank.toNext}回で「{rank.next.name}」
            </span>
          ) : (
            <span>最高ランク！</span>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <TodayTile done={!!visitedToday} label="来店チェックイン" doneText="今日は来店済み" todoText="お店のQRを読み取ってね" href="/checkin" />
        <TodayTile done={!!playedToday} label="デイリーゲーム" doneText="今日は遊んだよ" todoText="1日1回あそべる！" href="/game" />
      </div>

      <Panel title="スタンプカード" action={<span className="text-xs text-slate-500">達成 {member.completedCards}枚</span>}>
        <StampCard count={member.stampCount} perCard={s.stampsPerCard} bonus={s.stampCardBonus} pointName={s.pointName} />
      </Panel>

      <Panel title={`${formatMonth(month)}のランキング`} action={<Link href="/ranking" className="text-sm text-rose-600">すべて見る ›</Link>}>
        <ul className="divide-y divide-slate-100 text-sm">
          <RankLine label="🎯 ダーツ" r={ranks.darts} unit="pt" />
          <RankLine label="🃏 ポーカー" r={ranks.poker} unit="pt" />
          <RankLine label="🍺 サブマリン" r={ranks.submarine} unit="杯" />
        </ul>
      </Panel>

      <Panel>
        <Link href="/mochi" className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-bold text-slate-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={IMG.tigerShake} alt="" className="h-10 w-10 object-contain" />
            累計「{s.mochiWord}」
          </span>
          <span className="text-xl font-extrabold text-rose-600">{member.mochiTotal.toLocaleString()}回</span>
        </Link>
      </Panel>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/rewards" className="rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-rose-100">
          <div className="text-2xl">🎁</div>
          <div className="mt-1 text-sm font-bold">ポイント交換</div>
          {pending > 0 && <div className="mt-1 text-xs text-rose-600">未使用チケット {pending}枚</div>}
        </Link>
        <Link href="/history" className="rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-rose-100">
          <div className="text-2xl">🧾</div>
          <div className="mt-1 text-sm font-bold">ポイント履歴</div>
        </Link>
      </div>

      <form action={logoutAction} className="pt-2 text-center">
        <button className="text-xs text-slate-400 underline">この端末からログアウト</button>
      </form>
    </div>
  );
}

function TodayTile({ done, label, doneText, todoText, href }: { done: boolean; label: string; doneText: string; todoText: string; href: string }) {
  return (
    <Link href={href} className={`rounded-2xl p-3 shadow-sm ring-1 ${done ? "bg-emerald-50 ring-emerald-100" : "bg-white ring-rose-100"}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-sm font-bold ${done ? "text-emerald-700" : "text-rose-600"}`}>{done ? `✅ ${doneText}` : todoText}</div>
    </Link>
  );
}

function RankLine({ label, r, unit }: { label: string; r: { rank: number; value: number; of: number } | null; unit: string }) {
  return (
    <li className="flex items-center justify-between py-2">
      <span>{label}</span>
      {r ? (
        <span>
          <b className="text-lg text-rose-600">{r.rank}</b>位 <span className="text-xs text-slate-500">／{r.of}人（{r.value}{unit}）</span>
        </span>
      ) : (
        <span className="text-xs text-slate-400">まだ記録なし</span>
      )}
    </li>
  );
}
