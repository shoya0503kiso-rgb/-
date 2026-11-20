"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cx } from "@/components/ui";
import { SLOT_SYMBOLS, SLOT_TABLE, SYMBOL_LABEL, type SlotSymbol } from "@/lib/slot";
import { slotSpinAction } from "../../actions";
import { Confetti, useReducedMotion, wait } from "../fx";
import { useSfx } from "../sfx";

// トランプちゃんスロット。台の絵（slot-machine.webp）のリール窓に本物のリールを重ねる。
// 結果はサーバーで決まり、ボタンで止める順番やタイミングは見せ方だけ

const ART = "/brand/slot-machine.webp";
const FACE = "/brand/slot-trump.webp";

// 台の絵（1448×1086）の中の位置（%）
const WINDOW = { left: 26.6, top: 38.7, width: 47.3, height: 28.5 };
const REEL_X = [
  [0, 32.1],
  [33.6, 32.1],
  [67.2, 32.8],
] as const;
const LED = { top: 71.4, height: 4.6, credit: [32.1, 8.3], count: [45.2, 9.7], payout: [60.1, 7.9] } as const;
const BUTTONS = [37.6, 50.1, 62.5];
const BUTTON = { top: 86.7, size: 8.6 };
const LEVER = { left: 87.5, top: 33, width: 9.5, height: 27 };

type Status = { cost: number; limit: number; spinsToday: number; points: number; lastReels: SlotSymbol[] };

const next = (s: SlotSymbol, d: number) => SLOT_SYMBOLS[(SLOT_SYMBOLS.indexOf(s) + d + SLOT_SYMBOLS.length) % SLOT_SYMBOLS.length];

