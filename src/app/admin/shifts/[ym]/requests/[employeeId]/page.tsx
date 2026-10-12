import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui";
import { formatYearMonthJa, isValidYearMonth } from "@/lib/time";
import { getEmployee } from "@/server/employees";
import { requestForm } from "@/server/shifts/requests";
import { AdminRequestEditor } from "./AdminRequestEditor";

export default async function AdminRequestPage({ params }: { params: Promise<{ ym: string; employeeId: string }> }) {
  const { ym, employeeId } = await params;
  if (!isValidYearMonth(ym)) notFound();
  const employee = await getEmployee(employeeId);
  if (!employee) notFound();
  const form = await requestForm(employee.id, ym);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title={`${employee.name}さんの希望（${formatYearMonthJa(ym)}）`}
        description={<Link className="text-teal-700 underline" href={`/admin/shifts/${ym}?tab=requests`}>← 提出状況に戻る</Link>}
      />
      <div className="mb-3">
        <Alert kind="info">
          {form.submission
            ? `${form.submission.submittedBy === "ADMIN" ? "管理者が代理入力" : "本人が提出"}（${form.submission.submittedAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}）。修正すると「代理入力」として保存されます。`
            : "未提出です。電話などで聞いた内容を代理入力できます。"}
        </Alert>
      </div>
      <AdminRequestEditor
        ym={ym}
        employeeId={employee.id}
        initialDays={form.days}
        initialComment={form.submission?.comment ?? ""}
        patterns={form.patterns.map((p) => ({ id: p.id, name: p.name, startTime: p.startTime, endTime: p.endTime }))}
      />
    </div>
  );
}
