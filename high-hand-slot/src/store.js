'use strict';

const fs = require('fs');
const path = require('path');

// JSON ファイルの読み書き。書き込みは「一時ファイル → fsync → rename」で行い、
// 途中で電源が落ちても元のファイルか新しいファイルのどちらかが必ず残るようにする。
function writeJsonAtomic(file, data) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, JSON.stringify(data, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  renameWithRetry(tmp, file);
  // ディレクトリの fsync(Windows では失敗するので無視)
  try {
    const dfd = fs.openSync(dir, 'r');
    fs.fsyncSync(dfd);
    fs.closeSync(dfd);
  } catch {
    /* noop */
  }
}

// Windows ではウイルス対策ソフト等がファイルをつかんで rename が一時的に失敗することがあるので再試行する
function renameWithRetry(from, to) {
  for (let i = 0; ; i += 1) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      if (i >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}

// 足りないキーを初期値で補う(配列は丸ごと採用、オブジェクトはキー単位で補う)
function fillDefaults(value, defaults) {
  if (Array.isArray(defaults)) return Array.isArray(value) ? value : structuredClone(defaults);
  if (defaults && typeof defaults === 'object') {
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const out = { ...src };
    for (const [k, d] of Object.entries(defaults)) out[k] = fillDefaults(src[k], d);
    return out;
  }
  return value === undefined || (value !== null && typeof value !== typeof defaults) ? defaults : value;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    // 壊れたファイルは退避して初期値で続行(ログは消さない方針なので退避のみ)
    const broken = `${file}.broken-${Date.now()}`;
    try {
      fs.renameSync(file, broken);
      console.error(`[store] ${path.basename(file)} が読めなかったため ${path.basename(broken)} に退避しました`);
    } catch {
      /* noop */
    }
    return fallback;
  }
}

class Store {
  constructor(dataDir, defaults) {
    this.dataDir = dataDir;
    this.files = {
      settings: path.join(dataDir, 'settings.json'),
      log: path.join(dataDir, 'log.json'),
      players: path.join(dataDir, 'players.json'),
    };
    fs.mkdirSync(dataDir, { recursive: true });
    this._cleanupTmp();
    this.settings = this._init('settings', defaults.settings);
    const filled = fillDefaults(this.settings, defaults.settings);
    if (JSON.stringify(filled) !== JSON.stringify(this.settings)) this.saveSettings(filled);
    this.log = this._init('log', []);
    this.players = this._init('players', []);
  }

  // 電源断などで残った一時ファイルを掃除する
  _cleanupTmp() {
    for (const f of fs.readdirSync(this.dataDir)) {
      if (f.startsWith('.') && f.endsWith('.tmp')) {
        try {
          fs.unlinkSync(path.join(this.dataDir, f));
        } catch {
          /* noop */
        }
      }
    }
  }

  _init(key, initial) {
    const file = this.files[key];
    const value = readJson(file, undefined);
    if (value === undefined) {
      writeJsonAtomic(file, initial);
      return structuredClone(initial);
    }
    return value;
  }

  saveSettings(settings) {
    writeJsonAtomic(this.files.settings, settings);
    this.settings = settings;
  }

  appendLog(entry) {
    this.log.push(entry);
    writeJsonAtomic(this.files.log, this.log);
  }

  savePlayers(players) {
    writeJsonAtomic(this.files.players, players);
    this.players = players;
  }
}

module.exports = { Store, writeJsonAtomic, readJson, fillDefaults };