/** リールの絵柄 */
function Sym({ s }: { s: SlotSymbol }) {
  const box = "flex h-full w-full items-center justify-center";
  if (s === "trump") {
    return (
      <div className={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={FACE} alt="トランプちゃん" className="h-[78%] rounded-full ring-[3px] ring-amber-400" draggable={false} />
      </div>
    );
  }
  if (s === "two") {
    return (
      <div className={cx(box, "relative")}>
        <span className="text-[62cqw] leading-none font-black text-pink-500 [-webkit-text-stroke:2px_#831843] [text-shadow:0_3px_0_#831843]">2</span>
        <span className="absolute right-[18%] bottom-[16%] text-[18cqw]">🐾</span>
      </div>
    );
  }
  if (s === "bar") {
    return (
      <div className={box}>
        <span className="rounded-[10cqw] border-[3px] border-slate-900 bg-white px-[7cqw] py-[1cqw] text-[22cqw] leading-none font-black text-slate-900 shadow-[0_2px_0_#0f172a]">BAR</span>
      </div>
    );
  }
  const emoji = { bell: "🔔", grape: "🍇", cherry: "🍒" }[s];
  return <div className={cx(box, "text-[46cqw] leading-none")}>{emoji}</div>;
}

/** 1本のリール。spinning の間は回り続け、止まったら真ん中に face を出す */
function Reel({ face, spinning, slow, stopKey }: { face: SlotSymbol; spinning: boolean; slow?: boolean; stopKey: number }) {
  const strip = [...SLOT_SYMBOLS, ...SLOT_SYMBOLS];
  return (
    <div className="slot-reel relative h-full w-full overflow-hidden rounded-[6px]">
      {spinning ? (
        <div className={cx("slot-spin absolute inset-x-0 top-0", slow && "slow")} style={{ height: `${(strip.length / 3) * 100}%` }}>
          {strip.map((s, i) => (
            <div key={i} style={{ height: `${100 / strip.length}%` }}>
              <Sym s={s} />
            </div>
          ))}
        </div>
      ) : (
        <div key={stopKey} className="slot-stop absolute inset-0 flex flex-col">
          {[next(face, -1), face, next(face, 1)].map((s, i) => (
            <div key={i} className="h-1/3">
              <Sym s={s} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Led({ at, value }: { at: readonly [number, number]; value: number | string }) {
  return (
    <div
      className="absolute flex items-center justify-center rounded-[4px] bg-[#1a0606] font-mono font-black text-red-500 tabular-nums [text-shadow:0_0_6px_#ef4444]"
      style={{ left: `${at[0]}%`, width: `${at[1]}%`, top: `${LED.top}%`, height: `${LED.height}%`, fontSize: "clamp(10px, 3.6cqw, 22px)" }}
    >
      {value}
    </div>
  );
}

export function SlotMachine({ initial, pointName, characterName }: { initial: Status; pointName: string; characterName: string }) {
  const [st, setSt] = useState(initial);
  const [faces, setFaces] = useState<SlotSymbol[]>(initial.lastReels);
  const [spinning, setSpinning] = useState([false, false, false]);
  const [stopKeys, setStopKeys] = useState([0, 0, 0]);
  const [phase, setPhase] = useState<"idle" | "spinning" | "done">("idle");
  const [reach, setReach] = useState(false);
  const [credit, setCredit] = useState(initial.points);
  const [payout, setPayout] = useState(0);
  const [result, setResult] = useState<{ outcome: string; payout: number } | null>(null);
  const [msg, setMsg] = useState("");
  const [coins, setCoins] = useState(0);
  const [party, setParty] = useState<{ n: number; gold: boolean } | null>(null);
  const [cutin, setCutin] = useState<{ n: number; text: string } | null>(null);
  const sfx = useSfx();
  const reduced = useReducedMotion();
  const target = useRef<{ reels: SlotSymbol[]; outcome: string; payout: number; points: number; spinsToday: number } | null>(null);
  const stopped = useRef([false, false, false]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const left = st.limit - st.spinsToday;
  const canSpin = phase !== "spinning" && left > 0 && credit >= st.cost;

  async function start() {
    if (!canSpin) {
      if (left <= 0) setMsg("今日はもうおしまい。また明日！");
      else if (credit < st.cost) setMsg(`${pointName}が足りません（1回 ${st.cost}pt）`);
      return;
    }
    sfx.unlock();
    sfx.hit();
    setMsg("");
    setResult(null);
    setPayout(0);
    setReach(false);
    stopped.current = [false, false, false];
    target.current = null;
    setPhase("spinning");
    setSpinning([true, true, true]);
    setCredit((c) => c - st.cost);
    let res: Awaited<ReturnType<typeof slotSpinAction>> | null = null;
    try {
      res = await slotSpinAction();
    } catch {
      res = null;
    }
    if (!alive.current) return;
    if (!res || !res.ok) {
      setSpinning([false, false, false]);
      setPhase("idle");
      setCredit(st.points);
      setMsg(res ? res.error : "通信できませんでした。開き直してね");
      return;
    }
    target.current = res.data!;
    // 押さなくても順番に止まる
    timers.current = [0, 1, 2].map((i) => setTimeout(() => stop(i, true), (reduced ? 400 : 1600) + i * 700));
  }

  async function stop(i: number, auto = false) {
    const t = target.current;
    if (!t || stopped.current[i]) return;
    // リーチ中の最後のリールは、少しじらしてから止める
    const others = [0, 1, 2].filter((k) => k !== i);
    const isLast = others.every((k) => stopped.current[k]);
    if (isLast && t.reels[others[0]] === t.reels[others[1]] && !auto && !reachShown.current) return;
    stopped.current[i] = true;
    setFaces((f) => f.map((v, k) => (k === i ? t.reels[i] : v)) as SlotSymbol[]);
    setSpinning((s) => s.map((v, k) => (k === i ? false : v)));
    setStopKeys((k) => k.map((v, j) => (j === i ? v + 1 : v)));
    sfx.clack();
    const done = stopped.current.filter(Boolean).length;
    if (done === 2) {
      const rest = [0, 1, 2].find((k) => !stopped.current[k])!;
      const [a, b] = [0, 1, 2].filter((k) => k !== rest).map((k) => t.reels[k]);
      if (a === b) await showReach(rest);
    }
    if (done === 3) await finish();
  }

  const reachShown = useRef(false);
  async function showReach(rest: number) {
    reachShown.current = false;
    timers.current.forEach(clearTimeout);
    setReach(true);
    setCutin({ n: Date.now(), text: "リーチ！" });
    sfx.chant(2);
    setTimeout(() => sfx.chant(2), 180);
    await wait(reduced ? 300 : 1500);
    if (!alive.current) return;
    reachShown.current = true;
    // ボタンを押さなければ少し後に自動で止まる
    timers.current = [setTimeout(() => stop(rest, true), reduced ? 200 : 1200)];
  }

  async function finish() {
    const t = target.current!;
    timers.current.forEach(clearTimeout);
    setReach(false);
    reachShown.current = false;
    setResult({ outcome: t.outcome, payout: t.payout });
    setSt((s) => ({ ...s, points: t.points, spinsToday: t.spinsToday }));
    setPhase("done");
    if (t.payout > 0) {
      // 払い出しの数字を増やしていく
      const steps = Math.min(20, t.payout);
      for (let k = 1; k <= steps; k++) {
        setPayout(Math.round((t.payout * k) / steps));
        if (k % 2) sfx.tick();
        await wait(reduced ? 5 : 35);
      }
      setCredit(t.points);
      setCoins((c) => c + 1);
      if (t.outcome === "trump") {
        sfx.fanfare();
        setCutin({ n: Date.now(), text: "TRUMP★CHAN BONUS!!" });
        if (!reduced) setParty({ n: Date.now(), gold: true });
      } else if (t.outcome === "cherry") {
        sfx.coin();
      } else {
        sfx.win();
        setTimeout(() => sfx.coin(), 400);
        if (!reduced && (t.outcome === "two" || t.outcome === "bar")) setParty({ n: Date.now(), gold: false });
      }
    } else {
      setCredit(t.points);
    }
  }

  const win = result && result.payout > 0;
  return (
    <div className="space-y-3">
      <div className="relative mx-auto w-full max-w-[560px] select-none [container-type:inline-size]" style={{ aspectRatio: "1448 / 1086" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ART} alt="トランプちゃんスロット" className="absolute inset-0 h-full w-full" draggable={false} />

        {/* リール */}
        <div className="absolute" style={{ left: `${WINDOW.left}%`, top: `${WINDOW.top}%`, width: `${WINDOW.width}%`, height: `${WINDOW.height}%` }}>
          {REEL_X.map(([x, w], i) => (
            <div key={i} className="absolute top-0 h-full" style={{ left: `${x}%`, width: `${w}%` }}>
              <Reel face={faces[i]} spinning={spinning[i]} slow={reach && spinning[i]} stopKey={stopKeys[i]} />
            </div>
          ))}
          {/* 当たりのライン */}
          <div className={cx("pointer-events-none absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-amber-300 shadow-[0_0_8px_#fbbf24]", win ? "slot-line" : "opacity-40")} />
          {reach && <div className="pointer-events-none absolute inset-0 rounded-md ring-4 ring-pink-400 slot-line" />}
        </div>

        {/* 数字の表示 */}
        <Led at={LED.credit} value={credit} />
        <Led at={LED.count} value={st.spinsToday} />
        <Led at={LED.payout} value={payout} />

        {/* 止めるボタン（絵のピンクのボタンに重ねる） */}
        {BUTTONS.map((x, i) => (
          <button
            key={i}
            aria-label={`${i + 1}番目のリールを止める`}
            onClick={() => stop(i)}
            disabled={phase !== "spinning" || !spinning[i]}
            className={cx("absolute -translate-x-1/2 -translate-y-1/2 rounded-full", phase === "spinning" && spinning[i] && "slot-btn-on")}
            style={{ left: `${x}%`, top: `${BUTTON.top}%`, width: `${BUTTON.size}%`, aspectRatio: "1" }}
          />
        ))}
        {/* レバー */}
        <button
          aria-label="レバーを引いてスタート"
          onClick={start}
          className={cx("absolute rounded-full", canSpin && "slot-btn-on")}
          style={{ left: `${LEVER.left}%`, top: `${LEVER.top}%`, width: `${LEVER.width}%`, height: `${LEVER.height}%` }}
        />

        {/* カットイン（リーチ・大当たり） */}
        {cutin && (
          <div key={cutin.n} className="slot-cutin pointer-events-none absolute inset-x-0 top-[8%] z-10 flex items-center justify-center gap-2">
            <div className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-600 via-pink-500 to-rose-500 px-3 py-2 shadow-xl ring-4 ring-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={FACE} alt="" className="h-12 w-12 rounded-full ring-2 ring-amber-300" />
              <span className="text-xl font-black whitespace-nowrap text-white italic [text-shadow:0_2px_0_#831843]">{cutin.text}</span>
            </div>
          </div>
        )}
        {/* コインが飛び出す */}
        {coins > 0 && !reduced && (
          <div key={coins} className="pointer-events-none absolute top-[55%] left-1/2 z-10">
            {Array.from({ length: 18 }, (_, k) => (
              <span
                key={k}
                className="slot-coin absolute text-2xl"
                style={{ "--dx": `${(Math.random() - 0.5) * 320}px`, "--dy": `${-60 - Math.random() * 180}px`, "--rot": `${(Math.random() - 0.5) * 720}deg`, animationDelay: `${k * 25}ms` } as CSSProperties}
              >
                🪙
              </span>
            ))}
          </div>
        )}
      </div>
      {party && <Confetti key={party.n} gold={party.gold} count={party.gold ? 110 : 60} />}

      {/* 操作 */}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-rose-100">
        <div className="min-h-7 text-center text-lg font-black">
          {phase === "spinning" ? (
            <span className="text-pink-600">{reach ? "リーチ！ 止めて！" : "ボタンでリールを止めてね"}</span>
          ) : result ? (
            win ? (
              <span className={result.outcome === "trump" ? "bg-gradient-to-r from-amber-400 to-pink-500 bg-clip-text text-2xl text-transparent" : "text-rose-600"}>
                {result.outcome === "trump" ? `${characterName}そろった！ ` : `${SYMBOL_LABEL[result.outcome as SlotSymbol]}！ `}+{result.payout}pt
              </span>
            ) : (
              <span className="text-slate-500">ざんねん… もう一回？</span>
            )
          ) : (
            <span className="text-slate-600">レバーかスタートで回してね</span>
          )}
        </div>
        {msg && <p className="mt-1 text-center text-sm text-red-600">{msg}</p>}
        <button
          onClick={start}
          disabled={phase === "spinning"}
          className="mt-3 w-full rounded-2xl bg-gradient-to-b from-pink-500 to-rose-600 py-4 text-lg font-black text-white shadow-[0_6px_0_#9f1239] active:translate-y-1 active:shadow-[0_2px_0_#9f1239] disabled:opacity-50"
        >
          🎰 スタート（{st.cost}pt）
        </button>
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
          <span>
            今日あと <b className="text-slate-700">{Math.max(0, left)}</b> 回
          </span>
          <button onClick={sfx.toggle} className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200" aria-pressed={sfx.on}>
            {sfx.on ? "🔊 音あり" : "🔇 音なし"}
          </button>
        </div>
      </div>

      {/* 配当表 */}
      <details className="rounded-2xl bg-white p-4 text-sm shadow-sm ring-1 ring-rose-100">
        <summary className="cursor-pointer font-bold">配当表（1回 {st.cost}pt）</summary>
        <ul className="mt-3 space-y-2">
          {SLOT_TABLE.map((r) => (
            <li key={r.outcome} className="flex items-center gap-3">
              <div className="flex h-9 shrink-0 gap-1">
                {(r.outcome === "cherry" ? ["cherry"] : [r.outcome, r.outcome, r.outcome]).map((s, i) => (
                  <div key={i} className="w-9 [container-type:inline-size]">
                    <Sym s={s as SlotSymbol} />
                  </div>
                ))}
              </div>
              <span className="flex-1">{r.outcome === "cherry" ? "左にチェリー" : `${SYMBOL_LABEL[r.outcome]}そろい`}</span>
              <b className="text-rose-600">{st.cost * r.mult}pt</b>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">真ん中の横1列がそろうと当たり。止める順番やタイミングで結果は変わりません</p>
      </details>
    </div>
  );
}
