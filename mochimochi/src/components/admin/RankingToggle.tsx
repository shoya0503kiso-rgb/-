"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cx } from "@/components/ui";
import { setRankingVisibleAction } from "@/app/admin/settings/actions";

const LABEL = { darts: "🎯 ダーツランキング", poker: "🃏 ポーカーランキング", submarine: "🍺 サブマリンランキング" } as const;

/** ランキングをお客さんに見せるかどうかの切り替え（押すとすぐ反映） */
export function RankingToggle({ kind, visible }: { kind: keyof typeof LABEL; visible: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(visible);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    const res = await setRankingVisibleAction(kind, !on);
    setBusy(false);
    if (!res.ok) return alert(res.error);
    setOn(!on);
    router.refresh();
  }
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div>
        <div className="font-bold">{LABEL[kind]}</div>
        <div className={cx("text-xs", on ? "text-emerald-700" : "text-slate-500")}>{on ? "お客さんに表示中" : "お客さんには非表示（記録は続きます）"}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${LABEL[kind]}を${on ? "隠す" : "表示する"}`}
        disabled={busy}
        onClick={toggle}
        className={cx("relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50", on ? "bg-emerald-500" : "bg-slate-300")}
      >
        <span className={cx("absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform", on && "translate-x-6")} />
      </button>
    </div>
  );
}
