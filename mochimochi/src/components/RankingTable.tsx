import { cx } from "@/components/ui";
import type { RankingRow } from "@/server/rankings";

const MEDAL = ["", "🥇", "🥈", "🥉"];

export function RankingTable({ rows, unit, highlightId, limit = 50 }: { rows: RankingRow[]; unit: string; highlightId?: string; limit?: number }) {
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-slate-500">まだ記録がありません</p>;
  const mine = highlightId ? rows.find((r) => r.memberId === highlightId) : undefined;
  const shown = rows.slice(0, limit);
  return (
    <div>
      {mine && (
        <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-center text-sm">
          あなたは <b className="text-lg text-rose-600">{mine.rank}</b>位（{mine.value.toLocaleString()}
          {unit}）
        </p>
      )}
      <ol className="divide-y divide-slate-100">
        {shown.map((r) => (
          <li key={r.memberId} className={cx("flex items-center gap-3 py-2", r.memberId === highlightId && "rounded-lg bg-rose-50 px-2")}>
            <span className="w-10 shrink-0 text-center font-bold text-slate-500">{MEDAL[r.rank] || `${r.rank}`}</span>
            <span className="min-w-0 flex-1 truncate">{r.nickname}</span>
            <span className="shrink-0 font-bold text-slate-800">
              {r.value.toLocaleString()}
              <span className="ml-0.5 text-xs font-normal text-slate-500">{unit}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
