'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { Store } = require('./store');
const { defaultSettings } = require('./defaults');
const { normalizeStored } = require('./settings');
const { Game } = require('./game');
const { createAdminRouter } = require('./admin');

const ROLES = ['tv', 'control', 'admin'];

function createApp({ dataDir, timeScale = 1 }) {
  const store = new Store(dataDir, { settings: defaultSettings() });
  const norm = normalizeStored(store.settings);
  if (norm.problems.length) {
    const dest = store.backup('settings');
    if (dest) console.error(`[settings] 元の設定ファイルは ${path.basename(dest)} に残しています`);
  }
  if (norm.changed) store.saveSettings(norm.settings);

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  const game = new Game({ store, timeScale, onChange: () => io.emit('state', game.snapshot()) });
  game.restore();

  const pub = path.join(__dirname, '..', 'public');
  app.use(express.json({ limit: '1mb' }));
  app.use('/common', express.static(path.join(pub, 'common')));
  for (const page of ROLES) {
    app.use(`/${page}`, express.static(path.join(pub, page)));
  }
  app.get('/', (_req, res) => res.redirect('/control/'));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api/admin', createAdminRouter({ store, game }));
  // 壊れた JSON などはエラー画面ではなく JSON で返す
  app.use((err, _req, res, next) => {
    void next;
    console.error('[http]', err.message);
    res.status(err.status || 500).json({ error: err.status === 400 ? '送られた内容が正しくありません' : 'サーバーでエラーが起きました' });
  });

  // socket.io のハンドラ。ack(返事)が無くても落ちないようにする
  function on(socket, event, handler) {
    socket.on(event, (payload, ack) => {
      let res;
      try {
        res = handler(payload ?? {});
      } catch (err) {
        console.error(`[${event}]`, err);
        res = { error: 'サーバーでエラーが起きました' };
      }
      if (typeof ack === 'function') ack(res);
    });
  }

  io.on('connection', (socket) => {
    socket.emit('state', game.snapshot());
    socket.on('hello', (role) => {
      if (!ROLES.includes(role)) return;
      socket.data.role = role;
      broadcastClients();
    });
    socket.on('disconnect', broadcastClients);
    on(socket, 'register', (p) => game.register({ name: p.name, hand: p.hand }));
    on(socket, 'spin', (p) => game.spin(p.entryId));
    on(socket, 'cancel', (p) => game.cancel(p.entryId));
    on(socket, 'players', () => ({ players: store.players }));
  });

  function broadcastClients() {
    io.emit('clients', clientCounts());
  }

  function clientCounts() {
    const counts = { tv: 0, control: 0, admin: 0 };
    for (const s of io.sockets.sockets.values()) {
      if (counts[s.data.role] !== undefined) counts[s.data.role] += 1;
    }
    return counts;
  }

  return { app, server, io, store, game, dispose: () => game.dispose() };
}

module.exports = { createApp };
