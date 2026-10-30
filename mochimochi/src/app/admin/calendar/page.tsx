import Link from "next/link";
import { MonthCalendar } from "@/components/MonthCalendar";
import { Card, PageHeader } from "@/components/ui";
import { addMonths, formatDate, formatMonth, isValidDate, isValidMonth, monthOf } from "@/lib/time";
import { prisma } from "@/server/db";
import { pointDayLabel } from "@/server/points";
import { today } from "@/server/settings";
import { DayEditor } from "./DayEditor";

export default async function AdminCalendar({ searchParams }: { searchParams: Promise<{ m?: string; d?: string }> }) {
  const sp = await searchParams;
  const now = await today();
  const month = sp.m && isValidMonth(sp.m) ? sp.m : monthOf(now);
  const selected = sp.d && isValidDate(sp.d) ? sp.d : null;
  const [events, pointDays] = await Promise.all([
    prisma.event.findMany({ where: { date: { startsWith: month } }, orderBy: [{ date: "asc" }, { startTime: "asc" }] }),
    prisma.pointDay.findMany({ where: { date: { startsWith: month } } }),
  ]);
  const dayEvents = selected ? await prisma.event.findMany({ where: { date: selected }, orderBy: { startTime: "asc" } }) : [];
  const dayPoint = selected ? await prisma.pointDay.findUnique({ where: { date: selected } }) : null;

  return (
    <div className="space-y-4">
      <PageHeader title="イベントカレンダー・ポイント倍率" description="日付をタップして、イベントの登録やポイント倍率デー（2倍・来店10ptデーなど）を設定します" />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <div className="mb-3 flex items-center justify-between text-sm">
            <Link href={`/admin/calendar?m=${addMonths(month, -1)}`} className="rounded border px-3 py-1">
              ‹ 前月
            </Link>
            <span className="font-bold">{formatMonth(month)}</span>
            <Link href={`/admin/calendar?m=${addMonths(month, 1)}`} className="rounded border px-3 py-1">
              次月 ›
            </Link>
          </div>
          <MonthCalendar
            month={month}
            today={now}
            events={events}
            pointDays={pointDays.map((p) => ({ date: p.date, label: pointDayLabel(p) }))}
            dayHref={(d) => `/admin/calendar?m=${month}&d=${d}`}
          />
        </Card>
        {selected ? (
          <DayEditor
            key={selected}
            date={selected}
            dateLabel={formatDate(selected)}
            events={dayEvents.map((e) => ({ id: e.id, title: e.title, startTime: e.startTime, description: e.description }))}
            pointDay={dayPoint ? { mode: dayPoint.mode, value: dayPoint.value, label: dayPoint.label } : null}
          />
        ) : (
          <Card>
            <p className="text-sm text-slate-500">カレンダーの日付を選んでください</p>
          </Card>
        )}
      </div>
    </div>
  );
}
