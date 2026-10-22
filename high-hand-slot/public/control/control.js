// 操作画面(ディーラー用)。登録・回す・取り消しはすべてサーバーに頼み、結果はサーバーが決める。
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const socket = io();
  let state = null;
  let players = [];
  let hand = null;
  let spinPending = false; // 「回す」を押して返事待ちの間は押せない(連打防止)
  let registerPending = false;
  let clients = { tv: 0 };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  let toastTimer = null;
  function toast(msg, isErr) {
    const t = $('toast');
    t.textContent = msg;
    t.className = `toast show${isErr ? ' err' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = 'toast'), isErr ? 3500 : 2200);
  }

  function emit(event, payload) {
    return new Promise((resolve) => {
      if (!socket.connected) {
        resolve({ error: 'サーバーと接続できていません' });
        return;
      }
      const timer = setTimeout(() => resolve({ error: '応答がありません。テレビの画面を確認してください' }), 8000);
      socket.emit(event, payload, (res) => {
        clearTimeout(timer);
        resolve(res || {});
      });
    });
  }

  // ---------- 接続表示 ----------
  function renderConn() {
    $('offlineNote').classList.toggle('hidden', socket.connected);
    const c = $('conn');
    if (!socket.connected) {
      c.textContent = '未接続';
      c.className = 'conn ng';
    } else if (!clients.tv) {
      c.textContent = 'テレビ未接続';
      c.className = 'conn warn';
    } else {
      c.textContent = 'テレビ接続中';
      c.className = 'conn ok';
    }
  }

  // ---------- 名前候補 ----------
  function loadPlayers() {
    emit('players', {}).then((res) => {
      if (Array.isArray(res.players)) {
        players = res.players;
        renderSuggest();
      }
    });
  }

  function renderSuggest() {
    const q = $('name').value.trim();
    const box = $('suggest');
    box.replaceChildren();
    const norm = (s) => s.toLowerCase().normalize('NFKC');
    const list = (q ? players.filter((p) => norm(p).includes(norm(q)) && p !== q) : players).slice(0, 8);
    for (const p of list) {
      const b = el('button', '', p);
      b.type = 'button';
      b.onclick = () => {
        $('name').value = p;
        renderSuggest();
        renderForm();
      };
      box.append(b);
    }
  }

  // ---------- 役ボタン ----------
  function renderHands() {
    const box = $('hands');
    if (!state) return;
    box.replaceChildren();
    for (const h of state.hands) {
      const b = el('button', `hand-btn${hand === h.id ? ' on' : ''}`);
      b.type = 'button';
      b.append(document.createTextNode(h.short), el('small', '', `${state.settings.spins[h.id]}回転`));
      b.onclick = () => {
        hand = hand === h.id ? null : h.id;
        renderHands();
        renderForm();
      };
      box.append(b);
    }
    const tg = { both: 'トーナメント・キャッシュ両方', tournament: 'トーナメントのみ', cash: 'キャッシュゲームのみ' }[state.settings.targetGame];
    $('target').textContent = `対象ゲーム:${tg}`;
  }

  function renderForm() {
    $('registerBtn').disabled = !socket.connected || registerPending || !$('name').value.trim() || !hand;
  }

  async function register() {
    const name = $('name').value.trim();
    if (!name || !hand || registerPending) return;
    // 2台から同じ人を二重に登録するのを防ぐ
    if (state && state.queue.some((e) => e.name === name) && !window.confirm(`${name}さんはすでに待機列にいます。もう一度登録しますか?`)) return;
    registerPending = true;
    renderForm();
    const res = await emit('register', { name, hand });
    registerPending = false;
    const msg = $('formMsg');
    if (res.error) {
      msg.textContent = res.error;
      msg.className = 'form-msg err';
    } else {
      msg.textContent = '';
      msg.className = 'form-msg';
      const pos = state ? state.queue.findIndex((e) => e.id === res.entry.id) : -1;
      toast(pos > 0 ? `${res.entry.name}さんを待機列 ${pos + 1} 番目に登録しました` : `${res.entry.name}さん(${res.entry.handName})を登録しました`);
      $('name').value = '';
      hand = null;
      renderHands();
      renderSuggest();
      loadPlayers();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    renderForm();
  }

  // ---------- いまの番 ----------
  function renderNow() {
    const card = $('nowCard');
    const entry = state && state.queue[0];
    if (!entry || state.phase === 'idle') {
      card.classList.add('hidden');
      return;
    }
    card.classList.remove('hidden');
    $('nowName').textContent = entry.name;
    $('nowHand').textContent = entry.handName;
    const doing = ['spinning', 'result'].includes(state.phase) && state.currentSpin ? state.currentSpin.spinNo : entry.spinsDone + 1;
    $('nowCount').textContent = `${Math.min(doing, entry.spinsTotal)} / ${entry.spinsTotal} 回転目`;

    const btn = $('spinBtn');
    const canSpin = socket.connected && ['announce', 'ready'].includes(state.phase) && entry.spinsDone < entry.spinsTotal;
    btn.disabled = !canSpin || spinPending;
    btn.classList.toggle('ready', canSpin && !spinPending);
    const status = $('nowStatus');
    if (!socket.connected) {
      btn.textContent = '接続待ち…';
      status.textContent = 'サーバーにつながっていません(Wi-Fiを確認)';
    } else if (spinPending) {
      btn.textContent = '…';
      status.textContent = '';
    } else if (canSpin) {
      btn.textContent = '回す';
      status.textContent = entry.spinsDone === 0 ? 'お客さんにスマホを渡して押してもらってください' : `あと ${entry.spinsTotal - entry.spinsDone} 回`;
    } else if (state.phase === 'spinning') {
      btn.textContent = '回転中…';
      status.textContent = 'テレビを見てね!';
    } else if (state.phase === 'result') {
      btn.textContent = '結果発表中…';
      status.textContent = entry.spinsDone < entry.spinsTotal ? 'このあと次の回転です' : '';
    } else if (state.phase === 'finale') {
      btn.textContent = '全回転終了';
      status.textContent = state.queue.length > 1 ? 'まもなく次の人の番です' : 'まもなく待機画面に戻ります';
    }
  }

  async function spin() {
    const entry = state && state.queue[0];
    if (!entry || spinPending) return;
    spinPending = true;
    renderNow();
    if (navigator.vibrate) navigator.vibrate(40);
    const res = await emit('spin', { entryId: entry.id });
    spinPending = false;
    if (res.error) toast(res.error, true);
    renderNow();
  }

  // ---------- 待機列 ----------
  function renderQueue() {
    const ol = $('queue');
    ol.replaceChildren();
    const q = state ? state.queue : [];
    $('queueCount').textContent = `${q.length}人`;
    if (!q.length) {
      ol.append(el('li', 'empty', 'いまは誰もいません'));
      return;
    }
    q.forEach((e, i) => {
      const li = el('li', i === 0 ? 'current' : '');
      const info = el('div', 'info');
      info.append(el('div', 'nm', `${e.name}さん`));
      const st = i === 0 ? (e.spinsDone ? `回転中(${e.spinsDone}/${e.spinsTotal})` : 'いまの番') : '待ち';
      info.append(el('div', 'sub', `${e.handName} ・ ${e.spinsTotal}回転 ・ ${st}`));
      li.append(el('span', 'no', String(i + 1)), info);
      const locked = e.spinsDone > 0 || (i === 0 && ['spinning', 'result', 'finale'].includes(state.phase));
      if (!locked) {
        const b = el('button', 'cancel', '取り消し');
        b.type = 'button';
        b.disabled = !socket.connected;
        b.onclick = async () => {
          if (!window.confirm(`${e.name}さん(${e.handName})の登録を取り消しますか?`)) return;
          const res = await emit('cancel', { entryId: e.id });
          if (res.error) toast(res.error, true);
          else toast('取り消しました');
        };
        li.append(b);
      }
      ol.append(li);
    });
  }

  function render() {
    renderNow();
    renderQueue();
  }

  // ---------- イベント ----------
  $('name').addEventListener('input', () => {
    renderSuggest();
    renderForm();
    $('formMsg').textContent = '';
  });
  $('name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.target.blur();
  });
  $('registerBtn').addEventListener('click', register);
  $('spinBtn').addEventListener('click', spin);

  socket.on('connect', () => {
    socket.emit('hello', 'control');
    loadPlayers();
    renderConn();
    if (state) render();
    renderForm();
  });
  socket.on('disconnect', () => {
    renderConn();
    render();
    renderForm();
  });
  socket.on('clients', (c) => {
    clients = c;
    renderConn();
  });
  socket.on('state', (s) => {
    const first = !state;
    const settingsChanged = !state || JSON.stringify(state.settings.spins) !== JSON.stringify(s.settings.spins) || state.settings.targetGame !== s.settings.targetGame;
    state = s;
    if (first || settingsChanged) renderHands();
    render();
  });
  renderConn();
  renderForm();
})();
