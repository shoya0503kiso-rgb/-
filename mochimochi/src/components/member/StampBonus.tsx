import { cx } from "@/components/ui";

/** スタンプが◯個たまるとボーナス（来店の回数で進む） */
export function StampBonus({ stampCount, perCard, bonus, pointName }: { stampCount: number; perCard: number; bonus: number; pointName: string }) {
  if (bonus <= 0) return null;
  const left = Math.max(0, perCard - stampCount);
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-rose-100">
      <div className="flex items-center justify-between text-sm">
        <span className="font-bold text-slate-700">スタンプボーナス</span>
        <span className="text-xs text-slate-500">
          あと <b className="text-base text-rose-600">{left}</b> 回で <b className="text-rose-600">{bonus.toLocaleString()}</b> {pointName}
        </span>
      </div>
      <div className="mt-2 flex gap-1">
        {Array.from({ length: perCard }, (_, i) => (
          <span key={i} className={cx("h-2.5 flex-1 rounded-full", i < stampCount ? "bg-gradient-to-r from-rose-400 to-pink-500" : "bg-rose-100")} />
        ))}
      </div>
    </div>
  );
}
