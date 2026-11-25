import { cx } from "@/components/ui";
import { IMG } from "@/lib/brand-images";
import { formatMonth, monthInfo, ymd } from "@/lib/time";
import { StampMark } from "./StampMark";

// ふつうのカレンダー（マス目・予定入り）。来店した日には、その上からもちもちスタンプが押される

export type CalendarEvent = { date: string; title: string; time?: string };

export function StampCalendar({
  month,
  today,
  visits,
  pointDays = [],
  events = [],
}: {
  month: string;
  today: string;
  /** 来店した日（YYYY-MM-DD） */
  visits: string[];
  pointDays?: { date: string; label: string }[];
  events?: CalendarEvent[];
}) {
  const { y, m, days, firstWeekday } = monthInfo(month);
  const cells: (string | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: days }, (_, i) => ymd(y, m, i + 1))];
  while (cells.length % 7) cells.push(null);
  const visited = new Set(visits);
  const pd = new Map(pointDays.map((p) => [p.date, p.label]));
  const ev = new Map<string, CalendarEvent[]>();
  for (const e of events) ev.set(e.date, [...(ev.get(e.date) ?? []), e]);
  const count = visits.filter((v) => v.startsWith(month)).length;

  return (
    <section className="overflow-hidden rounded-3xl bg-white shadow-sm ring-2 ring-rose-200">
      {/* カードの頭 */}
      <div className="flex items-center gap-3 bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2.5 text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={IMG.mark} alt="" className="h-8 w-8 shrink-0 rounded-full bg-white object-contain p-0.5" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[10px] font-bold tracking-widest opacity-90">MOCHIMOCHI STAMP CARD</div>
          <div className="truncate font-black">{formatMonth(month)}のカレンダー</div>
        </div>
        <div className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-black text-rose-600">{count}個</div>
      </div>

      {/* 曜日 */}
      <div className="grid grid-cols-7 border-b border-rose-100 bg-rose-50/70 text-center text-[11px] font-bold">
        {["日", "月", "火", "水", "木", "金", "土"].map((w, i) => (
          <div key={w} className={cx("py-1", i === 0 ? "text-rose-500" : i === 6 ? "text-sky-600" : "text-slate-500")}>
            {w}
          </div>
        ))}
      </div>

      {/* マス目（1px の線で区切る） */}
      <div className="grid grid-cols-7 gap-px bg-rose-100">
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="min-h-16 bg-slate-50" />;
          const d = Number(date.slice(8));
          const on = visited.has(date);
          const label = pd.get(date);
          const list = ev.get(date) ?? [];
          const isToday = date === today;
          return (
            <div key={i} className={cx("relative min-h-16 overflow-hidden p-0.5", label ? "bg-amber-50" : "bg-white", isToday && "ring-2 ring-rose-400 ring-inset")}>
              <div
                className={cx(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold tabular-nums",
                  isToday ? "bg-rose-500 text-white" : i % 7 === 0 ? "text-rose-500" : i % 7 === 6 ? "text-sky-600" : "text-slate-600",
                )}
              >
                {d}
              </div>
              <div className="mt-0.5 space-y-px">
                {label && <div className="line-clamp-2 rounded-sm bg-amber-400 px-0.5 text-[9px] leading-tight font-bold break-all text-white">{label.replace(/^ポイント/, "")}</div>}
                {list.slice(0, 2).map((e, k) => (
                  <div key={k} className="line-clamp-2 rounded-sm bg-rose-100 px-0.5 text-[9px] leading-tight font-bold break-all text-rose-700">
                    {e.title}
                  </div>
                ))}
                {list.length > 2 && <div className="text-[9px] leading-none text-rose-500">ほか{list.length - 2}件</div>}
              </div>
              {/* 来店スタンプ：予定の上から押す */}
              {on && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <StampMark date={date} className="h-[88%] w-[88%] opacity-90" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
