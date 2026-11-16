"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { IMG } from "@/lib/brand-images";
import { evalChinchiro, HAND_LABEL, HANDS, type ChinchiroHand, type Hand } from "@/lib/games";
import { chinchiroAction, jankenAction } from "../actions";
import { Bowl, Bubble, Confetti, CountUp, Die, ResultStamp, useReducedMotion, wait } from "./fx";
import { useSfx, type Sfx } from "./sfx";

// デイリーゲーム（じゃんけん・チンチロ）。勝ち負けはサーバーで決まり、画面は結果を演出して見せるだけ

const HAND_ICON: Record<Hand, string> = { rock: "✊", scissors: "✌️", paper: "🖐️" };
const RESULT_TEXT = { win: "かち！", lose: "まけ…", draw: "わかれ" } as const;

type Played = { game: string; result: string; points: number };
type Rewards = { janken: number; chinchiro: number; chinchiroBig: number };
type Common = { onDone: () => void; pointName: string; characterName: string; sfx: Sfx; reduced: boolean };

export function GameBoard({ played, pointName, characterName, rewards }: { played: Played | null; pointName: string; characterName: string; rewards: Rewards }) {
  const [tab, setTab] = useState<"janken" | "chinchiro">("janken");
  // この画面で遊び始めたら、結果を出したままタブを固定する
  const [locked, setLocked] = useState(false);
  const sfx = useSfx();
  const reduced = useReducedMotion();

  if (played && !locked) return <PlayedToday played={played} pointName={pointName} characterName={characterName} />;

  const common: Common = { onDone: () => setLocked(true), pointName, characterName, sfx, reduced };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="grid flex-1 grid-cols-2 gap-1 rounded-2xl bg-white p-1 ring-1 ring-rose-100">
          {(["janken", "chinchiro"] as const).map((g) => (
            <button
              key={g}
              disabled={locked && tab !== g}
              onClick={() => !locked && setTab(g)}
              className={cx("rounded-xl py-2 text-sm font-bold transition-colors", tab === g ? "bg-rose-500 text-white" : "text-slate-600 disabled:opacity-40")}
            >
              {g === "janken" ? "✊ じゃんけん" : "🎲 チンチロ"}
            </button>
          ))}
        </div>
        <button onClick={sfx.toggle} className="shrink-0 rounded-full bg-white px-3 py-2 text-xs ring-1 ring-slate-200" aria-pressed={sfx.on}>
          {sfx.on ? "🔊 音あり" : "🔇 音なし"}
        </button>
      </div>
      {tab === "janken" ? <Janken {...common} reward={rewards.janken} /> : <Chinchiro {...common} rewards={rewards} />}
    </div>
  );
}

/** 今日もう遊んだとき */
function PlayedToday({ played, pointName, characterName }: { played: Played; pointName: string; characterName: string }) {
  const won = played.result === "win";
  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-rose-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={won ? IMG.trumpDrowsy : IMG.trumpAwake} alt="" className="h-44 w-full object-cover object-[50%_40%]" />
      <div className="p-4 text-center">
        <p className="text-lg font-extrabold">今日はもう遊びました</p>
        <p className="mt-1 text-sm text-slate-600">
          {played.game === "janken" ? "じゃんけん" : "チンチロ"}：{RESULT_TEXT[played.result as keyof typeof RESULT_TEXT] ?? ""}
          {played.points > 0 && `（+${played.points} ${pointName}）`}
        </p>
        <p className="mt-2 text-sm text-slate-500">{won ? `${characterName}「くやしい〜！明日また勝負よ！」` : `${characterName}「また明日あそぼうね♪」`}</p>
        <Link href="/mochi" className="mt-4 block rounded-xl bg-rose-500 py-3 text-center font-bold text-white">
          {characterName}をなでに行く
        </Link>
      </div>
    </section>
  );
}

/** 舞台：ゆれ・フラッシュ・紙吹雪をまとめて出す */
function useStage() {
  const [shake, setShake] = useState(0);
  const [flash, setFlash] = useState(0);
  const [confetti, setConfetti] = useState<{ n: number; gold: boolean } | null>(null);
  return {
    shake,
    flash,
    confetti,
    bang: () => {
      setShake((n) => n + 1);
      setFlash((n) => n + 1);
    },
    party: (gold = false) => setConfetti((c) => ({ n: (c?.n ?? 0) + 1, gold })),
  };
}

