import { formatYearMonthJa } from "@/lib/time";
import { listConditions, listPairs, referenceStats } from "@/server/shifts/conditions";
import { periodOverview } from "@/server/shifts/periods";
import { ConditionsEditor } from "./ConditionsEditor";

export async function ConditionsTab({ ym }: { ym: string }) {
  const [conditions, pairs, ref, overview] = await Promise.all([listConditions(ym), listPairs(ym), referenceStats(ym), periodOverview(ym)]);
  const okDays = new Map(overview.rows.map((r) => [r.employee.id, r.submission ? r.okDays : null]));
  return (
    <ConditionsEditor
      ym={ym}
      refLabel={formatYearMonthJa(ref.month)}
      refHasShifts={ref.hasShifts}
      rows={conditions.map((c) => ({
        employee: { id: c.employee.id, name: c.employee.name },
        saved: c.saved,
        value: c.value,
        okDays: okDays.get(c.employee.id) ?? null,
        ref: ref.stats.get(c.employee.id) ?? { workDays: 0, workMinutes: 0, late: 0, noShow: 0, anomalies: 0 },
      }))}
      pairs={pairs.map((p) => ({ id: p.id, a: p.employeeA.name, b: p.employeeB.name, strength: p.strength as "HARD" | "SOFT", memo: p.memo }))}
    />
  );
}
