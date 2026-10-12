import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { isValidDateStr, parseHm, jstAt, toJstLocal, businessDateOf } from "@/lib/time";
import { getEmployee } from "@/server/employees";
import { getSettings } from "@/server/settings";
import { SessionForm } from "../SessionForm";

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<{ employeeId?: string; date?: string }> }) {
  const sp = await searchParams;
  const employee = sp.employeeId ? await getEmployee(sp.employeeId) : null;
  if (!employee) notFound();
  const settings = await getSettings();
  const date = sp.date && isValidDateStr(sp.date) ? sp.date : businessDateOf(new Date(), settings.dayChangeHour);
  const clockIn = toJstLocal(jstAt(date, parseHm(settings.openTime)));
  return (
    <>
      <PageHeader title={`${employee.name}さんの勤怠を追加`} description="打刻忘れなどで勤怠がない日を手動で追加します" />
      <Card>
        <SessionForm sessionId={null} employeeId={employee.id} initial={{ clockIn, clockOut: "", breaks: [] }} />
      </Card>
    </>
  );
}
