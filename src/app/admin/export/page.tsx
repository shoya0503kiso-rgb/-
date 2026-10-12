import { AutoSubmitForm } from "@/components/AutoSubmitForm";
import Link from "next/link";
import { Alert, Card, Field, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import { addMonths, businessDateOf, datesOfMonth, formatYearMonthJa, isValidYearMonth, yearMonthOf } from "@/lib/time";
import { listOpenAnomalies } from "@/server/attendance";
import { listEmployees } from "@/server/employees";
import { getSettings } from "@/server/settings";

export default async function ExportPage({ searchParams }: { searchParams: Promise<{ ym?: string; employeeId?: string }> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  // 月末に前月分を出す運用を想定し、既定は前月
  const ym = sp.ym && isValidYearMonth(sp.ym) ? sp.ym : addMonths(yearMonthOf(businessDateOf(new Date(), settings.dayChangeHour)), -1);
  const employees = await listEmployees({ includeInactive: true });
  const employeeId = employees.some((e) => e.id === sp.employeeId) ? sp.employeeId! : "";
  const qs = new URLSearchParams({ ym, ...(employeeId ? { employeeId } : {}) });
  const dates = datesOfMonth(ym);
  const unconfirmed = (await listOpenAnomalies({ from: dates[0] })).filter(
    (a) => a.businessDate <= dates[dates.length - 1] && (!employeeId || a.employeeId === employeeId),
  );

  return (
    <>
      <PageHeader title="社労士提出データ出力" description="従業員名 / 日付 / 出勤 / 退勤 / 休憩 / 実働時間 を月単位・スタッフ単位で出力します。" />
      <Card>
        <AutoSubmitForm className="mb-6 grid gap-4 sm:grid-cols-2" action="/admin/export">
          <Field label="対象月">
            <Input type="month" name="ym" defaultValue={ym} />
          </Field>
          <Field label="対象スタッフ">
            <Select name="employeeId" defaultValue={employeeId}>
              <option value="">全スタッフ</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </Select>
          </Field>
        </AutoSubmitForm>
        {unconfirmed.length > 0 && (
          <div className="mb-3">
            <Alert kind="warn">
              この月に未確認の要確認勤怠が <b>{unconfirmed.length}件</b> あります。出力前に
              <Link className="mx-1 underline" href="/admin/anomalies">要確認勤怠</Link>
              を確認・修正してください。
            </Alert>
          </div>
        )}
        <p className="mb-3 font-bold">{formatYearMonthJa(ym)}・{employees.find((e) => e.id === employeeId)?.name ?? "全スタッフ"}</p>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/api/admin/export?${qs}&format=xlsx`} prefetch={false}>Excel（.xlsx）</LinkButton>
          <LinkButton variant="secondary" href={`/api/admin/export?${qs}&format=csv`} prefetch={false}>CSV</LinkButton>
          <LinkButton variant="secondary" href={`/admin/export/print?${qs}`} target="_blank">印刷 / PDF保存</LinkButton>
        </div>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-slate-500">
          <li>Excel：集計シート・スタッフ別シート（月の全日）・全明細シート</li>
          <li>CSV：Excelで文字化けしない形式（UTF-8 BOM付き）</li>
          <li>PDF：印刷ページを開き、ブラウザの印刷から「PDFとして保存」を選んでください</li>
          <li>要確認の勤怠が残っている場合は、出力前に確認・修正してください</li>
        </ul>
      </Card>
    </>
  );
}
