"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { cx } from "@/components/ui";

// ゲームの演出部品（紙吹雪・サイコロ・どんぶり・吹き出し・数字のカウントアップ）

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 「動きを減らす」設定の端末では演出を短くする */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}

const CONFETTI_COLORS = ["#f43f5e", "#fb7185", "#f59e0b", "#fde047", "#ffffff", "#ec4899", "#111827"];

/** 紙吹雪。key を変えるたびに降らせ直す。gold は役が出たときの金色多め */
export function Confetti({ count = 60, gold = false }: { count?: number; gold?: boolean }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        dur: 1.6 + Math.random() * 1.2,
        dx: (Math.random() - 0.5) * 160,
        rot: (Math.random() - 0.5) * 1440,
        w: 6 + Math.random() * 7,
        h: 8 + Math.random() * 10,
        color: gold && i % 2 === 0 ? (i % 4 === 0 ? "#fbbf24" : "#fde68a") : CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        round: i % 5 === 0,
      })),
    [count, gold],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="fx-confetti absolute top-0 block"
          style={
            {
              left: `${p.left}%`,
              width: p.w,
              height: p.round ? p.w : p.h,
              background: p.color,
              borderRadius: p.round ? "50%" : 2,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
              "--dx": `${p.dx}px`,
              "--rot": `${p.rot}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

/** サイコロ1個（チンチロらしく1の目は大きな赤）。目の位置と大きさはサイコロの大きさから決める */
export function Die({ value, size = 56, className, style }: { value: number; size?: number; className?: string; style?: CSSProperties }) {
  const pips = PIPS[value] ?? [];
  const pip = Math.max(3, Math.round(size * (value === 1 ? 0.3 : 0.17)));
  const pos = [22, 50, 78];
  return (
    <div
      className={cx("relative shrink-0 rounded-[22%] bg-gradient-to-br from-white to-slate-100 shadow-[inset_0_-3px_0_rgba(0,0,0,.10),0_3px_6px_rgba(0,0,0,.25)] ring-1 ring-slate-300", className)}
      style={{ width: size, height: size, ...style }}
      role="img"
      aria-label={`${value}の目`}
    >
      {pips.map((i) => (
        <span
          key={i}
          className={cx("absolute block -translate-x-1/2 -translate-y-1/2 rounded-full", value === 1 ? "bg-red-600" : "bg-slate-900")}
          style={{ left: `${pos[i % 3]}%`, top: `${pos[Math.floor(i / 3)]}%`, width: pip, height: pip }}
        />
      ))}
    </div>
  );
}

/** どんぶりと3つのサイコロ。rolling の間は転がり回る */
export function Bowl({ faces, rolling, size = 240, glow }: { faces: number[] | null; rolling: boolean; size?: number; glow?: boolean }) {
  // 転がる軌道をサイコロごとにランダムに
  const paths = useMemo(
    () =>
      [0, 1, 2].map(() => {
        const r = () => `${Math.round((Math.random() - 0.5) * size * 0.35)}px`;
        return { x1: r(), y1: r(), x2: r(), y2: r(), x3: r(), y3: r(), rot: `${Math.round(Math.random() * 60 - 30)}deg` };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rolling, size],
  );
  const spots = [
    { left: "26%", top: "34%" },
    { left: "54%", top: "26%" },
    { left: "44%", top: "56%" },
  ];
  const dieSize = Math.round(size * 0.22);
  return (
    <div
      className={cx("relative mx-auto rounded-full", glow && "fx-glow")}
      style={{
        width: size,
        height: size,
        maxWidth: "100%",
        background: "radial-gradient(circle at 50% 55%, #ffffff 0%, #f8fafc 46%, #e2e8f0 60%, #1e3a8a 61%, #1e40af 68%, #0f172a 72%)",
        boxShadow: "0 14px 0 #0f172a33, inset 0 8px 18px rgba(0,0,0,.18)",
      }}
    >
      {/* どんぶりの縁の模様 */}
      <div className="pointer-events-none absolute inset-[9%] rounded-full border-2 border-dashed border-blue-200/70" />
      {faces &&
        faces.map((v, i) => (
          <div
            key={i}
            className={cx("absolute", rolling ? "fx-tumble" : "fx-settle")}
            style={
              {
                ...spots[i],
                "--x1": paths[i].x1,
                "--y1": paths[i].y1,
                "--x2": paths[i].x2,
                "--y2": paths[i].y2,
                "--x3": paths[i].x3,
                "--y3": paths[i].y3,
                "--r": paths[i].rot,
                animationDelay: rolling ? `${i * 40}ms` : `${i * 60}ms`,
              } as CSSProperties
            }
          >
            <Die value={v} size={dieSize} />
          </div>
        ))}
    </div>
  );
}

/** トランプちゃんの吹き出し */
export function Bubble({ img, name, children, tone = "normal" }: { img: string; name: string; children: ReactNode; tone?: "normal" | "happy" | "sad" }) {
  return (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img} alt={name} className={cx("h-20 w-20 shrink-0 rounded-full object-cover ring-4 ring-white shadow-md", tone === "happy" && "fx-hop", tone === "sad" && "fx-droop")} />
      <div className="relative min-w-0 flex-1 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-rose-100">
        <span className="absolute top-1/2 -left-2 h-4 w-4 -translate-y-1/2 rotate-45 bg-white ring-1 ring-rose-100 [clip-path:polygon(0_0,0_100%,100%_100%)]" />
        <div className="text-[11px] font-bold text-rose-400">{name}</div>
        <div key={String(children)} className="fx-chant text-base font-extrabold text-slate-800">
          {children}
        </div>
      </div>
    </div>
  );
}

/** 0 から to まで数字を増やして見せる */
export function CountUp({ to, ms = 700 }: { to: number; ms?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      setN(Math.round(to * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return <>{n.toLocaleString()}</>;
}

/** 勝ち・負けなどの大きなスタンプ文字 */
export function ResultStamp({ kind, children }: { kind: "win" | "big" | "lose" | "draw"; children: ReactNode }) {
  const style = {
    win: "text-rose-600 [text-shadow:0_3px_0_#fecdd3]",
    big: "bg-gradient-to-b from-amber-300 to-amber-600 bg-clip-text text-transparent [filter:drop-shadow(0_3px_0_#92400e)]",
    lose: "text-slate-500 [text-shadow:0_3px_0_#e2e8f0]",
    draw: "text-sky-600 [text-shadow:0_3px_0_#e0f2fe]",
  }[kind];
  return <div className={cx("fx-stamp text-center text-5xl font-black tracking-tight", style)}>{children}</div>;
}
