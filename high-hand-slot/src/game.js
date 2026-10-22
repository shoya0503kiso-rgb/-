'use strict';

const crypto = require('crypto');
const { HANDS } = require('./defaults');
const { spin } = require('./lottery');

// 演出の長さ(ミリ秒)。サーバーが時間を管理するので、テレビが落ちていても進行は止まらない。
const TIMING = {
  announce: 4500, // 「◯◯さん フルハウス!」の告知
  reelStops: [1800, 2600, 3400], // 左・中・右リールの停止時刻
  reachExtra: 3200, // リーチ時に3リール目を遅らせる時間
  result: [3500, 4000, 5000, 6500, 11000], // 結果表示(tier 0〜4)
  finale: 7000, // 全回転終了後のまとめ表示 → 待機画面へ
};

const MAX_NAME = 20;
const MAX_QUEUE = 30;
const MAX_PLAYERS = 300;

function cleanName(name) {
  return String(name ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

class Game {
  constructor({ store, onChange = () => {}, timeScale = 1 }) {
    this.store = store;
    this.onChange = onChange;
    this.timeScale = timeScale;
    this.queue = [];
    // phase: idle(待機) / announce(告知) / ready(回す待ち) / spinning(回転中) / result(結果) / finale(まとめ)
    this.phase = 'idle';
    this.phaseAt = Date.now();
    this.currentSpin = null;
    this.timer = null;
  }

  dispose() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  _ms(ms) {
    return Math.max(0, Math.round(ms * this.timeScale));
  }

  _setPhase(phase, after, next) {
    clearTimeout(this.timer);
    this.timer = null;
    this.phase = phase;
    this.phaseAt = Date.now();
    if (after !== undefined) this.timer = setTimeout(next, this._ms(after));
    this.onChange();
  }

  get current() {
    return this.queue[0] || null;
  }

  register({ name, hand } = {}) {
    const n = cleanName(name);
    const h = HANDS.find((x) => x.id === hand);
    if (!n) return { error: 'プレイヤー名を入れてください' };
    if ([...n].length > MAX_NAME) return { error: `名前は${MAX_NAME}文字以内にしてください` };
    if (!h) return { error: '役を選んでください' };
    if (this.queue.length >= MAX_QUEUE) return { error: '待機列がいっぱいです' };
    const spinsTotal = this.store.settings.spins[h.id];
    const entry = {
      id: crypto.randomUUID(),
      name: n,
      hand: h.id,
      handName: h.name,
      spinsTotal,
      spinsDone: 0,
      results: [],
      createdAt: new Date().toISOString(),
    };
    this.queue.push(entry);
    this._rememberPlayer(n);
    if (this.phase === 'idle') this._startAnnounce();
    else this.onChange();
    return { entry };
  }

  _rememberPlayer(name) {
    const list = [name, ...this.store.players.filter((p) => p !== name)].slice(0, MAX_PLAYERS);
    try {
      this.store.savePlayers(list);
    } catch (err) {
      console.error('[players] 保存に失敗しました', err.message);
    }
  }

  cancel(entryId) {
    const idx = this.queue.findIndex((e) => e.id === entryId);
    if (idx < 0) return { error: 'すでに取り消されているか、終わっています' };
    const entry = this.queue[idx];
    if (entry.spinsDone > 0 || (idx === 0 && ['spinning', 'result', 'finale'].includes(this.phase))) {
      return { error: '回転が始まったあとは取り消せません' };
    }
    this.queue.splice(idx, 1);
    if (idx === 0) {
      if (this.queue.length) this._startAnnounce();
      else this._setPhase('idle');
    } else {
      this.onChange();
    }
    return { ok: true };
  }

  _startAnnounce() {
    this._setPhase('announce', TIMING.announce, () => this._setPhase('ready'));
  }

  // お客さんが「回す」を押した
  spin(entryId) {
    const entry = this.current;
    if (!entry || entry.id !== entryId) return { error: 'この人の番ではありません' };
    if (this.phase === 'announce') {
      // 告知中に押されたら告知を切り上げて回す
    } else if (this.phase !== 'ready') {
      return { error: '回転中です。少し待ってください' };
    }
    const settings = this.store.settings;
    const spinNo = entry.spinsDone + 1;
    const force = entry.hand === 'royal' && spinNo === 1 ? settings.royalFirstSymbolId : null;
    const outcome = spin(settings, { forceSymbolId: force });
    const symbol = settings.symbols.find((s) => s.id === outcome.symbolId);
    const stopsAt = [...TIMING.reelStops];
    if (outcome.reach) stopsAt[2] += TIMING.reachExtra;
    const result = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      entryId: entry.id,
      name: entry.name,
      hand: entry.hand,
      handName: entry.handName,
      spinNo,
      spinsTotal: entry.spinsTotal,
      symbolId: symbol.id,
      emoji: symbol.emoji,
      prize: symbol.prize,
      tier: symbol.tier,
      win: outcome.win,
      fakeReach: outcome.fakeReach,
      forced: outcome.forced,
    };
    // 結果は回す前に確定させてログに書く(途中で電源が落ちても記録は残る)
    this.store.appendLog(result);
    entry.spinsDone = spinNo;
    entry.results.push(result);
    this.currentSpin = {
      ...result,
      reels: outcome.reels,
      stops: outcome.stops,
      reach: outcome.reach,
      // 抽選に使った絵柄の並び(途中で設定が変わってもテレビのリールがずれないように)
      strip: settings.symbols.map((s) => ({ id: s.id, emoji: s.emoji })),
      stopsAt: stopsAt.map((t) => this._ms(t)),
      resultMs: this._ms(TIMING.result[symbol.tier] ?? TIMING.result[1]),
    };
    this._setPhase('spinning', stopsAt[2], () => this._showResult());
    return { result };
  }

  _showResult() {
    const entry = this.current;
    const ms = TIMING.result[this.currentSpin.tier] ?? TIMING.result[1];
    this._setPhase('result', ms, () => {
      if (entry.spinsDone < entry.spinsTotal) this._setPhase('ready');
      else this._setPhase('finale', TIMING.finale, () => this._next());
    });
  }

  _next() {
    this.queue.shift();
    this.currentSpin = null;
    if (this.queue.length) this._startAnnounce();
    else this._setPhase('idle');
  }

  recentWins(limit = 5) {
    const out = [];
    for (let i = this.store.log.length - 1; i >= 0 && out.length < limit; i -= 1) {
      const l = this.store.log[i];
      if (l.win) out.push(l);
    }
    return out;
  }

  jackpotWinners(month = monthKey(Date.now())) {
    return this.store.log.filter((l) => l.tier === 4 && monthKey(l.at) === month);
  }

  // 画面に送る状態一式(パスワードは含めない)
  snapshot() {
    const s = this.store.settings;
    return {
      serverNow: Date.now(),
      phase: this.phase,
      phaseAt: this.phaseAt,
      queue: this.queue.map((e) => ({ ...e })),
      currentSpin: this.currentSpin,
      timing: { announce: this._ms(TIMING.announce), finale: this._ms(TIMING.finale) },
      settings: {
        targetGame: s.targetGame,
        spins: s.spins,
        symbols: s.symbols,
        royalFirstSymbolId: s.royalFirstSymbolId,
      },
      hands: HANDS,
      recentWins: this.recentWins(),
      jackpotWinners: this.jackpotWinners(),
      month: monthKey(Date.now()),
    };
  }
}

module.exports = { Game, TIMING, monthKey, cleanName };
