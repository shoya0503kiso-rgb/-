"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IMG } from "@/lib/brand-images";
import { mochiTapAction } from "../actions";

type Status = { total: number; todayTaps: number; todayWins: number; winLimit: number };
type Pop = { id: number; x: number; y: number; heart: boolean };

const FLUSH_MS = 800;

/** 「もち」の音。音声ファイルがあれば WebAudio で、無ければ端末の読み上げで鳴らす */
function useMochiSound(soundUrl: string | null, word: string) {
  const ctx = useRef<AudioContext | null>(null);
  const buffer = useRef<AudioBuffer | null>(null);
  const loading = useRef(false);

  const load = useCallback(async () => {
    if (!soundUrl || loading.current) return;
    loading.current = true;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx.current = new AC();
      const data = await (await fetch(soundUrl)).arrayBuffer();
      buffer.current = await ctx.current.decodeAudioData(data);
    } catch {
      buffer.current = null;
    }
  }, [soundUrl]);

  return useCallback(() => {
    if (soundUrl) {
      if (!ctx.current) void load();
      const c = ctx.current;
      if (c && buffer.current) {
        if (c.state === "suspended") void c.resume();
        const src = c.createBufferSource();
        src.buffer = buffer.current;
        src.connect(c.destination);
        src.start();
        return;
      }
    }
    if (typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "ja-JP";
    u.rate = 1.6;
    u.pitch = 1.4;
    speechSynthesis.speak(u);
  }, [soundUrl, word, load]);
}

/** なでた回数としてまとめる指の移動距離（px）。こするようになでても数える */
const STROKE_PX = 48;