function Stage({ stage, children, className }: { stage: ReturnType<typeof useStage>; children: ReactNode; className?: string }) {
  return (
    <>
      <section key={`shake-${stage.shake}`} className={cx("relative overflow-hidden rounded-3xl p-4 shadow-sm ring-1 ring-rose-100", stage.shake > 0 && "fx-shake", className)}>
        {children}
        {stage.flash > 0 && <div key={`flash-${stage.flash}`} className="fx-flash pointer-events-none absolute inset-0 bg-white" />}
      </section>
      {stage.confetti && <Confetti key={stage.confetti.n} gold={stage.confetti.gold} count={stage.confetti.gold ? 110 : 70} />}
    </>
  );
}

// ───────────────── じゃんけん ─────────────────

type JPhase = "pick" | "chant" | "reveal" | "result";

function Janken({ onDone, reward, pointName, characterName, sfx, reduced }: Common & { reward: number }) {
  const [phase, setPhase] = useState<JPhase>("pick");
  const [round, setRound] = useState(0);
  const [player, setPlayer] = useState<Hand | null>(null);
  const [house, setHouse] = useState<Hand | null>(null);
  const [spin, setSpin] = useState<Hand>("rock");
  const [chant, setChant] = useState("");
  const [line, setLine] = useState("じゃんけんで勝負よ！");
  const [result, setResult] = useState<{ res: "win" | "lose"; points: number } | null>(null);
  const [error, setError] = useState("");
  const stage = useStage();
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  async function play(hand: Hand) {
    if (phase !== "pick") return;
    setError("");
    setPlayer(hand);
    setHouse(null);
    setPhase("chant");
    setLine(round === 0 ? "いくわよ〜！" : "もう一回！");
    const req = jankenAction(hand);
    // 相手の手をルーレットのように回す
    let k = 0;
    const spinner = setInterval(() => {
      k = (k + 1) % 3;
      setSpin(HANDS[k]);
      sfx.tick();
    }, 90);
    const words = round === 0 ? ["じゃん", "けん", "ぽん！"] : ["あいこで", "しょ！"];
    for (let i = 0; i < words.length - 1; i++) {
      setChant(words[i]);
      sfx.chant(i);
      await wait(reduced ? 150 : 420);
    }
    const res = await req;
    clearInterval(spinner);
    if (!alive.current) return;
    if (!res.ok) {
      setChant("");
      setPhase("pick");
      setLine("あれ？うまくいかなかったみたい");
      setError(res.error);
      return;
    }
    const d = res.data!;
    setChant(words[words.length - 1]);
    sfx.chant(2);
    setHouse(d.house);
    setPhase("reveal");
    sfx.hit();
    stage.bang();
    await wait(reduced ? 200 : 650);
    if (!alive.current) return;
    setChant("");
    if (d.result === "draw") {
      sfx.draw();
      setLine("あいこでしょ！ もう一回選んで！");
      setRound((r) => r + 1);
      setPhase("pick");
      return;
    }
    onDone();
    setResult({ res: d.result, points: d.points });
    setPhase("result");
    if (d.result === "win") {
      sfx.win();
      stage.party();
      setTimeout(() => sfx.coin(), 500);
      setLine("まけちゃった〜！ つよいね！");
    } else {
      sfx.lose();
      setLine("やった〜！ わたしの勝ち♪");
    }
  }

  const showHouse: Hand | null = phase === "chant" ? spin : house;
  const won = result?.res === "win";
  return (
    <Stage stage={stage} className="bg-gradient-to-b from-rose-50 via-white to-pink-50">
      <Bubble img={won ? IMG.trumpDrowsy : IMG.trumpAwake} name={characterName} tone={result ? (won ? "sad" : "happy") : "normal"}>
        {line}
      </Bubble>

      <div className="relative mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <HandCard label="あなた" hand={player} pump={phase === "chant"} slam={phase === "reveal" || phase === "result"} highlight={result?.res === "win"} dim={result?.res === "lose"} />
        <div className="text-xl font-black text-rose-300">VS</div>
        <HandCard
          label={characterName}
          hand={showHouse}
          spinning={phase === "chant"}
          slam={phase === "reveal" || phase === "result"}
          highlight={result?.res === "lose"}
          dim={result?.res === "win"}
        />
        {chant && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span key={chant} className="fx-chant rounded-2xl bg-rose-600/90 px-5 py-2 text-3xl font-black text-white shadow-lg">
              {chant}
            </span>
          </div>
        )}
      </div>

      {phase === "result" && result ? (
        <div className="mt-5 space-y-3">
          <ResultStamp kind={won ? "win" : "lose"}>{won ? "WIN!" : "LOSE…"}</ResultStamp>
          {won && (
            <p className="fx-rise text-center text-2xl font-black text-rose-600">
              +<CountUp to={result.points} /> <span className="text-base">{pointName}</span>
            </p>
          )}
          <AfterPlay characterName={characterName} />
        </div>
      ) : (
        <>
          <p className="mt-5 text-center text-sm text-slate-600">
            {round > 0 ? "あいこ！ もう一度、手を選んでね" : <>手を選んで勝負！ 勝ったら <b className="text-rose-600">{reward}</b> {pointName}</>}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {HANDS.map((h) => (
              <button
                key={h}
                disabled={phase !== "pick"}
                onClick={() => play(h)}
                className={cx(
                  "rounded-2xl bg-white py-3 text-center shadow-[0_5px_0_#fda4af] ring-2 ring-rose-200 transition-transform active:translate-y-1 active:shadow-[0_1px_0_#fda4af] disabled:opacity-40",
                  player === h && phase !== "pick" && "opacity-100 ring-rose-500",
                )}
              >
                <div className="text-4xl">{HAND_ICON[h]}</div>
                <div className="mt-1 text-xs font-bold text-rose-700">{HAND_LABEL[h]}</div>
              </button>
            ))}
          </div>
          {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
        </>
      )}
    </Stage>
  );
}

