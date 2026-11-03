import { cx } from "@/components/ui";
import { IMG } from "@/lib/brand-images";

export function StampCard({ count, perCard, bonus, pointName, highlight }: { count: number; perCard: number; bonus: number; pointName: string; highlight?: number }) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: perCard }, (_, i) => {
          const on = i < count;
          return (
            <div
              key={i}
              className={cx(
                "flex aspect-square items-center justify-center rounded-full border-2 text-xs",
                on ? "border-rose-300 bg-white" : "border-dashed border-slate-200 text-slate-300",
              )}
            >
              {on ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={IMG.mark} alt="スタンプ" className={cx("h-[78%] w-[78%] object-contain", i + 1 === highlight ? "stamp-in" : "-rotate-12")} />
              ) : (
                i + 1
              )}
            </div>
          );
        })}
      </div>
      {bonus > 0 && (
        <p className="mt-2 text-center text-xs text-slate-500">
          {perCard}個たまると <b className="text-rose-600">{bonus.toLocaleString()}</b> {pointName}
        </p>
      )}
    </div>
  );
}
