'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { Store } = require('./store');
const { defaultSettings } = require('./defaults');
const { normalizeStored } = require('./settings');

function createApp({ dataDir }) {
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

  const pub = path.join(__dirname, '..', 'public');
  app.use(express.json({ limit: '1mb' }));
  app.use('/common', express.static(path.join(pub, 'common')));
  for (const page of ['tv', 'control', 'admin']) {
    app.use(`/${page}`, express.static(path.join(pub, page)));
  }
  app.get('/', (_req, res) => res.redirect('/control/'));

  io.on('connection', (socket) => {
    socket.on('hello', (role) => {
      if (!['tv', 'control', 'admin'].includes(role)) return;
      socket.data.role = role;
      broadcastClients();
    });
    socket.on('ping-test', (from) => {
      io.emit('pong-test', { from, at: Date.now() });
    });
    socket.on('disconnect', broadcastClients);
  });

  function broadcastClients() {
    const counts = { tv: 0, control: 0, admin: 0 };
    for (const s of io.sockets.sockets.values()) {
      if (counts[s.data.role] !== undefined) counts[s.data.role] += 1;
    }
    io.emit('clients', counts);
  }

  return { app, server, io, store };
}

module.exports = { createApp };
