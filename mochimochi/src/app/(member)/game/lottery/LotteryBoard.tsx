"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cx } from "@/components/ui";
import { IMG } from "@/lib/brand-images";
import { formatDate } from "@/lib/time";
import { buyLotteryAction } from "../../actions";
import { Confetti, useReducedMotion, wait } from "../fx";
import { useSfx } from "../sfx";

// とらんぷちゃん宝くじ。4桁を自分で選んで買う → 次の日の22時にとらんぷちゃんが発表。
// 4桁ぜんぶ一致で VIPパス、下3桁一致でプラチナパス（中身はアプリには出さない）

type Pass = "VIP" | "PLATINUM";
type Draw = {
  date: string;
  announceAt: string;
  revealed: boolean;
  winning: string | null;
  tickets: { id: string; number: string; rank: number | null; pass: Pass | null }[];
};
type View = {
  enabled: boolean;
  price: number;
  max: number;
  drawHour: number;
  points: number;
  today: string;
  todayAnnounceAt: string;
  todayTickets: { id: string; number: string }[];
  draws: Draw[];
  passes: { id: string; pass: Pass; drawDate: string; number: string }[];
};

const PASS_LABEL: Record<Pass, string> = { VIP: "VIPパス", PLATINUM: "プラチナパス" };
const FACE = "/brand/slot-trump.webp";

function whenText(iso: string) {
  const d = new Date(iso);
  const j = new Date(d.getTime() + 9 * 3600_000);
  return `${j.getUTCMonth() + 1}/${j.getUTCDate()} ${j.getUTCHours()}:00`;
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

function PassBadge({ pass }: { pass: Pass }) {
  return (
    <span
      className={cx(
        "inline-block -rotate-12 rounded-lg px-2 py-1 text-center text-sm font-black whitespace-nowrap shadow",
        pass === "VIP" ? "bg-gradient-to-r from-amber-300 to-yellow-500 text-amber-950" : "bg-gradient-to-r from-slate-200 to-slate-400 text-slate-800",
      )}
    >
      {PASS_LABEL[pass]}
    </span>
  );
}

function Ticket({ number, sub, match = 0, pass, fresh, done }: { number: string; sub: string; match?: number; pass?: Pass | null; fresh?: boolean; done?: boolean }) {
  const [rolling, setRolling] = useState(!!fresh);
  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setRolling(false), 700);
    return () => clearTimeout(t);
  }, [fresh]);
  return (
    <div
      className={cx("lottery-ticket relative flex items-center gap-3 px-5 py-3", fresh && "fx-chant", pass && "drop-shadow-[0_0_10px_rgba(251,191,36,.8)]")}
      style={{ "--tk": pass ? "#fef3c7" : "#fff1f3" } as CSSProperties}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={FACE} alt="" className="h-11 w-11 shrink-0 rounded-full ring-2 ring-white" />
      <div className="min-w-0 flex-1 border-l-2 border-dashed border-rose-200 pl-3">
        <div className="truncate text-[10px] font-bold tracking-widest text-rose-400">TRUMP★CHAN LOTTERY</div>
        <div className="mt-1">
          <Digits number={number} match={match} rolling={rolling} />
        </div>
        <div className="mt-1 text-[11px] text-slate-500">{sub}</div>
      </div>
      {done && <div className="shrink-0">{pass ? <PassBadge pass={pass} /> : <span className="inline-block -rotate-12 rounded-lg px-2 py-1 text-sm font-black text-slate-400 ring-1 ring-slate-300">はずれ</span>}</div>}
    </div>
  );
}

