"use client";

import Link from "next/link";
import { useState } from "react";
import { Panel } from "@/components/member/Panel";
import { cx } from "@/components/ui";
import { HAND_LABEL, type ChinchiroHand, type Hand } from "@/lib/games";
import { chinchiroAction, jankenAction } from "../actions";

const HAND_ICON: Record<Hand, string> = { rock: "✊", scissors: "✌️", paper: "🖐️" };
const DIE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const RESULT_TEXT = { win: "かち！", lose: "まけ…", draw: "わかれ" } as const;

type Played = { game: string; result: string; points: number };
type Rewards = { janken: number; chinchiro: number; chinchiroBig: number };

export function GameBoard({ played, pointName, rewards }: { played: Played | null; pointName: string; rewards: Rewards }) {
  const [tab, setTab] = useState<"janken" | "chinchiro">("janken");
  // この画面で遊び終えたら、結果を出したままタブを固定する
  const [finished, setFinished] = useState(false);

  if (played && !finished) {
    return (
      <Panel>
        <p className="text-center text-lg font-bold">今日はもう遊びました</p>
        <p className="mt-1 text-center text-sm text-slate-600">
          {played.game === "janken" ? "じゃんけん" : "チンチロ"}：{RESULT_TEXT[played.result as keyof typeof RESULT_TEXT] ?? ""}
          {played.points > 0 && `（+${played.points} ${pointName}）`}
        </p>
        <p className="mt-3 text-center text-sm text-slate-500">また明日あそんでね！</p>
        <Link href="/mochi" className="mt-4 block rounded-xl bg-rose-500 py-3 text-center font-bold text-white">
          🍡 もちもち連打へ
        </Link>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-1 ring-1 ring-rose-100">
        {(["janken", "chinchiro"] as const).map((g) => (
          <button
            key={g}
            onClick={() => !finished && setTab(g)}
            className={cx("rounded-xl py-2 text-sm font-bold", tab === g ? "bg-rose-500 text-white" : "text-slate-600")}
          >
            {g === "janken" ? "✊ じゃんけん" : "🎲 チンチロ"}
          </button>
        ))}
      </div>
      {tab === "janken" ? (
        <Janken onDone={() => setFinished(true)} reward={rewards.janken} pointName={pointName} />
      ) : (
        <Chinchiro onDone={() => setFinished(true)} rewards={rewards} pointName={pointName} />
      )}
    </div>
  );
}

function Janken({ onDone, reward, pointName }: { onDone: () => void; reward: number; pointName: string }) {
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ player: Hand; house: Hand; result: "win" | "lose" | "draw"; points: number } | null>(null);
  const [error, setError] = useState("");

  async function play(hand: Hand) {
    setBusy(true);
    setError("");
    const res = await jankenAction(hand);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    const d = res.data!;
    setLast({ player: hand, house: d.house, result: d.result, points: d.points });
    if (d.result !== "draw") onDone();
  }

  const finished = last && last.result !== "draw";
  return (
    <Panel>
      <p className="text-center text-sm text-slate-600">
        勝ったら <b className="text-rose-600">{reward}</b> {pointName}
      </p>
      <div className="my-6 flex items-center justify-around text-center">
        <div>
          <div className="text-xs text-slate-500">あなた</div>
          <div className="text-6xl">{last ? HAND_ICON[last.player] : "❔"}</div>
        </div>
        <div className="text-lg font-bold text-slate-400">VS</div>
        <div>
          <div className="text-xs text-slate-500">もちもち</div>
          <div className="text-6xl">{last ? HAND_ICON[last.house] : "❔"}</div>
        </div>
      </div>
      {last && (
        <p className={cx("mb-4 text-center text-2xl font-extrabold", last.result === "win" ? "text-rose-600" : "text-slate-600")}>
          {last.result === "draw" ? "あいこ！もう一回" : RESULT_TEXT[last.result]}
          {last.points > 0 && <span className="block text-base">+{last.points} {pointName}</span>}
        </p>
      )}
      {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}
      {!finished && (
        <div className="grid grid-cols-3 gap-3">
          {(["rock", "scissors", "paper"] as Hand[]).map((h) => (
            <button
              key={h}
              disabled={busy}
              onClick={() => play(h)}
              className="rounded-2xl bg-rose-50 py-4 text-center ring-1 ring-rose-200 active:scale-95 disabled:opacity-50"
            >
              <div className="text-4xl">{HAND_ICON[h]}</div>
              <div className="text-xs font-bold text-rose-700">{HAND_LABEL[h]}</div>
            </button>
          ))}
        </div>
      )}
      {finished && <AfterPlay />}
    </Panel>
  );
}

