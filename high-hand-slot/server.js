'use strict';

const os = require('os');
const path = require('path');
const { createApp } = require('./src/app');

const PORT = Number(process.env.PORT) || 3000;
const { server } = createApp({ dataDir: path.join(__dirname, 'data') });

function lanAddresses() {
  const list = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === 'IPv4' && !i.internal) list.push(i.address);
    }
  }
  // 一般的な家庭・店舗ルーターの 192.168.x.x を先頭に(仮想アダプタのIPを後ろへ)
  const rank = (a) => (a.startsWith('192.168.') ? 0 : a.startsWith('10.') ? 1 : a.startsWith('172.') ? 2 : 3);
  return list.sort((a, b) => rank(a) - rank(b));
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nポート ${PORT} は使用中です。すでに起動していないか確認してください。`);
    console.error('別のポートで起動する場合: PORT=3001 npm start (Windows は set PORT=3001 && npm start)\n');
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  const hosts = lanAddresses();
  const host = hosts[0] || 'localhost';
  const line = '='.repeat(56);
  console.log(`\n${line}`);
  console.log('  ハイハンドスロット 起動しました(9High福山)');
  console.log(line);
  console.log(`  テレビ      : http://${host}:${PORT}/tv`);
  console.log(`  操作(スタッフ): http://${host}:${PORT}/control`);
  console.log(`  管理(店長)  : http://${host}:${PORT}/admin`);
  if (hosts.length > 1) {
    console.log(`\n  ※つながらない場合は次のアドレスも試してください: ${hosts.slice(1).join(', ')}`);
  }
  if (!hosts.length) {
    console.log('\n  ※Wi-Fiにつながっていないようです。このPCのブラウザでのみ開けます。');
  }
  console.log('  このPCで開く場合は ' + `http://localhost:${PORT}/tv`);
  console.log(`  終了するには この画面で Ctrl + C`);
  console.log(`${line}\n`);
});
