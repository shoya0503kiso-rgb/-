"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { cx } from "@/components/ui";
import { REEL_STRIPS, STRIP_LEN, SYMBOL_LABEL, type SlotOutcome, type SlotPays, type SlotSymbol } from "@/lib/slot";
import { slotChanceAction, slotSpinAction } from "../../actions";
import { Confetti, useReducedMotion, wait } from "../fx";
import { useSfx } from "../sfx";

// トランプちゃんスロット。台の絵（slot-machine.webp）のリール窓に本物のように回るリールを重ねる。
// ・ふだんの回：結果はサーバーで決まっていて、ボタンを押した近くでその絵柄に止まる
// ・もちもちランプが光った回（チャンス）：押した位置で止まる（1コマだけすべる）。222 を目押しで揃えると追加ボーナス

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
const ART_BUTTONS = [37.6, 50.1, 62.5];
const LAMP = { left: 75.2, top: 43, width: 12, height: 13.5 };
const PAWS = [
  { left: 10.5, top: 70, width: 12, height: 11 },
  { left: 77.5, top: 70, width: 12, height: 11 },
];
const LEVER = { left: 87.5, top: 33, width: 9.5, height: 27 };

/** リールの速さ（コマ/秒）。チャンスのときは目押ししやすいよう少しゆっくり */
const SPEED = { normal: 10, chance: 6, reach: 4 };

