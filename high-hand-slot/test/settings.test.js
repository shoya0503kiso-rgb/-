'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { validateSettings, normalizeStored } = require('../src/settings');
const { defaultSettings } = require('../src/defaults');

test('初期設定はそのまま有効', () => {
  const r = validateSettings(defaultSettings());
  assert.ok(r.settings, JSON.stringify(r.errors));
});

test('確率の合計が100%にならない設定は保存できない', () => {
  const symbols = defaultSettings().symbols.map((s) => ({ ...s }));
  symbols[1].rate = 26;
  const r = validateSettings({ symbols });
  assert.ok(r.errors);
  assert.match(r.errors.join(), /101%/);
});

test('絵柄の追加・削除ができる(合計100%なら保存可)', () => {
  const symbols = defaultSettings().symbols.map((s) => ({ ...s }));
  symbols.push({ emoji: '🍫', prize: 'チョコ', rate: 5, tier: 1 });
  symbols[0].rate = 40;
  const r = validateSettings({ symbols });
  assert.ok(r.settings, JSON.stringify(r.errors));
  assert.strictEqual(r.settings.symbols.length, 6);
  assert.ok(r.settings.symbols[5].id);
  const r2 = validateSettings({ symbols: symbols.filter((s) => s.id !== 'stack').map((s) => (s.id === 'miss' ? { ...s, rate: 50 } : s)) });
  assert.ok(r2.settings, JSON.stringify(r2.errors));
});

test('不正な値は弾く', () => {
  assert.ok(validateSettings({ fakeReachRate: 120 }).errors);
  assert.ok(validateSettings({ targetGame: 'xxx' }).errors);
  assert.ok(validateSettings({ spins: { fullhouse: 0, quads: 2, straightflush: 3, royal: 5 } }).errors);
  assert.ok(validateSettings({ symbols: [{ emoji: '💀', prize: 'ハズレ', rate: 100, tier: 0 }] }).errors);
  const dup = defaultSettings().symbols.map((s) => ({ ...s, emoji: '💀' }));
  assert.ok(validateSettings({ symbols: dup }).errors);
});

test('ロイヤル確定の絵柄を削除したら、いちばん格の高い当たり絵柄に切り替わる', () => {
  const symbols = defaultSettings()
    .symbols.filter((s) => s.id !== 'jackpot')
    .map((s) => (s.id === 'miss' ? { ...s, rate: 50 } : s));
  const r = validateSettings({ symbols });
  assert.strictEqual(r.settings.royalFirstSymbolId, 'stack');
});

test('tier が欠けた古い設定ファイルも補って読み込める', () => {
  const stored = defaultSettings();
  stored.symbols = stored.symbols.map(({ tier, ...rest }) => rest);
  const { settings, changed } = normalizeStored(stored);
  assert.strictEqual(changed, true);
  assert.strictEqual(settings.symbols[0].tier, 0);
  assert.ok(settings.symbols.slice(1).every((s) => s.tier >= 1));
});

test('不正な項目があってもその項目だけ初期値に戻し、景品などは残す', () => {
  const stored = { ...defaultSettings(), adminPassword: 'abcd' };
  stored.symbols[1].prize = '生ビール';
  stored.spins.royal = 0;
  stored.fakeReachRate = 'abc';
  const { settings, problems } = normalizeStored(stored);
  assert.strictEqual(settings.symbols[1].prize, '生ビール');
  assert.strictEqual(settings.spins.royal, 5);
  assert.strictEqual(settings.spins.quads, 2);
  assert.strictEqual(settings.fakeReachRate, 30);
  assert.strictEqual(settings.adminPassword, 'abcd');
  assert.strictEqual(problems.length, 2);
});

test('確率の合計が崩れた確率表は初期値に戻す(パスワードは残す)', () => {
  const stored = { ...defaultSettings(), adminPassword: 'abcd' };
  stored.symbols[0].rate = 10;
  const { settings, problems } = normalizeStored(stored);
  assert.strictEqual(settings.symbols[0].rate, 45);
  assert.strictEqual(settings.adminPassword, 'abcd');
  assert.strictEqual(problems.length, 1);
});

test('不正な設定で起動すると元ファイルが退避され、元の内容が残る', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { createApp } = require('../src/app');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hhs-norm-'));
  try {
    const stored = defaultSettings();
    stored.symbols[1].prize = '生ビール';
    stored.spins.royal = 0;
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(stored));
    const { store, io } = createApp({ dataDir: dir });
    io.close();
    assert.strictEqual(store.settings.symbols[1].prize, '生ビール');
    assert.strictEqual(store.settings.spins.royal, 5);
    const backup = fs.readdirSync(dir).find((f) => f.startsWith('settings.json.broken-'));
    assert.ok(backup, '退避ファイルがある');
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, backup), 'utf8')).spins.royal, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('異体字セレクタ違いの同じ絵文字は重複として弾く', () => {
  const symbols = defaultSettings().symbols.map((s) => ({ ...s }));
  symbols[1].emoji = '7\u20E3';
  assert.match(validateSettings({ symbols }).errors.join(), /同じ絵柄/);
});

test('16進数などの表記、当たり絵柄なし、絵柄21個以上、ハズレのロイヤル確定は弾く', () => {
  assert.ok(validateSettings({ fakeReachRate: '0x10' }).errors);
  const allMiss = defaultSettings().symbols.map((s) => ({ ...s, tier: 0 }));
  assert.match(validateSettings({ symbols: allMiss }).errors.join(), /当たり/);
  const many = Array.from({ length: 21 }, (_, i) => ({ emoji: `E${i}`, prize: 'x', rate: i === 0 ? 80 : 1, tier: i === 0 ? 0 : 1 }));
  assert.match(validateSettings({ symbols: many }).errors.join(), /20個/);
  assert.ok(validateSettings({ royalFirstSymbolId: 'miss' }).errors);
  assert.ok(validateSettings({ royalFirstSymbolId: 'stack' }).settings);
});
