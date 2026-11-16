"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ゲームの効果音。音声ファイルは使わず、ブラウザの中で音を作る（WebAudio）
// 最初の音は必ずタップの中で鳴らす（スマホは操作の前に音を出せないため）

const STORAGE_KEY = "mm-sfx";

type ToneOpts = { type?: OscillatorType; vol?: number; at?: number; slide?: number };

export function useSfx() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [on, setOn] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "off") setOn(false);
    } catch {
      // 保存できない端末では毎回オン
    }
  }, []);

  const toggle = useCallback(() => {
    setOn((v) => {
      const next = !v;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
      } catch {}
      return next;
    });
  }, []);

  const ctx = useCallback(() => {
    if (!on) return null;
    if (!ctxRef.current) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }, [on]);

  const tone = useCallback(
    (freq: number, dur: number, { type = "square", vol = 0.08, at = 0, slide }: ToneOpts = {}) => {
      const c = ctx();
      if (!c) return;
      const t = c.currentTime + at;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    [ctx],
  );

  const noise = useCallback(
    (dur: number, { vol = 0.15, at = 0, hp = 800 }: { vol?: number; at?: number; hp?: number } = {}) => {
      const c = ctx();
      if (!c) return;
      const t = c.currentTime + at;
      const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = hp;
      const g = c.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(c.destination);
      src.start(t);
    },
    [ctx],
  );

  return useMemo(
    () => ({
      on,
      toggle,
      /** 手やサイコロの目が切り替わるカチカチ */
      tick: () => tone(1100, 0.03, { type: "square", vol: 0.025 }),
      /** 「じゃん」「けん」「ぽん」 */
      chant: (i: number) => tone([523, 659, 880][i] ?? 880, 0.16, { type: "triangle", vol: 0.14 }),
      /** 手を出した瞬間のドン */
      hit: () => {
        tone(150, 0.3, { type: "sine", vol: 0.4, slide: 45 });
        noise(0.12, { vol: 0.22, hp: 250 });
      },
      /** どんぶりの中でサイコロが転がる音 */
      roll: () => {
        for (let i = 0; i < 9; i++) noise(0.025, { vol: 0.1 + Math.random() * 0.08, at: i * 0.1 + Math.random() * 0.04, hp: 2600 });
      },
      /** サイコロが止まるカラン */
      clack: () => {
        noise(0.05, { vol: 0.3, hp: 1800 });
        tone(1500, 0.06, { type: "triangle", vol: 0.06 });
      },
      win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.24, { type: "triangle", vol: 0.13, at: i * 0.1 })),
      /** 役が出たときのファンファーレ */
      fanfare: () =>
        (
          [
            [523, 0],
            [523, 0.12],
            [523, 0.24],
            [659, 0.36],
            [784, 0.6],
            [1047, 0.84],
          ] as const
        ).forEach(([f, at]) => tone(f, 0.32, { type: "square", vol: 0.07, at })),
      lose: () => [392, 370, 349, 262].forEach((f, i) => tone(f, 0.36, { type: "sawtooth", vol: 0.045, at: i * 0.28 })),
      draw: () => {
        tone(660, 0.12, { type: "triangle", vol: 0.12 });
        tone(660, 0.14, { type: "triangle", vol: 0.12, at: 0.16 });
      },
      coin: () => {
        tone(988, 0.08, { type: "square", vol: 0.06 });
        tone(1319, 0.3, { type: "square", vol: 0.06, at: 0.08 });
      },
    }),
    [on, toggle, tone, noise],
  );
}

export type Sfx = ReturnType<typeof useSfx>;
