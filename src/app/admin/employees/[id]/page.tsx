import { notFound } from "next/navigation";
import { Alert, Card, LinkButton, PageHeader } from "@/components/ui";
import { yearMonthOf, jstDateStr } from "@/lib/time";
import { getEmployee } from "@/server/employees";
import { EmployeeForm, PinForm } from "../EmployeeForm";
import { LineLinkPanel } from "./LineLinkPanel";

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  const employee = await getEmployee(id);
  if (!employee) notFound();
  const ym = yearMonthOf(jstDateStr(new Date()));
  return (
    <div className="space-y-5">
      <PageHeader title={employee.name} actions={<LinkButton variant="secondary" href={`/admin/attendance?employeeId=${id}&ym=${ym}`}>勤怠を見る</LinkButton>} />
      {created && <Alert kind="success">登録しました。必要に応じてPINやLINE連携を設定してください。</Alert>}
      <Card title="固定プロフィール">
        <EmployeeForm employee={employee} />
      </Card>
      <Card title="打刻用PIN（任意）">
        <PinForm employeeId={id} hasPin={!!employee.pinHash} />
      </Card>
      <Card title="LINE連携">
        <LineLinkPanel employeeId={id} linked={employee.lineAccount ? { displayName: employee.lineAccount.displayName, linkedAt: employee.lineAccount.linkedAt } : null} />
      </Card>
    </div>
  );
}
