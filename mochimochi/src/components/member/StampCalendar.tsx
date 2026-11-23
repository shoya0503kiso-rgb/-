import Link from "next/link";
import { cx } from "@/components/ui";
import { IMG } from "@/lib/brand-images";
import { formatMonth, monthInfo, ymd } from "@/lib/time";

// カレンダーがそのままスタンプカード。来店した日の丸にスタンプが押される

export function StampCalendar({
  month,
  today,
  visits,
  pointDays = [],
  eventDates = [],
  size = "full",
  href,
}: {
  month: string;
  today: string;
  /** 来店した日（YYYY-MM-DD） */
  visits: string[];
  pointDays?: { date: string; label: string }[];
  eventDates?: string[];
  size?: "full" | "mini";
  /** mini のとき、押すと開く先 */
  href?: string;
}) {
  const { y, m, days, firstWeekday } = monthInfo(month);
  const cells: (string | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: days }, (_, i) => ymd(y, m, i + 1))];
  while (cells.length % 7) cells.push(null);
  const visited = new Set(visits);
  const pd = new Map(pointDays.map((p) => [p.date, p.label]));
  const ev = new Set(eventDates);
  const count = visits.filter((v) => v.startsWith(month)).length;
  const mini = size === "mini";

  const card = (
    <section className="overflow-hidden rounded-3xl bg-[#fffaf0] shadow-sm ring-2 ring-rose-200">
      {/* カードの頭 */}
      <div className="flex items-center gap-3 bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2.5 text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={IMG.mark} alt="" className="h-8 w-8 shrink-0 rounded-full bg-white object-contain p-0.5" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[10px] font-bold tracking-widest opacity-90">MOCHIMOCHI STAMP CARD</div>
          <div className="truncate font-black">{formatMonth(month)}のスタンプ</div>
        </div>
        <div className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-black text-rose-600">{count}個</div>
      </div>

      <div className={cx("bg-[radial-gradient(#fde2e4_1px,transparent_1px)] [background-size:12px_12px]", mini ? "p-2" : "p-3")}>
        <div className="grid grid-cols-7 text-center text-[11px] font-bold">
          {["日", "月", "火", "水", "木", "金", "土"].map((w, i) => (
            <div key={w} className={cx("pb-1", i === 0 ? "text-rose-500" : i === 6 ? "text-sky-600" : "text-slate-500")}>
              {w}
            </div>
          ))}
        </div>
        <div className={cx("grid grid-cols-7", mini ? "gap-1" : "gap-1.5")}>
          {cells.map((date, i) => {
            if (!date) return <div key={i} />;
            const d = Number(date.slice(8));
            const on = visited.has(date);
            const label = pd.get(date);
            return (
              <div key={i} className="relative flex flex-col items-center">
                <div
                  className={cx(
                    "relative flex aspect-square w-full max-w-[52px] items-center justify-center rounded-full",
                    on ? "bg-white shadow-[inset_0_0_0_2px_#e11d48]" : "border-2 border-dashed border-rose-200 bg-white/70",
                    label && !on && "border-amber-300 bg-amber-50",
                    date === today && "ring-2 ring-rose-400 ring-offset-1 ring-offset-[#fffaf0]",
                  )}
                >
                  <span className={cx("font-black tabular-nums", on ? "absolute top-0.5 left-1 text-[9px] text-rose-500" : i % 7 === 0 ? "text-rose-400" : i % 7 === 6 ? "text-sky-500" : "text-slate-400", !on && (mini ? "text-[11px]" : "text-sm"))}>{d}</span>
                  {on && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={IMG.mark} alt="来店スタンプ" className="h-[78%] w-[78%] -rotate-12 object-contain drop-shadow-[0_1px_0_rgba(225,29,72,.5)]" />
                  )}
                  {label && <span className="absolute -top-1 -right-1 rounded-full bg-amber-400 px-1 text-[8px] leading-tight font-black text-white">UP</span>}
                </div>
                {!mini && ev.has(date) && <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-rose-400" aria-label="イベント" />}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
  return href ? (
    <Link href={href} className="block">
      {card}
    </Link>
  ) : (
    card
  );
}
