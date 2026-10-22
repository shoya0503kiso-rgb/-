'use strict';

// 使い方: npm run simulate (data/settings.json の設定で10万回まわして出現率を表示)
const path = require('path');
const fs = require('fs');
const { defaultSettings } = require('../src/defaults');
const { normalizeStored } = require('../src/settings');
const { simulate } = require('../src/lottery');

const n = Number(process.argv[2]) || 100000;
// 読むだけ(壊れていてもファイルには触らない)
let stored;
try {
  stored = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'settings.json'), 'utf8'));
} catch {
  stored = defaultSettings();
}
const { settings } = normalizeStored(stored);
const r = simulate(settings, n);
console.log(`\n${n.toLocaleString()} 回シミュレーション`);
for (const s of r.symbols) {
  const diff = s.actualRate - s.setRate;
  const ok = Math.abs(diff) <= 1 ? 'OK' : 'NG';
  console.log(`  ${s.emoji} ${s.prize.padEnd(16)} 設定 ${String(s.setRate).padStart(6)}%  実際 ${s.actualRate.toFixed(2).padStart(6)}%  (${diff >= 0 ? '+' : ''}${diff.toFixed(2)}) ${ok}`);
}
console.log(`  ハズレで3つ揃った回数: ${r.missAllSame} 回`);
console.log(`  ガセリーチ率: 設定 ${r.fakeReachSetRate}%  実際 ${r.fakeReachActualRate.toFixed(2)}%\n`);
