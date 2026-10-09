import { Alert } from "@/components/ui";
import { boardData, latestReport } from "@/server/shifts/board";
import { hasUnpublishedChanges } from "@/server/shifts/publish";
import { Board } from "./Board";

export async function BoardTab({ ym }: { ym: string }) {
  const [data, report, unpublished] = await Promise.all([boardData(ym), latestReport(ym), hasUnpublishedChanges(ym)]);
  if (data.patterns.filter((p) => p.active).length === 0) {
    return <Alert kind="warn">シフト枠がありません。先に「シフト枠・必要人数」で枠と必要人数を設定してください。</Alert>;
  }
  return (
    <Board
      ym={ym}
      status={data.period.status}
      unpublished={unpublished}
      dates={data.dates}
      patterns={data.patterns.map((p) => ({ id: p.id, name: p.name, startTime: p.startTime, endTime: p.endTime, active: p.active }))}
      rows={data.rows}
      fill={data.fill}
      report={report ? { ...report.report, createdAt: report.createdAt.toISOString(), createdBy: report.createdBy } : null}
    />
  );
}
