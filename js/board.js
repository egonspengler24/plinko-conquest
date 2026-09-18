// Pure game logic for the territory grid, cannons and shots. No DOM access, so it can be tested in Node.

const BOARD_CFG = {
  cols: 120,          // 6 blocks x 20 cells
  rows: 80,           // 4 blocks x 20 cells
  blocksX: 6,
  blocksY: 4,
  cellPx: 14,
  spinRate: 1.8,      // cannon rotation, radians per second (all cannons identical)
  shotSpeed: 780,     // px per second
  shotInterval: 0.07, // seconds between shots when releasing a stack
  shotGrace: 28,      // px a shot ignores foreign squares after leaving the cannon
  splashBase: 4,      // cells; each impact captures a ragged blob around this radius
  splashMax: 20,
  escalateAfter: 30,  // seconds of play before splashes start to grow, so the endgame always finishes
  escalatePerMin: 6,  // cells of extra splash radius per minute after that
  shotLife: 8,        // seconds before a shot gives up
};

class Board {
  constructor(cfg = {}) {
    Object.assign(this, BOARD_CFG, cfg);
    this.teamCount = this.blocksX * this.blocksY;
    this.widthPx = this.cols * this.cellPx;
    this.heightPx = this.rows * this.cellPx;
    this.owner = new Uint8Array(this.cols * this.rows);
    this.onEliminate = null; // (team) => void
    this.onImpact = null;    // ({x, y, team, cells}) => void
    this.reset();
  }

  reset() {
    const n = this.teamCount;
    const bw = this.cols / this.blocksX, bh = this.rows / this.blocksY;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        this.owner[y * this.cols + x] = Math.floor(y / bh) * this.blocksX + Math.floor(x / bw);
      }
    }
    this.count = new Array(n).fill(bw * bh);
    this.mult = new Array(n).fill(1);
    this.queued = new Array(n).fill(0);
    this.cool = new Array(n).fill(0);
    this.angle = Array.from({ length: n }, () => Math.random() * Math.PI * 2);
    this.alive = new Array(n).fill(true);
    this.flash = Array.from({ length: n }, () => ({ kind: null, t: 0 }));
    this.cannon = Array.from({ length: n }, (_, i) => ({
      x: ((i % this.blocksX) * bw + bw / 2) * this.cellPx,
      y: (Math.floor(i / this.blocksX) * bh + bh / 2) * this.cellPx,
    }));
    this.shots = [];
    this.dirty = [];      // cell indices changed since the renderer last drained
    this.impacts = [];    // recent impact effects for the renderer
    this.aliveCount = n;
    this.winner = -1;
    this.time = 0;
    this.splashRadius = this.splashBase;
  }

  // --- ball events from the pegboard -------------------------------------------------

  doubleMultiplier(team) {
    if (!this.alive[team] || this.winner >= 0) return;
    this.mult[team] *= 2;
    this.flash[team] = { kind: 'x2', t: 1 };
  }

  release(team) {
    if (!this.alive[team] || this.winner >= 0) return;
    this.queued[team] += this.mult[team];
    this.mult[team] = 1;
    this.flash[team] = { kind: 'R', t: 1 };
  }

  // --- simulation --------------------------------------------------------------------

  step(dt) {
    if (this.winner < 0) this.time += dt;
    const extra = Math.max(0, (this.time - this.escalateAfter) / 60) * this.escalatePerMin;
    this.splashRadius = Math.min(this.splashMax, this.splashBase + extra);
    for (let i = 0; i < this.teamCount; i++) {
      if (!this.alive[i]) continue;
      this.angle[i] = (this.angle[i] + this.spinRate * dt) % (Math.PI * 2);
      if (this.flash[i].t > 0) this.flash[i].t = Math.max(0, this.flash[i].t - dt * 3);
      if (this.cool[i] > 0) this.cool[i] -= dt;
      while (this.queued[i] > 0 && this.cool[i] <= 0) {
        this.fire(i);
        this.queued[i]--;
        this.cool[i] += this.shotInterval;
      }
      if (this.queued[i] === 0 && this.cool[i] < 0) this.cool[i] = 0;
    }
    this.moveShots(dt);
    for (const im of this.impacts) im.t += dt;
    this.impacts = this.impacts.filter((im) => im.t < 0.4);
  }

  fire(team) {
    const a = this.angle[team];
    const c = this.cannon[team];
    this.shots.push({
      team,
      x: c.x, y: c.y,
      vx: Math.cos(a) * this.shotSpeed,
      vy: Math.sin(a) * this.shotSpeed,
      travelled: 0,
      age: 0,
    });
  }

  moveShots(dt) {
    const survivors = [];
    for (const s of this.shots) {
      if (!this.alive[s.team]) continue;
      s.age += dt;
      const dist = this.shotSpeed * dt;
      const sub = Math.ceil(dist / (this.cellPx / 2));
      const sx = (s.vx * dt) / sub, sy = (s.vy * dt) / sub;
      let hit = false;
      for (let k = 0; k < sub && !hit; k++) {
        s.x += sx; s.y += sy;
        s.travelled += dist / sub;
        // bounce off the outer walls so a shot is never wasted
        if (s.x < 0) { s.x = -s.x; s.vx = -s.vx; }
        else if (s.x >= this.widthPx) { s.x = 2 * this.widthPx - s.x - 0.01; s.vx = -s.vx; }
        if (s.y < 0) { s.y = -s.y; s.vy = -s.vy; }
        else if (s.y >= this.heightPx) { s.y = 2 * this.heightPx - s.y - 0.01; s.vy = -s.vy; }
        if (s.travelled < this.shotGrace) continue;
        const cx = Math.floor(s.x / this.cellPx), cy = Math.floor(s.y / this.cellPx);
        if (this.owner[cy * this.cols + cx] !== s.team) {
          this.capture(cx, cy, s.team);
          hit = true;
        }
      }
      if (!hit && s.age < this.shotLife && this.winner < 0) survivors.push(s);
    }
    this.shots = survivors;
  }

  capture(cx, cy, team) {
    const R = this.splashRadius, reach = Math.ceil(R + 1);
    const changed = [];
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
        const thr = R - 0.6 + Math.random() * 1.2;
        if (dx * dx + dy * dy > thr * thr) continue;
        const idx = y * this.cols + x;
        const prev = this.owner[idx];
        if (prev === team) continue;
        this.owner[idx] = team;
        this.count[prev]--;
        this.count[team]++;
        this.dirty.push(idx);
        changed.push(prev);
      }
    }
    this.impacts.push({ x: (cx + 0.5) * this.cellPx, y: (cy + 0.5) * this.cellPx, team, t: 0 });
    if (this.onImpact) this.onImpact({ x: cx, y: cy, team });
    for (const t of new Set(changed)) {
      if (this.alive[t] && this.count[t] <= 0) this.eliminate(t);
    }
  }

  eliminate(team) {
    this.alive[team] = false;
    this.aliveCount--;
    this.queued[team] = 0;
    if (this.onEliminate) this.onEliminate(team);
    if (this.aliveCount === 1) this.winner = this.alive.indexOf(true);
  }

  drainDirty() {
    const d = this.dirty;
    this.dirty = [];
    return d;
  }
}

if (typeof module !== 'undefined') module.exports = { Board, BOARD_CFG };
