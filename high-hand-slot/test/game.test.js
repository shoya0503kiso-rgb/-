'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { startTestServer, waitFor } = require('./helpers');

const call = (sock, ev, payload) => new Promise((r) => sock.emit(ev, payload, r));
const waitPhase = (sock, phase, timeout = 3000) => waitFor(sock, 'state', (s) => s.phase === phase, timeout);

test('登録 → 告知 → 回す → 結果 → まとめ → 待機 の流れ', async () => {
  const srv = await startTestServer({ timeScale: 0.01 });
  try {
    const c = await srv.connect('control');
    const announce = waitPhase(c, 'announce');
    const r = await call(c, 'register', { name: ' たろう ', hand: 'fullhouse' });
    assert.ok(r.entry);
    assert.strictEqual(r.entry.name, 'たろう');
    assert.strictEqual(r.entry.spinsTotal, 1);
    await announce;
    await waitPhase(c, 'ready');
    const spinning = waitPhase(c, 'spinning');
    const result = waitPhase(c, 'result');
    const finale = waitPhase(c, 'finale');
    const idleP = waitPhase(c, 'idle');
    const res = await call(c, 'spin', { entryId: r.entry.id });
    assert.ok(res.result);
    assert.ok(srv.store.log.length === 1, 'ログは回す時点で書かれる');
    await spinning;
    await result;
    await finale;
    const idle = await idleP;
    assert.strictEqual(idle.queue.length, 0);
    assert.deepStrictEqual(srv.store.players, ['たろう']);
  } finally {
    await srv.close();
  }
});

test('回転中の連打は無視され、1回分しか回らない', async () => {
  const srv = await startTestServer({ timeScale: 0.01 });
  try {
    const c = await srv.connect('control');
    const { entry } = await call(c, 'register', { name: 'A', hand: 'quads' });
    await waitPhase(c, 'ready');
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => call(c, 'spin', { entryId: entry.id })));
    assert.strictEqual(results.filter((x) => x.result).length, 1);
    assert.ok(results.filter((x) => x.error).length === 4);
    assert.strictEqual(srv.store.log.length, 1);
    // 2回転目
    await waitPhase(c, 'ready');
    assert.ok((await call(c, 'spin', { entryId: entry.id })).result);
    await waitPhase(c, 'finale');
    assert.strictEqual(srv.store.log.length, 2);
    assert.ok((await call(c, 'spin', { entryId: entry.id })).error, '回し終わった後は回せない');
  } finally {
    await srv.close();
  }
});

test('同時当選は待機列に積まれ順番に回る。他人の番では回せない', async () => {
  const srv = await startTestServer({ timeScale: 0.01 });
  try {
    const c = await srv.connect('control');
    const a = (await call(c, 'register', { name: 'A', hand: 'fullhouse' })).entry;
    const b = (await call(c, 'register', { name: 'B', hand: 'fullhouse' })).entry;
    const s = await waitPhase(c, 'ready');
    assert.deepStrictEqual(s.queue.map((e) => e.name), ['A', 'B']);
    assert.ok((await call(c, 'spin', { entryId: b.id })).error);
    assert.ok((await call(c, 'spin', { entryId: a.id })).result);
    await waitFor(c, 'state', (x) => x.phase === 'announce' && x.queue[0].id === b.id, 3000);
    await waitPhase(c, 'ready');
    assert.ok((await call(c, 'spin', { entryId: b.id })).result);
    await waitPhase(c, 'idle');
    assert.deepStrictEqual(srv.store.log.map((l) => l.name), ['A', 'B']);
  } finally {
    await srv.close();
  }
});

test('取り消しは回転前だけ。先頭を取り消すと次の人の告知になる', async () => {
  const srv = await startTestServer({ timeScale: 0.01 });
  try {
    const c = await srv.connect('control');
    const a = (await call(c, 'register', { name: 'A', hand: 'quads' })).entry;
    const b = (await call(c, 'register', { name: 'B', hand: 'fullhouse' })).entry;
    const x = (await call(c, 'register', { name: 'X', hand: 'fullhouse' })).entry;
    assert.ok((await call(c, 'cancel', { entryId: x.id })).ok, '待機中は取り消せる');
    await waitPhase(c, 'ready');
    await call(c, 'spin', { entryId: a.id });
    assert.ok((await call(c, 'cancel', { entryId: a.id })).error, '回転中は取り消せない');
    await waitPhase(c, 'ready');
    assert.ok((await call(c, 'cancel', { entryId: a.id })).error, '1回でも回したら取り消せない');
    await call(c, 'spin', { entryId: a.id });
    await waitFor(c, 'state', (s) => s.queue[0] && s.queue[0].id === b.id && s.phase === 'ready', 3000);
    const idleP = waitPhase(c, 'idle');
    assert.ok((await call(c, 'cancel', { entryId: b.id })).ok, '回す前なら先頭でも取り消せる');
    const s = await idleP;
    assert.strictEqual(s.queue.length, 0);
    assert.ok((await call(c, 'cancel', { entryId: b.id })).error);
  } finally {
    await srv.close();
  }
});

