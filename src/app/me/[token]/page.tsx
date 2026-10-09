import { Alert, Card } from "@/components/ui";
import { addMonths, businessDateOf, formatDateJa, formatDuration, formatDurationJa, formatHmRange, formatTime, formatYearMonthJa, yearMonthOf } from "@/lib/time";
import { monthlyAttendance } from "@/server/attendance";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { myShifts } from "@/server/shifts/staff";
import { verifyStaffToken } from "@/server/staff-link";

export const dynamic = "force-dynamic";
export const metadata = { title: "わたしのシフト・勤務時間", robots: { index: false } };

export default async function MePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const employeeId = verifyStaffToken(token, "me");
  const employee = employeeId ? await prisma.employee.findUnique({ where: { id: employeeId } }) : null;
  if (!employee || !employee.active) {
    return (
      <main className="mx-auto max-w-xl p-4">
        <Alert kind="error">リンクの有効期限が切れています。LINEで「シフト確認」と送ると新しいリンクが届きます。</Alert>
      </main>
    );
  }
  const settings = await getSettings();
  const ym = yearMonthOf(businessDateOf(new Date(), settings.dayChangeHour));
  const months = [ym, addMonths(ym, 1)];
  const shifts = await Promise.all(months.map((m) => myShifts(employee.id, m)));
  const attendance = await monthlyAttendance(employee.id, ym);

  return (
    <main className="mx-auto max-w-xl space-y-4 p-4">
      <h1 className="text-xl font-bold">{employee.name}さん</h1>
      {months.map((m, i) => (
        <Card key={m} title={`${formatYearMonthJa(m)}の確定シフト`}>
          {!shifts[i].published ? (
            <p className="text-sm text-slate-500">まだ公開されていません</p>
          ) : shifts[i].items.length === 0 ? (
            <p className="text-sm text-slate-500">シフトはありません</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {shifts[i].items.map((s) => (
                <li key={s.date} className="flex justify-between py-2">
                  <span>{formatDateJa(s.date)}</span>
                  <span className="font-medium">{s.patternName ? `${s.patternName} ` : ""}{formatHmRange(s.startTime, s.endTime)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
      <Card title={`${formatYearMonthJa(ym)}の勤務時間`}>
        <div className="mb-3 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">勤務日数</div><div className="text-2xl font-bold">{attendance.totals.workDays}日</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">実働時間</div><div className="text-2xl font-bold">{formatDurationJa(attendance.totals.workMinutes)}</div></div>
        </div>
        <ul className="divide-y divide-slate-100 text-sm">
          {attendance.days.flatMap((d) =>
            d.rows.map((r) => (
              <li key={r.session.id} className="flex justify-between py-1.5">
                <span>{formatDateJa(d.date)}</span>
                <span>{formatTime(r.session.clockIn, d.date) || "—"}〜{formatTime(r.session.clockOut, d.date) || "—"}　<b>{formatDuration(r.summary.workMinutes) || "—"}</b></span>
              </li>
            )),
          )}
        </ul>
        <p className="mt-2 text-xs text-slate-500">打刻の間違いに気づいたら店長に伝えてください。</p>
      </Card>
    </main>
  );
}
