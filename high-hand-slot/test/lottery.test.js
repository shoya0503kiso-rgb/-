'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { spin, simulate, drawSymbol } = require('../src/lottery');
const { defaultSettings } = require('../src/defaults');

const N = 100000;

test('10万回の抽選で各絵柄の出現率が設定値の ±1% 以内', () => {
  const r = simulate(defaultSettings(), N);
  for (const s of r.symbols) {
    assert.ok(Math.abs(s.actualRate - s.setRate) <= 1, `${s.id}: 設定 ${s.setRate}% 実際 ${s.actualRate}%`);
  }
  assert.strictEqual(r.symbols.reduce((a, s) => a + s.count, 0), N);
});

test('10万回中、ハズレで3つ揃うケースは0回・当たりは必ず3つ揃う', () => {
  const r = simulate(defaultSettings(), N);
  assert.strictEqual(r.missAllSame, 0);
  assert.strictEqual(r.winNotAligned, 0);
});

test('ガセリーチ率がおおむね設定どおり(初期値30%)で、ガセリーチは1・2リール目だけ揃う', () => {
  const settings = defaultSettings();
  let misses = 0;
  let fake = 0;
  for (let i = 0; i < N; i += 1) {
    const r = spin(settings);
    if (r.win) continue;
    misses += 1;
    const [a, b, c] = r.reels;
    if (r.fakeReach) {
      fake += 1;
      assert.strictEqual(a, b);
      assert.notStrictEqual(b, c);
      // リーチ絵柄は景品のある絵柄
      assert.notStrictEqual(a, 'miss');
    } else {
      assert.notStrictEqual(a, b, '通常ハズレはリーチにならない');
    }
    assert.strictEqual(r.reach, r.fakeReach);
  }
  const rate = (fake / misses) * 100;
  assert.ok(Math.abs(rate - 30) <= 1.5, `ガセリーチ率 ${rate}%`);
});

test('ガセリーチ率 0% / 100% の端の値', () => {
  const s0 = { ...defaultSettings(), fakeReachRate: 0 };
  const s100 = { ...defaultSettings(), fakeReachRate: 100 };
  for (let i = 0; i < 5000; i += 1) {
    const a = spin(s0);
    if (!a.win) assert.strictEqual(a.fakeReach, false);
    const b = spin(s100);
    if (!b.win) {
      assert.strictEqual(b.fakeReach, true);
      assert.notStrictEqual(b.reels[1], b.reels[2]);
    }
  }
});

test('乱数の端(0 と 最大値)でも正しい絵柄になる', () => {
  const symbols = defaultSettings().symbols;
  assert.strictEqual(drawSymbol(symbols, () => 0).id, 'miss');
  assert.strictEqual(drawSymbol(symbols, () => 4499).id, 'miss');
  assert.strictEqual(drawSymbol(symbols, () => 4500).id, 'drink');
  assert.strictEqual(drawSymbol(symbols, (max) => max - 1).id, 'jackpot');
});

test('確率の合計が100%でないと抽選しない', () => {
  const symbols = defaultSettings().symbols.map((s) => ({ ...s }));
  symbols[0].rate = 44;
  assert.throws(() => drawSymbol(symbols), /100%/);
});

test('確定指定(ロイヤル1回目)は必ずその絵柄で3つ揃う', () => {
  for (let i = 0; i < 1000; i += 1) {
    const r = spin(defaultSettings(), { forceSymbolId: 'jackpot' });
    assert.deepStrictEqual(r.reels, ['jackpot', 'jackpot', 'jackpot']);
    assert.strictEqual(r.win, true);
    assert.strictEqual(r.forced, true);
  }
});

test('リール停止位置(stops)は絵柄の並び順のインデックスと一致する', () => {
  const settings = defaultSettings();
  for (let i = 0; i < 2000; i += 1) {
    const r = spin(settings);
    assert.deepStrictEqual(
      r.stops.map((i2) => settings.symbols[i2].id),
      r.reels,
    );
  }
});

test('絵柄2つ・ハズレ確率100%など極端な設定でもハズレで揃わない', () => {
  const settings = {
    ...defaultSettings(),
    fakeReachRate: 50,
    symbols: [
      { id: 'miss', emoji: '💀', prize: 'ハズレ', rate: 100, tier: 0 },
      { id: 'a', emoji: '🍺', prize: 'A', rate: 0, tier: 1 },
    ],
  };
  const r = simulate(settings, 20000);
  assert.strictEqual(r.missAllSame, 0);
  assert.strictEqual(r.symbols[1].count, 0);
});

test('小数の確率(0.5% など)も ±1% 以内', () => {
  const settings = {
    ...defaultSettings(),
    symbols: [
      { id: 'miss', emoji: '💀', prize: 'ハズレ', rate: 69.5, tier: 0 },
      { id: 'a', emoji: '🍺', prize: 'A', rate: 30, tier: 1 },
      { id: 'b', emoji: '7️⃣', prize: 'B', rate: 0.5, tier: 4 },
    ],
  };
  const r = simulate(settings, N);
  for (const s of r.symbols) assert.ok(Math.abs(s.actualRate - s.setRate) <= 1, s.id);
  assert.strictEqual(r.missAllSame, 0);
});
