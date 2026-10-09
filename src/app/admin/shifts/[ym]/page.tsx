import { notFound } from "next/navigation";
import { Badge, LinkButton, PageHeader } from "@/components/ui";
import { addMonths, formatYearMonthJa, isValidYearMonth } from "@/lib/time";
import { PERIOD_STATUS_LABELS, getOrCreatePeriod } from "@/server/shifts/periods";
import { RequestsTab } from "./RequestsTab";
import { SHIFT_TABS, ShiftTabs, type ShiftTab } from "./ShiftTabs";
import { ConditionsTab } from "./ConditionsTab";
import { BoardTab } from "./BoardTab";

export default async function ShiftPeriodPage({ params, searchParams }: { params: Promise<{ ym: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { ym } = await params;
  const { tab } = await searchParams;
  if (!isValidYearMonth(ym)) notFound();
  const period = await getOrCreatePeriod(ym);
  const active: ShiftTab = SHIFT_TABS.some((t) => t.key === tab) ? (tab as ShiftTab) : period.status === "PREPARING" || period.status === "COLLECTING" ? "requests" : "board";

  return (
    <>
      <PageHeader
        title={`${formatYearMonthJa(ym)}のシフト`}
        description={<Badge color={period.status === "PUBLISHED" ? "green" : "blue"}>{PERIOD_STATUS_LABELS[period.status]}</Badge>}
        actions={
          <>
            <LinkButton size="sm" variant="secondary" href={`/admin/shifts/${addMonths(ym, -1)}?tab=${active}`}>◀ 前月</LinkButton>
            <LinkButton size="sm" variant="secondary" href={`/admin/shifts/${addMonths(ym, 1)}?tab=${active}`}>翌月 ▶</LinkButton>
          </>
        }
      />
      <ShiftTabs ym={ym} active={active} />
      {active === "requests" && <RequestsTab ym={ym} />}
      {active === "conditions" && <ConditionsTab ym={ym} />}
      {active === "board" && <BoardTab ym={ym} />}
    </>
  );
}
