"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IMG } from "@/lib/brand-images";
import { mochiTapAction } from "../actions";

type Status = { total: number; todayTaps: number; todayWins: number; winLimit: number };
type Pop = { id: number; x: number };

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

export function MochiTapper({
  label,
  word,
  soundUrl,
  pointName,
  winPoints,
  initial,
}: {
  label: string;
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
  const [pressed, setPressed] = useState(false);
  const pendingRef = useRef(0);
  const sending = useRef(false);
  const popId = useRef(0);
  const play = useMochiSound(soundUrl, word);

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

  function tap(e: React.PointerEvent) {
    e.preventDefault();
    pendingRef.current += 1;
    setPending(pendingRef.current);
    if (!muted) play();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const id = ++popId.current;
    setPops((p) => [...p.slice(-12), { id, x: ((e.clientX - rect.left) / rect.width) * 100 }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 700);
  }

  return (
    <div className="no-select space-y-4">
      <div className="flex items-end justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={IMG.tigerShake} alt="" className="-mb-2 w-20 shrink-0" />
        <div className="flex-1 pl-2">
          <div className="text-xs text-slate-500">累計「{word}」</div>
          <div className="text-3xl font-extrabold text-rose-600">{(status.total + pending).toLocaleString()}</div>
        </div>
        <div className="text-right text-xs text-slate-500">
          今日 {(status.todayTaps + pending).toLocaleString()}回
          <br />
          <button onClick={() => setMuted((m) => !m)} className="mt-1 rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
            {muted ? "🔇 音オフ" : "🔊 音オン"}
          </button>
        </div>
      </div>

      <div className="relative">
        <button
          aria-label={label}
          onPointerDown={(e) => {
            setPressed(true);
            tap(e);
          }}
          onPointerUp={() => setPressed(false)}
          onPointerLeave={() => setPressed(false)}
          onContextMenu={(e) => e.preventDefault()}
          className="no-select flex aspect-square w-full items-center justify-center rounded-full bg-gradient-to-b from-white to-rose-100 shadow-[0_12px_0_#fda4af] ring-4 ring-rose-200 transition-transform"
          style={{ transform: pressed ? "translateY(8px) scale(0.97)" : undefined, boxShadow: pressed ? "0 4px 0 #fda4af" : undefined }}
        >
          <span className="text-6xl font-black tracking-tight text-rose-500 drop-shadow-sm">{label}</span>
        </button>
        {pops.map((p) => (
          <span key={p.id} className="mochi-pop pointer-events-none absolute top-1/4 text-2xl font-black text-rose-400" style={{ left: `${p.x}%` }}>
            {word}
          </span>
        ))}
      </div>

      <p className="text-center text-xs text-slate-500">
        ひたすら押すだけ！ ごくまれに <b className="text-rose-600">{winPoints}</b> {pointName} が当たるかも…？
        {status.todayWins >= status.winLimit && status.winLimit > 0 && <span className="block">今日の当たりは出ました。また明日！</span>}
      </p>

      {win !== null && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-6" onClick={() => setWin(null)}>
          <div className="w-full max-w-xs rounded-3xl bg-white p-6 text-center shadow-xl">
            <div className="text-6xl">🎊</div>
            <div className="mt-2 text-2xl font-black text-rose-600">大当たり！</div>
            <div className="mt-2 text-lg font-bold">
              +{win} {pointName}
            </div>
            <button className="mt-5 w-full rounded-xl bg-rose-500 py-3 font-bold text-white">やったー！</button>
          </div>
        </div>
      )}
    </div>
  );
}