function HandCard({
  label,
  hand,
  pump,
  spinning,
  slam,
  highlight,
  dim,
}: {
  label: string;
  hand: Hand | null;
  pump?: boolean;
  spinning?: boolean;
  slam?: boolean;
  highlight?: boolean;
  dim?: boolean;
}) {
  return (
    <div className="text-center">
      <div className="mb-1 truncate text-xs font-bold text-slate-500">{label}</div>
      <div
        className={cx(
          "mx-auto flex aspect-square w-full max-w-[120px] items-center justify-center rounded-3xl bg-white text-6xl shadow-md ring-4 transition-all",
          highlight ? "ring-amber-400" : "ring-rose-100",
          dim && "opacity-50 grayscale",
        )}
      >
        <span key={slam ? `slam-${hand}` : pump ? "pump" : `idle-${hand}`} className={cx("inline-block", pump && "fx-pump", spinning && "fx-roulette", slam && "fx-slam")}>
          {hand ? HAND_ICON[hand] : pump ? "✊" : "❔"}
        </span>
      </div>
    </div>
  );
}

// ───────────────── チンチロ ─────────────────

type CPhase = "ready" | "loading" | "house" | "turn" | "player" | "result";
type Roll = { rolls: number[][]; hand: ChinchiroHand };
type CData = { result: "win" | "lose" | "draw"; player: Roll; house: Roll; points: number };

const randFace = () => 1 + Math.floor(Math.random() * 6);

