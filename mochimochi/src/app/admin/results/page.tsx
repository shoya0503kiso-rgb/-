import { Card, Empty, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/time";
import { prisma } from "@/server/db";
import { GAME_LABEL, type GameKind } from "@/server/rankings";
import { today } from "@/server/settings";
import { DeleteMatchButton, ResultForm } from "./ResultForm";

export default async function ResultsPage() {
  const [date, rules, matches] = await Promise.all([
    today(),
    prisma.placePointRule.findMany({ orderBy: [{ game: "asc" }, { place: "asc" }] }),
    prisma.match.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 30, include: { entries: { include: { member: true }, orderBy: { place: "asc" } } } }),
  ]);
  const table = { darts: [] as { place: number; points: number }[], poker: [] as { place: number; points: number }[] };
  for (const r of rules) if (r.game === "darts" || r.game === "poker") table[r.game].push({ place: r.place, points: r.points });

  return (
    <div className="space-y-4">
      <PageHeader title="ダーツ・ポーカーの結果入力" description="順位を入れて登録すると、順位に応じたポイントが自動で付与され、ランキングに反映されます（順位ごとのポイントは「設定」で変更）" />
      <ResultForm today={date} table={table} />
      <Card title="最近の結果">
        {matches.length === 0 ? (
          <Empty>まだ登録されていません</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {matches.map((m) => (
              <li key={m.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="mr-2 font-bold">{formatDate(m.date)}</span>
                    <span className="mr-2 rounded bg-slate-100 px-2 py-0.5 text-xs">{GAME_LABEL[m.game as GameKind]}</span>
                    {m.title}
                  </div>
                  <DeleteMatchButton id={m.id} />
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {m.entries.map((e) => `${e.place}位 ${e.member.nickname}（+${e.points}）`).join("　")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
