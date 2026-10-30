import Link from "next/link";
import { Panel } from "@/components/member/Panel";
import { RankingTable } from "@/components/RankingTable";
import { cx } from "@/components/ui";
import { IMG } from "@/lib/brand-images";
import { addMonths, formatMonth, isValidMonth, monthOf } from "@/lib/time";
import { requireMember } from "@/server/member-auth";
import { gameRanking, submarineRanking } from "@/server/rankings";
import { today } from "@/server/settings";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "darts", label: "🎯 ダーツ", img: IMG.tigerDarts, pos: "object-[50%_50%]", bg: "bg-[#fdf9f1]" },
  { key: "poker", label: "🃏 ポーカー", img: IMG.poker, pos: "object-[50%_30%]", bg: "bg-white" },
  { key: "submarine", label: "🍺 サブマリン", img: IMG.submarine, pos: "object-[50%_25%]", bg: "bg-white" },
] as const;

export default async function RankingPage({ searchParams }: { searchParams: Promise<{ t?: string; m?: string }> }) {
  const sp = await searchParams;
  const member = await requireMember("/ranking");
  const tabInfo = TABS.find((t) => t.key === sp.t) ?? TABS[0];
  const tab = tabInfo.key;
  const current = monthOf(await today());
  const month = sp.m === "all" && tab !== "submarine" ? "all" : sp.m && isValidMonth(sp.m) ? sp.m : current;
  const rows = tab === "submarine" ? await submarineRanking(month) : await gameRanking(tab, month);
  const href = (t: string, m: string) => `/ranking?t=${t}&m=${m}`;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">ランキング</h1>
      <div className={`overflow-hidden rounded-2xl ring-1 ring-rose-100 ${tabInfo.bg}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tabInfo.img} alt="" className={`h-40 w-full object-cover ${tabInfo.pos}`} />
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white p-1 ring-1 ring-rose-100">
        {TABS.map((t) => (
          <Link key={t.key} href={href(t.key, month === "all" && t.key === "submarine" ? current : month)} className={cx("rounded-xl py-2 text-center text-sm font-bold", tab === t.key ? "bg-rose-500 text-white" : "text-slate-600")}>
            {t.label}
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between text-sm">
        {month === "all" ? (
          <span />
        ) : (
          <Link href={href(tab, addMonths(month, -1))} className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
            ‹ 前月
          </Link>
        )}
        <span className="font-bold">{month === "all" ? "通算" : formatMonth(month)}</span>
        {month === "all" || month >= current ? (
          <span className="w-16" />
        ) : (
          <Link href={href(tab, addMonths(month, 1))} className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
            次月 ›
          </Link>
        )}
      </div>
      {tab !== "submarine" && (
        <div className="text-center text-xs">
          {month === "all" ? (
            <Link href={href(tab, current)} className="text-rose-600 underline">
              月間に戻す
            </Link>
          ) : (
            <Link href={href(tab, "all")} className="text-rose-600 underline">
              通算ランキングを見る
            </Link>
          )}
        </div>
      )}

      <Panel>
        <RankingTable rows={rows} unit={tab === "submarine" ? "杯" : "pt"} highlightId={member.id} />
      </Panel>
      <p className="text-center text-xs text-slate-500">
        {tab === "submarine" ? "サブマリンは毎月1日にリセットされます" : "大会・ゲームの順位に応じたポイントの合計です"}
      </p>
    </div>
  );
}
