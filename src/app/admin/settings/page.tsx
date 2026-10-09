import { Badge, Card, Empty, LinkButton, PageHeader, Button } from "@/components/ui";
import { formatDateJa, jstDateStr } from "@/lib/time";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { parseWeekdays } from "@/lib/calendar";
import { revokeKioskAction } from "./actions";
import { logoutEverywhereAction } from "../../login/actions";
import { CalendarForm, SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  const [settings, days, devices] = await Promise.all([
    getSettings(),
    prisma.calendarDay.findMany({ where: { date: { gte: jstDateStr(new Date()) } }, orderBy: { date: "asc" } }),
    prisma.kioskDevice.findMany({ where: { revokedAt: null }, orderBy: { createdAt: "asc" } }),
  ]);
  const { updatedAt: _updatedAt, id: _id, ...values } = settings;
  void _updatedAt;
  void _id;
  return (
    <div className="space-y-5">
      <PageHeader title="店舗設定" description="暫定仕様（docs/00-provisional-specs.md）の値はここで変更できます" />
      <SettingsForm initial={{ ...values, holidayWeekdays: parseWeekdays(values.holidayWeekdays) }} />

      <Card title="店休日・休日の個別指定">
        <CalendarForm />
        <div className="mt-4">
          {days.length === 0 ? (
            <Empty>今日以降の個別指定はありません</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {days.map((d) => (
                <li key={d.date} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="w-24">{formatDateJa(d.date)}</span>
                  {d.isClosed && <Badge color="red">店休日</Badge>}
                  {d.isHoliday === true && <Badge color="amber">休日扱い</Badge>}
                  {d.isHoliday === false && <Badge>平日扱い</Badge>}
                  <span className="text-slate-600">{d.note}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card title="打刻端末" actions={<LinkButton size="sm" variant="secondary" href="/kiosk/setup">この端末を登録</LinkButton>}>
        {devices.length === 0 ? (
          <Empty>登録された打刻端末はありません。店舗のiPadで管理者ログイン後「この端末を登録」を開いてください。</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {devices.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <b>{d.name}</b>
                  <span className="ml-2 text-slate-500">
                    最終使用 {d.lastUsedAt ? d.lastUsedAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—"}
                  </span>
                </span>
                <form action={revokeKioskAction.bind(null, d.id)}>
                  <Button variant="ghost" size="sm">登録解除</Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="管理者セッション">
        <p className="mb-3 text-sm text-slate-600">スマホの紛失時などは、すべての端末の管理者ログインを無効にできます（この端末も再ログインが必要です）。</p>
        <form action={logoutEverywhereAction}>
          <Button variant="danger" size="sm">全端末からログアウト</Button>
        </form>
      </Card>
    </div>
  );
}
