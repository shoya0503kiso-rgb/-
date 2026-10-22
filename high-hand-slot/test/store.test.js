'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/store');
const { defaultSettings } = require('../src/defaults');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hhs-store-'));
}

test('キーが足りない settings.json は初期値で補われ、保存し直される', () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ adminPassword: 'x', spins: { fullhouse: 9 } }));
    const store = new Store(dir, { settings: defaultSettings() });
    assert.strictEqual(store.settings.adminPassword, 'x');
    assert.strictEqual(store.settings.spins.fullhouse, 9);
    assert.strictEqual(store.settings.spins.royal, 5);
    assert.strictEqual(store.settings.symbols.length, 5);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
    assert.strictEqual(saved.fakeReachRate, 30);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('壊れた log.json は退避され、空のログで起動する', () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, 'log.json'), '{broken');
    const store = new Store(dir, { settings: defaultSettings() });
    assert.deepStrictEqual(store.log, []);
    assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('log.json.broken-')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('書き込み後に一時ファイルが残らず、残骸は起動時に掃除される', () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, '.log.json.1.2.tmp'), 'x');
    const store = new Store(dir, { settings: defaultSettings() });
    store.appendLog({ a: 1 });
    assert.deepStrictEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')), []);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'log.json'), 'utf8')).length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
