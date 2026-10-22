// 効果音はすべて Web Audio API でその場で作る(音声ファイルは使わない)
(function () {
  'use strict';

  let ctx = null;
  let master = null;
  let spinLoop = null;
  let reachLoop = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function unlocked() {
    return Boolean(ctx && ctx.state === 'running');
  }

  // 1音鳴らす
  function tone(freq, start, dur, { type = 'square', vol = 0.2, slideTo = null, attack = 0.005 } = {}) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(start, dur, { vol = 0.2, filter = 1200 } = {}) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + start;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
  }

  const N = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDIノート番号 → 周波数

  // メロディを鳴らす: [[ノート, 長さ(拍)], ...]
  function melody(notes, { bpm = 160, type = 'square', vol = 0.16, start = 0 } = {}) {
    const beat = 60 / bpm;
    let t = start;
    for (const [n, len] of notes) {
      if (n) tone(N(n), t, len * beat * 0.95, { type, vol });
      t += len * beat;
    }
    return t;
  }

  function chord(ns, start, dur, opts) {
    for (const n of ns) tone(N(n), start, dur, opts);
  }

  const Sound = {
    unlock() {
      ensure();
      return unlocked();
    },
    unlocked,

    announce() {
      melody([[72, 0.5], [76, 0.5], [79, 0.5], [84, 1.5]], { bpm: 200, vol: 0.18 });
      chord([60, 64, 67], 0.6, 0.8, { type: 'triangle', vol: 0.1 });
    },

    button() {
      tone(880, 0, 0.08, { type: 'square', vol: 0.12 });
    },

    spinStart() {
      if (!ensure()) return;
      this.spinStop();
      tone(220, 0, 0.25, { type: 'sawtooth', vol: 0.12, slideTo: 660 });
      // カラカラ回る音
      let i = 0;
      spinLoop = setInterval(() => {
        tone(i % 2 ? 1400 : 1100, 0, 0.03, { type: 'square', vol: 0.05 });
        i += 1;
      }, 70);
    },

    spinStop() {
      if (spinLoop) clearInterval(spinLoop);
      spinLoop = null;
    },

    reelStop(i) {
      noise(0, 0.12, { vol: 0.35, filter: 600 });
      tone(160 - i * 20, 0, 0.18, { type: 'triangle', vol: 0.35, slideTo: 60 });
    },

    reach() {
      // 「リーチ!」:上がっていく音+心臓の鼓動ループ
      melody([[67, 0.25], [71, 0.25], [74, 0.25], [79, 1]], { bpm: 220, type: 'sawtooth', vol: 0.14 });
      this.reachStop();
      let beat = 0;
      reachLoop = setInterval(() => {
        tone(70, 0, 0.12, { type: 'sine', vol: 0.5, slideTo: 40 });
        tone(70, 0.16, 0.1, { type: 'sine', vol: 0.35, slideTo: 40 });
        tone(N(60 + (beat % 12)), 0, 0.25, { type: 'triangle', vol: 0.06 });
        beat += 1;
      }, 420);
    },

    reachStop() {
      if (reachLoop) clearInterval(reachLoop);
      reachLoop = null;
    },

    miss() {
      // ちょっと笑える「残念…」(トロンボーン風に下がる)
      const opts = { type: 'sawtooth', vol: 0.14 };
      tone(N(67), 0, 0.35, opts);
      tone(N(66), 0.4, 0.35, opts);
      tone(N(65), 0.8, 0.35, opts);
      tone(N(64), 1.2, 1.0, { ...opts, slideTo: N(62) });
    },

    // tier 1〜4 で格が上がる
    win(tier) {
      if (tier <= 1) {
        melody([[72, 0.5], [76, 0.5], [79, 1]], { bpm: 220 });
        chord([60, 64, 67], 0.5, 0.6, { type: 'triangle', vol: 0.08 });
      } else if (tier === 2) {
        const t = melody([[72, 0.5], [76, 0.5], [79, 0.5], [84, 0.5], [79, 0.5], [84, 1.5]], { bpm: 200 });
        chord([60, 64, 67, 72], t - 0.8, 1, { type: 'triangle', vol: 0.08 });
        for (let i = 0; i < 6; i += 1) tone(2000 + i * 300, 0.2 + i * 0.12, 0.15, { type: 'sine', vol: 0.06 });
      } else if (tier === 3) {
        const t = melody(
          [[67, 0.5], [72, 0.5], [76, 0.5], [79, 1], [76, 0.5], [79, 0.5], [84, 2]],
          { bpm: 180, vol: 0.17 },
        );
        chord([48, 55, 60, 64], t - 1.3, 1.4, { type: 'triangle', vol: 0.1 });
        // コインのチャリンチャリン
        for (let i = 0; i < 14; i += 1) tone(2400 + (i % 3) * 400, 0.3 + i * 0.16, 0.12, { type: 'square', vol: 0.05 });
      } else {
        this.jackpot();
      }
    },

    jackpot() {
      // 長めのファンファーレ
      noise(0, 0.6, { vol: 0.4, filter: 4000 });
      const bpm = 150;
      const t1 = melody(
        [
          [72, 0.33], [72, 0.33], [72, 0.33], [72, 1], [68, 1], [70, 1],
          [72, 0.66], [70, 0.33], [72, 2.5],
        ],
        { bpm, vol: 0.18, start: 0.3 },
      );
      chord([48, 60, 64, 67], 0.3, 1.2, { type: 'triangle', vol: 0.09 });
      chord([44, 56, 60, 63], 1.9, 0.8, { type: 'triangle', vol: 0.09 });
      chord([46, 58, 62, 65], 2.7, 0.8, { type: 'triangle', vol: 0.09 });
      chord([48, 60, 64, 67, 72], t1 - 1.0, 1.6, { type: 'triangle', vol: 0.1 });
      const t2 = melody(
        [[79, 0.5], [84, 0.5], [88, 0.5], [91, 1], [88, 0.5], [91, 3]],
        { bpm: 170, vol: 0.16, start: t1 + 0.1 },
      );
      chord([48, 55, 60, 64, 67, 72], t2 - 1.8, 2.2, { type: 'sawtooth', vol: 0.05 });
      for (let i = 0; i < 30; i += 1) tone(1800 + Math.random() * 2400, 0.4 + i * 0.25, 0.1, { type: 'sine', vol: 0.05 });
    },

    stopAll() {
      this.spinStop();
      this.reachStop();
    },
  };

  window.HHSound = Sound;
})();
