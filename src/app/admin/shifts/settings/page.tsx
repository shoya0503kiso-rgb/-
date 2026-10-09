import { Card, PageHeader } from "@/components/ui";
import { formatYearMonthJa } from "@/lib/time";
import { listOverrides, listPatterns } from "@/server/shifts/patterns";
import { nextTargetMonth } from "@/server/shifts/periods";
import { OverrideEditor, PatternEditor, StaffingGrid } from "./ShiftSettingsClient";

export default async function ShiftSettingsPage() {
  const ym = await nextTargetMonth();
  const [patterns, overrides] = await Promise.all([listPatterns({ includeInactive: true }), listOverrides(ym)]);
  const active = patterns.filter((p) => p.active);
  const counts: Record<number, Record<string, number>> = {};
  for (let w = 0; w < 7; w++) {
    counts[w] = {};
    for (const p of active) counts[w][p.id] = p.rules.find((r) => r.weekday === w)?.requiredCount ?? 0;
  }
  const plain = (ps: typeof patterns) => ps.map((p) => ({ id: p.id, name: p.name, startTime: p.startTime, endTime: p.endTime, sortOrder: p.sortOrder, active: p.active }));
  return (
    <div className="space-y-5">
      <PageHeader title="シフト枠・必要人数" description="自動シフト生成で使う「枠」と、曜日・日ごとの必要人数（P-18）" />
      <Card title="シフト枠">
        <PatternEditor patterns={plain(patterns)} />
      </Card>
      <Card title="曜日ごとの必要人数">
        {active.length === 0 ? <p className="text-sm text-slate-500">先にシフト枠を作成してください</p> : <StaffingGrid patterns={plain(active)} initial={counts} />}
      </Card>
      <Card title={`特定日の必要人数（${formatYearMonthJa(ym)}〜）`}>
        <OverrideEditor
          patterns={plain(active)}
          overrides={overrides.map((o) => ({ date: o.date, patternId: o.patternId, patternName: o.pattern.name, count: o.requiredCount }))}
        />
      </Card>
    </div>
  );
}
