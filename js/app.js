(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const DT = 1 / 60;            // fixed simulation step, seconds
  const FRAME_BUDGET_MS = 12;   // stop simulating for this frame after this long, so fast-forward never freezes the page
  const STORE_KEY = 'plinko-conquest-names';
  const SPEED_KEY = 'plinko-conquest-speed';
  const GRID_KEY = 'plinko-conquest-grid';
  const LINEUP_KEY = 'plinko-conquest-lineup';
  const SLOTS = 24;                 // the most colours any grid uses (6x4)
  const ANIMATED_REPAINT_MS = 80;   // how often the squares of Rainbow / Monochrome are repainted
  const DEFAULT_TRACK = 'assets/keep-it-real.mp3';
  const X2_COLOR = '#8cff00';
  const R_COLOR = '#ff0a84';

  // Created afresh for every game, because the grid size decides how many colours play.
  let board = null;
  let peg = null;

  const gctx = $('gridCanvas').getContext('2d', { alpha: false });
  const fctx = $('fxCanvas').getContext('2d');
  const pctx = $('pegCanvas').getContext('2d', { alpha: false });

  let gridKey = '6x4';
  let lineup = DEFAULT_LINEUP.slice();   // colour id for each of the 24 slots; smaller grids use the first few
  let entries = [];                      // palette entries in play this game
  let colors = [];                       // their current colours (animated ones change every frame)
  let animated = [];                     // which teams are Rainbow / Monochrome
  let gameStart = 0;
  let lastAnimatedPaint = 0;
  let names = [];
  let running = false;
  let paused = false;
  let speed = 1;
  let acc = 0;
  let lastFrame = 0;
  let lastLeaderboard = 0;
  let winTimer = null;
  let winShown = false;

  // ---------------------------------------------------------------- music
  // Three sources: the bundled default track, a file the user picks, or nothing.
  const music = new Audio(DEFAULT_TRACK);
  music.loop = true;
  music.preload = 'auto';
  music.volume = Number($('volume').value);
  let musicUrl = null;      // object URL for a user-chosen file
  let musicMode = 'default'; // 'default' | 'custom' | 'none'

  function releaseCustomFile() {
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    musicUrl = null;
    $('musicFile').value = '';
  }

  function setMusicMode(mode, label) {
    musicMode = mode;
    $('musicDefault').classList.toggle('on', mode === 'default');
    $('musicFileLabel').classList.toggle('on', mode === 'custom');
    $('musicNone').classList.toggle('on', mode === 'none');
    $('musicName').textContent = mode === 'none' ? 'The game will be silent.' : label;
  }
  setMusicMode('default', 'Keep It Real (Nick Petrov)');

  $('musicDefault').addEventListener('click', () => {
    releaseCustomFile();
    music.src = DEFAULT_TRACK;
    setMusicMode('default', 'Keep It Real (Nick Petrov)');
  });

  $('musicFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    musicUrl = URL.createObjectURL(file);
    music.src = musicUrl;
    setMusicMode('custom', file.name);
  });

  $('musicNone').addEventListener('click', () => {
    music.pause();
    releaseCustomFile();
    setMusicMode('none');
  });

  $('volume').addEventListener('input', (e) => { music.volume = Number(e.target.value); });
  $('muteBtn').addEventListener('click', () => {
    music.muted = !music.muted;
    $('muteBtn').textContent = music.muted ? 'Sound off' : 'Sound on';
    $('muteBtn').setAttribute('aria-pressed', String(music.muted));
  });

  function playMusic(restart) {
    if (musicMode === 'none') return;
    if (restart) music.currentTime = 0;
    music.play().catch(() => {});
  }

  // ---------------------------------------------------------------- setup screen
  const slots = [];   // { field, chip, select, input } for each of the 24 possible squares

  const readJson = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; } };
  const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* private mode */ } };
  const storeNames = () => writeJson(STORE_KEY, slots.map((sl) => sl.input.value));
  const storeLineup = () => writeJson(LINEUP_KEY, lineup);
  const teamsInGrid = (key) => GRID_PRESETS[key].blocksX * GRID_PRESETS[key].blocksY;

  function refreshSlot(i) {
    const entry = PALETTE_BY_ID[lineup[i]];
    slots[i].chip.style.background = entry.css;
    slots[i].select.value = entry.id;
    slots[i].input.placeholder = entry.label;
    slots[i].input.setAttribute('aria-label', `Name for square ${i + 1} (${entry.label})`);
  }

  // Every colour can be used once. Picking one that another square already has swaps the two.
  function assignColor(slot, id) {
    const other = lineup.indexOf(id);
    if (other >= 0 && other !== slot) {
      lineup[other] = lineup[slot];
      refreshSlot(other);
    }
    lineup[slot] = id;
    refreshSlot(slot);
    storeLineup();
  }

  (function buildTeamGrid() {
    const storedNames = readJson(STORE_KEY) || [];
    const storedLineup = readJson(LINEUP_KEY);
    if (Array.isArray(storedLineup) && storedLineup.length === SLOTS
        && storedLineup.every((id) => PALETTE_BY_ID[id]) && new Set(storedLineup).size === SLOTS) {
      lineup = storedLineup;
    }
    for (let i = 0; i < SLOTS; i++) {
      const field = document.createElement('div');
      field.className = 'team-field';
      const chip = document.createElement('span');
      chip.className = 'chip';
      const select = document.createElement('select');
      select.setAttribute('aria-label', `Colour for square ${i + 1}`);
      select.title = 'Change colour';
      for (const p of PALETTE) select.add(new Option(p.label, p.id));
      select.addEventListener('change', () => assignColor(i, select.value));
      chip.append(select);
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 24;
      input.value = typeof storedNames[i] === 'string' ? storedNames[i] : '';
      input.addEventListener('input', storeNames);
      field.append(chip, input);
      $('teamGrid').appendChild(field);
      slots.push({ field, chip, select, input });
      refreshSlot(i);
    }
  })();

  const visibleSlots = () => slots.slice(0, teamsInGrid(gridKey));

  function setGrid(key) {
    gridKey = key;
    const preset = GRID_PRESETS[key];
    $('teamGrid').dataset.cols = preset.blocksX;
    $('teamGrid').style.setProperty('--cols', preset.blocksX);
    slots.forEach((sl, i) => { sl.field.hidden = i >= teamsInGrid(key); });
    for (const b of $('gridSeg').children) b.classList.toggle('on', b.dataset.grid === key);
    $('gridNote').textContent = `${teamsInGrid(key)} colours, ${preset.blocksX * preset.blockW} × ${preset.blocksY * preset.blockH} small squares`;
    writeJson(GRID_KEY, key);
  }
  $('gridSeg').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-grid]');
    if (btn) setGrid(btn.dataset.grid);
  });
  const storedGrid = readJson(GRID_KEY);
  setGrid(GRID_PRESETS[storedGrid] ? storedGrid : '6x4');

  try {
    const saved = localStorage.getItem(SPEED_KEY);
    if (saved && [...$('startSpeed').options].some((o) => o.value === saved)) $('startSpeed').value = saved;
  } catch (_) { /* private mode */ }
  $('startSpeed').addEventListener('change', () => {
    try { localStorage.setItem(SPEED_KEY, $('startSpeed').value); } catch (_) { /* private mode */ }
  });

  $('clearNames').addEventListener('click', () => {
    visibleSlots().forEach((sl) => { sl.input.value = ''; });
    storeNames();
  });

  $('shuffleNames').addEventListener('click', () => {
    const vis = visibleSlots();
    const vals = vis.map((sl) => sl.input.value);
    for (let i = vals.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [vals[i], vals[j]] = [vals[j], vals[i]];
    }
    vis.forEach((sl, i) => { sl.input.value = vals[i]; });
    storeNames();
  });

  $('applyPaste').addEventListener('click', () => {
    const lines = $('pasteBox').value.split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
    visibleSlots().forEach((sl, i) => { sl.input.value = (lines[i] || '').slice(0, 24); });
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
  function refreshColors(now) {
    const t = (now - gameStart) / 1000;
    for (const i of animated) colors[i] = resolveColor(entries[i], t);
  }

  function startGame() {
    const n = teamsInGrid(gridKey);
    entries = lineup.slice(0, n).map((id) => PALETTE_BY_ID[id]);
    colors = entries.map((e) => resolveColor(e, 0));
    animated = entries.map((e, i) => (isAnimated(e) ? i : -1)).filter((i) => i >= 0);
    names = visibleSlots().map((sl, i) => sl.input.value.trim() || entries[i].label);

    board = new Board({ grid: gridKey });
    peg = new Pegboard(n);
    board.onEliminate = (team) => toast(`${names[team]} is out`, colors[team].ball);
    board.onCannonCaptured = (cannon, from, to) => {
      toast(`${names[to]} captured a cannon from ${names[from]}`, colors[to].ball);
    };
    peg.onLand = (cannon, kind) => {
      if (kind === 'x2') board.doubleMultiplier(cannon);
      else board.release(cannon);
    };

    gameStart = performance.now();
    lastAnimatedPaint = gameStart;
    paintAllCells();
    setSpeed(Number($('startSpeed').value));
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

  function setSpeed(v) {
    speed = v;
    for (const b of $('speedSeg').children) b.classList.toggle('on', Number(b.dataset.speed) === v);
  }
  $('speedSeg').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-speed]');
    if (btn) setSpeed(Number(btn.dataset.speed));
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
      const started = performance.now();
      while (acc >= DT) {
        if (performance.now() - started > FRAME_BUDGET_MS) { acc = 0; break; } // fell behind: drop the backlog
        peg.step(DT);
        board.step(DT);
        acc -= DT;
      }
    }

    if (board.winner >= 0 && !winShown) {
      winShown = true;
      winTimer = setTimeout(showWinner, 1200);
    }

    refreshColors(now);
    for (const idx of board.drainDirty()) paintCell(idx);
    if (animated.length && now - lastAnimatedPaint > ANIMATED_REPAINT_MS) {
      lastAnimatedPaint = now;
      repaintAnimatedCells();
    }
    drawFx();
    peg.draw(pctx, (i) => {
      const owner = board.ownerOf(i);
      return { fill: colors[owner].ball, ring: owner !== i };
    });

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

  // The gap between squares is 1px, or 2px when the squares are big.
  function paintCell(idx) {
    const x = idx % board.cols, y = (idx / board.cols) | 0;
    const x0 = Math.round(x * board.cellW), x1 = Math.round((x + 1) * board.cellW);
    const y0 = Math.round(y * board.cellH), y1 = Math.round((y + 1) * board.cellH);
    const gap = board.cellW > 30 ? 2 : 1;
    gctx.fillStyle = colors[board.owner[idx]].tile;
    gctx.fillRect(x0 + gap, y0 + gap, x1 - x0 - gap, y1 - y0 - gap);
  }

  // Rainbow and Monochrome squares change colour continuously, so they are repainted a few times a second.
  function repaintAnimatedCells() {
    const isAnimatedTeam = new Set(animated);
    for (let i = 0; i < board.owner.length; i++) if (isAnimatedTeam.has(board.owner[i])) paintCell(i);
  }

  // ---------------------------------------------------------------- fx layer: shots, impacts, cannons
  function drawFx() {
    fctx.clearRect(0, 0, board.widthPx, board.heightPx);

    for (const im of board.impacts) {
      const k = im.t / 0.3;
      fctx.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.7})`;
      fctx.lineWidth = 2;
      fctx.beginPath();
      fctx.arc(im.x, im.y, Math.min(board.cellW, 30) * (0.5 + 1.6 * k), 0, TAU);
      fctx.stroke();
    }

    for (const s of board.shots) {
      const color = colors[s.team].shot, r = 7 * board.scale;
      fctx.lineCap = 'round';
      fctx.strokeStyle = color;
      fctx.globalAlpha = 0.5;
      fctx.lineWidth = r * 1.4;
      fctx.beginPath();
      fctx.moveTo(s.x - s.vx * 0.05, s.y - s.vy * 0.05);
      fctx.lineTo(s.x, s.y);
      fctx.stroke();
      fctx.globalAlpha = 1;
      fctx.beginPath();
      fctx.arc(s.x, s.y, r, 0, TAU);
      fctx.fillStyle = color;
      fctx.fill();
      fctx.lineWidth = 2;
      fctx.strokeStyle = '#fff';
      fctx.stroke();
    }

    for (let i = 0; i < board.teamCount; i++) { drawCannon(i); drawLabels(i); }
  }

  function drawCannon(i) {
    const c = board.cannon[i], a = board.angle, owner = board.ownerOf(i), bright = colors[owner].bright, f = board.flash[i];
    const captured = owner !== i;
    fctx.save();
    fctx.translate(c.x, c.y);
    fctx.scale(board.scale, board.scale);   // bigger blocks (fewer colours) get bigger cannons
    if (f.t > 0) {
      fctx.globalAlpha = f.t;
      fctx.strokeStyle = f.kind === 'x2' ? X2_COLOR : f.kind === 'R' ? R_COLOR : '#fff';
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
    if (captured) { // a white ring marks a cannon that has changed hands
      fctx.strokeStyle = '#fff';
      fctx.lineWidth = 3;
      fctx.beginPath(); fctx.arc(0, 0, 23, 0, TAU); fctx.stroke();
    }
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
    const c = board.cannon[i], name = names[board.ownerOf(i)], S = board.scale;
    fctx.textAlign = 'center';
    fctx.textBaseline = 'middle';
    fctx.lineJoin = 'round';

    // the number: current multiplier, or shots still to fire while releasing
    const firing = board.queued[i] > 0;
    const num = String(firing ? board.queued[i] : board.mult[i]);
    fctx.font = `900 ${(num.length >= 3 ? 50 : 64) * S}px system-ui, sans-serif`;
    fctx.lineWidth = 7 * S;
    fctx.strokeStyle = 'rgba(0,0,0,0.55)';
    fctx.strokeText(num, c.x, c.y + 70 * S);
    fctx.fillStyle = firing ? '#ff6ab8' : 'rgba(255,255,255,0.82)';
    fctx.fillText(num, c.x, c.y + 70 * S);

    // the name, shrunk to fit inside the block
    let size = 24 * S;
    fctx.font = `700 ${size}px system-ui, sans-serif`;
    const w = fctx.measureText(name).width;
    if (w > 250 * S) {
      size = Math.max(11, Math.floor((size * 250 * S) / w));
      fctx.font = `700 ${size}px system-ui, sans-serif`;
    }
    fctx.lineWidth = 5 * S;
    fctx.strokeStyle = 'rgba(0,0,0,0.85)';
    fctx.strokeText(name, c.x, c.y - 44 * S);
    fctx.fillStyle = '#fff';
    fctx.fillText(name, c.x, c.y - 44 * S);
  }

  // ---------------------------------------------------------------- leaderboard, clock, winner
  function fmtTime(sec) {
    const s = Math.floor(sec);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    const mmss = `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
    return h ? `${h}:${mmss}` : mmss;
  }
  function updateClock() {
    $('clock').textContent = fmtTime(board.time);
  }

  function updateLeaderboard() {
    const total = board.owner.length;
    const cannons = board.cannonCounts();
    const order = entries.map((_, i) => i).sort((a, b) => {
      if (board.alive[a] !== board.alive[b]) return board.alive[a] ? -1 : 1;
      return board.count[b] - board.count[a] || cannons[b] - cannons[a];
    });
    const rows = order.map((i, rank) => {
      const li = document.createElement('li');
      li.className = 'lb-row' + (board.alive[i] ? '' : ' out');
      const r = document.createElement('span'); r.className = 'lb-rank'; r.textContent = rank + 1;
      const sw = document.createElement('span'); sw.className = 'lb-sw'; sw.style.background = entries[i].css;
      const nm = document.createElement('span'); nm.className = 'lb-name'; nm.textContent = names[i]; nm.title = names[i];
      const cn = document.createElement('span'); cn.className = 'lb-c';
      cn.textContent = board.alive[i] ? `◎${cannons[i]}` : '';
      cn.title = `${cannons[i]} cannon${cannons[i] === 1 ? '' : 's'}`;
      const n = document.createElement('span'); n.className = 'lb-n';
      n.textContent = board.alive[i] ? `${board.count[i]} · ${((board.count[i] / total) * 100).toFixed(1)}%` : 'out';
      li.append(r, sw, nm, cn, n);
      return li;
    });
    $('lbList').replaceChildren(...rows);
  }

  // white text on the winner's card, or black on the pale solid colours
  function inkFor(entry) {
    if (entry.kind !== 'solid') return '#fff';
    const n = parseInt(entry.tile.slice(1), 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.55 ? '#111' : '#fff';
  }

  function showWinner() {
    const w = board.winner;
    if (w < 0 || $('game').hidden) return;
    const card = $('winCard');
    card.style.setProperty('--tile', entries[w].css);
    card.style.setProperty('--ink', inkFor(entries[w]));
    $('winName').textContent = names[w];
    $('winSub').textContent = `Owns the whole board after ${fmtTime(board.time)}`;
    $('winOverlay').hidden = false;
    $('againBtn').focus();
  }

  // handy for poking at the game from the console
  window.plinko = { get board() { return board; }, get peg() { return peg; }, music };
})();
