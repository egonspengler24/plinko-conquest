(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const DT = 1 / 60;            // fixed simulation step, seconds
  const MAX_STEPS_PER_FRAME = 40;
  const STORE_KEY = 'plinko-conquest-names';
  const X2_COLOR = '#8cff00';
  const R_COLOR = '#ff0a84';

  const board = new Board();
  const peg = new Pegboard(TEAM_COUNT);
  const C = board.cellPx;

  const gctx = $('gridCanvas').getContext('2d', { alpha: false });
  const fctx = $('fxCanvas').getContext('2d');
  const pctx = $('pegCanvas').getContext('2d', { alpha: false });

  let names = TEAMS.map((t) => t.label);
  let running = false;
  let paused = false;
  let speed = 1;
  let acc = 0;
  let lastFrame = 0;
  let lastLeaderboard = 0;
  let winTimer = null;
  let winShown = false;

  // ---------------------------------------------------------------- music
  const music = new Audio();
  music.loop = true;
  music.volume = Number($('volume').value);
  let musicUrl = null;

  $('musicFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    musicUrl = URL.createObjectURL(file);
    music.src = musicUrl;
    $('musicName').textContent = file.name;
    $('musicName').classList.add('has-track');
    $('musicClear').hidden = false;
  });

  $('musicClear').addEventListener('click', () => {
    music.pause();
    music.removeAttribute('src');
    music.load();
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    musicUrl = null;
    $('musicFile').value = '';
    $('musicName').textContent = 'No track chosen. The game will be silent.';
    $('musicName').classList.remove('has-track');
    $('musicClear').hidden = true;
  });

  $('volume').addEventListener('input', (e) => { music.volume = Number(e.target.value); });
  $('muteBtn').addEventListener('click', () => {
    music.muted = !music.muted;
    $('muteBtn').textContent = music.muted ? 'Sound off' : 'Sound on';
    $('muteBtn').setAttribute('aria-pressed', String(music.muted));
  });

  function playMusic(restart) {
    if (!musicUrl) return;
    if (restart) music.currentTime = 0;
    music.play().catch(() => {});
  }

  // ---------------------------------------------------------------- setup screen
  const inputs = [];

  function loadStoredNames() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (_) { return []; }
  }
  function storeNames() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(inputs.map((i) => i.value))); } catch (_) { /* private mode */ }
  }

  (function buildTeamGrid() {
    const stored = loadStoredNames();
    TEAMS.forEach((team, i) => {
      const field = document.createElement('label');
      field.className = 'team-field';
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = team.tile;
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 24;
      input.placeholder = team.label;
      input.value = typeof stored[i] === 'string' ? stored[i] : '';
      input.setAttribute('aria-label', `Name for the ${team.label} squares`);
      input.addEventListener('input', storeNames);
      field.append(sw, input);
      $('teamGrid').appendChild(field);
      inputs.push(input);
    });
  })();

  $('clearNames').addEventListener('click', () => {
    inputs.forEach((i) => { i.value = ''; });
    storeNames();
  });

  $('shuffleNames').addEventListener('click', () => {
    const vals = inputs.map((i) => i.value);
    for (let i = vals.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [vals[i], vals[j]] = [vals[j], vals[i]];
    }
    inputs.forEach((inp, i) => { inp.value = vals[i]; });
    storeNames();
  });

  $('applyPaste').addEventListener('click', () => {
    const lines = $('pasteBox').value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    inputs.forEach((inp, i) => { inp.value = (lines[i] || '').slice(0, 24); });
    storeNames();
  });

  $('startBtn').addEventListener('click', () => startGame());
  $('againBtn').addEventListener('click', () => startGame());
  $('editBtn').addEventListener('click', () => showSetup());
  $('backBtn').addEventListener('click', () => showSetup());

  function showSetup() {
    running = false;
    clearTimeout(winTimer);
    music.pause();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    $('game').hidden = true;
    $('setup').hidden = false;
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- game lifecycle
  board.onEliminate = (team) => {
    peg.remove(team);
    toast(`${names[team]} is out`, TEAMS[team].bright);
  };
  peg.onLand = (team, kind) => {
    if (kind === 'x2') board.doubleMultiplier(team);
    else board.release(team);
  };

  function startGame() {
    names = inputs.map((inp, i) => inp.value.trim() || TEAMS[i].label);
    board.reset();
    peg.reset();
    paintAllCells();
    acc = 0;
    paused = false;
    winShown = false;
    clearTimeout(winTimer);
    $('winOverlay').hidden = true;
    $('pauseBadge').hidden = true;
    $('pauseBtn').textContent = 'Pause';
    $('toasts').replaceChildren();
    $('setup').hidden = true;
    $('game').hidden = false;
    playMusic(true);
    updateLeaderboard();
    updateClock();
    if (!running) {
      running = true;
      lastFrame = performance.now();
      requestAnimationFrame(frame);
    }
  }

  function toast(text, color) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.setProperty('--c', color);
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 5) box.firstChild.remove();
    setTimeout(() => el.remove(), 4000);
  }

  // ---------------------------------------------------------------- HUD controls
  function setPaused(p) {
    paused = p;
    $('pauseBtn').textContent = p ? 'Resume' : 'Pause';
    $('pauseBadge').hidden = !p;
  }
  $('pauseBtn').addEventListener('click', () => setPaused(!paused));
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && running && !$('game').hidden && !/^(INPUT|TEXTAREA|BUTTON)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      setPaused(!paused);
    }
  });

  $('speedSeg').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-speed]');
    if (!btn) return;
    speed = Number(btn.dataset.speed);
    for (const b of $('speedSeg').children) b.classList.toggle('on', b === btn);
  });

  $('fsBtn').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else $('stageWrap').requestFullscreen().catch(() => {});
  });

  // ---------------------------------------------------------------- main loop
  function frame(now) {
    if (!running) return;
    const real = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;

    if (!paused) {
      acc += real * speed;
      let n = 0;
      while (acc >= DT && n < MAX_STEPS_PER_FRAME) {
        peg.step(DT);
        board.step(DT);
        acc -= DT;
        n++;
      }
      if (n === MAX_STEPS_PER_FRAME) acc = 0;
    }

    if (board.winner >= 0 && !winShown) {
      winShown = true;
      winTimer = setTimeout(showWinner, 1200);
    }

    for (const idx of board.drainDirty()) paintCell(idx);
    drawFx();
    peg.draw(pctx, (t) => TEAMS[t].bright);

    if (now - lastLeaderboard > 250) {
      lastLeaderboard = now;
      updateLeaderboard();
      updateClock();
    }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- grid rendering
  function paintAllCells() {
    gctx.fillStyle = '#000';
    gctx.fillRect(0, 0, board.widthPx, board.heightPx);
    for (let i = 0; i < board.owner.length; i++) paintCell(i);
    board.drainDirty();
  }

  function paintCell(idx) {
    const x = idx % board.cols, y = (idx / board.cols) | 0;
    gctx.fillStyle = TEAMS[board.owner[idx]].tile;
    gctx.fillRect(x * C + 1, y * C + 1, C - 1, C - 1);
  }

  // ---------------------------------------------------------------- fx layer: shots, impacts, cannons
  function drawFx() {
    fctx.clearRect(0, 0, board.widthPx, board.heightPx);

    for (const im of board.impacts) {
      const k = im.t / 0.4;
      fctx.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.8})`;
      fctx.lineWidth = 3;
      fctx.beginPath();
      fctx.arc(im.x, im.y, board.splashRadius * C * (0.3 + 0.7 * k), 0, TAU);
      fctx.stroke();
    }

    for (const s of board.shots) {
      const color = TEAMS[s.team].bright;
      fctx.lineCap = 'round';
      fctx.strokeStyle = color;
      fctx.globalAlpha = 0.45;
      fctx.lineWidth = 6;
      fctx.beginPath();
      fctx.moveTo(s.x - s.vx * 0.035, s.y - s.vy * 0.035);
      fctx.lineTo(s.x, s.y);
      fctx.stroke();
      fctx.globalAlpha = 1;
      fctx.beginPath();
      fctx.arc(s.x, s.y, 6, 0, TAU);
      fctx.fillStyle = color;
      fctx.fill();
      fctx.lineWidth = 2;
      fctx.strokeStyle = '#fff';
      fctx.stroke();
    }

    for (let i = 0; i < board.teamCount; i++) {
      if (board.alive[i]) { drawCannon(i); drawLabels(i); }
    }
  }

  function drawCannon(i) {
    const c = board.cannon[i], a = board.angle[i], bright = TEAMS[i].bright, f = board.flash[i];
    fctx.save();
    fctx.translate(c.x, c.y);
    if (f.t > 0) {
      fctx.globalAlpha = f.t;
      fctx.strokeStyle = f.kind === 'x2' ? X2_COLOR : R_COLOR;
      fctx.lineWidth = 3 + 7 * f.t;
      fctx.beginPath();
      fctx.arc(0, 0, 24 + (1 - f.t) * 36, 0, TAU);
      fctx.stroke();
      fctx.globalAlpha = 1;
    }
    fctx.rotate(a);
    fctx.lineWidth = 3;
    fctx.strokeStyle = 'rgba(0,0,0,0.65)';
    fctx.fillStyle = bright;
    fctx.beginPath(); fctx.rect(6, -7, 34, 14); fctx.fill(); fctx.stroke();
    fctx.fillStyle = 'rgba(255,255,255,0.92)';
    fctx.fillRect(30, -6, 10, 12);
    fctx.fillStyle = bright;
    fctx.beginPath(); fctx.arc(0, 0, 20, 0, TAU); fctx.fill(); fctx.stroke();
    fctx.lineWidth = 2;
    fctx.strokeStyle = 'rgba(0,0,0,0.55)';
    for (let k = 0; k < 6; k++) {
      const s = (k / 6) * TAU;
      fctx.beginPath(); fctx.moveTo(0, 0); fctx.lineTo(Math.cos(s) * 17, Math.sin(s) * 17); fctx.stroke();
    }
    fctx.fillStyle = 'rgba(0,0,0,0.75)';
    fctx.beginPath(); fctx.arc(0, 0, 3, 0, TAU); fctx.fill();
    fctx.restore();
  }

  function drawLabels(i) {
    const c = board.cannon[i];
    fctx.textAlign = 'center';
    fctx.textBaseline = 'middle';
    fctx.lineJoin = 'round';

    // the number: current multiplier, or shots still to fire while releasing
    const firing = board.queued[i] > 0;
    const num = String(firing ? board.queued[i] : board.mult[i]);
    fctx.font = `900 ${num.length >= 3 ? 50 : 64}px system-ui, sans-serif`;
    fctx.lineWidth = 6;
    fctx.strokeStyle = 'rgba(0,0,0,0.35)';
    fctx.strokeText(num, c.x, c.y + 70);
    fctx.fillStyle = firing ? '#ff6ab8' : 'rgba(255,255,255,0.82)';
    fctx.fillText(num, c.x, c.y + 70);

    // the name, shrunk to fit inside the block
    let size = 24;
    fctx.font = `700 ${size}px system-ui, sans-serif`;
    const w = fctx.measureText(names[i]).width;
    if (w > 250) {
      size = Math.max(11, Math.floor((size * 250) / w));
      fctx.font = `700 ${size}px system-ui, sans-serif`;
    }
    fctx.lineWidth = 5;
    fctx.strokeStyle = 'rgba(0,0,0,0.85)';
    fctx.strokeText(names[i], c.x, c.y - 44);
    fctx.fillStyle = '#fff';
    fctx.fillText(names[i], c.x, c.y - 44);
  }

  // ---------------------------------------------------------------- leaderboard, clock, winner
  function fmtTime(sec) {
    const s = Math.floor(sec);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  function updateClock() {
    $('clock').textContent = fmtTime(board.time);
    $('blast').textContent = board.splashRadius.toFixed(1);
  }

  function updateLeaderboard() {
    const total = board.owner.length;
    const order = TEAMS.map((_, i) => i).sort((a, b) => {
      if (board.alive[a] !== board.alive[b]) return board.alive[a] ? -1 : 1;
      return board.count[b] - board.count[a];
    });
    const rows = order.map((i, rank) => {
      const li = document.createElement('li');
      li.className = 'lb-row' + (board.alive[i] ? '' : ' out');
      const r = document.createElement('span'); r.className = 'lb-rank'; r.textContent = rank + 1;
      const sw = document.createElement('span'); sw.className = 'lb-sw'; sw.style.background = TEAMS[i].tile;
      const nm = document.createElement('span'); nm.className = 'lb-name'; nm.textContent = names[i]; nm.title = names[i];
      const n = document.createElement('span'); n.className = 'lb-n';
      n.textContent = board.alive[i] ? `${board.count[i]} · ${((board.count[i] / total) * 100).toFixed(1)}%` : 'out';
      li.append(r, sw, nm, n);
      return li;
    });
    $('lbList').replaceChildren(...rows);
  }

  function inkFor(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.55 ? '#111' : '#fff';
  }

  function showWinner() {
    const w = board.winner;
    if (w < 0 || $('game').hidden) return;
    const card = $('winCard');
    card.style.setProperty('--tile', TEAMS[w].tile);
    card.style.setProperty('--ink', inkFor(TEAMS[w].tile));
    $('winName').textContent = names[w];
    $('winSub').textContent = `Owns the whole board after ${fmtTime(board.time)}`;
    $('winOverlay').hidden = false;
    $('againBtn').focus();
  }

  // handy for poking at the game from the console
  window.plinko = { board, peg, music };
})();
