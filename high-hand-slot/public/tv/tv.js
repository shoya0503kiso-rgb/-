// テレビ画面。結果はサーバーが決めて送ってくるので、ここでは演出だけを行う。
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const Sound = window.HHSound;
  const CELL = 160; // リール1コマの高さ(px、tv.css と合わせる)
  const TIER_HEAD = ['ざんねん…', 'WIN!', 'NICE WIN!!', 'BIG WIN!!!', 'JACKPOT!!!!'];

  // ---------- 画面サイズに合わせて 1920×1080 を拡大縮小 ----------
  const stage = $('stage');
  function fit() {
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = `scale(${s}) translate(-50%, -50%)`;
  }
  window.addEventListener('resize', fit);
  fit();

  // ---------- 音の解禁(ブラウザはクリックされるまで音を出せない) ----------
  function tryUnlock() {
    Sound.unlock();
    setTimeout(updateHint, 100);
  }
  function updateHint() {
    $('soundHint').classList.toggle('hide', Sound.unlocked());
  }
  window.addEventListener('pointerdown', tryUnlock);
  window.addEventListener('keydown', tryUnlock);
  tryUnlock();
  setInterval(updateHint, 2000);

  // ---------- 小物 ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function fmtDate(iso, withTime) {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    const date = `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
    return withTime ? `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}` : date;
  }
  function fmtRate(r) {
    return `${Number(r)}%`;
  }
  function handName(state, id) {
    const h = state.hands.find((x) => x.id === id);
    return h ? h.name : id;
  }
  function showScreen(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('show', s.id === id);
  }

  // 長い名前でもはみ出さないように文字サイズを縮める(.fit と data-max の幅に収める)
  function fitAll() {
    for (const e of document.querySelectorAll('.fit')) {
      const max = Number(e.dataset.max) || 1800;
      e.style.fontSize = '';
      let size = parseFloat(getComputedStyle(e).fontSize);
      let guard = 0;
      while (e.scrollWidth > max && size > 24 && guard < 40) {
        size *= 0.92;
        e.style.fontSize = `${size}px`;
        guard += 1;
      }
    }
  }

  // ---------- リール ----------
  class Reel {
    constructor(node, index) {
      this.node = node;
      this.index = index;
      this.cells = [];
      for (let j = 0; j < 5; j += 1) {
        const c = el('div', 'cell');
        node.appendChild(c);
        this.cells.push(c);
      }
      this.strip = [];
      this.key = '';
      this.pos = 0;
      this.anim = null;
    }

    setStrip(strip) {
      const key = strip.map((s) => s.id + s.emoji).join('|');
      if (key === this.key) return;
      this.key = key;
      this.strip = strip;
      this.pos = Math.floor(Math.random() * strip.length);
      this.draw();
    }

    draw() {
      const n = this.strip.length;
      if (!n) return;
      const base = Math.floor(this.pos);
      const frac = this.pos - base;
      for (let j = -2; j <= 2; j += 1) {
        const c = this.cells[j + 2];
        const sym = this.strip[(((base + j) % n) + n) % n];
        if (c.textContent !== sym.emoji) c.textContent = sym.emoji;
        c.style.transform = `translateY(${(frac - j) * CELL}px)`;
      }
    }

    // stopAt(ms) に target 番目で止まるように動きを作る
    plan(target, stopAt, { reachFrom = null } = {}) {
      const V = 0.024; // コマ/ms
      const VS = 0.0045; // リーチ時のスロー回転
      const decel = reachFrom !== null ? 1500 : 650;
      const base = (t) => {
        let v = t < 300 ? (V * t) / 300 : V;
        if (reachFrom !== null && t > reachFrom) {
          const u = Math.min(1, (t - reachFrom) / 600);
          v = V + (VS - V) * u;
        }
        return v;
      };
      const step = 4;
      const cum = [0];
      const vEnd = base(stopAt - decel);
      let d = 0;
      for (let t = step; t <= stopAt + step; t += step) {
        const tt = Math.min(t, stopAt);
        let v;
        if (tt >= stopAt - decel) {
          const u = (tt - (stopAt - decel)) / decel;
          v = vEnd * (1 - u) * (1 - u);
        } else {
          v = base(tt);
        }
        d += v * step;
        cum.push(d);
      }
      const n = this.strip.length;
      const start = Math.round(this.pos) % n;
      const delta = (((target - start) % n) + n) % n;
      const k = Math.max(1, Math.round((d - delta) / n));
      const dist = delta + k * n;
      this.anim = { start, f: dist / d, cum, step, stopAt, dist, stopped: false };
    }

    // t: 回転開始からの経過ms。止まった瞬間に true を返す
    update(t) {
      const a = this.anim;
      if (!a || a.stopped) return false;
      if (t >= a.stopAt) {
        this.pos = a.start + a.dist;
        a.stopped = true;
        this.node.classList.remove('blur', 'reach-slow');
        this.node.classList.add('stopped');
        this.draw();
        return true;
      }
      const i = Math.max(0, Math.min(a.cum.length - 1, Math.floor(t / a.step)));
      const v = (a.cum[Math.min(i + 1, a.cum.length - 1)] - a.cum[i]) / a.step;
      this.pos = a.start + a.f * a.cum[i];
      this.node.classList.toggle('blur', v * a.f > 0.009);
      this.draw();
      return false;
    }

    reset() {
      this.anim = null;
      this.node.classList.remove('blur', 'stopped', 'hit', 'reach-slow');
    }
  }

  const reels = [0, 1, 2].map((i) => new Reel($(`reel${i}`), i));

  // ---------- 紙吹雪・コインなどの演出 ----------
  const fx = (function () {
    const canvas = $('fx');
    const g = canvas.getContext('2d');
    let parts = [];
    let running = false;
    const emojiCache = new Map();
    const COLORS = ['#ff3b5c', '#ffd54a', '#4ade80', '#38bdf8', '#a78bfa', '#fb923c', '#ffffff'];

    function emojiImg(e, size) {
      const key = `${e}@${size}`;
      if (!emojiCache.has(key)) {
        const c = document.createElement('canvas');
        c.width = c.height = Math.ceil(size * 1.3);
        const cg = c.getContext('2d');
        cg.font = `${size}px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif`;
        cg.textAlign = 'center';
        cg.textBaseline = 'middle';
        cg.fillText(e, c.width / 2, c.height / 2);
        emojiCache.set(key, c);
      }
      return emojiCache.get(key);
    }

    function loop() {
      g.clearRect(0, 0, 1920, 1080);
      parts = parts.filter((p) => p.y < 1200 && p.life > 0);
      for (const p of parts) {
        p.vy += p.gy;
        p.vx *= 0.995;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life -= 1;
        g.save();
        g.globalAlpha = Math.min(1, p.life / 30);
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        if (p.type === 'emoji') {
          const img = emojiImg(p.emoji, p.size);
          g.drawImage(img, -img.width / 2, -img.height / 2);
        } else if (p.type === 'spark') {
          g.fillStyle = p.color;
          g.beginPath();
          for (let i = 0; i < 4; i += 1) {
            g.rotate(Math.PI / 2);
            g.lineTo(0, p.size);
            g.lineTo(p.size * 0.25, p.size * 0.25);
          }
          g.fill();
        } else {
          g.fillStyle = p.color;
          g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2 + Math.sin(p.rot * 3) * p.size * 0.3);
        }
        g.restore();
      }
      if (parts.length) requestAnimationFrame(loop);
      else running = false;
    }
    function add(p) {
      parts.push({ vx: 0, vy: 0, gy: 0.25, rot: 0, vr: 0, life: 400, ...p });
      if (!running) {
        running = true;
        requestAnimationFrame(loop);
      }
    }
    const R = (a, b) => a + Math.random() * (b - a);

    return {
      clear() {
        parts = [];
      },
      sparkle(n = 40) {
        for (let i = 0; i < n; i += 1) {
          const a = Math.random() * Math.PI * 2;
          const sp = R(4, 14);
          add({ type: 'spark', x: 960, y: 540, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4, gy: 0.18, size: R(14, 30), color: COLORS[i % 3 === 0 ? 1 : 6], life: R(60, 110) });
        }
      },
      confetti(n = 250) {
        for (let i = 0; i < n; i += 1) {
          add({ type: 'rect', x: R(0, 1920), y: R(-600, -20), vx: R(-2, 2), vy: R(2, 6), gy: 0.06, vr: R(-0.2, 0.2), size: R(16, 30), color: COLORS[i % COLORS.length], life: 600 });
        }
      },
      cannon(n = 120) {
        for (let i = 0; i < n; i += 1) {
          const left = i % 2 === 0;
          add({ type: 'rect', x: left ? 0 : 1920, y: 1000, vx: (left ? 1 : -1) * R(8, 22), vy: R(-30, -14), gy: 0.35, vr: R(-0.3, 0.3), size: R(16, 28), color: COLORS[i % COLORS.length], life: 300 });
        }
      },
      rain(emoji, n = 40, size = 90) {
        for (let i = 0; i < n; i += 1) {
          add({ type: 'emoji', emoji, x: R(40, 1880), y: R(-900, -60), vx: R(-1, 1), vy: R(3, 7), gy: 0.12, vr: R(-0.05, 0.05), size: R(size * 0.7, size * 1.2), life: 500 });
        }
      },
      // 画面の両脇から噴き上げる(結果カードの文字を隠さないように)
      fountain(emoji, n = 30) {
        for (let i = 0; i < n; i += 1) {
          const left = i % 2 === 0;
          add({ type: 'emoji', emoji, x: left ? R(20, 180) : R(1740, 1900), y: 1080, vx: (left ? 1 : -1) * R(0, 3), vy: R(-30, -18), gy: 0.55, vr: R(-0.1, 0.1), size: R(60, 100), life: 250 });
        }
      },
    };
  })();

  function flash() {
    const f = $('flash');
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
  }

  // ---------- 状態 ----------
  let state = null;
  let clockOffset = 0; // サーバー時刻 - 端末時刻
  let shown = { announce: null, spin: null, result: null, finale: null, phase: null };
  let spinRun = null;
  const effectTimers = [];

  function laterFx(ms, fn) {
    effectTimers.push(setTimeout(fn, ms));
  }
  function clearFx() {
    while (effectTimers.length) clearTimeout(effectTimers.pop());
    fx.clear();
  }
  function serverElapsed(since) {
    return Date.now() + clockOffset - since;
  }

  function renderIdle(s) {
    const prob = $('probTable');
    prob.replaceChildren();
    prob.classList.toggle('small', s.settings.symbols.length > 7);
    for (const sym of s.settings.symbols) {
      const tr = el('tr');
      tr.append(el('td', 'e', sym.emoji), el('td', 'p', sym.prize), el('td', 'r', fmtRate(sym.rate)));
      prob.append(tr);
    }
    const spins = $('spinTable');
    spins.replaceChildren();
    for (const h of s.hands) {
      const tr = el('tr');
      const extra = h.id === 'royal' ? '(1回目は確定!)' : '';
      const royalSym = s.settings.symbols.find((x) => x.id === s.settings.royalFirstSymbolId);
      const name = el('td', '', h.name);
      if (extra && royalSym) name.append(el('div', 'note', `1回目は ${royalSym.emoji} 確定!`));
      tr.append(name, el('td', 'r', `${s.settings.spins[h.id]}回転`));
      spins.append(tr);
    }
    const tg = { both: 'トーナメント・キャッシュ', tournament: 'トーナメント', cash: 'キャッシュゲーム' }[s.settings.targetGame];
    $('targetNote').textContent = `対象ゲーム:${tg}`;

    const rw = $('recentWins');
    rw.replaceChildren();
    if (!s.recentWins.length) rw.append(el('li', 'empty', 'まだ当選はありません'));
    for (const w of s.recentWins) {
      const li = el('li');
      const t = el('span', 't');
      t.append(el('span', 'e', w.emoji), document.createTextNode(`${w.name}さん`));
      li.append(t, el('span', 's', `${w.prize} ・ ${fmtDate(w.at, true)}`));
      rw.append(li);
    }
    $('monthLabel').textContent = `${Number(s.month.slice(5))}月`;
    const jl = $('jackpotList');
    jl.replaceChildren();
    if (!s.jackpotWinners.length) jl.append(el('li', 'empty', '今月はまだいません。あなたが1人目に!'));
    const jw = s.jackpotWinners.slice().reverse();
    for (const w of jw.slice(0, 4)) {
      const li = el('li');
      const t = el('span', 't');
      t.append(el('span', 'd', fmtDate(w.at, true)), el('span', 'e', w.emoji), document.createTextNode(`${w.name}さん`));
      li.append(t);
      jl.append(li);
    }
    if (jw.length > 4) jl.append(el('li', 'empty', `ほか ${jw.length - 4} 人`));
  }

  function renderNextUp(s) {
    const waiting = s.phase === 'idle' ? s.queue : s.queue.slice(1);
    $('nextUp').textContent = waiting.length ? `次の挑戦者:${waiting.map((e) => `${e.name}さん(${e.handName})`).join('、')}` : '';
  }

  function renderSlotHeader(s, entry) {
    $('slName').textContent = entry.name;
    $('slHand').textContent = entry.handName;
    const no = s.currentSpin && s.currentSpin.entryId === entry.id && s.phase !== 'ready' ? s.currentSpin.spinNo : entry.spinsDone + 1;
    $('slCount').textContent = `${Math.min(no, entry.spinsTotal)} / ${entry.spinsTotal} 回転目`;
  }

  function onState(s) {
    clockOffset = s.serverNow - Date.now();
    state = s;
    renderIdle(s);
    renderNextUp(s);
    const entry = s.queue[0];
    const slot = $('slot');

    if (s.phase === 'idle' || !entry) {
      showScreen('idle');
      stopSpinVisuals();
      shown = { announce: null, spin: null, result: null, finale: null, phase: 'idle' };
      return;
    }

    if (s.phase === 'announce') {
      showScreen('announce');
      $('anName').textContent = entry.name;
      $('anHand').textContent = `${entry.handName}!`;
      $('anSpins').textContent = `${entry.spinsTotal}回転`;
      if (shown.announce !== entry.id) {
        shown.announce = entry.id;
        clearFx();
        fx.sparkle(60);
        Sound.announce();
      }
    } else if (s.phase === 'ready') {
      showScreen('slot');
      renderSlotHeader(s, entry);
      prepareReels(s);
      $('result').classList.remove('show');
      slot.classList.remove('spinning', 'reaching');
      const m = $('slMessage');
      m.textContent = entry.spinsDone === 0 ? 'スマホの「回す」ボタンを押してね!' : `あと ${entry.spinsTotal - entry.spinsDone} 回!「回す」を押してね!`;
      m.className = 'slot-message blink';
      if (shown.announce !== entry.id) shown.announce = entry.id;
    } else if (s.phase === 'spinning' && s.currentSpin) {
      showScreen('slot');
      renderSlotHeader(s, entry);
      $('result').classList.remove('show');
      const m = $('slMessage');
      if (!m.classList.contains('reach')) {
        m.textContent = '';
        m.className = 'slot-message';
      }
      if (shown.spin !== s.currentSpin.id) {
        shown.spin = s.currentSpin.id;
        startSpin(s.currentSpin, serverElapsed(s.phaseAt));
      }
    } else if (s.phase === 'result' && s.currentSpin) {
      showScreen('slot');
      renderSlotHeader(s, entry);
      if (shown.spin !== s.currentSpin.id) {
        // 途中から開いた場合は止まった状態にする
        shown.spin = s.currentSpin.id;
        startSpin(s.currentSpin, Infinity);
      }
      if (shown.result !== s.currentSpin.id) {
        shown.result = s.currentSpin.id;
        finishSpin();
        showResult(s.currentSpin, entry);
      }
    } else if (s.phase === 'finale') {
      showScreen('finale');
      stopSpinVisuals();
      if (shown.finale !== entry.id) {
        shown.finale = entry.id;
        showFinale(entry);
      }
    }
    shown.phase = s.phase;
    fitAll();
  }

  function prepareReels(s) {
    const strip = s.currentSpin && s.currentSpin.strip ? s.currentSpin.strip : s.settings.symbols.map((x) => ({ id: x.id, emoji: x.emoji }));
    if (s.phase === 'ready' && !spinRun) {
      for (const r of reels) {
        r.reset();
        r.setStrip(s.settings.symbols.map((x) => ({ id: x.id, emoji: x.emoji })));
      }
      return;
    }
    for (const r of reels) r.setStrip(strip);
  }

  function startSpin(spin, elapsed) {
    stopSpinVisuals();
    clearFx();
    for (const r of reels) {
      r.reset();
      r.setStrip(spin.strip);
    }
    const reachFrom = spin.reach ? spin.stopsAt[1] + 150 : null;
    reels.forEach((r, i) => r.plan(spin.stops[i], spin.stopsAt[i], i === 2 ? { reachFrom } : {}));
    const t0 = performance.now() - Math.min(elapsed, spin.stopsAt[2] + 1);
    const late = elapsed >= spin.stopsAt[2];
    const slot = $('slot');
    if (!late) {
      slot.classList.add('spinning');
      Sound.spinStart();
    }
    const run = { t0, reachShown: false, spin, raf: 0 };
    spinRun = run;
    const frame = () => {
      if (spinRun !== run) return;
      const t = performance.now() - run.t0;
      reels.forEach((r, i) => {
        if (r.update(t) && !late) {
          Sound.reelStop(i);
          if (i === 2) Sound.spinStop();
        }
      });
      if (spin.reach && !run.reachShown && t >= spin.stopsAt[1]) {
        run.reachShown = true;
        if (!late && t < spin.stopsAt[2]) showReach();
      }
      if (t < spin.stopsAt[2] + 50) run.raf = requestAnimationFrame(frame);
      else finishSpin();
    };
    run.raf = requestAnimationFrame(frame);
  }

  function showReach() {
    const b = $('reachBanner');
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    $('slot').classList.add('reaching');
    reels[0].node.classList.add('hit');
    reels[1].node.classList.add('hit');
    reels[2].node.classList.add('reach-slow');
    const m = $('slMessage');
    m.textContent = '★ リーチ ★';
    m.className = 'slot-message reach';
    Sound.spinStop();
    Sound.reach();
  }

  function finishSpin() {
    const slot = $('slot');
    slot.classList.remove('spinning', 'reaching');
    $('reachBanner').classList.remove('show');
    const m = $('slMessage');
    if (m.classList.contains('reach')) {
      m.textContent = '';
      m.className = 'slot-message';
    }
    Sound.stopAll();
  }

  function stopSpinVisuals() {
    if (spinRun) cancelAnimationFrame(spinRun.raf);
    spinRun = null;
    finishSpin();
  }

  function showResult(spin, entry) {
    const box = $('result');
    box.className = `result tier${spin.tier}`;
    $('rsHead').textContent = TIER_HEAD[spin.tier] || TIER_HEAD[1];
    $('rsEmoji').textContent = spin.win ? spin.reels.map(() => spin.emoji).join('') : spin.reels.map((id) => (spin.strip.find((x) => x.id === id) || {}).emoji || '').join('');
    $('rsPrize').textContent = spin.win ? spin.prize : `${spin.prize}… ドンマイ!`;
    $('rsName').textContent = spin.name;
    $('rsHand').textContent = spin.handName;
    $('rsDate').textContent = fmtDate(spin.at);
    if (spin.win) for (const r of reels) r.node.classList.add('hit');
    // 結果カードは止まってから少しだけ間を置いて出す
    laterFx(spin.tier === 4 ? 700 : 350, () => box.classList.add('show'));

    switch (spin.tier) {
      case 0:
        Sound.miss();
        break;
      case 1:
        Sound.win(1);
        laterFx(350, () => fx.sparkle(50));
        break;
      case 2:
        Sound.win(2);
        laterFx(350, () => {
          fx.sparkle(80);
          fx.fountain(spin.emoji, 25);
        });
        break;
      case 3:
        Sound.win(3);
        laterFx(300, () => {
          fx.rain(spin.emoji, 70, 100);
          fx.cannon(100);
        });
        break;
      default:
        // 7️⃣:画面フラッシュ・紙吹雪・長いファンファーレ
        flash();
        Sound.jackpot();
        laterFx(200, () => {
          fx.confetti(320);
          fx.cannon(160);
        });
        laterFx(1600, () => {
          flash();
          fx.rain(spin.emoji, 60, 120);
        });
        laterFx(3500, () => {
          fx.confetti(250);
          fx.cannon(120);
        });
        laterFx(6000, () => fx.rain(spin.emoji, 50, 110));
    }
  }

  function showFinale(entry) {
    clearFx();
    const wins = entry.results.filter((r) => r.win);
    const best = wins.reduce((a, r) => (a && a.tier >= r.tier ? a : r), null);
    $('fnTitle').textContent = wins.length ? 'おめでとうございます!' : 'ナイスチャレンジ!また挑戦してね!';
    $('fnName').textContent = entry.name;
    $('fnHand').textContent = `${entry.handName} ・ ${entry.spinsTotal}回転`;
    $('fnDate').textContent = fmtDate(entry.results.length ? entry.results[entry.results.length - 1].at : Date.now());
    const list = $('fnList');
    list.replaceChildren();
    list.classList.toggle('many', entry.results.length > 6);
    entry.results.forEach((r, i) => {
      const li = el('li', r.win ? 'win' : '');
      li.append(el('span', 'n', `${i + 1}回目`), el('span', 'e', r.emoji), el('span', '', r.prize));
      list.append(li);
    });
    if (best) {
      fx.sparkle(60);
      if (best.tier >= 3) fx.confetti(150);
      Sound.win(Math.min(best.tier, 2));
    }
  }

  // ---------- 接続 ----------
  const socket = io();
  socket.on('connect', () => {
    $('offline').classList.remove('show');
    socket.emit('hello', 'tv');
  });
  socket.on('disconnect', () => $('offline').classList.add('show'));
  socket.on('state', onState);
})();