test('ロイヤルフラッシュは5回転で1回目は 7️⃣ 確定', async () => {
  const srv = await startTestServer({ timeScale: 0.005 });
  try {
    const c = await srv.connect('control');
    const { entry } = await call(c, 'register', { name: 'R', hand: 'royal' });
    assert.strictEqual(entry.spinsTotal, 5);
    for (let i = 0; i < 5; i += 1) {
      await waitPhase(c, 'ready');
      const { result } = await call(c, 'spin', { entryId: entry.id });
      if (i === 0) {
        assert.strictEqual(result.symbolId, 'jackpot');
        assert.strictEqual(result.forced, true);
      }
    }
    await waitPhase(c, 'idle', 5000);
    assert.strictEqual(srv.store.log.length, 5);
    assert.strictEqual(srv.store.log[0].symbolId, 'jackpot');
  } finally {
    await srv.close();
  }
});

test('入力チェック:名前なし・長すぎ・役なしは登録できない', async () => {
  const srv = await startTestServer({ timeScale: 0.01 });
  try {
    const c = await srv.connect('control');
    assert.ok((await call(c, 'register', { name: '  ', hand: 'fullhouse' })).error);
    assert.ok((await call(c, 'register', { name: 'あ'.repeat(21), hand: 'fullhouse' })).error);
    assert.ok((await call(c, 'register', { name: 'A', hand: 'twopair' })).error);
    assert.ok((await call(c, 'register', null)).error);
    assert.ok((await call(c, 'spin', null)).error);
  } finally {
    await srv.close();
  }
});

test('接続した画面には現在の状態(回転中ならリール停止位置と時刻)が送られる', async () => {
  const srv = await startTestServer({ timeScale: 0.05 });
  try {
    const c = await srv.connect('control');
    const { entry } = await call(c, 'register', { name: 'A', hand: 'fullhouse' });
    await waitPhase(c, 'ready');
    await call(c, 'spin', { entryId: entry.id });
    const { io: ioClient } = require('socket.io-client');
    const tv = ioClient(srv.url, { transports: ['websocket'], forceNew: true });
    try {
      const s = await waitFor(tv, 'state', () => true);
      assert.strictEqual(s.phase, 'spinning');
      assert.strictEqual(s.currentSpin.reels.length, 3);
      assert.strictEqual(s.currentSpin.stopsAt.length, 3);
      assert.ok(s.currentSpin.strip.length >= 2);
      assert.ok(!('adminPassword' in s.settings), 'パスワードは送らない');
      for (let i = 0; i < 3; i += 1) assert.strictEqual(s.currentSpin.strip[s.currentSpin.stops[i]].id, s.currentSpin.reels[i]);
    } finally {
      tv.close();
    }
  } finally {
    await srv.close();
  }
});

test('当選履歴と今月の 7️⃣ 獲得者が状態に含まれる', async () => {
  const srv = await startTestServer({ timeScale: 0.005 });
  try {
    const c = await srv.connect('control');
    const { entry } = await call(c, 'register', { name: 'R', hand: 'royal' });
    await waitPhase(c, 'ready');
    await call(c, 'spin', { entryId: entry.id });
    const s = await waitPhase(c, 'result');
    assert.strictEqual(s.recentWins[0].name, 'R');
    assert.strictEqual(s.jackpotWinners.length, 1);
    assert.ok(s.recentWins.length <= 5);
  } finally {
    await srv.close();
  }
});

test('PCを再起動しても待機列が残り、回転途中の人は続きから回せる(ロイヤル確定は付け直さない)', async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { createApp } = require('../src/app');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hhs-restore-'));
  try {
    const a = createApp({ dataDir, timeScale: 0.005 });
    const r = a.game.register({ name: 'R', hand: 'royal' }).entry;
    a.game.register({ name: 'B', hand: 'fullhouse' });
    await new Promise((res) => setTimeout(res, 60));
    assert.ok(a.game.spin(r.id).result.forced);
    a.dispose();
    a.io.close();

    const b = createApp({ dataDir, timeScale: 0.005 });
    try {
      assert.deepStrictEqual(b.game.queue.map((e) => e.name), ['R', 'B']);
      assert.strictEqual(b.game.queue[0].spinsDone, 1);
      assert.strictEqual(b.game.phase, 'ready');
      const res = b.game.spin(r.id).result;
      assert.strictEqual(res.spinNo, 2);
      assert.strictEqual(res.forced, false);
    } finally {
      b.dispose();
      b.io.close();
    }
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
