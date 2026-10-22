// 管理画面(店長用)
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TIERS = [
    [0, 'ハズレ'],
    [1, '小 🍺'],
    [2, '中 ⭐'],
    [3, '大 🪙'],
    [4, '特大 7️⃣'],
  ];
  let token = '';
  try {
    token = sessionStorage.getItem('hhsAdminToken') || '';
  } catch {
    /* noop */
  }
  let settings = null;
  let hands = [];
  let draft = []; // 編集中の絵柄
  let newId = 0;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function setMsg(id, text, ok) {
    const m = $(id);
    m.textContent = text;
    m.className = `msg ${ok ? 'ok' : 'err'}`;
  }
  function saveToken(t) {
    token = t;
    try {
      if (t) sessionStorage.setItem('hhsAdminToken', t);
      else sessionStorage.removeItem('hhsAdminToken');
    } catch {
      /* noop */
    }
  }
  function fmtDate(iso) {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  const units = (r) => Math.round(Number(r) * 100);

  async function api(method, path, body) {
    const res = await fetch(`/api/admin${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && path !== '/login') {
      showLogin('ログインし直してください');
      throw new Error('unauthorized');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error((data.errors || [data.error || 'エラーが起きました']).join('\n'));
      err.data = data;
      throw err;
    }
    return data;
  }

  // ---------- ログイン ----------
  function showLogin(msg) {
    saveToken('');
    $('loginView').classList.remove('hidden');
    $('appView').classList.add('hidden');
    $('logoutBtn').classList.add('hidden');
    $('loginMsg').textContent = msg || '';
  }
  async function showApp() {
    try {
      await loadSettings();
    } catch {
      return;
    }
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    $('logoutBtn').classList.remove('hidden');
  }
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { token: t } = await api('POST', '/login', { password: $('pw').value });
      saveToken(t);
      $('pw').value = '';
      showApp();
    } catch (err) {
      $('loginMsg').textContent = err.message;
    }
  });
  $('logoutBtn').addEventListener('click', async () => {
    try {
      await api('POST', '/logout');
    } catch {
      /* noop */
    }
    showLogin('');
  });

  // ---------- タブ ----------
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    for (const x of $('tabs').querySelectorAll('button')) x.classList.toggle('on', x === b);
    for (const t of document.querySelectorAll('.tab')) t.classList.toggle('hidden', t.id !== `tab-${b.dataset.tab}`);
    if (b.dataset.tab === 'log') loadLog();
    if (b.dataset.tab === 'jackpot') loadJackpots();
  });

  // ---------- 設定 ----------
  async function loadSettings() {
    const data = await api('GET', '/settings');
    settings = data.settings;
    hands = data.hands;
    draft = settings.symbols.map((s) => ({ ...s }));
    renderSymbols();
    renderRules();
  }

  function renderSymbols() {
    const box = $('symRows');
    box.replaceChildren();
    draft.forEach((s, i) => {
      const row = el('div', 'sym-row');
      const emoji = el('input', 'emoji');
      emoji.type = 'text';
      emoji.value = s.emoji;
      emoji.maxLength = 8;
      emoji.setAttribute('aria-label', '絵柄');
      emoji.oninput = () => {
        s.emoji = emoji.value.trim();
        renderRoyal();
      };
      const prize = el('input', 'prize');
      prize.type = 'text';
      prize.value = s.prize;
      prize.maxLength = 40;
      prize.placeholder = '景品名';
      prize.setAttribute('aria-label', '景品名');
      prize.oninput = () => {
        s.prize = prize.value;
        renderRoyal();
        renderSum();
      };
      const rate = el('input', 'rate');
      rate.type = 'number';
      rate.min = '0';
      rate.max = '100';
      rate.step = '0.01';
      rate.inputMode = 'decimal';
      rate.value = s.rate;
      rate.placeholder = '確率%';
      rate.setAttribute('aria-label', '確率(%)');
      rate.oninput = () => {
        s.rate = rate.value === '' ? '' : Number(rate.value);
        renderSum();
      };
      const tier = el('select', 'tier');
      tier.setAttribute('aria-label', '演出');
      for (const [v, label] of TIERS) {
        const o = el('option', '', label);
        o.value = v;
        if (Number(s.tier) === v) o.selected = true;
        tier.append(o);
      }
      tier.onchange = () => {
        s.tier = Number(tier.value);
        renderRoyal();
      };
      const ops = el('div', 'ops');
      const up = el('button', '', '↑');
      up.type = 'button';
      up.title = '上へ';
      up.disabled = i === 0;
      up.onclick = () => move(i, -1);
      const down = el('button', '', '↓');
      down.type = 'button';
      down.title = '下へ';
      down.disabled = i === draft.length - 1;
      down.onclick = () => move(i, 1);
      const del = el('button', 'del', '✕');
      del.type = 'button';
      del.title = '削除';
      del.onclick = () => {
        if (draft.length <= 2) {
          setMsg('symMsg', '絵柄は2つ以上必要です');
          return;
        }
        if (!window.confirm(`「${s.emoji} ${s.prize}」を削除しますか?(保存するまで反映されません)`)) return;
        draft.splice(i, 1);
        renderSymbols();
      };
      ops.append(up, down, del);
      row.append(emoji, prize, rate, tier, ops);
      box.append(row);
    });
    renderSum();
    renderRoyal();
  }

  function move(i, d) {
    const j = i + d;
    [draft[i], draft[j]] = [draft[j], draft[i]];
    renderSymbols();
  }

  $('addSym').addEventListener('click', () => {
    if (draft.length >= 20) {
      setMsg('symMsg', '絵柄は20個までです');
      return;
    }
    newId += 1;
    draft.push({ id: `new${Date.now().toString(36)}${newId}`, emoji: '', prize: '', rate: 0, tier: 1 });
    renderSymbols();
    const rows = $('symRows').querySelectorAll('.sym-row .emoji');
    rows[rows.length - 1].focus();
  });

  function renderSum() {
    const total = draft.reduce((a, s) => a + (Number.isFinite(Number(s.rate)) && s.rate !== '' ? units(s.rate) : 0), 0);
    const box = $('sumBox');
    const t = (total / 100).toFixed(2).replace(/\.?0+$/, '');
    if (total === 10000) {
      box.textContent = `合計 ${t}% ✔`;
      box.className = 'sum ok';
    } else {
      const diff = ((10000 - total) / 100).toFixed(2).replace(/\.?0+$/, '');
      box.textContent = `合計 ${t}%(${total < 10000 ? `あと ${diff}%` : `${diff.replace('-', '')}% 多い`})。100% にしないと保存できません`;
      box.className = 'sum ng';
    }
    $('saveSyms').disabled = total !== 10000;
    // テレビの確率表に入りきらないほど多い・長いときは小さく表示される旨を伝える
    const long = draft.some((s) => String(s.prize || '').length > 16);
    $('tvNote').textContent =
      draft.length > 10 || long ? '※絵柄が多い・景品名が長いと、テレビの確率表は文字が小さくなります(景品名は16文字以内がおすすめ)' : '';
  }

  function renderRoyal() {
    const sel = $('royalFirst');
    const cur = sel.value || settings.royalFirstSymbolId;
    sel.replaceChildren();
    const wins = draft.filter((s) => Number(s.tier) > 0);
    for (const s of wins) {
      const o = el('option', '', `${s.emoji} ${s.prize}`);
      o.value = s.id;
      sel.append(o);
    }
    if (wins.some((s) => s.id === cur)) sel.value = cur;
    else if (wins.length) sel.value = wins.slice().sort((a, b) => b.tier - a.tier)[0].id;
  }

  $('saveSyms').addEventListener('click', async () => {
    try {
      const data = await api('PUT', '/settings', { symbols: draft, royalFirstSymbolId: $('royalFirst').value });
      settings = data.settings;
      draft = settings.symbols.map((s) => ({ ...s }));
      renderSymbols();
      setMsg('symMsg', '保存しました。テレビの確率表にもすぐ反映されます。', true);
    } catch (err) {
      setMsg('symMsg', err.message);
    }
  });

  $('simDraft').addEventListener('click', async () => {
    const box = $('simDraftBox');
    box.replaceChildren(el('p', 'hint', '計算中…'));
    try {
      const r = await api('POST', '/simulate', { symbols: draft, fakeReachRate: settings.fakeReachRate });
      box.replaceChildren(simTable(r));
    } catch (err) {
      box.replaceChildren();
      setMsg('symMsg', err.message);
    }
  });

  function renderRules() {
    const box = $('spinRows');
    box.replaceChildren();
    for (const h of hands) {
      const wrap = el('div');
      const lbl = el('label', '', h.name);
      lbl.htmlFor = `spin-${h.id}`;
      const line = el('div', 'inline');
      const inp = el('input');
      inp.type = 'number';
      inp.min = '1';
      inp.max = '20';
      inp.step = '1';
      inp.inputMode = 'numeric';
      inp.id = `spin-${h.id}`;
      inp.value = settings.spins[h.id];
      line.append(inp, document.createTextNode('回転'));
      wrap.append(lbl, line);
      box.append(wrap);
    }
    $('fakeReach').value = settings.fakeReachRate;
    for (const r of document.querySelectorAll('input[name=tg]')) r.checked = r.value === settings.targetGame;
  }

  $('saveRules').addEventListener('click', async () => {
    const spins = {};
    for (const h of hands) spins[h.id] = $(`spin-${h.id}`).value;
    const tg = document.querySelector('input[name=tg]:checked');
    try {
      const data = await api('PUT', '/settings', {
        spins,
        fakeReachRate: $('fakeReach').value,
        targetGame: tg ? tg.value : settings.targetGame,
      });
      settings = data.settings;
      renderRules();
      setMsg('rulesMsg', '保存しました。次に登録する人から反映されます。', true);
    } catch (err) {
      setMsg('rulesMsg', err.message);
    }
  });

  // ---------- ログ ----------
  async function loadLog() {
    const month = $('logMonth').value || '';
    let data;
    try {
      data = await api('GET', `/log?month=${encodeURIComponent(month)}&limit=1000`);
    } catch {
      return;
    }
    const sel = $('logMonth');
    const prev = sel.value;
    sel.replaceChildren();
    const all = el('option', '', 'すべての月');
    all.value = '';
    sel.append(all);
    for (const m of data.months) {
      const o = el('option', '', `${m.slice(0, 4)}年${Number(m.slice(5))}月`);
      o.value = m;
      sel.append(o);
    }
    sel.value = data.months.includes(prev) ? prev : '';

    const sum = $('logSummary');
    sum.replaceChildren(el('span', '', `全 ${data.total} 回転`));
    for (const [k, v] of Object.entries(data.counts || {})) sum.append(el('span', '', `${k}:${v}回`));

    const tb = $('logTable').querySelector('tbody');
    tb.replaceChildren();
    if (!data.log.length) {
      const tr = el('tr');
      const td = el('td', '', 'まだログはありません');
      td.colSpan = 6;
      tr.append(td);
      tb.append(tr);
    }
    for (const l of data.log) {
      const tr = el('tr', l.tier === 4 ? 'jp' : l.win ? 'win' : '');
      tr.append(
        el('td', '', fmtDate(l.at)),
        el('td', '', l.name),
        el('td', '', l.handName),
        el('td', '', `${l.spinNo}/${l.spinsTotal}`),
        el('td', 'e', l.emoji),
        el('td', '', l.prize + (l.forced ? '(確定)' : '')),
      );
      tb.append(tr);
    }
    $('logMore').textContent = data.total > data.log.length ? `新しい順に ${data.log.length} 件を表示中。全件は CSV で確認できます。` : '';
  }
  $('logMonth').addEventListener('change', loadLog);
  $('logReload').addEventListener('click', loadLog);
  $('csvBtn').addEventListener('click', async () => {
    const month = $('logMonth').value || '';
    const res = await fetch(`/api/admin/log.csv?month=${encodeURIComponent(month)}`, { headers: { 'x-admin-token': token } });
    if (res.status === 401) return showLogin('ログインし直してください');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `high-hand-slot-log${month ? `-${month}` : ''}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });

  // ---------- 7️⃣ 獲得者 ----------
  async function loadJackpots() {
    let data;
    try {
      data = await api('GET', '/jackpots');
    } catch {
      return;
    }
    const box = $('jackpotBox');
    box.replaceChildren();
    if (!data.months.length) box.append(el('p', 'hint', 'まだ 7️⃣ の獲得者はいません'));
    for (const m of data.months) {
      const blk = el('div', 'month-block');
      blk.append(el('h3', '', `${m.month.slice(0, 4)}年${Number(m.month.slice(5))}月(${m.list.length}人)`));
      const t = el('table', 'tbl');
      const tb = el('tbody');
      for (const l of m.list) {
        const tr = el('tr');
        tr.append(el('td', '', fmtDate(l.at)), el('td', '', `${l.name}さん`), el('td', '', l.handName), el('td', 'e', l.emoji), el('td', '', l.prize + (l.forced ? '(ロイヤル確定)' : '')));
        tb.append(tr);
      }
      t.append(tb);
      blk.append(t);
      box.append(blk);
    }
  }

  // ---------- 理論値チェック ----------
  function simTable(r) {
    const wrap = el('div');
    const t = el('table', 'tbl');
    const thead = el('thead');
    const hr = el('tr');
    for (const h of ['絵柄', '景品', '設定', '実際', 'ずれ', '回数']) hr.append(el('th', ['設定', '実際', 'ずれ', '回数'].includes(h) ? 'num' : '', h));
    thead.append(hr);
    const tb = el('tbody');
    let allOk = true;
    for (const s of r.symbols) {
      const diff = s.actualRate - s.setRate;
      const ok = Math.abs(diff) <= 1;
      if (!ok) allOk = false;
      const tr = el('tr');
      tr.append(
        el('td', 'e', s.emoji),
        el('td', '', s.prize),
        el('td', 'num', `${s.setRate}%`),
        el('td', 'num', `${s.actualRate.toFixed(2)}%`),
        el('td', `num ${ok ? 'okc' : 'ngc'}`, `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}`),
        el('td', 'num', s.count.toLocaleString()),
      );
      tb.append(tr);
    }
    t.append(thead, tb);
    const tw = el('div', 'table-wrap');
    tw.append(t);
    wrap.append(tw);
    const ok = allOk && r.missAllSame === 0 && r.winNotAligned === 0;
    wrap.append(
      el(
        'div',
        `verdict ${ok ? 'ok' : 'ng'}`,
        `${r.n.toLocaleString()}回中:ハズレで3つ揃った回数 ${r.missAllSame}回 / ガセリーチ率 設定${r.fakeReachSetRate}% → 実際${r.fakeReachActualRate.toFixed(2)}% / ${ok ? '問題なし(全絵柄 ±1% 以内)' : '設定値から1%以上ずれた絵柄があります'}`,
      ),
    );
    return wrap;
  }

  $('simBtn').addEventListener('click', async () => {
    const box = $('simBox');
    $('simBtn').disabled = true;
    box.replaceChildren(el('p', 'hint', '計算中…'));
    try {
      box.replaceChildren(simTable(await api('POST', '/simulate')));
    } catch (err) {
      box.replaceChildren(el('p', 'msg err', err.message));
    }
    $('simBtn').disabled = false;
  });

  // ---------- パスワード ----------
  $('pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if ($('pwNew').value !== $('pwNew2').value) return setMsg('pwMsg', '新しいパスワードが2回で違っています');
    try {
      await api('POST', '/password', { current: $('pwCur').value, next: $('pwNew').value });
      $('pwForm').reset();
      showLogin('パスワードを変更しました。新しいパスワードでログインしてください。');
    } catch (err) {
      setMsg('pwMsg', err.message);
    }
  });

  if (token) showApp().catch(() => showLogin(''));
  else showLogin('');
})();
