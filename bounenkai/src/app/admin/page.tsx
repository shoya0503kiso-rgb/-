import Link from "next/link";
import { addDays, endMin, extensionLabel, fmtDate, fmtMin, jstToday, PLANS, yen, type Plan } from "@/lib/booking";
import { Badge, Card, Empty, PageHeader, cx } from "@/components/ui";
import { requireAdmin } from "@/server/auth";
import { listReservations } from "@/server/reservations";
import { ReservationControls } from "./ReservationControls";

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ past?: string; cancelled?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const today = jstToday();
  const tomorrow = addDays(today, 1);
  const rows = await listReservations({ from: sp.past ? undefined : today, includeCancelled: !!sp.cancelled });
  const needCheck = rows.filter((r) => r.status === "active" && r.date === tomorrow && !r.confirmed).length;

  const q = (k: "past" | "cancelled") => {
    const p = new URLSearchParams();
    if (k === "past" ? !sp.past : sp.past) p.set("past", "1");
    if (k === "cancelled" ? !sp.cancelled : sp.cancelled) p.set("cancelled", "1");
    const s = p.toString();
    return s ? `/admin?${s}` : "/admin";
  };

  const byDate = new Map<string, typeof rows>();
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="予約一覧"
        description={sp.past ? "すべての日付（日付順）" : "今日以降（日付順）"}
        actions={
          <>
            <Link href={q("past")} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm">
              {sp.past ? "今日以降だけ" : "過去も表示"}
            </Link>
            <Link href={q("cancelled")} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm">
              {sp.cancelled ? "キャンセルを隠す" : "キャンセルも表示"}
            </Link>
          </>
        }
      />
      {needCheck > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          明日（{fmtDate(tomorrow)}）の予約で、前日確認がまだのものが <b>{needCheck}件</b> あります。
        </div>
      )}
      {rows.length === 0 ? (
        <Card>
          <Empty>予約はまだありません</Empty>
        </Card>
      ) : (
        [...byDate.entries()].map(([date, list]) => (
          <section key={date}>
            <h2 className="mb-2 flex items-center gap-2 font-bold">
              {fmtDate(date)}
              {date === today && <Badge color="red">今日</Badge>}
              {date === tomorrow && <Badge color="amber">明日</Badge>}
            </h2>
            <div className="space-y-3">
              {list.map((r) => {
                const cancelled = r.status === "cancelled";
                return (
                  <div key={r.id} className={cx("rounded-xl border bg-white p-4 shadow-sm", cancelled ? "border-slate-200 opacity-60" : "border-slate-200")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold">
                        {fmtMin(r.startMin)}〜{fmtMin(endMin(r.startMin, r.extensionHours))}
                      </span>
                      <Badge color={r.plan === "casino" ? "amber" : "gray"}>{PLANS[r.plan as Plan]?.name ?? r.plan}</Badge>
                      {cancelled && <Badge color="red">キャンセル</Badge>}
                      {!cancelled && r.confirmed && <Badge color="green">前日確認済み</Badge>}
                      <span className="ml-auto text-sm text-slate-500">受付番号 {r.code}</span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                      <Item k="人数" v={r.people === r.bookedPeople ? `${r.people}名` : `${r.people}名（予約時 ${r.bookedPeople}名）`} />
                      <Item k="延長" v={extensionLabel(r.extensionHours)} />
                      <Item k="オードブル" v={r.hors ? "あり" : "なし"} />
                      <Item k="金額の目安" v={yen(r.estimate)} />
                      <Item k="代表者" v={r.representative} />
                      <Item k={r.groupType === "company" ? "会社・団体" : "種類"} v={r.groupType === "company" ? r.companyName : "友人・個人グループ"} />
                      <Item k="電話" v={<a className="text-amber-800 underline" href={`tel:${r.phone}`}>{r.phone}</a>} />
                      <Item k="メール" v={<a className="break-all text-amber-800 underline" href={`mailto:${r.email}`}>{r.email}</a>} />
                    </dl>
                    {r.note && <p className="mt-2 rounded bg-slate-50 px-2 py-1 text-sm whitespace-pre-wrap">メモ：{r.note}</p>}
                    {!cancelled && <ReservationControls id={r.id} confirmed={r.confirmed} people={r.people} note={r.note} />}
                    <p className="mt-2 text-xs text-slate-400">申込 {r.createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</p>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{k}</dt>
      <dd className="truncate">{v}</dd>
    </div>
  );
}