export function MochiTapper({
  name,
  word,
  soundUrl,
  pointName,
  winPoints,
  initial,
}: {
  name: string;
  word: string;
  soundUrl: string | null;
  pointName: string;
  winPoints: number;
  initial: Status;
}) {
  const [status, setStatus] = useState(initial);
  const [pending, setPending] = useState(0);
  const [pops, setPops] = useState<Pop[]>([]);
  const [win, setWin] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [squish, setSquish] = useState(0);
  // なでている間だけ、むにゃむにゃ顔になる
  const [drowsy, setDrowsy] = useState(false);
  const drowsyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef(0);
  const sending = useRef(false);
  const popId = useRef(0);
  const dragFrom = useRef<{ x: number; y: number } | null>(null);
  const play = useMochiSound(soundUrl, word);
  // 今日の上限まで起きたら、その日は起きたまま
  const awake = status.winLimit > 0 && status.todayWins >= status.winLimit;

  const flush = useCallback(async () => {
    if (sending.current || pendingRef.current === 0) return;
    sending.current = true;
    const n = Math.min(pendingRef.current, 100);
    pendingRef.current -= n;
    setPending(pendingRef.current);
    const res = await mochiTapAction(n);
    sending.current = false;
    if (res.ok && res.data) {
      const d = res.data;
      setStatus({ total: d.total, todayTaps: d.todayTaps, todayWins: d.todayWins, winLimit: d.winLimit });
      if (d.won) setWin(d.points);
    }
  }, []);

  useEffect(() => {
    const t = setInterval(flush, FLUSH_MS);
    const onHide = () => document.visibilityState === "hidden" && void flush();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onHide);
      void flush();
    };
  }, [flush]);

  /** 1回なでた */
  function pet(el: HTMLElement, clientX: number, clientY: number) {
    pendingRef.current += 1;
    setPending(pendingRef.current);
    setSquish((n) => n + 1);
    // ぷにっとさせる（画像を作り直さずに、動きだけやり直す）
    artRef.current?.animate([{ transform: "scale(1, 1)" }, { transform: "scale(1.06, 0.92)" }, { transform: "scale(1, 1)" }], {
      duration: 250,
      easing: "ease-out",
    });
    setDrowsy(true);
    if (drowsyTimer.current) clearTimeout(drowsyTimer.current);
    drowsyTimer.current = setTimeout(() => setDrowsy(false), 600);
    if (!muted) play();
    const rect = el.getBoundingClientRect();
    const id = ++popId.current;
    setPops((p) => [
      ...p.slice(-12),
      { id, x: ((clientX - rect.left) / rect.width) * 100, y: ((clientY - rect.top) / rect.height) * 100, heart: id % 3 === 0 },
    ]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 700);
  }

  return (
    <div className="no-select space-y-4">
      <div className="text-center">
        <h1 className="text-2xl font-black text-rose-600">{awake ? `${name}が起きてるよ！` : `${name}をなでよう`}</h1>
        <p className="mt-1 text-xs text-slate-600">
          {awake ? (
            "今日はもう起きました。また明日なでてね"
          ) : (
            <>
              すやすや寝ています…。なでていると、ごくまれに起きるかも？
              <br />
              起きたら <b className="text-rose-600">{winPoints}</b> {pointName}！
            </>
          )}
        </p>
      </div>

      <div
        role="button"
        aria-label={`${name}をなでる`}
        onPointerDown={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          dragFrom.current = { x: e.clientX, y: e.clientY };
          pet(e.currentTarget as HTMLElement, e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          const from = dragFrom.current;
          if (!from) return;
          if (Math.hypot(e.clientX - from.x, e.clientY - from.y) >= STROKE_PX) {
            dragFrom.current = { x: e.clientX, y: e.clientY };
            pet(e.currentTarget as HTMLElement, e.clientX, e.clientY);
          }
        }}
        onPointerUp={() => (dragFrom.current = null)}
        onPointerCancel={() => (dragFrom.current = null)}
        onContextMenu={(e) => e.preventDefault()}
        className="no-select relative mx-auto aspect-square w-full max-w-sm cursor-pointer touch-none overflow-hidden rounded-full bg-[#f878a1] shadow-[0_10px_0_#ec4899] ring-4 ring-white"
      >
        {/* 3枚を重ねて置き、見せる1枚だけ切り替える（切り替えでちらつかない） */}
        <div
          ref={artRef}
          key={awake ? "awake" : "sleep"}
          className={`pointer-events-none absolute inset-0 ${awake ? "wake" : squish ? "" : "breathe"}`}
        >
          {[
            { src: IMG.trumpSleep, show: !awake && !drowsy },
            { src: IMG.trumpDrowsy, show: !awake && drowsy },
            { src: IMG.trumpAwake, show: awake },
          ].map((f) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={f.src}
              src={f.src}
              alt={f.show ? name : ""}
              draggable={false}
              className={`absolute inset-0 h-full w-full object-cover ${f.show ? "opacity-100" : "opacity-0"}`}
            />
          ))}
        </div>
        {pops.map((p) => (
          <span
            key={p.id}
            className={`mochi-pop pointer-events-none absolute font-black drop-shadow ${p.heart ? "text-3xl text-rose-500" : "text-2xl text-white"}`}
            style={{ left: `${p.x}%`, top: `${p.y - 10}%` }}
          >
            {p.heart ? "♥" : word}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-rose-100">
        <div>
          <div className="text-xs text-slate-500">なでた回数（累計「{word}」）</div>
          <div className="text-2xl font-extrabold text-rose-600">{(status.total + pending).toLocaleString()}</div>
        </div>
        <div className="text-right text-xs text-slate-500">
          今日 {(status.todayTaps + pending).toLocaleString()}回
          <br />
          <button onClick={() => setMuted((m) => !m)} className="mt-1 rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
            {muted ? "🔇 音オフ" : "🔊 音オン"}
          </button>
        </div>
      </div>

      {win !== null && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-6" onClick={() => setWin(null)}>
          <div className="w-full max-w-xs rounded-3xl bg-white p-6 text-center shadow-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={IMG.trumpAwake} alt="" className="wake mx-auto w-44 rounded-full ring-4 ring-rose-100" />
            <div className="mt-2 text-2xl font-black text-rose-600">{name}が起きた！</div>
            <div className="mt-2 text-lg font-bold">
              +{win} {pointName}
            </div>
            <button className="mt-5 w-full rounded-xl bg-rose-500 py-3 font-bold text-white">おはよう！</button>
          </div>
        </div>
      )}
    </div>
  );
}
