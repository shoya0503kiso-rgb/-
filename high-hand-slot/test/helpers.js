'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { io: ioClient } = require('socket.io-client');
const { createApp } = require('../src/app');

async function startTestServer(opts = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hhs-test-'));
  const ctx = createApp({ dataDir, ...opts });
  await new Promise((r) => ctx.server.listen(0, '127.0.0.1', r));
  const { port } = ctx.server.address();
  const url = `http://127.0.0.1:${port}`;
  const sockets = [];
  return {
    ...ctx,
    dataDir,
    url,
    connect(role) {
      const s = ioClient(url, { transports: ['websocket'], forceNew: true });
      sockets.push(s);
      return new Promise((resolve) => {
        s.on('connect', () => {
          if (role) s.emit('hello', role);
          resolve(s);
        });
      });
    },
    async close() {
      for (const s of sockets) s.close();
      if (ctx.dispose) ctx.dispose();
      ctx.io.close();
      await new Promise((r) => ctx.server.close(() => r()));
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

function waitFor(socket, event, pred = () => true, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      socket.off(event, h);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeout);
    function h(payload) {
      if (pred(payload)) {
        clearTimeout(t);
        socket.off(event, h);
        resolve(payload);
      }
    }
    socket.on(event, h);
  });
}

module.exports = { startTestServer, waitFor };
