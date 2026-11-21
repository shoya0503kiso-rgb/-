"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cx } from "@/components/ui";
import { IMG } from "@/lib/brand-images";
import { lotteryRank } from "@/lib/slot";
import { formatDate, monthInfo, ymd } from "@/lib/time";
import { buyLotteryAction } from "../../actions";
import { Confetti, useReducedMotion, wait } from "../fx";
import { useSfx } from "../sfx";

// トランプちゃん宝くじ。買う → 営業日が終わると抽選 → 翌日トランプちゃんが番号を発表（当たりは自動で入る）

type Draw = { date: string; winning: string; tickets: { id: string; number: string; rank: number; prize: number }[] };
type View = {
  price: number;
  max: number;
  enabled: boolean;
  prizes: number[];
  dayChangeHour: number;
  points: number;
  today: string;
  todayTickets: { id: string; number: string }[];
  draws: Draw[];
};

const RANK_LABEL = ["", "1等", "2等", "3等", "4等"];
const RANK_RULE = ["", "4桁ぜんぶ", "下3桁", "下2桁", "下1桁"];
const FACE = "/brand/slot-trump.webp";

function nextDay(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const { days } = monthInfo(date.slice(0, 7));
  if (d < days) return ymd(y, m, d + 1);
  return m === 12 ? ymd(y + 1, 1, 1) : ymd(y, m + 1, 1);
}

/** 4桁の番号。match は下から何桁が当たりと同じか（光らせる） */
function Digits({ number, match = 0, rolling = false, size = "md" }: { number: string; match?: number; rolling?: boolean; size?: "md" | "lg" }) {
  const [shown, setShown] = useState(number);
  useEffect(() => {
    if (!rolling) {
      setShown(number);
      return;
    }
    const iv = setInterval(() => setShown(String(Math.floor(Math.random() * 10000)).padStart(4, "0")), 60);
    return () => clearInterval(iv);
  }, [rolling, number]);
  return (
    <div className="flex gap-1">
      {shown.split("").map((d, i) => {
        const hit = !rolling && i >= 4 - match;
        return (
          <span
            key={i}
            className={cx(
              "flex items-center justify-center rounded-lg font-mono font-black tabular-nums shadow-inner",
              size === "lg" ? "h-14 w-11 text-4xl" : "h-9 w-7 text-xl",
              hit ? "bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 ring-2 ring-amber-200" : "bg-white text-rose-600 ring-1 ring-rose-200",
            )}
          >
            {d}
          </span>
        );
      })}
    </div>
  );
}

function Ticket({ number, drawDate, winning, rank, prize, fresh, dayChangeHour }: { number: string; drawDate: string; winning?: string; rank?: number; prize?: number; fresh?: boolean; dayChangeHour: number }) {
  const [rolling, setRolling] = useState(!!fresh);
  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setRolling(false), 700);
    return () => clearTimeout(t);
  }, [fresh]);
  const match = winning ? (rank ? 5 - rank : 0) : 0;
  const won = (rank ?? 0) > 0;
  return (
    <div
      className={cx("lottery-ticket relative flex items-center gap-3 px-5 py-3", fresh && "fx-chant", won && "drop-shadow-[0_0_10px_rgba(251,191,36,.8)]")}
      style={{ "--tk": won ? "#fef3c7" : "#fff1f3" } as CSSProperties}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={FACE} alt="" className="h-11 w-11 shrink-0 rounded-full ring-2 ring-white" />
      <div className="min-w-0 flex-1 border-l-2 border-dashed border-rose-200 pl-3">
        <div className="text-[10px] font-bold tracking-widest text-rose-400">TRUMP★CHAN LOTTERY</div>
        <div className="mt-1">
          <Digits number={number} match={match} rolling={rolling} />
        </div>
        <div className="mt-1 text-[11px] text-slate-500">
          {winning ? `${formatDate(drawDate)}の抽選` : `${formatDate(nextDay(drawDate))} ${dayChangeHour}:00 抽選`}
        </div>
      </div>
      {winning !== undefined && (
        <div className={cx("shrink-0 -rotate-12 rounded-lg px-2 py-1 text-center text-sm font-black", won ? "bg-amber-400 text-amber-950" : "text-slate-400 ring-1 ring-slate-300")}>
          {won ? (
            <>
              {RANK_LABEL[rank!]}
              <div className="text-[10px]">+{prize}pt</div>
            </>
          ) : (
            "はずれ"
          )}
        </div>
      )}
    </div>
  );
}

