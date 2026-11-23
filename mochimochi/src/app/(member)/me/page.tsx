import { rankTheme } from "@/lib/rank-theme";
import { formatMemberNo } from "@/lib/member-no";
import { ensureMemberNos } from "@/server/member-no";
import Link from "next/link";
import { Panel } from "@/components/member/Panel";
import { StampBonus } from "@/components/member/StampBonus";
import { StampCalendar } from "@/components/member/StampCalendar";
import { IMG } from "@/lib/brand-images";
import { formatDate, formatMonth, monthOf } from "@/lib/time";
import { PASS_LABEL, settleLottery, type LotteryPass } from "@/server/casino";
import { prisma } from "@/server/db";
import { requireMember } from "@/server/member-auth";
import { pointDayLabel } from "@/server/points";
import { myRankings } from "@/server/rankings";
import { getRankTiers, getSettings, rankFor, today, visibleRankings } from "@/server/settings";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function MyPage() {
  let me = await requireMember("/me");
  // この機能より前に登録した人には、ここで番号をつける
  if (me.memberNo == null) {
    await ensureMemberNos();
    me = await prisma.member.findUniqueOrThrow({ where: { id: me.id } });
  }
  // 終わった宝くじの当たりをここでも払い出す（ポイントの表示を正しくするため）
  // 発表の時刻を過ぎた宝くじを判定する（当たりはパス）
  const lottery = await settleLottery(me.id);
  const member = me;
  const passes = await prisma.lotteryTicket.findMany({ where: { memberId: me.id, pass: { not: null }, passUsedAt: null }, select: { id: true, pass: true } });
  const [s, tiers, date] = await Promise.all([getSettings(), getRankTiers(), today()]);
  const month = monthOf(date);
  const [ranks, visitedToday, monthVisits, pointDay, pending, events, pointDays] = await Promise.all([
    myRankings(member.id, month),
    prisma.visit.findUnique({ where: { memberId_businessDate: { memberId: member.id, businessDate: date } } }),
    prisma.visit.findMany({ where: { memberId: member.id, businessDate: { startsWith: month } }, select: { businessDate: true } }),
    prisma.pointDay.findUnique({ where: { date } }),
    prisma.redemption.count({ where: { memberId: member.id, status: "pending" } }),
    prisma.event.findMany({ where: { date: { startsWith: month } }, orderBy: [{ date: "asc" }, { startTime: "asc" }] }),
    prisma.pointDay.findMany({ where: { date: { startsWith: month } }, orderBy: { date: "asc" } }),
  ]);
  const pdItems = pointDays.map((p) => ({ date: p.date, label: pointDayLabel(p) }));
  const upcoming = [
    ...events.map((e) => ({ date: e.date, time: e.startTime, title: e.title, description: e.description, kind: "event" as const })),
    ...pdItems.map((p) => ({ date: p.date, time: "", title: p.label, description: "", kind: "point" as const })),
  ]
    .filter((x) => x.date >= date)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const rank = rankFor(member.visitCount, tiers);
  const theme = rankTheme(rank.level);
  const show = visibleRankings(s);

  return (
    <div className="space-y-4">
      {lottery.passes.length > 0 && (
        <Link href="/game/lottery" className="block rounded-2xl bg-gradient-to-r from-amber-300 to-pink-400 px-4 py-3 text-center font-bold text-white shadow">
          🎟️ 宝くじで{lottery.passes.map((p) => PASS_LABEL[p]).join("・")}が当たりました！（結果を見る ›）
        </Link>
      )}
      {pointDay && (
        <div className="rounded-2xl bg-gradient-to-r from-amber-400 to-rose-400 px-4 py-3 text-center font-bold text-white shadow">
          🎉 今日は {pointDayLabel(pointDay)}！
        </div>
      )}

      <section className={`relative overflow-hidden rounded-3xl p-5 shadow-lg ${theme.card}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={theme.img} alt="" className={`pointer-events-none absolute drop-shadow-md ${theme.imgPos ?? "-right-2 -bottom-2 w-36"}`} />
        <div className="relative flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className={`text-xs ${theme.label}`}>ニックネーム</div>
            <div className="truncate text-lg font-bold">{member.nickname} さん</div>
            <div className="mt-0.5 font-mono text-xs tracking-wider opacity-70">会員番号 {formatMemberNo(member.memberNo)}</div>
          </div>
          <span className={`relative shrink-0 rounded-full bg-white px-3 py-1 text-sm font-bold ${theme.badge ?? ""}`} style={{ color: rank.current.color }}>
            {rank.current.name}
          </span>
        </div>
        <div className={`relative mt-4 text-xs ${theme.label}`}>{s.pointName}</div>
        <div className={`relative text-4xl font-extrabold tracking-tight ${theme.points}`}>
          {member.points.toLocaleString()}
          <span className={`ml-1 text-base font-bold ${theme.unit}`}>pt</span>
        </div>
        <div className="relative mt-3 flex flex-wrap gap-x-4 gap-y-1 pr-32 text-xs opacity-90">
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
        <Link href="/game/slot" className="rounded-2xl bg-gradient-to-br from-fuchsia-500 to-rose-500 p-3 text-white shadow-sm">
          <div className="text-xs opacity-90">ゲームコーナー</div>
          <div className="mt-1 text-sm font-bold">🎰 スロット・🎟️ 宝くじ</div>
        </Link>
      </div>

      {passes.length > 0 && (
        <section className="rounded-2xl bg-gradient-to-r from-slate-900 to-slate-700 p-4 text-white shadow">
          <div className="text-xs opacity-80">持っているパス（お店でスタッフに見せてね）</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {passes.map((p) => (
              <span
                key={p.id}
                className={
                  p.pass === "VIP"
                    ? "rounded-xl bg-gradient-to-r from-amber-300 to-yellow-500 px-3 py-1.5 text-sm font-black text-amber-950"
                    : "rounded-xl bg-gradient-to-r from-slate-200 to-slate-400 px-3 py-1.5 text-sm font-black text-slate-800"
                }
              >
                {PASS_LABEL[p.pass as LotteryPass]}
              </span>
            ))}
          </div>
        </section>
      )}
      <StampCalendar month={month} today={date} visits={monthVisits.map((v) => v.businessDate)} pointDays={pdItems} eventDates={events.map((e) => e.date)} />
      <p className="-mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span>スタンプ＝来店した日（日によって絵が変わるよ）</span>
        <span>
          <span className="mr-1 inline-block rounded-full bg-amber-400 px-1 text-[8px] font-black text-white">UP</span>
          ポイントアップ
        </span>
        <span>
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-rose-400 align-middle" />
          イベント
        </span>
      </p>
      <StampBonus stampCount={member.stampCount} perCard={s.stampsPerCard} bonus={s.stampCardBonus} pointName={s.pointName} />
      <Panel title="これからの予定">
        {upcoming.length === 0 ? (
          <p className="py-3 text-center text-sm text-slate-500">今月の予定はまだありません</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {upcoming.map((x, i) => (
              <li key={i} className="py-2">
                <div className="flex items-baseline gap-2">
                  <span className="w-20 shrink-0 text-sm font-bold text-slate-700">{formatDate(x.date)}</span>
                  <span className={x.kind === "point" ? "font-bold text-amber-600" : "font-bold text-slate-900"}>
                    {x.kind === "point" ? "🎉 " : ""}
                    {x.title}
                  </span>
                  {x.time && <span className="text-xs text-slate-500">{x.time}〜</span>}
                </div>
                {x.description && <p className="mt-0.5 pl-22 text-xs whitespace-pre-wrap text-slate-600">{x.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {(show.darts || show.poker || show.submarine) && (
        <Panel title={`${formatMonth(month)}のランキング`} action={<Link href="/ranking" className="text-sm text-rose-600">すべて見る ›</Link>}>
          <ul className="divide-y divide-slate-100 text-sm">
            {show.darts && <RankLine label="🎯 ダーツ" r={ranks.darts} unit="pt" />}
            {show.poker && <RankLine label="🃏 ポーカー" r={ranks.poker} unit="pt" />}
            {show.submarine && <RankLine label="🍺 サブマリン" r={ranks.submarine} unit="杯" />}
          </ul>
        </Panel>
      )}

      <Panel>
        <Link href="/mochi" className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-bold text-slate-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={IMG.tigerShake} alt="" className="h-10 w-10 object-contain" />
            {s.characterName}をなでた回数
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
