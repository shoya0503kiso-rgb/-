"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Panel } from "@/components/member/Panel";
import { StampCard } from "@/components/member/StampCard";
import { IMG } from "@/lib/brand-images";
import type { CheckinResult } from "@/server/checkin";
import { checkinAction } from "../actions";

type State = { kind: "working"; text: string } | { kind: "done"; r: CheckinResult } | { kind: "error"; message: string };

function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

export function CheckinRunner({
  code,
  needGeo,
  alreadyVisited,
  pointName,
  stampCardBonus,
}: {
  code: string;
  needGeo: boolean;
  alreadyVisited: boolean;
  pointName: string;
  stampCardBonus: number;
}) {
  const [state, setState] = useState<State>(
    alreadyVisited ? { kind: "error", message: "今日はもうチェックイン済みです。また明日！" } : { kind: "working", text: "チェックイン中…" },
  );
  const started = useRef(false);

  async function run() {
    setState({ kind: "working", text: needGeo ? "位置情報を確認しています…" : "チェックイン中…" });
    const geo = needGeo ? await getPosition() : null;
    setState({ kind: "working", text: "チェックイン中…" });
    const res = await checkinAction(code, geo);
    setState(res.ok ? { kind: "done", r: res.data! } : { kind: "error", message: res.error });
  }

  useEffect(() => {
    if (alreadyVisited || started.current) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.kind === "working") {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-slate-600">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-rose-200 border-t-rose-500" />
        {state.text}
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="space-y-4 py-6">
        <Panel>
          <p className="text-center font-bold text-slate-800">{state.message}</p>
          {!alreadyVisited && (
            <button onClick={run} className="mt-4 w-full rounded-xl bg-rose-500 py-3 font-bold text-white">
              もう一度ためす
            </button>
          )}
        </Panel>
        <Link href="/me" className="block text-center text-sm text-rose-600">
          マイページへ
        </Link>
      </div>
    );
  }

  const r = state.r;
  return (
    <div className="space-y-4">
      <div className="py-4 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={IMG.tigerChip} alt="" className="mx-auto w-36" />
        <h1 className="mt-2 text-2xl font-extrabold text-rose-600">いらっしゃいませ！</h1>
        <p className="mt-1 text-sm text-slate-600">来店 {r.visitCount}回目</p>
      </div>
      <Panel>
        <p className="text-center">
          <b className="text-3xl text-rose-600">+{r.points}</b> <span className="text-sm">{pointName}</span>
        </p>
        {r.cardCompleted && (
          <p className="mt-2 rounded-xl bg-amber-50 py-2 text-center font-bold text-amber-700">
            スタンプカード達成！ +{r.cardBonus || stampCardBonus} {pointName}
          </p>
        )}
        {r.rankUp && <p className="mt-2 rounded-xl bg-rose-50 py-2 text-center font-bold text-rose-700">ランクアップ！「{r.rankName}」になりました</p>}
      </Panel>
      <Panel title="スタンプカード">
        <StampCard count={r.stampCount} perCard={r.stampsPerCard} bonus={0} pointName={pointName} highlight={r.stampCount} />
      </Panel>
      <div className="grid grid-cols-2 gap-3">
        <Link href="/game" className="rounded-xl bg-rose-500 py-3 text-center font-bold text-white">
          🎲 ゲームで遊ぶ
        </Link>
        <Link href="/me" className="rounded-xl bg-white py-3 text-center font-bold text-rose-600 ring-1 ring-rose-200">
          マイページ
        </Link>
      </div>
    </div>
  );
}
