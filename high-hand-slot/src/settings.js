'use strict';

const { HANDS, defaultSettings } = require('./defaults');
const { toUnits, SCALE } = require('./lottery');

const TIERS = [0, 1, 2, 3, 4];
const GAMES = ['both', 'tournament', 'cash'];

const MAX_SYMBOLS = 20;

// 10進数だけを数値として受け付ける('0x10' や '1e3' は不可)
function num(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
  return NaN;
}

// 見た目の比較用(異体字セレクタ U+FE0F の有無で「7️⃣」と「7⃣」が別扱いにならないように)
function emojiKey(e) {
  return e.replace(/\uFE0F/g, '');
}

// 管理画面から来た設定を検証・整形する。問題があれば { errors } を返し保存させない。
function validateSettings(input, current = defaultSettings()) {
  const errors = [];
  const out = structuredClone(current);
  if (!input || typeof input !== 'object') return { errors: ['設定の形式が正しくありません'] };

  if ('targetGame' in input) {
    if (GAMES.includes(input.targetGame)) out.targetGame = input.targetGame;
    else errors.push('対象ゲームの値が正しくありません');
  }

  if ('fakeReachRate' in input) {
    const v = num(input.fakeReachRate);
    if (Number.isFinite(v) && v >= 0 && v <= 100) out.fakeReachRate = Math.round(v * SCALE) / SCALE;
    else errors.push('ガセリーチ率は 0〜100 の数字にしてください');
  }

  if ('spins' in input) {
    for (const h of HANDS) {
      const v = num(input.spins?.[h.id]);
      if (Number.isInteger(v) && v >= 1 && v <= 20) out.spins[h.id] = v;
      else errors.push(`${h.name}の回転数は 1〜20 の整数にしてください`);
    }
  }

  if ('symbols' in input) {
    const list = Array.isArray(input.symbols) ? input.symbols : [];
    if (list.length < 2) errors.push('絵柄は2つ以上必要です');
    if (list.length > MAX_SYMBOLS) errors.push(`絵柄は${MAX_SYMBOLS}個までにしてください`);
    const ids = new Set();
    const emojis = new Set();
    const symbols = list.map((raw, i) => {
      const row = `${i + 1}行目`;
      const emoji = String(raw?.emoji ?? '').trim();
      const prize = String(raw?.prize ?? '').trim();
      const rate = num(raw?.rate);
      const tier = num(raw?.tier ?? (raw?.id === 'miss' ? 0 : 1));
      let id = String(raw?.id ?? '').trim();
      if (!/^[a-z0-9_-]{1,32}$/i.test(id)) id = `sym${Date.now().toString(36)}${i}`;
      if (!emoji) errors.push(`${row}: 絵柄を入れてください`);
      else if ([...emoji].length > 8) errors.push(`${row}: 絵柄は短くしてください(絵文字1つ推奨)`);
      if (!prize) errors.push(`${row}: 景品名を入れてください`);
      else if (prize.length > 40) errors.push(`${row}: 景品名は40文字以内にしてください`);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) errors.push(`${row}: 確率は 0〜100 の数字にしてください`);
      else if (Math.abs(toUnits(rate) / SCALE - rate) > 1e-9) errors.push(`${row}: 確率は小数第2位までにしてください`);
      if (!TIERS.includes(tier)) errors.push(`${row}: 演出の種類が正しくありません`);
      if (ids.has(id)) errors.push(`${row}: IDが重複しています`);
      if (emoji && emojis.has(emojiKey(emoji))) errors.push(`${row}: 同じ絵柄が他の行にもあります`);
      ids.add(id);
      emojis.add(emojiKey(emoji));
      return { id, emoji, prize, rate, tier };
    });
    const total = symbols.reduce((a, s) => a + (Number.isFinite(s.rate) ? toUnits(s.rate) : 0), 0);
    if (total !== 100 * SCALE) {
      errors.push(`確率の合計が ${(total / SCALE).toFixed(2).replace(/\.?0+$/, '')}% です。100% にしてください`);
    }
    if (list.length && !symbols.some((s) => s.tier > 0)) errors.push('当たり(ハズレ以外)の絵柄が1つ以上必要です');
    out.symbols = symbols;
  }

  const isWinId = (id) => out.symbols.some((s) => s.id === id && s.tier > 0);
  if ('royalFirstSymbolId' in input) {
    const id = String(input.royalFirstSymbolId || '');
    if (isWinId(id)) out.royalFirstSymbolId = id;
    else errors.push('ロイヤルフラッシュ1回目の確定絵柄は、当たりの絵柄から選んでください');
  }
  // ロイヤル1回目確定の絵柄が削除されたら、いちばん格の高い当たり絵柄にする
  if (!isWinId(out.royalFirstSymbolId)) {
    const best = [...out.symbols].filter((s) => s.tier > 0).sort((a, b) => b.tier - a.tier)[0];
    out.royalFirstSymbolId = best ? best.id : '';
  }

  if ('adminPassword' in input && input.adminPassword !== undefined && input.adminPassword !== '') {
    const pw = String(input.adminPassword);
    if (pw.length < 4 || pw.length > 64) errors.push('パスワードは4〜64文字にしてください');
    else out.adminPassword = pw;
  }

  return errors.length ? { errors } : { settings: out };
}

// 保存済みの設定を読み込んだときの整形(古い/手で書き換えたファイルでも動くように)。
// 項目ごとに検証し、問題のある項目だけ初期値に戻す(景品や確率など使える項目は残す)。
// problems が空でなければ、呼び出し側で元ファイルを退避してから保存すること。
function normalizeStored(stored) {
  const defaults = defaultSettings();
  const problems = [];
  const src = stored && typeof stored === 'object' ? stored : {};
  let acc = {
    ...defaults,
    adminPassword: typeof src.adminPassword === 'string' && src.adminPassword ? src.adminPassword : defaults.adminPassword,
  };
  if (acc.adminPassword !== src.adminPassword) problems.push('adminPassword');

  const tryApply = (key, patch) => {
    const r = validateSettings(patch, acc);
    if (r.settings) acc = r.settings;
    else problems.push(`${key}: ${r.errors.join(' / ')}`);
  };
  for (const key of ['targetGame', 'fakeReachRate', 'symbols']) {
    if (key in src) tryApply(key, { [key]: src[key] });
  }
  for (const h of HANDS) {
    if (src.spins && h.id in src.spins) tryApply(`spins.${h.id}`, { spins: { ...acc.spins, [h.id]: src.spins[h.id] } });
  }
  if ('royalFirstSymbolId' in src) tryApply('royalFirstSymbolId', { royalFirstSymbolId: src.royalFirstSymbolId });

  if (problems.length) {
    console.error('[settings] 設定ファイルの次の項目に問題があったため、その項目だけ初期値に戻しました:\n  ' + problems.join('\n  '));
  }
  return { settings: acc, problems, changed: JSON.stringify(acc) !== JSON.stringify(stored) };
}

module.exports = { validateSettings, normalizeStored, emojiKey, GAMES, TIERS, MAX_SYMBOLS };
