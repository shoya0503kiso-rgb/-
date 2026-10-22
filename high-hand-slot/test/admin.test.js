'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');
const { defaultSettings } = require('../src/defaults');

async function req(srv, method, path, { token, body } = {}) {
  const res = await fetch(`${srv.url}/api/admin${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-admin-token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = Buffer.from(await res.arrayBuffer());
  const text = raw.toString('utf8');
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* CSV など */
  }
  return { status: res.status, json, text, raw, headers: res.headers };
}

async function login(srv, password = '9high') {
  const r = await req(srv, 'POST', '/login', { body: { password } });
  return r.json && r.json.token;
}

test('パスワード(初期値 9high)でログインでき、間違いやトークンなしは拒否', async () => {
  const srv = await startTestServer();
  try {
    assert.strictEqual((await req(srv, 'POST', '/login', { body: { password: 'xxx' } })).status, 401);
    assert.strictEqual((await req(srv, 'GET', '/settings')).status, 401);
    assert.strictEqual((await req(srv, 'GET', '/settings', { token: 'bogus' })).status, 401);
    const token = await login(srv);
    assert.ok(token);
    const r = await req(srv, 'GET', '/settings', { token });
    assert.strictEqual(r.status, 200);
    assert.ok(!('adminPassword' in r.json.settings), 'パスワードは返さない');
  } finally {
    await srv.close();
  }
});

test('5回続けて間違えると一時的にロックされる', async () => {
  const srv = await startTestServer();
  try {
    for (let i = 0; i < 5; i += 1) await req(srv, 'POST', '/login', { body: { password: 'bad' } });
    assert.strictEqual((await req(srv, 'POST', '/login', { body: { password: '9high' } })).status, 429);
  } finally {
    await srv.close();
  }
});

test('確率の合計が100%でない設定は保存されない。正しければ保存され画面に配信される', async () => {
  const srv = await startTestServer();
  try {
    const token = await login(srv);
    const symbols = defaultSettings().symbols;
    symbols[0].rate = 50;
    const bad = await req(srv, 'PUT', '/settings', { token, body: { symbols } });
    assert.strictEqual(bad.status, 400);
    assert.match(bad.json.errors.join(), /105%/);
    assert.strictEqual(srv.store.settings.symbols[0].rate, 45);

    symbols[0].rate = 40;
    symbols.push({ emoji: '🍫', prize: 'チョコ', rate: 5, tier: 1 });
    const tv = await srv.connect('tv');
    const got = new Promise((r) => tv.on('state', (s) => s.settings.symbols.length === 6 && r(s)));
    const ok = await req(srv, 'PUT', '/settings', { token, body: { symbols } });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.json));
    await got;
    assert.strictEqual(srv.store.settings.symbols.length, 6);
    // ディスクにも保存されている
    const fs = require('fs');
    const path = require('path');
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(srv.dataDir, 'settings.json'), 'utf8')).symbols.length, 6);
  } finally {
    await srv.close();
  }
});

test('回転数・ガセリーチ率・対象ゲームを変更できる。設定の保存でパスワードは変わらない', async () => {
  const srv = await startTestServer();
  try {
    const token = await login(srv);
    const r = await req(srv, 'PUT', '/settings', {
      token,
      body: { spins: { fullhouse: 2, quads: 3, straightflush: 4, royal: 6 }, fakeReachRate: 50, targetGame: 'cash', adminPassword: 'hack' },
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(srv.store.settings.spins.royal, 6);
    assert.strictEqual(srv.store.settings.fakeReachRate, 50);
    assert.strictEqual(srv.store.settings.targetGame, 'cash');
    assert.strictEqual(srv.store.settings.adminPassword, '9high');
  } finally {
    await srv.close();
  }
});

test('パスワード変更:今のパスワードが必要。変更後は古いトークンと古いパスワードが使えない', async () => {
  const srv = await startTestServer();
  try {
    const token = await login(srv);
    assert.strictEqual((await req(srv, 'POST', '/password', { token, body: { current: 'x', next: 'newpass' } })).status, 400);
    assert.strictEqual((await req(srv, 'POST', '/password', { token, body: { current: '9high', next: 'ab' } })).status, 400);
    assert.strictEqual((await req(srv, 'POST', '/password', { token, body: { current: '9high', next: 'newpass' } })).status, 200);
    assert.strictEqual((await req(srv, 'GET', '/settings', { token })).status, 401);
    assert.strictEqual(await login(srv, '9high'), undefined);
    assert.ok(await login(srv, 'newpass'));
  } finally {
    await srv.close();
  }
});

function seedLog(srv) {
  srv.store.appendLog({ id: '1', at: '2026-09-10T10:00:00.000Z', name: 'A', hand: 'fullhouse', handName: 'フルハウス', spinNo: 1, spinsTotal: 1, symbolId: 'drink', emoji: '🍺', prize: 'ソフトドリンク1杯', tier: 1, win: true, fakeReach: false, forced: false });
  srv.store.appendLog({ id: '2', at: '2026-10-05T10:00:00.000Z', name: '=cmd,"x"', hand: 'royal', handName: 'ロイヤルフラッシュ', spinNo: 1, spinsTotal: 5, symbolId: 'jackpot', emoji: '7️⃣', prize: '大当たり(次回エントリー無料)', tier: 4, win: true, fakeReach: false, forced: true });
  srv.store.appendLog({ id: '3', at: '2026-10-06T10:00:00.000Z', name: 'C', hand: 'quads', handName: 'フォーカード', spinNo: 1, spinsTotal: 2, symbolId: 'miss', emoji: '💀', prize: 'ハズレ', tier: 0, win: false, fakeReach: true, forced: false });
}

test('ログ一覧(新しい順・月で絞り込み)と CSV ダウンロード', async () => {
  const srv = await startTestServer();
  try {
    seedLog(srv);
    const token = await login(srv);
    const all = await req(srv, 'GET', '/log', { token });
    assert.deepStrictEqual(all.json.log.map((l) => l.id), ['3', '2', '1']);
    assert.deepStrictEqual(all.json.months, ['2026-10', '2026-09']);
    const oct = await req(srv, 'GET', '/log?month=2026-10', { token });
    assert.strictEqual(oct.json.total, 2);

    const csv = await req(srv, 'GET', '/log.csv', { token });
    assert.strictEqual(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.ok(csv.text.startsWith('﻿日時,名前,役'), 'BOM と見出し');
    const lines = csv.text.trim().split('\r\n');
    assert.strictEqual(lines.length, 4);
    assert.ok(lines[2].includes(`"'=cmd,""x"""`), '数式・カンマ・引用符は無害化');
    assert.strictEqual((await req(srv, 'GET', '/log.csv')).status, 401);
  } finally {
    await srv.close();
  }
});

test('月別の 7️⃣ 獲得者', async () => {
  const srv = await startTestServer();
  try {
    seedLog(srv);
    const token = await login(srv);
    const r = await req(srv, 'GET', '/jackpots', { token });
    assert.strictEqual(r.json.months.length, 1);
    assert.strictEqual(r.json.months[0].month, '2026-10');
    assert.strictEqual(r.json.months[0].list[0].id, '2');
  } finally {
    await srv.close();
  }
});

test('理論値チェック:10万回で各絵柄 ±1% 以内・ハズレの3つ揃い0回。ログには残らない', async () => {
  const srv = await startTestServer();
  try {
    const token = await login(srv);
    const r = await req(srv, 'POST', '/simulate', { token, body: {} });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.n, 100000);
    for (const s of r.json.symbols) assert.ok(Math.abs(s.actualRate - s.setRate) <= 1, s.id);
    assert.strictEqual(r.json.missAllSame, 0);
    assert.strictEqual(srv.store.log.length, 0);
    // 未保存の編集内容でもチェックできる(不正なら 400)
    const draft = defaultSettings().symbols;
    draft[0].rate = 1;
    assert.strictEqual((await req(srv, 'POST', '/simulate', { token, body: { symbols: draft } })).status, 400);
  } finally {
    await srv.close();
  }
});
