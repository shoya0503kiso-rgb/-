import Link from "next/link";
import { StampBonus } from "@/components/member/StampBonus";
import { StampCalendar } from "@/components/member/StampCalendar";
import { IMG } from "@/lib/brand-images";
import { Panel } from "@/components/member/Panel";
import { addMonths, formatDate, formatMonth, isValidMonth, monthOf } from "@/lib/time";
import { prisma } from "@/server/db";
import { requireMember } from "@/server/member-auth";
import { pointDayLabel } from "@/server/points";
import { getSettings, today } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const member = await requireMember("/calendar");
  const [date, s] = await Promise.all([today(), getSettings()]);
  const me = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
  const month = sp.m && isValidMonth(sp.m) ? sp.m : monthOf(date);
  const [events, pointDays, visits] = await Promise.all([
    prisma.event.findMany({ where: { date: { startsWith: month } }, orderBy: [{ date: "asc" }, { startTime: "asc" }] }),
    prisma.pointDay.findMany({ where: { date: { startsWith: month } }, orderBy: { date: "asc" } }),
    prisma.visit.findMany({ where: { memberId: member.id, businessDate: { startsWith: month } }, select: { businessDate: true } }),
  ]);
  const pdItems = pointDays.map((p) => ({ date: p.date, label: pointDayLabel(p) }));
  const list = [
    ...events.map((e) => ({ date: e.date, time: e.startTime, title: e.title, description: e.description, kind: "event" as const })),
    ...pdItems.map((p) => ({ date: p.date, time: "", title: p.label, description: "", kind: "point" as const })),
  ].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const upcoming = month === monthOf(date) ? list.filter((x) => x.date >= date) : list;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">スタンプカレンダー</h1>
      <div className="flex items-center justify-between text-sm">
        <Link href={`/calendar?m=${addMonths(month, -1)}`} className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
          ‹ 前月
        </Link>
        <span className="font-bold">{formatMonth(month)}</span>
        <Link href={`/calendar?m=${addMonths(month, 1)}`} className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
          次月 ›
        </Link>
      </div>
      <StampCalendar
        month={month}
        today={date}
        visits={visits.map((v) => v.businessDate)}
        pointDays={pdItems}
        eventDates={events.map((e) => e.date)}
      />
      <StampBonus stampCount={me.stampCount} perCard={s.stampsPerCard} bonus={s.stampCardBonus} pointName={s.pointName} />
      <p className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={IMG.mark} alt="" className="mr-0.5 inline-block h-3.5 w-3.5 -rotate-12 align-[-3px]" />
          来店した日
        </span>
        <span>
          <span className="mr-1 inline-block rounded-full bg-amber-400 px-1 text-[8px] font-black text-white">UP</span>
          ポイントアップ
        </span>
        <span>
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-rose-400 align-middle" />
          イベント
        </span>
      </p>
      <Panel title={month === monthOf(date) ? "これからの予定" : "この月の予定"}>
        {upcoming.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">予定はまだありません</p>
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
    </div>
  );
}
