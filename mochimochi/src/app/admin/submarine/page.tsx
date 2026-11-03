import { RankingToggle } from "@/components/admin/RankingToggle";
import { Card, PageHeader } from "@/components/ui";
import { formatMonth, monthOf } from "@/lib/time";
import { submarineRanking } from "@/server/rankings";
import { getSettings, today } from "@/server/settings";
import { SubmarineBoard } from "./SubmarineBoard";

export default async function SubmarinePage() {
  const [s, date] = await Promise.all([getSettings(), today()]);
  const month = monthOf(date);
  const rows = await submarineRanking(month);
  return (
    <div className="space-y-4">
      <PageHeader title={`サブマリンカウンター（${formatMonth(month)}）`} description="飲んだ会員を選んで「＋1」。間違えたら「−1」。月が変わるとリセットされます" />
      <Card>
        <RankingToggle kind="submarine" visible={s.rankingSubmarineEnabled} />
      </Card>
      <SubmarineBoard rows={rows.map((r) => ({ id: r.memberId, nickname: r.nickname, count: r.value, rank: r.rank }))} />
    </div>
  );
}
