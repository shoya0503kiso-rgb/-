"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

// ゲームの演出部品（紙吹雪・数字のカウントアップ）

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