type Roll = { rolls: number[][]; hand: ChinchiroHand };

function Chinchiro({ onDone, rewards, pointName }: { onDone: () => void; rewards: Rewards; pointName: string }) {
  const [phase, setPhase] = useState<"ready" | "rolling" | "done">("ready");
  const [result, setResult] = useState<{ player: Roll; house: Roll; result: "win" | "lose" | "draw"; points: number } | null>(null);
  const [error, setError] = useState("");

  async function play() {
    setPhase("rolling");
    setError("");
    const [res] = await Promise.all([chinchiroAction(), new Promise((r) => setTimeout(r, 1200))]);
    if (!res.ok) {
      setPhase("ready");
      return setError(res.error);
    }
    setResult(res.data!);
    setPhase("done");
    onDone();
  }

  return (
    <Panel>
      <p className="text-center text-sm text-slate-600">
        親（もちもち）より強い目で勝ち！ 勝ち <b className="text-rose-600">{rewards.chinchiro}</b>／役で勝ち <b className="text-rose-600">{rewards.chinchiroBig}</b> {pointName}
      </p>
      <p className="mt-1 text-center text-[11px] text-slate-400">ピンゾロ ＞ ゾロ目 ＞ シゴロ ＞ 目 ＞ 目なし ＞ ヒフミ</p>
      {phase === "rolling" && <div className="dice-shake my-8 text-center text-6xl">🎲🎲🎲</div>}
      {phase === "ready" && (
        <button onClick={play} className="mt-6 w-full rounded-2xl bg-rose-500 py-4 text-lg font-bold text-white active:scale-95">
          サイコロをふる
        </button>
      )}
      {result && phase === "done" && (
        <div className="mt-4 space-y-3">
          <DiceRow label="もちもち（親）" roll={result.house} />
          <DiceRow label="あなた" roll={result.player} />
          <p className={cx("text-center text-2xl font-extrabold", result.result === "win" ? "text-rose-600" : "text-slate-600")}>
            {RESULT_TEXT[result.result]}
            {result.points > 0 && <span className="block text-base">+{result.points} {pointName}</span>}
          </p>
          <AfterPlay />
        </div>
      )}
      {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
    </Panel>
  );
}

function DiceRow({ label, roll }: { label: string; roll: Roll }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="font-bold text-slate-800">{roll.hand.name}</span>
      </div>
      <div className="mt-1 space-y-0.5">
        {roll.rolls.map((dice, i) => (
          <div key={i} className={cx("text-4xl leading-none tracking-wider", i < roll.rolls.length - 1 && "text-2xl opacity-40")}>
            {dice.map((d) => DIE[d]).join("")}
          </div>
        ))}
      </div>
    </div>
  );
}

function AfterPlay() {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      <Link href="/mochi" className="rounded-xl bg-rose-500 py-3 text-center text-sm font-bold text-white">
        🍡 もちもち連打
      </Link>
      <Link href="/me" className="rounded-xl bg-white py-3 text-center text-sm font-bold text-rose-600 ring-1 ring-rose-200">
        マイページ
      </Link>
    </div>
  );
}
