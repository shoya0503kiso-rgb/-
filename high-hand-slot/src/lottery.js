'use strict';

const crypto = require('crypto');

// 確率は「%」で小数第2位まで使える。内部では 1/10000 単位の整数に直して重み付き抽選する。
const SCALE = 100;

function toUnits(rate) {
  return Math.round(Number(rate) * SCALE);
}

function defaultRandInt(max) {
  return crypto.randomInt(max);
}

// 0 <= x < 100*SCALE の整数を1つ引き、確率表の区間で絵柄を決める
function drawSymbol(symbols, randInt = defaultRandInt) {
  const total = symbols.reduce((a, s) => a + toUnits(s.rate), 0);
  if (total !== 100 * SCALE) throw new Error('確率の合計が100%ではありません');
  let r = randInt(total);
  for (const s of symbols) {
    r -= toUnits(s.rate);
    if (r < 0) return s;
  }
  throw new Error('unreachable');
}

// リール停止位置:各リールの帯は確率表の並び順。結果の絵柄が帯の何番目で止まるかを返す
function stopsFor(symbols, reels) {
  return reels.map((id) => symbols.findIndex((s) => s.id === id));
}

function isMiss(symbol) {
  return Number(symbol.tier) === 0;
}

function pick(list, randInt) {
  return list[randInt(list.length)];
}

// 1回転分の結果をサーバー側で決める。
// 戻り値の reels は左・中・右リールが止まる絵柄ID。
function spin(settings, { forceSymbolId = null, randInt = defaultRandInt } = {}) {
  const symbols = settings.symbols;
  if (symbols.length < 2) throw new Error('絵柄は2つ以上必要です');

  let symbol;
  let forced = false;
  if (forceSymbolId) {
    symbol = symbols.find((s) => s.id === forceSymbolId);
    forced = Boolean(symbol);
  }
  if (!symbol) symbol = drawSymbol(symbols, randInt);

  if (!isMiss(symbol)) {
    return {
      symbolId: symbol.id,
      win: true,
      reels: [symbol.id, symbol.id, symbol.id],
      stops: stopsFor(symbols, [symbol.id, symbol.id, symbol.id]),
      reach: true,
      fakeReach: false,
      forced,
    };
  }

  const ids = symbols.map((s) => s.id);
  // ガセリーチにするか(fakeReachRate は % 、小数可)
  const fakeReach = randInt(100 * SCALE) < toUnits(settings.fakeReachRate);
  let reels;
  if (fakeReach) {
    // リーチは当たり絵柄で見せた方が盛り上がるので、景品のある絵柄からリーチ絵柄を選ぶ
    const prizeIds = symbols.filter((s) => !isMiss(s)).map((s) => s.id);
    const a = pick(prizeIds.length ? prizeIds : ids, randInt);
    const others = ids.filter((id) => id !== a);
    reels = [a, a, pick(others, randInt)];
  } else {
    // 1・2リール目を必ず別の絵柄にする → リーチにもならず、3つ揃うこともない
    const a = pick(ids, randInt);
    const b = pick(
      ids.filter((id) => id !== a),
      randInt,
    );
    reels = [a, b, pick(ids, randInt)];
  }
  return { symbolId: symbol.id, win: false, reels, stops: stopsFor(symbols, reels), reach: fakeReach, fakeReach, forced };
}

// 現在の設定で n 回シミュレーションし、出現率などを返す(管理画面の「理論値チェック」用)
function simulate(settings, n = 100000, randInt = defaultRandInt) {
  const counts = Object.fromEntries(settings.symbols.map((s) => [s.id, 0]));
  let missAllSame = 0;
  let winNotAligned = 0;
  let misses = 0;
  let fakeReach = 0;
  for (let i = 0; i < n; i += 1) {
    const r = spin(settings, { randInt });
    counts[r.symbolId] += 1;
    const same = r.reels[0] === r.reels[1] && r.reels[1] === r.reels[2];
    if (r.win) {
      if (!same || r.reels[0] !== r.symbolId) winNotAligned += 1;
    } else {
      misses += 1;
      if (same) missAllSame += 1;
      if (r.fakeReach) fakeReach += 1;
    }
  }
  return {
    n,
    symbols: settings.symbols.map((s) => ({
      id: s.id,
      emoji: s.emoji,
      prize: s.prize,
      setRate: Number(s.rate),
      count: counts[s.id],
      actualRate: (counts[s.id] / n) * 100,
    })),
    missAllSame,
    winNotAligned,
    fakeReachActualRate: misses ? (fakeReach / misses) * 100 : 0,
    fakeReachSetRate: Number(settings.fakeReachRate),
  };
}

module.exports = { drawSymbol, spin, simulate, isMiss, toUnits, SCALE };