export function LotteryBoard({ view, pointName, characterName }: { view: View; pointName: string; characterName: string }) {
  const router = useRouter();
  const sfx = useSfx();
  const reduced = useReducedMotion();
  const [points, setPoints] = useState(view.points);
  const [tickets, setTickets] = useState(view.todayTickets.map((t) => ({ ...t, fresh: false })));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [line, setLine] = useState(view.todayTickets.length ? "抽選まで、たのしみに待っててね♪" : "宝くじ、買ってみる？");
  const left = view.max - tickets.length;

  async function buy(n: number) {
    if (busy) return;
    sfx.unlock();
    setBusy(true);
    setMsg("");
    let res: Awaited<ReturnType<typeof buyLotteryAction>> | null = null;
    try {
      res = await buyLotteryAction(n);
    } catch {
      res = null;
    }
    setBusy(false);
    if (!res || !res.ok) {
      setMsg(res ? res.error : "通信できませんでした。開き直してね");
      return;
    }
    sfx.coin();
    setPoints((p) => p - view.price * n);
    setTickets((t) => [...res.data!.map((x) => ({ ...x, fresh: true })), ...t.map((x) => ({ ...x, fresh: false }))]);
    setLine(n > 1 ? `${n}枚もありがとう♡ 当たりますように！` : "はい、どうぞ♪ 当たりますように！");
    router.refresh();
  }

  const latest = view.draws[0];
  return (
    <div className="space-y-4">
      {/* 看板 */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-pink-400 via-rose-400 to-fuchsia-500 p-4 text-white shadow-md">
        <div className="pointer-events-none absolute -top-6 -right-6 text-8xl opacity-20">🎟️</div>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={IMG.trumpAwake} alt={characterName} className="h-20 w-20 shrink-0 rounded-full object-cover ring-4 ring-white/80" />
          <div className="min-w-0">
            <div className="text-[11px] font-bold tracking-widest opacity-90">TRUMP★CHAN LOTTERY</div>
            <h1 className="text-xl font-black whitespace-nowrap [text-shadow:0_2px_0_rgba(131,24,67,.4)]">トランプちゃん宝くじ</h1>
            <p key={line} className="fx-chant mt-1 rounded-xl bg-white/90 px-3 py-1 text-sm font-bold text-rose-600">{line}</p>
          </div>
        </div>
      </section>

      {/* 抽選結果 */}
      {latest && <Result draw={latest} view={view} sfx={sfx} reduced={reduced} characterName={characterName} />}

      {/* 買う */}
      {view.enabled && (
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-rose-100">
          <div className="flex items-baseline justify-between">
            <h2 className="font-black text-slate-800">今日の宝くじ</h2>
            <span className="text-xs text-slate-500">
              1枚 <b className="text-rose-600">{view.price}</b>pt・あと {Math.max(0, left)} 枚
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            持っている{pointName}：<b>{points.toLocaleString()}</b> pt ／ 抽選は {formatDate(nextDay(view.today))} {view.dayChangeHour}:00
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[1, 3, 5].map((n) => (
              <button
                key={n}
                disabled={busy || n > left || points < view.price * n}
                onClick={() => buy(n)}
                className="rounded-2xl bg-gradient-to-b from-pink-400 to-rose-500 py-3 text-white shadow-[0_5px_0_#be123c] active:translate-y-1 active:shadow-[0_1px_0_#be123c] disabled:opacity-40"
              >
                <div className="text-lg font-black">{n}枚</div>
                <div className="text-[11px] opacity-90">{view.price * n}pt</div>
              </button>
            ))}
          </div>
          {msg && <p className="mt-2 text-center text-sm text-red-600">{msg}</p>}
          {tickets.length > 0 && (
            <div className="mt-4 space-y-2">
              {tickets.map((t) => (
                <Ticket key={t.id} number={t.number} drawDate={view.today} fresh={t.fresh} dayChangeHour={view.dayChangeHour} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* 当せん金 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-rose-100">
        <h2 className="font-black text-slate-800">当たり</h2>
        <ul className="mt-2 divide-y divide-rose-50 text-sm">
          {[1, 2, 3, 4].map((r) => (
            <li key={r} className="flex items-center justify-between py-2">
              <span>
                <b className={cx("mr-2", r === 1 ? "text-amber-500" : "text-rose-500")}>{RANK_LABEL[r]}</b>当選番号と{RANK_RULE[r]}が同じ
              </span>
              <b className="text-rose-600">{view.prizes[r - 1].toLocaleString()}pt</b>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">当たりのポイントは、抽選のあとこの画面を開くと自動で入ります</p>
      </section>

      {/* これまでの抽選 */}
      {view.draws.length > 1 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-rose-100">
          <h2 className="font-black text-slate-800">これまでの抽選</h2>
          <ul className="mt-2 divide-y divide-rose-50 text-sm">
            {view.draws.slice(1).map((d) => {
              const won = d.tickets.reduce((a, t) => a + t.prize, 0);
              return (
                <li key={d.date} className="flex items-center gap-3 py-2">
                  <span className="w-20 shrink-0 font-bold">{formatDate(d.date)}</span>
                  <span className="font-mono text-base font-black tracking-widest text-rose-600">{d.winning}</span>
                  <span className="ml-auto text-xs text-slate-500">
                    {d.tickets.length}枚 {won > 0 ? <b className="text-amber-600">+{won}pt</b> : "はずれ"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

const SEEN_KEY = "mm-lottery-seen";

/** いちばん新しい抽選の結果発表（一度見たら次からは結果だけ出す） */
function Result({ draw, view, sfx, reduced, characterName }: { draw: Draw; view: View; sfx: ReturnType<typeof useSfx>; reduced: boolean; characterName: string }) {
  const [stage, setStage] = useState<"ready" | "rolling" | "shown">("ready");
  const [revealed, setRevealed] = useState(0);
  const [party, setParty] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY) === draw.date) {
        setStage("shown");
        setRevealed(4);
      }
    } catch {}
    return () => {
      alive.current = false;
    };
  }, [draw.date]);
  const best = draw.tickets.reduce((a, t) => (t.rank > 0 && (a === 0 || t.rank < a) ? t.rank : a), 0);
  const won = draw.tickets.reduce((a, t) => a + t.prize, 0);

  async function reveal() {
    sfx.unlock();
    setStage("rolling");
    for (let i = 1; i <= 4; i++) {
      for (let k = 0; k < (reduced ? 1 : 6); k++) {
        sfx.tick();
        await wait(reduced ? 60 : 110);
      }
      if (!alive.current) return;
      setRevealed(i);
      sfx.clack();
      await wait(reduced ? 100 : 380);
    }
    setStage("shown");
    try {
      localStorage.setItem(SEEN_KEY, draw.date);
    } catch {}
    if (best > 0) {
      if (best <= 2) sfx.fanfare();
      else sfx.win();
      setTimeout(() => sfx.coin(), 500);
      if (!reduced) setParty((p) => p + 1);
    } else {
      sfx.lose();
    }
  }

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-amber-50 via-white to-pink-50 p-4 shadow-sm ring-2 ring-amber-200">
      <h2 className="text-center font-black text-amber-700">🎉 {formatDate(draw.date)}の抽選結果</h2>
      <div className="mt-3 flex items-center justify-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={stage === "shown" ? (best > 0 ? IMG.trumpAwake : IMG.trumpDrowsy) : IMG.trumpSleep}
          alt={characterName}
          className={cx("h-16 w-16 shrink-0 rounded-full object-cover ring-4 ring-white shadow", stage === "shown" && best > 0 && "fx-hop")}
        />
        <div className="text-center">
          <div className="text-[11px] font-bold text-slate-500">当選番号</div>
          {stage === "ready" ? (
            <div className="font-mono text-4xl font-black tracking-widest text-slate-300">????</div>
          ) : (
            <div className="flex gap-1">
              {draw.winning.split("").map((d, i) => (
                <span key={i} className={cx("flex h-14 w-11 items-center justify-center rounded-lg bg-white font-mono text-4xl font-black tabular-nums shadow ring-2", i < revealed ? "fx-chant text-rose-600 ring-rose-300" : "ring-slate-200")}>
                  {i < revealed ? d : <RollingDigit />}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {stage === "ready" ? (
        <button
          onClick={reveal}
          className="fx-chant mt-4 w-full rounded-2xl bg-gradient-to-b from-amber-400 to-amber-500 py-4 text-lg font-black text-amber-950 shadow-[0_6px_0_#b45309] active:translate-y-1 active:shadow-[0_2px_0_#b45309]"
        >
          {characterName}に発表してもらう！
        </button>
      ) : (
        stage === "shown" && (
          <p className="fx-rise mt-3 text-center text-lg font-black">
            {best > 0 ? (
              <span className="text-amber-600">
                {RANK_LABEL[best]}が当たり！ +{won.toLocaleString()}pt
                <span className="block text-xs font-bold text-slate-500">ポイントはもう入っています</span>
              </span>
            ) : (
              <span className="text-slate-500">ざんねん…また挑戦してね！</span>
            )}
          </p>
        )
      )}

      {stage === "shown" && (
        <div className="mt-3 space-y-2">
          {draw.tickets.map((t) => (
            <Ticket key={t.id} number={t.number} drawDate={draw.date} winning={draw.winning} rank={lotteryRank(t.number, draw.winning)} prize={t.prize} dayChangeHour={view.dayChangeHour} />
          ))}
        </div>
      )}
      {party > 0 && <Confetti key={party} gold={best <= 2} count={best <= 2 ? 110 : 60} />}
    </section>
  );
}

function RollingDigit() {
  const [d, setD] = useState(0);
  useEffect(() => {
    // 桁ごとにばらばらの数字が回る
    const iv = setInterval(() => setD(Math.floor(Math.random() * 10)), 60);
    return () => clearInterval(iv);
  }, []);
  return <span className="text-slate-400">{d}</span>;
}