type Status = { cost: number; limit: number; spinsToday: number; points: number; freeNext: boolean; pays: SlotPays };
type Result = { spinId: string; outcome: SlotOutcome; reels: SlotSymbol[]; payout: number; free: boolean; freeNext: boolean; points: number; spinsToday: number };

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** リールの絵柄（コマの中で小さめにして間をあける） */
function Sym({ s, glow }: { s: SlotSymbol; glow?: boolean }) {
  const box = "flex h-full w-full items-center justify-center";
  if (s === "trump") {
    return (
      <div className={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={FACE} alt="トランプちゃん" className="h-[64%] rounded-full ring-[3px] ring-amber-400" draggable={false} />
      </div>
    );
  }
  if (s === "two") {
    return (
      <div className={cx(box, "relative")}>
        <span className={cx("text-[50cqw] leading-none font-black text-pink-500 [-webkit-text-stroke:2px_#831843] [text-shadow:0_3px_0_#831843]", glow && "drop-shadow-[0_0_10px_#f9a8d4]")}>2</span>
        <span className="absolute right-[22%] bottom-[20%] text-[14cqw]">🐾</span>
      </div>
    );
  }
  if (s === "bar") {
    return (
      <div className={box}>
        <span className="rounded-[8cqw] border-[3px] border-slate-900 bg-white px-[6cqw] py-[1cqw] text-[18cqw] leading-none font-black text-slate-900 shadow-[0_2px_0_#0f172a]">BAR</span>
      </div>
    );
  }
  const emoji = { bell: "🔔", grape: "🍇", cherry: "🍒" }[s];
  return <div className={cx(box, "text-[36cqw] leading-none")}>{emoji}</div>;
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
  const [phase, setPhase] = useState<"idle" | "loading" | "spinning" | "done">("idle");
  const [moving, setMoving] = useState([false, false, false]);
  const [chance, setChance] = useState(false);
  const [reach, setReach] = useState(false);
  const [credit, setCredit] = useState(initial.points);
  const [payout, setPayout] = useState(0);
  const [msg, setMsg] = useState("");
  const [line, setLine] = useState<{ text: string; tone: "normal" | "win" | "big" | "dim" } | null>(null);
  const [coins, setCoins] = useState(0);
  const [party, setParty] = useState<{ n: number; gold: boolean } | null>(null);
  const [cutin, setCutin] = useState<{ n: number; text: string } | null>(null);
  const sfx = useSfx();
  const reduced = useReducedMotion();

  // リールの動き（毎フレーム書き換えるので state ではなく ref）
  const reelBox = useRef<(HTMLDivElement | null)[]>([]);
  const stripEl = useRef<(HTMLDivElement | null)[]>([]);
  const pos = useRef([0, 4, 8].map((x) => x + 0.0));
  const speed = useRef([0, 0, 0]);
  const settle = useRef<({ from: number; to: number; start: number; dur: number } | null)[]>([null, null, null]);
  const stops = useRef<(number | null)[]>([null, null, null]);
  const result = useRef<Result | null>(null);
  const raf = useRef(0);
  const last = useRef(0);
  const alive = useRef(true);

  const paint = useCallback(() => {
    for (let r = 0; r < 3; r++) {
      const box = reelBox.current[r];
      const el = stripEl.current[r];
      if (!box || !el) continue;
      const cell = box.clientHeight / 3;
      el.style.transform = `translateY(${cell - (pos.current[r] + STRIP_LEN) * cell}px)`;
    }
  }, []);

  const loop = useCallback(
    (ts: number) => {
      const dt = last.current ? Math.min(0.05, (ts - last.current) / 1000) : 0;
      last.current = ts;
      let active = false;
      for (let r = 0; r < 3; r++) {
        const sx = settle.current[r];
        if (sx) {
          const t = Math.min(1, (ts - sx.start) / sx.dur);
          // 少し行き過ぎて戻る
          const e = 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
          pos.current[r] = mod(sx.from + (sx.to - sx.from) * e, STRIP_LEN);
          if (t >= 1) {
            pos.current[r] = mod(Math.round(sx.to), STRIP_LEN);
            settle.current[r] = null;
          } else active = true;
        } else if (speed.current[r] > 0) {
          pos.current[r] = mod(pos.current[r] - speed.current[r] * dt, STRIP_LEN);
          active = true;
        }
      }
      paint();
      raf.current = active ? requestAnimationFrame(loop) : 0;
      if (!active) last.current = 0;
    },
    [paint],
  );

  const kick = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(loop);
  }, [loop]);

  useEffect(() => {
    paint();
    const ro = new ResizeObserver(paint);
    reelBox.current.forEach((b) => b && ro.observe(b));
    return () => {
      alive.current = false;
      cancelAnimationFrame(raf.current);
      ro.disconnect();
    };
  }, [paint]);

  const left = st.limit - st.spinsToday;
  const free = st.freeNext;
  const canStart = (phase === "idle" || phase === "done") && left > 0 && (free || credit >= st.cost);

  async function start() {
    if (phase === "loading" || phase === "spinning") return;
    if (left <= 0) return setMsg("今日はもうおしまい。また明日！");
    if (!free && credit < st.cost) return setMsg(`${pointName}が足りません（1回 ${st.cost}pt）`);
    sfx.unlock();
    sfx.hit();
    setMsg("");
    setLine(null);
    setPayout(0);
    setReach(false);
    setChance(false);
    stops.current = [null, null, null];
    result.current = null;
    setPhase("loading");
    if (!free) setCredit((c) => c - st.cost);
    speed.current = [SPEED.normal, SPEED.normal, SPEED.normal];
    setMoving([true, true, true]);
    kick();
    let res: Awaited<ReturnType<typeof slotSpinAction>> | null = null;
    try {
      res = await slotSpinAction();
    } catch {
      res = null;
    }
    if (!alive.current) return;
    if (!res || !res.ok) {
      // 回したことにならないので、その場でゆっくり止める
      for (let r = 0; r < 3; r++) settleTo(r, 0);
      setMoving([false, false, false]);
      setPhase("idle");
      setCredit(st.points);
      setMsg(res ? res.error : "通信できませんでした。開き直してね");
      return;
    }
    const d = res.data! as Result;
    result.current = d;
    setSt((s) => ({ ...s, spinsToday: d.spinsToday, freeNext: false }));
    if (d.outcome === "chance") {
      // もちもちランプが光る：この時点で 50pt。リールはゆっくりになり、目押しできる
      setChance(true);
      speed.current = [SPEED.chance, SPEED.chance, SPEED.chance];
      setCutin({ n: Date.now(), text: "もちもちチャンス！" });
      sfx.fanfare();
      setCredit((c) => c + d.payout);
      setPayout(d.payout);
      setLine({ text: `+${d.payout}pt 確定！ 222 を目押しでそろえて！`, tone: "big" });
    } else {
      setLine({ text: "好きなタイミングでボタンを押して止めてね", tone: "normal" });
    }
    setPhase("spinning");
  }

  /** r 番のリールを、いまの位置から d コマ先で止める */
  function settleTo(r: number, d: number) {
    const from = pos.current[r];
    const frac = from - Math.floor(from);
    const to = from - frac - d;
    settle.current[r] = { from, to, start: performance.now(), dur: reduced ? 60 : 140 + d * 45 };
    speed.current[r] = 0;
    kick();
    return mod(Math.round(to), STRIP_LEN);
  }

  async function stop(r: number) {
    const res = result.current;
    if (phase !== "spinning" || !res || stops.current[r] !== null) return;
    const base = Math.floor(pos.current[r]);
    const strip = REEL_STRIPS[r];
    let d = 0;
    if (res.outcome === "chance") {
      // 目押し：押した位置で止まる。「2」がすぐ手前（1コマ以内）なら引き込む
      d = strip[mod(base, STRIP_LEN)] === "two" ? 0 : strip[mod(base - 1, STRIP_LEN)] === "two" ? 1 : 0;
    } else {
      // ふだん：決まっている絵柄が来るまですべらせる
      for (d = 0; d < STRIP_LEN; d++) if (strip[mod(base - d, STRIP_LEN)] === res.reels[r]) break;
    }
    const at = settleTo(r, d);
    stops.current[r] = at;
    setMoving((m) => m.map((v, k) => (k === r ? false : v)));
    setTimeout(() => sfx.clack(), reduced ? 30 : 140);
    const done = stops.current.filter((x) => x !== null).length;
    if (done === 2) {
      const rest = [0, 1, 2].find((k) => stops.current[k] === null)!;
      const [a, b] = [0, 1, 2].filter((k) => k !== rest).map((k) => REEL_STRIPS[k][stops.current[k]!]);
      if (a === b) {
        setReach(true);
        speed.current[rest] = SPEED.reach;
        setCutin({ n: Date.now(), text: res.outcome === "chance" && a === "two" ? "あと1つ！ 2 を狙って！" : "リーチ！" });
        sfx.chant(2);
        setTimeout(() => sfx.chant(2), 180);
      }
    }
    if (done === 3) {
      await wait(reduced ? 80 : 320);
      if (alive.current) await finish(res);
    }
  }

  async function finish(res: Result) {
    setReach(false);
    setPhase("done");
    if (res.outcome === "chance") {
      const lineup = stops.current as number[];
      let r: Awaited<ReturnType<typeof slotChanceAction>> | null = null;
      try {
        r = await slotChanceAction(res.spinId, lineup);
      } catch {
        r = null;
      }
      if (!alive.current) return;
      setChance(false);
      if (r && r.ok && r.data!.hit) {
        sfx.fanfare();
        setTimeout(() => sfx.coin(), 600);
        setCutin({ n: Date.now(), text: "222 目押し成功!!" });
        if (!reduced) setParty({ n: Date.now(), gold: true });
        setCoins((c) => c + 1);
        await countPayout(res.payout, res.payout + r.data!.bonus);
        setCredit(r.data!.points);
        setLine({ text: `目押し成功！ +${r.data!.bonus}pt（合計 +${res.payout + r.data!.bonus}pt）`, tone: "big" });
      } else {
        if (r && r.ok) setCredit(r.data!.points);
        sfx.lose();
        setLine({ text: r && !r.ok ? r.error : `おしい！ ボーナス +${res.payout}pt はゲット`, tone: "dim" });
      }
      return;
    }
    if (res.outcome === "trump") {
      sfx.draw();
      setCutin({ n: Date.now(), text: "REPLAY！ もう一回" });
      setSt((s) => ({ ...s, freeNext: true, points: res.points }));
      setLine({ text: `${characterName}そろった！ 次の1回は無料！`, tone: "win" });
      return;
    }
    if (res.payout > 0) {
      setCoins((c) => c + 1);
      sfx.coin();
      await countPayout(0, res.payout);
      setCredit(res.points);
      setLine({ text: `${SYMBOL_LABEL[res.reels[res.outcome === "cherry" ? 0 : 1]]}！ +${res.payout}pt`, tone: "win" });
    } else {
      setCredit(res.points);
      setLine({ text: "ざんねん… もう一回？", tone: "dim" });
    }
    setSt((s) => ({ ...s, points: res.points }));
  }

  async function countPayout(from: number, to: number) {
    const steps = Math.min(20, Math.max(1, to - from));
    for (let k = 1; k <= steps; k++) {
      setPayout(Math.round(from + ((to - from) * k) / steps));
      if (k % 2) sfx.tick();
      await wait(reduced ? 5 : 35);
    }
  }

  const stopReady = (r: number) => phase === "spinning" && moving[r];
  return (
    <div className="space-y-3">
      {/* 台（画面いっぱいに大きく） */}
      <div className="relative -mx-4 select-none [container-type:inline-size]" style={{ aspectRatio: "1448 / 1086" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ART} alt="トランプちゃんスロット" className="absolute inset-0 h-full w-full" draggable={false} />

        {/* リール */}
        <div className="absolute" style={{ left: `${WINDOW.left}%`, top: `${WINDOW.top}%`, width: `${WINDOW.width}%`, height: `${WINDOW.height}%` }}>
          {REEL_X.map(([x, w], r) => (
            <div
              key={r}
              ref={(el) => {
                reelBox.current[r] = el;
              }}
              className="slot-reel absolute top-0 h-full overflow-hidden rounded-[6px]"
              style={{ left: `${x}%`, width: `${w}%` }}
            >
              <div
                ref={(el) => {
                  stripEl.current[r] = el;
                }}
                className={cx("absolute inset-x-0 top-0 will-change-transform", moving[r] && !chance && "blur-[0.6px]")}
                style={{ height: `${STRIP_LEN * 100}%` }}
              >
                {[0, 1, 2].flatMap((k) =>
                  REEL_STRIPS[r].map((s, i) => (
                    <div key={`${k}-${i}`} className="border-b border-slate-200/70" style={{ height: `${100 / (3 * STRIP_LEN)}%` }}>
                      <Sym s={s} glow={chance && s === "two"} />
                    </div>
                  )),
                )}
              </div>
            </div>
          ))}
          {/* 当たりのライン */}
          <div className={cx("pointer-events-none absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 shadow-[0_0_8px_#fbbf24]", chance ? "slot-line bg-pink-400" : "bg-amber-300 opacity-60", line?.tone === "win" || line?.tone === "big" ? "slot-line" : "")} />
          {reach && <div className="slot-line pointer-events-none absolute inset-0 rounded-md ring-4 ring-pink-400" />}
        </div>

        {/* もちもちランプ（チャンスのときに光る） */}
        <div
          className={cx("pointer-events-none absolute rounded-full transition-opacity", chance ? "slot-line opacity-100" : "opacity-0")}
          style={{ left: `${LAMP.left}%`, top: `${LAMP.top}%`, width: `${LAMP.width}%`, height: `${LAMP.height}%`, background: "radial-gradient(circle, rgba(255,255,255,.95) 0%, rgba(244,114,182,.85) 40%, rgba(244,114,182,0) 72%)", mixBlendMode: "screen" }}
        />
        {PAWS.map((p, i) => (
          <div
            key={i}
            className={cx("pointer-events-none absolute rounded-xl transition-opacity", chance ? "slot-line opacity-100" : "opacity-0")}
            style={{ ...p, left: `${p.left}%`, top: `${p.top}%`, width: `${p.width}%`, height: `${p.height}%`, background: "radial-gradient(circle, rgba(255,255,255,.9), rgba(236,72,153,0) 70%)", mixBlendMode: "screen" }}
          />
        ))}

        {/* 数字の表示 */}
        <Led at={LED.credit} value={credit} />
        <Led at={LED.count} value={st.spinsToday} />
        <Led at={LED.payout} value={payout} />

        {/* 絵のボタンとレバーも押せる */}
        {ART_BUTTONS.map((x, r) => (
          <button
            key={r}
            aria-label={`${r + 1}番目のリールを止める（台のボタン）`}
            tabIndex={-1}
            onClick={() => stop(r)}
            className={cx("absolute -translate-x-1/2 -translate-y-1/2 rounded-full", stopReady(r) && "slot-btn-on")}
            style={{ left: `${x}%`, top: "86.7%", width: "8.6%", aspectRatio: "1" }}
          />
        ))}
        <button
          aria-label="レバーを引いてスタート"
          onClick={start}
          className={cx("absolute rounded-full", canStart && "slot-btn-on")}
          style={{ left: `${LEVER.left}%`, top: `${LEVER.top}%`, width: `${LEVER.width}%`, height: `${LEVER.height}%` }}
        />

        {cutin && (
          <div key={cutin.n} className="slot-cutin pointer-events-none absolute inset-x-0 top-[6%] z-10 flex items-center justify-center">
            <div className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-600 via-pink-500 to-rose-500 px-3 py-2 shadow-xl ring-4 ring-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={FACE} alt="" className="h-12 w-12 rounded-full ring-2 ring-amber-300" />
              <span className="text-xl font-black whitespace-nowrap text-white italic [text-shadow:0_2px_0_#831843]">{cutin.text}</span>
            </div>
          </div>
        )}
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

      {/* 大きいストップボタン（目押し用） */}
      <div className="grid grid-cols-3 gap-3 px-2">
        {[0, 1, 2].map((r) => (
          <button
            key={r}
            onClick={() => stop(r)}
            disabled={!stopReady(r)}
            aria-label={`${r + 1}番目のリールを止める`}
            className={cx(
              "mx-auto flex aspect-square w-full max-w-[104px] flex-col items-center justify-center rounded-full border-4 text-white transition-transform active:scale-90",
              stopReady(r)
                ? chance
                  ? "slot-btn-on border-white bg-gradient-to-b from-fuchsia-400 to-pink-600 shadow-[0_6px_0_#9d174d]"
                  : "slot-btn-on border-white bg-gradient-to-b from-pink-400 to-rose-600 shadow-[0_6px_0_#9f1239]"
                : "border-rose-200 bg-rose-200 shadow-[0_3px_0_#fecdd3]",
            )}
          >
            <span className="text-2xl font-black">STOP</span>
            <span className="text-[11px] font-bold opacity-90">{["左", "中", "右"][r]}</span>
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-rose-100">
        <div
          className={cx(
            "min-h-7 text-center text-lg font-black",
            line?.tone === "big" ? "bg-gradient-to-r from-amber-500 to-pink-500 bg-clip-text text-transparent" : line?.tone === "win" ? "text-rose-600" : line?.tone === "dim" ? "text-slate-500" : "text-pink-600",
          )}
        >
          {phase === "loading" ? "回してます…" : (line?.text ?? "レバーかスタートで回してね")}
        </div>
        {msg && <p className="mt-1 text-center text-sm text-red-600">{msg}</p>}
        <button
          onClick={start}
          disabled={phase === "loading" || phase === "spinning"}
          className="mt-3 w-full rounded-2xl bg-gradient-to-b from-pink-500 to-rose-600 py-4 text-lg font-black text-white shadow-[0_6px_0_#9f1239] active:translate-y-1 active:shadow-[0_2px_0_#9f1239] disabled:opacity-50"
        >
          {free ? "🎰 もう一回（無料）" : `🎰 スタート（${st.cost}pt）`}
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
      <details className="rounded-2xl bg-white p-4 text-sm shadow-sm ring-1 ring-rose-100" open>
        <summary className="cursor-pointer font-bold">配当表（1回 {st.cost}pt）</summary>
        <ul className="mt-3 space-y-2">
          <li className="rounded-xl bg-gradient-to-r from-fuchsia-50 to-pink-50 p-2">
            <div className="font-black text-pink-600">✨ もちもちランプが光ったら目押しチャンス</div>
            <div className="mt-1 text-xs text-slate-600">
              光った時点で <b className="text-rose-600">+{st.pays.chance}pt</b>。222 を目押しでそろえたら さらに <b className="text-rose-600">+{st.pays.skill}pt</b>
            </div>
          </li>
          {(
            [
              ["trump", "そろい", "もう一回（無料）"],
              ["cherry", "左に1つ", `${st.pays.cherry}pt`],
              ["grape", "そろい", `${st.pays.grape}pt`],
              ["bell", "そろい", `${st.pays.bell}pt`],
              ["bar", "そろい", `${st.pays.bar}pt`],
            ] as const
          ).map(([s, how, pay]) => (
            <li key={s} className="flex items-center gap-3">
              <div className="flex h-9 shrink-0 gap-1">
                {(s === "cherry" ? [s] : [s, s, s]).map((x, i) => (
                  <div key={i} className="w-9 [container-type:inline-size]">
                    <Sym s={x} />
                  </div>
                ))}
              </div>
              <span className="flex-1">
                {SYMBOL_LABEL[s]}
                {how}
              </span>
              <b className="text-rose-600">{pay}</b>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">真ん中の横1列がそろうと当たり。ふだんの回は押すタイミングで結果は変わりません。チャンスの回だけ、押した位置で止まります</p>
      </details>
    </div>
  );
}
