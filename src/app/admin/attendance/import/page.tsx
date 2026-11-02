import { Card, PageHeader } from "@/components/ui";
import { listEmployees } from "@/server/employees";
import { ImportForm } from "./ImportForm";

export default async function AttendanceImportPage() {
  const employees = await listEmployees({ includeInactive: true });
  return (
    <>
      <PageHeader
        title="勤怠の一括取り込み"
        description="以前の勤怠システム（スマレジ・タイムカードなど）の記録をまとめて登録します。すでに登録済みの勤怠と時間が重なる行は取り込みません。"
      />
      <Card>
        <ImportForm employees={employees.map((e) => ({ id: e.id, name: e.name }))} />
      </Card>
    </>
  );
}
