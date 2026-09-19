// Pure game logic for the territory grid, cannons and shots. No DOM access, so it can be tested in Node.
//
// Rules (matched to the reference video):
//  - There is one cannon per colour, each fixed on one square, and each with its own plinko ball and its own
//    number. All cannons spin at the same constant rate, in sync.
//  - A cannon belongs to whichever colour owns the square underneath it. Capture that square and the
//    cannon (with its built-up number) becomes yours. Cannons are never removed; they keep circling and firing.
//  - x2 doubles a cannon's number; R fires that many shots, then the number resets to 1.
//  - A burst leaves along the barrel's current direction; each shot captures exactly ONE square:
//    the first square it meets that isn't its own colour.
//  - The board wraps around: a shot leaving one edge re-enters from the opposite edge, so colours in the
//    middle are no more exposed to fire than colours on the edge.
//  - A colour with no squares left is out. The last colour standing wins.
//
// "team" always means a colour (the original owner of block i); "cannon" is an index too,
// where cannon i starts on team i's block.

// Grid presets: how many blocks (one per colour), and how many small squares each block holds.
// Every block holds about 13x13 squares, so games last about as long whichever grid you pick; the
// small squares just get bigger on screen when there are fewer blocks. The board is always
// 1680x1120 px, so 4x3 squares come out very slightly wider than tall.
const GRID_PRESETS = {
  '6x4': { blocksX: 6, blocksY: 4, blockW: 13, blockH: 13 }, // 24 colours, 78 x 52 squares
  '4x3': { blocksX: 4, blocksY: 3, blockW: 13, blockH: 12 }, // 12 colours, 52 x 36 squares
  '3x2': { blocksX: 3, blocksY: 2, blockW: 13, blockH: 13 }, //  6 colours, 39 x 26 squares
};

const BOARD_CFG = {
  grid: '6x4',
  widthPx: 1680,
  heightPx: 1120,
  spinRate: 2.1,          // radians per second, clockwise; about one turn every 3 seconds
  shotBlocksPerSec: 2.3,  // shot speed, in blocks per second (about 640 px/s on the 6x4 board)
  shotInterval: 0.02,     // seconds between shots in a burst
  shotLife: 12,           // seconds before a shot gives up
  wrapEdges: true,        // shots leave one edge and re-enter from the opposite one (false: bounce off the walls)
};

class Board {
  constructor(cfg = {}) {
    Object.assign(this, BOARD_CFG, GRID_PRESETS[cfg.grid || BOARD_CFG.grid], cfg);
    this.teamCount = this.blocksX * this.blocksY;
    this.cols = this.blocksX * this.blockW;
    this.rows = this.blocksY * this.blockH;
    this.cellW = this.widthPx / this.cols;
    this.cellH = this.heightPx / this.rows;
    const blockPx = Math.min(this.widthPx / this.blocksX, this.heightPx / this.blocksY);
    if (cfg.shotSpeed === undefined) this.shotSpeed = this.shotBlocksPerSec * blockPx; // px per second
    this.scale = Math.min(1.8, Math.max(1, blockPx / 280));  // how much the renderer enlarges cannons and text
    this.owner = new Uint8Array(this.cols * this.rows);
    this.onEliminate = null;       // (team) => void
    this.onCannonCaptured = null;  // (cannon, from, to) => void
    this.reset();
  }

