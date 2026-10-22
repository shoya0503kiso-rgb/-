'use strict';

const crypto = require('crypto');
const express = require('express');
const { HANDS } = require('./defaults');
const { validateSettings } = require('./settings');
const { simulate } = require('./lottery');
const { monthKey } = require('./game');

const TOKEN_TTL = 12 * 60 * 60 * 1000;
const SIM_N = 100000;
const MONTH_RE = /^\d{4}-\d{2}$/;

function publicSettings(s) {
  const { adminPassword, ...rest } = s;
  void adminPassword;
  return rest;
}

function csvCell(v) {
  let s = v === undefined || v === null ? '' : String(v);
  // Excel で数式として解釈されないように
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function localDateTime(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function sameText(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function createAdminRouter({ store, game }) {
  const router = express.Router();
  const tokens = new Map(); // token -> 有効期限
  let fails = 0;
  let lockUntil = 0;

  router.post('/login', (req, res) => {
    const now = Date.now();
    if (now < lockUntil) {
      return res.status(429).json({ error: `続けて間違えたため、${Math.ceil((lockUntil - now) / 1000)}秒待ってください` });
    }
    if (!sameText(req.body?.password ?? '', store.settings.adminPassword)) {
      fails += 1;
      if (fails >= 5) {
        lockUntil = now + 30 * 1000;
        fails = 0;
      }
      return res.status(401).json({ error: 'パスワードが違います' });
    }
    fails = 0;
    const token = crypto.randomBytes(24).toString('hex');
    tokens.set(token, now + TOKEN_TTL);
    res.json({ token });
  });

  // ここから下はログインが必要
  router.use((req, res, next) => {
    const token = req.get('x-admin-token');
    const exp = token && tokens.get(token);
    if (!exp || exp < Date.now()) {
      if (token) tokens.delete(token);
      return res.status(401).json({ error: 'ログインしてください' });
    }
    next();
  });

  router.post('/logout', (req, res) => {
    tokens.delete(req.get('x-admin-token'));
    res.json({ ok: true });
  });

  router.get('/settings', (_req, res) => {
    res.json({ settings: publicSettings(store.settings), hands: HANDS });
  });

  router.put('/settings', (req, res) => {
    const body = { ...(req.body || {}) };
    delete body.adminPassword; // パスワードは専用の画面で変える
    const r = validateSettings(body, store.settings);
    if (r.errors) return res.status(400).json({ errors: r.errors });
    store.saveSettings(r.settings);
    game.onChange();
    res.json({ settings: publicSettings(r.settings) });
  });

  router.post('/password', (req, res) => {
    const { current, next } = req.body || {};
    if (!sameText(current ?? '', store.settings.adminPassword)) return res.status(400).json({ errors: ['今のパスワードが違います'] });
    const r = validateSettings({ adminPassword: String(next ?? '') || ' ' }, store.settings);
    if (r.errors) return res.status(400).json({ errors: r.errors });
    store.saveSettings(r.settings);
    tokens.clear();
    res.json({ ok: true });
  });

  function monthParam(req) {
    return MONTH_RE.test(req.query.month || '') ? req.query.month : '';
  }

  function filterLog(month) {
    return month ? store.log.filter((l) => monthKey(l.at) === month) : store.log;
  }

  router.get('/log', (req, res) => {
    const month = monthParam(req);
    const months = [...new Set(store.log.map((l) => monthKey(l.at)))].sort().reverse();
    const list = filterLog(month).slice().reverse();
    const limit = Math.min(Number(req.query.limit) || 500, 5000);
    // 件数の集計は表示件数に関係なく全件で行う
    const counts = {};
    for (const l of list) {
      const key = `${l.emoji} ${l.prize}`;
      counts[key] = (counts[key] || 0) + 1;
    }
    res.json({ total: list.length, months, counts, log: list.slice(0, limit) });
  });

  router.get('/log.csv', (req, res) => {
    const month = monthParam(req);
    const head = ['日時', '名前', '役', '何回転目', '回転数', '結果', '絵柄', '景品', 'リーチ', '確定'];
    const lines = [head.map(csvCell).join(',')];
    for (const l of filterLog(month)) {
      lines.push(
        [
          localDateTime(l.at),
          l.name,
          l.handName,
          l.spinNo,
          l.spinsTotal,
          l.win ? '当たり' : 'ハズレ',
          l.emoji,
          l.prize,
          l.fakeReach ? 'ガセリーチ' : '',
          l.forced ? 'ロイヤル確定' : '',
        ]
          .map(csvCell)
          .join(','),
      );
    }
    const name = `high-hand-slot-log${month ? `-${month}` : ''}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    // Excel で文字化けしないように BOM を付ける
    res.send(`﻿${lines.join('\r\n')}\r\n`);
  });

  router.get('/jackpots', (_req, res) => {
    const byMonth = new Map();
    for (const l of store.log) {
      if (l.tier !== 4) continue;
      const m = monthKey(l.at);
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m).push(l);
    }
    const months = [...byMonth.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([month, list]) => ({ month, list }));
    res.json({ months });
  });

  // 理論値チェック:送られた設定(保存前の編集内容)か、今の設定で10万回まわす。ログには残さない
  router.post('/simulate', (req, res) => {
    let settings = store.settings;
    if (req.body && req.body.symbols) {
      const r = validateSettings(
        { symbols: req.body.symbols, fakeReachRate: req.body.fakeReachRate ?? store.settings.fakeReachRate },
        store.settings,
      );
      if (r.errors) return res.status(400).json({ errors: r.errors });
      settings = r.settings;
    }
    const started = Date.now();
    const result = simulate(settings, SIM_N);
    res.json({ ...result, ms: Date.now() - started });
  });

  return router;
}

module.exports = { createAdminRouter, csvCell };
