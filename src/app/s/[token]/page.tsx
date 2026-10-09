import { formatYearMonthJa } from "@/lib/time";
import { prisma } from "@/server/db";
import { formatDeadline, nextTargetMonth } from "@/server/shifts/periods";
import { requestForm } from "@/server/shifts/requests";
import { verifyStaffToken } from "@/server/staff-link";
import { Alert } from "@/components/ui";
import { StaffRequestEditor } from "./StaffRequestEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "シフト希望の提出", robots: { index: false } };

export default async function StaffSubmitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const employeeId = verifyStaffToken(token, "submit");
  const employee = employeeId ? await prisma.employee.findUnique({ where: { id: employeeId } }) : null;
  if (!employee || !employee.active) {
    return (
      <main className="mx-auto max-w-xl p-4">
        <Alert kind="error">リンクの有効期限が切れているか、正しくありません。LINEで「シフト提出」と送ると新しいリンクが届きます。</Alert>
      </main>
    );
  }
  const collecting = await prisma.shiftPeriod.findFirst({ where: { status: "COLLECTING" }, orderBy: { yearMonth: "asc" } });
  const ym = collecting?.yearMonth ?? (await nextTargetMonth());
  const form = await requestForm(employee.id, ym);

  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="text-xl font-bold">{formatYearMonthJa(ym)} 希望シフト</h1>
      <p className="mb-3 text-slate-600">{employee.name}さん</p>
      <div className="mb-4 space-y-2">
        {form.accepting ? (
          <Alert kind="info">締切：<b>{formatDeadline(form.period.deadline)}</b>　締切までは何度でも修正できます。</Alert>
        ) : (
          <Alert kind="warn">現在は提出期間外のため、変更できません（表示のみ）。変更したい場合は店長に連絡してください。</Alert>
        )}
        {form.submission && (
          <Alert kind="success">提出済み（{form.submission.submittedAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}）</Alert>
        )}
      </div>
      <StaffRequestEditor
        token={token}
        ym={ym}
        readOnly={!form.accepting}
        initialDays={form.days}
        initialComment={form.submission?.comment ?? ""}
        patterns={form.patterns.map((p) => ({ id: p.id, name: p.name, startTime: p.startTime, endTime: p.endTime }))}
      />
    </main>
  );
}
