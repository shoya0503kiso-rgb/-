'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { startTestServer, waitFor } = require('./helpers');

test('3画面のページと socket.io クライアントが返る', async () => {
  const srv = await startTestServer();
  try {
    for (const p of ['tv', 'control', 'admin']) {
      const res = await fetch(`${srv.url}/${p}/`);
      assert.strictEqual(res.status, 200, p);
      assert.match(await res.text(), /ハイハンドスロット/);
    }
    const js = await fetch(`${srv.url}/socket.io/socket.io.js`);
    assert.strictEqual(js.status, 200);
  } finally {
    await srv.close();
  }
});

test('初回起動で data/ の3ファイルが作られる', async () => {
  const srv = await startTestServer();
  try {
    for (const f of ['settings.json', 'log.json', 'players.json']) {
      assert.ok(fs.existsSync(path.join(srv.dataDir, f)), f);
    }
    const s = JSON.parse(fs.readFileSync(path.join(srv.dataDir, 'settings.json'), 'utf8'));
    assert.strictEqual(s.adminPassword, '9high');
    assert.strictEqual(s.symbols.reduce((a, x) => a + x.rate, 0), 100);
  } finally {
    await srv.close();
  }
});

test('socket.io で画面間の通信ができる', async () => {
  const srv = await startTestServer();
  try {
    const tv = await srv.connect('tv');
    const control = await srv.connect('control');
    await waitFor(tv, 'clients', (c) => c.tv === 1 && c.control === 1);
    const got = waitFor(tv, 'pong-test', (m) => m.from === 'control');
    control.emit('ping-test', 'control');
    await got;
  } finally {
    await srv.close();
  }
});