export function LotteryBoard({ view, pointName, characterName }: { view: View; pointName: string; characterName: string }) {
  const router = useRouter();
  const sfx = useSfx();
  const reduced = useReducedMotion();
  const [points, setPoints] = useState(view.points);
  const [tickets, setTickets] = useState(view.todayTickets.map((t) => ({ ...t, fresh: false })));
  const [digits, setDigits] = useState([0, 0, 0, 0]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [line, setLine] = useState(view.todayTickets.length ? "発表まで、たのしみに待っててね♪" : "好きな4桁を選んでね！");
  const left = view.max - tickets.length;
  const number = digits.join("");
  const dup = tickets.some((t) => t.number === number);

  const bump = (i: number, d: number) => setDigits((ds) => ds.map((v, k) => (k === i ? (v + d + 10) % 10 : v)));

  function omakase() {
    sfx.unlock();
    sfx.tick();
    for (let k = 0; k < 20; k++) {
      const n = Array.from({ length: 4 }, () => Math.floor(Math.random() * 10));
      if (!tickets.some((t) => t.number === n.join(""))) return setDigits(n);
    }
  }

  async function buy() {
    if (busy || left <= 0 || dup) return;
    sfx.unlock();
    setBusy(true);
    setMsg("");
    let res: Awaited<ReturnType<typeof buyLotteryAction>> | null = null;
    try {
      res = await buyLotteryAction([number]);
    } catch {
      res = null;
    }
    setBusy(false);
    if (!res || !res.ok) {
      setMsg(res ? res.error : "通信できませんでした。開き直してね");
      return;
    }
    sfx.coin();
    setPoints((p) => p - view.price);
    setTickets((t) => [...res.data!.map((x) => ({ ...x, fresh: true })), ...t.map((x) => ({ ...x, fresh: false }))]);
    setLine(`${number} だね！ 当たりますように♡`);
    router.refresh();
  }

  const revealed = view.draws.filter((d) => d.revealed);
  const waiting = view.draws.filter((d) => !d.revealed);
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
            <h1 className="text-xl font-black whitespace-nowrap [text-shadow:0_2px_0_rgba(131,24,67,.4)]">とらんぷちゃん宝くじ</h1>
            <p key={line} className="fx-chant mt-1 rounded-xl bg-white/90 px-3 py-1 text-sm font-bold text-rose-600">
              {line}
            </p>
          </div>
        </div>
      </section>

      {/* 発表済み（いちばん新しい回） */}
      {revealed[0] && <Result draw={revealed[0]} sfx={sfx} reduced={reduced} characterName={characterName} />}

      {/* 発表待ち */}
      {waiting.map((d) => (
        <Waiting key={d.date} draw={d} characterName={characterName} />
      ))}

      {/* 買う */}
      {view.enabled && (
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-rose-100">
          <div className="flex items-baseline justify-between">
            <h2 className="font-black text-slate-800">番号を選んで買う</h2>
            <span className="text-xs text-slate-500">
              1枚 <b className="text-rose-600">{view.price}</b>pt・今日あと {Math.max(0, left)} 枚
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            持っている{pointName}：<b>{points.toLocaleString()}</b> pt ／ 発表は {whenText(view.todayAnnounceAt)}
          </p>

          {left > 0 ? (
            <>
              <div className="mt-4 flex justify-center gap-2">
                {digits.map((d, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <button aria-label={`${i + 1}桁目を増やす`} onClick={() => bump(i, 1)} className="h-9 w-14 rounded-xl bg-rose-100 text-lg font-black text-rose-600 active:scale-95">
                      ▲
                    </button>
                    <button
                      aria-label={`${i + 1}桁目 ${d}`}
                      onClick={() => bump(i, 1)}
                      className="flex h-16 w-14 items-center justify-center rounded-2xl bg-white font-mono text-4xl font-black text-rose-600 shadow-inner ring-2 ring-rose-300"
                    >
                      {d}
                    </button>
                    <button aria-label={`${i + 1}桁目を減らす`} onClick={() => bump(i, -1)} className="h-9 w-14 rounded-xl bg-rose-100 text-lg font-black text-rose-600 active:scale-95">
                      ▼
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={omakase} className="flex-1 rounded-2xl bg-white py-3 font-bold whitespace-nowrap text-rose-600 ring-2 ring-rose-200">
                  🎲 おまかせ
                </button>
                <button
                  onClick={buy}
                  disabled={busy || dup || points < view.price}
                  className="flex-[2] rounded-2xl bg-gradient-to-b from-pink-400 to-rose-500 py-3 font-black text-white shadow-[0_5px_0_#be123c] active:translate-y-1 active:shadow-[0_1px_0_#be123c] disabled:opacity-40"
                >
                  {number} を買う（{view.price}pt）
                </button>
              </div>
              {dup && <p className="mt-2 text-center text-sm text-amber-700">{number} はもう買っています。同じ番号は1枚までです</p>}
            </>
          ) : (
            <p className="mt-4 rounded-xl bg-rose-50 py-3 text-center text-sm font-bold text-rose-600">今日の分（{view.max}枚）は買いました。発表をお楽しみに！</p>
          )}
          {msg && <p className="mt-2 text-center text-sm text-red-600">{msg}</p>}

          {tickets.length > 0 && (
            <div className="mt-4 space-y-2">
              {tickets.map((t) => (
                <Ticket key={t.id} number={t.number} sub={`${whenText(view.todayAnnounceAt)} 発表`} fresh={t.fresh} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* 当たり */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-rose-100">
        <h2 className="font-black text-slate-800">当たり</h2>
        <ul className="mt-2 space-y-2 text-sm">
          <li className="flex items-center justify-between gap-2">
            <span>当選番号と4桁ぜんぶ同じ</span>
            <PassBadge pass="VIP" />
          </li>
          <li className="flex items-center justify-between gap-2">
            <span>当選番号と下3桁が同じ</span>
            <PassBadge pass="PLATINUM" />
          </li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          買った日の次の日 {view.drawHour}:00 に発表。1日{view.max}枚まで、同じ番号は1枚までです
        </p>
      </section>

      {/* これまでの発表 */}
      {revealed.length > 1 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-rose-100">
          <h2 className="font-black text-slate-800">これまでの発表</h2>
          <ul className="mt-2 divide-y divide-rose-50 text-sm">
            {revealed.slice(1).map((d) => {
              const wins = d.tickets.filter((t) => t.pass);
              return (
                <li key={d.date} className="flex items-center gap-3 py-2">
                  <span className="w-20 shrink-0 font-bold">{formatDate(d.date)}</span>
                  <span className="font-mono text-base font-black tracking-widest text-rose-600">{d.winning}</span>
                  <span className="ml-auto text-xs text-slate-500">{wins.length ? wins.map((t) => PASS_LABEL[t.pass!]).join("・") : `${d.tickets.length}枚 はずれ`}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

/** 発表待ち（あと何時間か） */
function Waiting({ draw, characterName }: { draw: Draw; characterName: string }) {
  const [now, setNow] = useState(() => Date.now());
  const router = useRouter();
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);
  const ms = new Date(draw.announceAt).getTime() - now;
  useEffect(() => {
    // 発表の時刻になったら画面を読み直す
    if (ms <= 0) router.refresh();
  }, [ms, router]);
  const h = Math.max(0, Math.floor(ms / 3600_000));
  const m = Math.max(0, Math.floor((ms % 3600_000) / 60_000));
  return (
    <section className="rounded-3xl bg-gradient-to-b from-indigo-50 to-white p-4 shadow-sm ring-2 ring-indigo-100">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={IMG.trumpSleep} alt={characterName} className="h-16 w-16 shrink-0 rounded-full object-cover ring-4 ring-white" />
        <div>
          <div className="font-black text-indigo-700">{whenText(draw.announceAt)} 発表！</div>
          <div className="text-sm text-slate-600">
            あと <b className="text-lg text-indigo-700">{h}</b>時間<b className="text-lg text-indigo-700">{m}</b>分
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {draw.tickets.map((t) => (
          <Ticket key={t.id} number={t.number} sub={`${formatDate(draw.date)}に購入`} />
        ))}
      </div>
    </section>
  );
}

const SEEN_KEY = "mm-lottery-seen";

/** いちばん新しい発表（一度見たら次からは結果だけ出す） */
function Result({ draw, sfx, reduced, characterName }: { draw: Draw; sfx: ReturnType<typeof useSfx>; reduced: boolean; characterName: string }) {
  const [stage, setStage] = useState<"ready" | "rolling" | "shown">("ready");
  const [revealedDigits, setRevealedDigits] = useState(0);
  const [party, setParty] = useState(0);
  const alive = useRef(true);
  const winning = draw.winning ?? "????";
  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY) === draw.date) {
        setStage("shown");
        setRevealedDigits(4);
      }
    } catch {}
    return () => {
      alive.current = false;
    };
  }, [draw.date]);
  const best: Pass | null = draw.tickets.some((t) => t.pass === "VIP") ? "VIP" : draw.tickets.some((t) => t.pass === "PLATINUM") ? "PLATINUM" : null;

  async function reveal() {
    sfx.unlock();
    setStage("rolling");
    for (let i = 1; i <= 4; i++) {
      for (let k = 0; k < (reduced ? 1 : 6); k++) {
        sfx.tick();
        await wait(reduced ? 60 : 110);
      }
      if (!alive.current) return;
      setRevealedDigits(i);
      sfx.clack();
      await wait(reduced ? 100 : 380);
    }
    setStage("shown");
    try {
      localStorage.setItem(SEEN_KEY, draw.date);
    } catch {}
    if (best) {
      sfx.fanfare();
      setTimeout(() => sfx.coin(), 600);
      if (!reduced) setParty((p) => p + 1);
    } else {
      sfx.lose();
    }
  }

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-amber-50 via-white to-pink-50 p-4 shadow-sm ring-2 ring-amber-200">
      <h2 className="text-center font-black text-amber-700">🎉 {formatDate(draw.date)}購入分の発表</h2>
      <div className="mt-3 flex items-center justify-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={stage === "shown" ? (best ? IMG.trumpAwake : IMG.trumpDrowsy) : IMG.trumpSleep}
          alt={characterName}
          className={cx("h-16 w-16 shrink-0 rounded-full object-cover shadow ring-4 ring-white", stage === "shown" && best && "fx-hop")}
        />
        <div className="text-center">
          <div className="text-[11px] font-bold text-slate-500">当選番号</div>
          {stage === "ready" ? (
            <div className="font-mono text-4xl font-black tracking-widest text-slate-300">????</div>
          ) : (
            <div className="flex gap-1">
              {winning.split("").map((d, i) => (
                <span
                  key={i}
                  className={cx(
                    "flex h-14 w-11 items-center justify-center rounded-lg bg-white font-mono text-4xl font-black tabular-nums shadow ring-2",
                    i < revealedDigits ? "fx-chant text-rose-600 ring-rose-300" : "ring-slate-200",
                  )}
                >
                  {i < revealedDigits ? d : <RollingDigit />}
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
          <div className="fx-rise mt-3 text-center">
            {best ? (
              <>
                <div className="text-lg font-black text-amber-600">おめでとう！</div>
                <div className="mt-1 text-3xl font-black">
                  <PassBadge pass={best} />
                </div>
                <div className="mt-2 text-xs font-bold text-slate-500">お店でスタッフに見せてね</div>
              </>
            ) : (
              <span className="text-lg font-black text-slate-500">ざんねん…また挑戦してね！</span>
            )}
          </div>
        )
      )}

      {stage === "shown" && (
        <div className="mt-3 space-y-2">
          {draw.tickets.map((t) => (
            <Ticket key={t.id} number={t.number} sub={`${formatDate(draw.date)}に購入`} match={t.rank ? 5 - t.rank : 0} pass={t.pass} done />
          ))}
        </div>
      )}
      {party > 0 && <Confetti key={party} gold count={110} />}
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