  reset() {
    const n = this.teamCount;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        this.owner[y * this.cols + x] = Math.floor(y / this.blockH) * this.blocksX + Math.floor(x / this.blockW);
      }
    }
    this.count = new Array(n).fill(this.blockW * this.blockH); // squares per colour
    this.mult = new Array(n).fill(1);              // per cannon
    this.queued = new Array(n).fill(0);            // per cannon: shots still to fire
    this.cool = new Array(n).fill(0);              // per cannon
    this.alive = new Array(n).fill(true);          // per colour
    this.flash = Array.from({ length: n }, () => ({ kind: null, t: 0 })); // per cannon
    // each cannon sits centred on one square, the middle of its block
    this.cannon = Array.from({ length: n }, (_, i) => {
      const cx = (i % this.blocksX) * this.blockW + Math.floor(this.blockW / 2);
      const cy = Math.floor(i / this.blocksX) * this.blockH + Math.floor(this.blockH / 2);
      return { cx, cy, idx: cy * this.cols + cx, x: (cx + 0.5) * this.cellW, y: (cy + 0.5) * this.cellH };
    });
    this.cannonAt = new Map(this.cannon.map((c, i) => [c.idx, i]));
    this.angle = Math.random() * Math.PI * 2;      // shared by every cannon
    this.shots = [];
    this.dirty = [];      // cell indices changed since the renderer last drained
    this.impacts = [];    // recent impact effects for the renderer
    this.aliveCount = n;
    this.winner = -1;
    this.time = 0;
  }

  // The colour a cannon currently belongs to: whoever owns the square underneath it.
  ownerOf(cannon) {
    return this.owner[this.cannon[cannon].idx];
  }

  cannonCounts() {
    const c = new Array(this.teamCount).fill(0);
    for (let i = 0; i < this.teamCount; i++) c[this.ownerOf(i)]++;
    return c;
  }

  // --- ball events from the pegboard (ball i belongs to cannon i) --------------------

  doubleMultiplier(cannon) {
    if (this.winner >= 0) return;
    this.mult[cannon] *= 2;
    this.flash[cannon] = { kind: 'x2', t: 1 };
  }

  release(cannon) {
    if (this.winner >= 0) return;
    this.queued[cannon] += this.mult[cannon];
    this.mult[cannon] = 1;
    this.flash[cannon] = { kind: 'R', t: 1 };
  }

  // --- simulation --------------------------------------------------------------------

  step(dt) {
    if (this.winner < 0) this.time += dt;
    this.angle = (this.angle + this.spinRate * dt) % (Math.PI * 2);
    for (let i = 0; i < this.teamCount; i++) {
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
    if (this.impacts.length) {
      for (const im of this.impacts) im.t += dt;
      this.impacts = this.impacts.filter((im) => im.t < 0.3);
    }
  }

  // Shots take the colour of whoever owns the cannon at the moment they leave the barrel.
  fire(cannon) {
    const c = this.cannon[cannon];
    this.shots.push({
      team: this.ownerOf(cannon),
      x: c.x, y: c.y,
      vx: Math.cos(this.angle) * this.shotSpeed,
      vy: Math.sin(this.angle) * this.shotSpeed,
      age: 0,
    });
  }

  moveShots(dt) {
    if (!this.shots.length) return;
    const survivors = [];
    const sub = Math.max(1, Math.ceil((this.shotSpeed * dt) / (Math.min(this.cellW, this.cellH) / 2)));
    for (const s of this.shots) {
      if (!this.alive[s.team]) continue;
      s.age += dt;
      let hit = false;
      for (let k = 0; k < sub && !hit; k++) {
        s.x += (s.vx * dt) / sub; s.y += (s.vy * dt) / sub;
        if (this.wrapEdges) {
          if (s.x < 0) s.x += this.widthPx; else if (s.x >= this.widthPx) s.x -= this.widthPx;
          if (s.y < 0) s.y += this.heightPx; else if (s.y >= this.heightPx) s.y -= this.heightPx;
        } else {
          if (s.x < 0) { s.x = -s.x; s.vx = -s.vx; }
          else if (s.x >= this.widthPx) { s.x = 2 * this.widthPx - s.x - 0.01; s.vx = -s.vx; }
          if (s.y < 0) { s.y = -s.y; s.vy = -s.vy; }
          else if (s.y >= this.heightPx) { s.y = 2 * this.heightPx - s.y - 0.01; s.vy = -s.vy; }
        }
        const cx = Math.min(this.cols - 1, Math.floor(s.x / this.cellW));
        const cy = Math.min(this.rows - 1, Math.floor(s.y / this.cellH));
        if (this.owner[cy * this.cols + cx] !== s.team) {
          this.capture(cx, cy, s.team);
          hit = true;
        }
      }
      if (!hit && s.age < this.shotLife && this.winner < 0) survivors.push(s);
    }
    this.shots = survivors;
  }

  // One shot takes exactly one square. If a cannon sits on it, the cannon changes hands too.
  capture(cx, cy, team) {
    const idx = cy * this.cols + cx;
    const prev = this.owner[idx];
    this.owner[idx] = team;
    this.count[prev]--;
    this.count[team]++;
    this.dirty.push(idx);
    this.impacts.push({ x: (cx + 0.5) * this.cellW, y: (cy + 0.5) * this.cellH, team, t: 0 });
    const cannon = this.cannonAt.get(idx);
    if (cannon !== undefined) {
      this.flash[cannon] = { kind: 'captured', t: 1 };
      if (this.onCannonCaptured) this.onCannonCaptured(cannon, prev, team);
    }
    if (this.alive[prev] && this.count[prev] <= 0) this.eliminate(prev);
  }

  eliminate(team) {
    this.alive[team] = false;
    this.aliveCount--;
    if (this.onEliminate) this.onEliminate(team);
    if (this.aliveCount === 1) {
      this.winner = this.alive.indexOf(true);
      this.queued.fill(0);
    }
  }

  drainDirty() {
    const d = this.dirty;
    this.dirty = [];
    return d;
  }
}

if (typeof module !== 'undefined') module.exports = { Board, BOARD_CFG, GRID_PRESETS };
