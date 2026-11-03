import Link from "next/link";
import { cx } from "@/components/ui";
import { monthInfo, ymd } from "@/lib/time";

export interface CalendarItem {
  date: string;
  title: string;
}

/** 月カレンダー。イベントと倍率デーを日付のマスに表示する */
export function MonthCalendar({
  month,
  today,
  events,
  pointDays,
  dayHref,
}: {
  month: string;
  today: string;
  events: CalendarItem[];
  pointDays: { date: string; label: string }[];
  dayHref?: (date: string) => string;
}) {
  const { y, m, days, firstWeekday } = monthInfo(month);
  const cells: (string | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: days }, (_, i) => ymd(y, m, i + 1))];
  while (cells.length % 7) cells.push(null);
  const byDate = new Map<string, CalendarItem[]>();
  for (const e of events) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const pd = new Map(pointDays.map((p) => [p.date, p.label]));

  return (
    <div>
      <div className="grid grid-cols-7 text-center text-[11px] font-bold">
        {["日", "月", "火", "水", "木", "金", "土"].map((w, i) => (
          <div key={w} className={cx("py-1", i === 0 ? "text-rose-500" : i === 6 ? "text-sky-600" : "text-slate-500")}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200">
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="min-h-16 bg-slate-50" />;
          const d = Number(date.slice(8));
          const label = pd.get(date);
          const items = byDate.get(date) ?? [];
          const body = (
            <div className={cx("h-full min-h-16 bg-white p-1", label && "bg-amber-50", date === today && "ring-2 ring-inset ring-rose-400")}>
              <div className={cx("text-xs font-bold", i % 7 === 0 ? "text-rose-500" : i % 7 === 6 ? "text-sky-600" : "text-slate-700")}>{d}</div>
              {label && <div className="mt-0.5 truncate rounded bg-amber-400 px-0.5 text-[9px] font-bold leading-tight text-white">{label}</div>}
              {items.slice(0, 2).map((e, k) => (
                <div key={k} className="mt-0.5 truncate rounded bg-rose-100 px-0.5 text-[9px] leading-tight text-rose-800">
                  {e.title}
                </div>
              ))}
              {items.length > 2 && <div className="text-[9px] text-slate-500">+{items.length - 2}</div>}
            </div>
          );
          return dayHref ? (
            <Link key={i} href={dayHref(date)}>
              {body}
            </Link>
          ) : (
            <div key={i}>{body}</div>
          );
        })}
      </div>
    </div>
  );
}