function Chinchiro({ onDone, rewards, pointName, characterName, sfx, reduced }: Common & { rewards: Rewards }) {
  const [phase, setPhase] = useState<CPhase>("ready");
  const [faces, setFaces] = useState<number[] | null>([1, 2, 3]);
  const [rolling, setRolling] = useState(false);
  const [note, setNote] = useState("");
  const [line, setLine] = useState("サイコロで勝負よ！ 先にわたしが振るね");
  const [houseHand, setHouseHand] = useState<ChinchiroHand | null>(null);
  const [playerHand, setPlayerHand] = useState<ChinchiroHand | null>(null);
  const [data, setData] = useState<CData | null>(null);
  const [glow, setGlow] = useState(false);
  const [error, setError] = useState("");
  const stage = useStage();
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  /** 出目を順番に見せる（目なしなら振り直し） */
  async function rollOut(rolls: number[][], who: "house" | "player") {
    for (let i = 0; i < rolls.length; i++) {
      setNote(i === 0 ? "" : `${i + 1}投目…`);
      setGlow(false);
      setRolling(true);
      sfx.roll();
      const iv = setInterval(() => setFaces([randFace(), randFace(), randFace()]), 85);
      await wait(reduced ? 250 : 1150);
      clearInterval(iv);
      if (!alive.current) return;
      setRolling(false);
      setFaces(rolls[i]);
      sfx.clack();
      await wait(reduced ? 100 : 350);
      const h = evalChinchiro(rolls[i]);
      if (h.name === "目なし" && i < rolls.length - 1) {
        setNote("目なし！ もう一回…");
        setLine(who === "house" ? "あれ、目なし…もう一回振るね" : "目なし！ もう一回振れるよ");
        await wait(reduced ? 300 : 950);
        if (!alive.current) return;
      }
    }
  }

  function showHand(h: ChinchiroHand, who: "house" | "player") {
    setNote(h.name);
    if (h.big) {
      setGlow(true);
      sfx.fanfare();
      stage.bang();
      if (who === "player") stage.party(true);
    } else if (h.name === "ヒフミ") {
      sfx.lose();
    }
  }

  async function start() {
    setError("");
    setPhase("loading");
    const res = await chinchiroAction();
    if (!alive.current) return;
    if (!res.ok) {
      setPhase("ready");
      setError(res.error);
      return;
    }
    const d = res.data! as CData;
    onDone();
    setData(d);
    // 親（トランプちゃん）の番
    setPhase("house");
    setLine("それっ！");
    await rollOut(d.house.rolls, "house");
    if (!alive.current) return;
    setHouseHand(d.house.hand);
    showHand(d.house.hand, "house");
    setLine(
      d.house.hand.big
        ? `${d.house.hand.name}！ どう？ すごいでしょ♪`
        : d.house.hand.name === "ヒフミ"
          ? "ヒフミ…あちゃ〜"
          : d.house.hand.name === "目なし"
            ? "目なし…ついてないなぁ"
            : `わたしは「${d.house.hand.name}」よ！`,
    );
    await wait(reduced ? 300 : 1100);
    if (!alive.current) return;
    setGlow(false);
    setPhase("turn");
    setLine("次はあなたの番！ 思いっきり振って！");
  }

  async function playerRoll() {
    if (!data || phase !== "turn") return;
    setPhase("player");
    setLine("ドキドキ…");
    await rollOut(data.player.rolls, "player");
    if (!alive.current) return;
    setPlayerHand(data.player.hand);
    showHand(data.player.hand, "player");
    await wait(reduced ? 300 : data.player.hand.big ? 1300 : 700);
    if (!alive.current) return;
    setPhase("result");
    if (data.result === "win") {
      if (!data.player.hand.big) {
        sfx.win();
        stage.party();
      }
      setTimeout(() => sfx.coin(), 500);
      setLine(data.player.hand.big ? "うそ〜！ 役で負けた〜！" : "まけちゃった〜！ つよいね！");
    } else if (data.result === "lose") {
      sfx.lose();
      setLine("わたしの勝ち♪ また明日ね！");
    } else {
      sfx.draw();
      setLine("同じ強さ…わかれね！");
    }
  }

  const won = data?.result === "win";
  const done = phase === "result" && data;
  return (
    <Stage stage={stage} className="bg-gradient-to-b from-indigo-50 via-white to-rose-50">
      <Bubble img={done && won ? IMG.trumpDrowsy : IMG.trumpAwake} name={`${characterName}（親）`} tone={done ? (won ? "sad" : data.result === "lose" ? "happy" : "normal") : "normal"}>
        {line}
      </Bubble>

      <div className="relative mt-5">
        <Bowl faces={faces} rolling={rolling} size={232} glow={glow} />
        {note && (
          <div className="pointer-events-none absolute inset-x-0 -bottom-2 flex justify-center">
            <span
              key={note}
              className={cx(
                "fx-chant rounded-full px-4 py-1 text-lg font-black shadow-md",
                glow ? "bg-gradient-to-r from-amber-300 to-amber-500 text-amber-950" : note.includes("目なし") || note === "ヒフミ" ? "bg-slate-700 text-white" : "bg-rose-600 text-white",
              )}
            >
              {glow ? `✨ ${note} ✨` : note}
            </span>
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2">
        <HandSlot label={`${characterName}（親）`} hand={houseHand} active={phase === "house"} />
        <HandSlot label="あなた" hand={playerHand} active={phase === "player" || phase === "turn"} />
      </div>

      <div className="mt-4">
        {phase === "ready" || phase === "loading" ? (
          <>
            <p className="text-center text-xs text-slate-600">
              親より強い目で勝ち！ 勝ち <b className="text-rose-600">{rewards.chinchiro}</b>／役で勝ち <b className="text-amber-600">{rewards.chinchiroBig}</b> {pointName}
            </p>
            <p className="mt-1 text-center text-[11px] text-slate-400">ピンゾロ ＞ ゾロ目 ＞ シゴロ ＞ 目 ＞ 目なし ＞ ヒフミ（目なしは3回まで振り直し）</p>
            <button
              onClick={start}
              disabled={phase === "loading"}
              className="mt-3 w-full rounded-2xl bg-gradient-to-b from-rose-500 to-rose-600 py-4 text-lg font-black text-white shadow-[0_6px_0_#9f1239] active:translate-y-1 active:shadow-[0_2px_0_#9f1239] disabled:opacity-60"
            >
              {phase === "loading" ? "準備中…" : "勝負する！"}
            </button>
            {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
          </>
        ) : phase === "turn" ? (
          <button
            onClick={playerRoll}
            className="fx-chant w-full rounded-2xl bg-gradient-to-b from-amber-400 to-amber-500 py-4 text-lg font-black text-amber-950 shadow-[0_6px_0_#b45309] active:translate-y-1 active:shadow-[0_2px_0_#b45309]"
          >
            🎲 あなたの番！ サイコロを振る
          </button>
        ) : done ? (
          <div className="space-y-3">
            <ResultStamp kind={won ? (data.player.hand.big ? "big" : "win") : data.result === "lose" ? "lose" : "draw"}>
              {won ? (data.player.hand.big ? "役で勝ち!!" : "WIN!") : data.result === "lose" ? "LOSE…" : "わかれ"}
            </ResultStamp>
            {data.points > 0 && (
              <p className="fx-rise text-center text-2xl font-black text-rose-600">
                +<CountUp to={data.points} /> <span className="text-base">{pointName}</span>
              </p>
            )}
            <AfterPlay characterName={characterName} />
          </div>
        ) : (
          <p className="py-4 text-center text-sm font-bold text-slate-500">{phase === "house" ? `${characterName}が振っています…` : "サイコロが転がっています…"}</p>
        )}
      </div>
    </Stage>
  );
}

function HandSlot({ label, hand, active }: { label: string; hand: ChinchiroHand | null; active: boolean }) {
  return (
    <div className={cx("rounded-2xl bg-white/90 p-2 text-center ring-2 transition-colors", active ? "ring-rose-400" : "ring-slate-100")}>
      <div className="truncate text-[11px] font-bold text-slate-500">{label}</div>
      {hand ? (
        <div className="fx-chant">
          <div className="mt-1 flex justify-center gap-1">
            {hand.dice.map((v, i) => (
              <Die key={i} value={v} size={22} />
            ))}
          </div>
          <div className={cx("mt-1 text-sm font-black", hand.big ? "text-amber-600" : hand.name === "ヒフミ" || hand.name === "目なし" ? "text-slate-500" : "text-slate-800")}>{hand.name}</div>
        </div>
      ) : (
        <div className="mt-1 py-3 text-sm text-slate-300">{active ? "…" : "－"}</div>
      )}
    </div>
  );
}

function AfterPlay({ characterName }: { characterName: string }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Link href="/mochi" className="rounded-xl bg-rose-500 py-3 text-center text-sm font-bold text-white">
        {characterName}をなでる
      </Link>
      <Link href="/me" className="rounded-xl bg-white py-3 text-center text-sm font-bold text-rose-600 ring-1 ring-rose-200">
        マイページ
      </Link>
    </div>
  );
}
