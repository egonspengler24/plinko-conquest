// The plinko board on the right-hand side, powered by Matter.js.
// One ball per team. A ball that reaches the bottom bar triggers x2 (left half) or R (right half)
// for its team and is dropped back in at the top.

const PEG_CFG = {
  width: 320,
  height: 1120,
  ballR: 11,
  pegR: 18,
  rowGap: 72,
  firstRowY: 100,
  rows: 13,
  barH: 60,
  substeps: 2,        // physics updates per game tick, to stop fast balls tunnelling through pegs
};

class Pegboard {
  constructor(teamCount, cfg = {}) {
    Object.assign(this, PEG_CFG, cfg);
    this.teamCount = teamCount;
    this.barTop = this.height - this.barH;
    this.onLand = null;              // (team, 'x2' | 'R') => void
    this.barFlash = { x2: 0, R: 0 };
    this.engine = Matter.Engine.create({ gravity: { x: 0, y: 1, scale: 0.001 } });
    this.buildStatics();
    this.balls = [];
    this.reset();
  }

  buildStatics() {
    const { Bodies, Body, Composite } = Matter;
    const W = this.width, statics = [];
    this.pegs = [];
    for (let r = 0; r < this.rows; r++) {
      const y = this.firstRowY + r * this.rowGap;
      const xs = r % 2 === 0 ? [46, 122, 198, 274] : [84, 160, 236];
      for (const x of xs) this.pegs.push({ x, y });
    }
    for (const p of this.pegs) statics.push(Bodies.circle(p.x, p.y, this.pegR, { isStatic: true, restitution: 0.6, friction: 0 }));
    // walls run far above the board so balls queued above the top are contained
    statics.push(Bodies.rectangle(-30, this.height / 2 - 2500, 60, this.height + 5000, { isStatic: true }));
    statics.push(Bodies.rectangle(W + 30, this.height / 2 - 2500, 60, this.height + 5000, { isStatic: true }));
    // triangular divider that splits the bottom bar into x2 | R
    this.divider = Bodies.polygon(W / 2, this.barTop - 6, 3, 30, { isStatic: true, restitution: 0.3, friction: 0 });
    Body.rotate(this.divider, -Math.PI / 2);
    statics.push(this.divider);
    Composite.add(this.engine.world, statics);
  }

  reset() {
    const { Bodies, Composite, Body } = Matter;
    for (const b of this.balls) if (b) Composite.remove(this.engine.world, b);
    this.balls = [];
    for (let i = 0; i < this.teamCount; i++) {
      const ball = Bodies.circle(0, 0, this.ballR, {
        restitution: 0.55, friction: 0.01, frictionAir: 0.002, density: 0.002,
      });
      ball.team = i;
      ball.stillSteps = 0;
      this.balls.push(ball);
      this.respawn(ball, -20 - i * 55);
      Composite.add(this.engine.world, ball);
    }
    this.barFlash = { x2: 0, R: 0 };
  }

  respawn(ball, y = -30 - Math.random() * 40) {
    const { Body } = Matter;
    Body.setPosition(ball, { x: 30 + Math.random() * (this.width - 60), y });
    Body.setVelocity(ball, { x: (Math.random() - 0.5) * 2, y: 0 });
    Body.setAngularVelocity(ball, 0);
    ball.stillSteps = 0;
  }

  remove(team) {
    const b = this.balls[team];
    if (!b) return;
    Matter.Composite.remove(this.engine.world, b);
    this.balls[team] = null;
  }

  step(dt) {
    const { Engine, Body } = Matter;
    for (let s = 0; s < this.substeps; s++) Engine.update(this.engine, (dt * 1000) / this.substeps);
    for (const k of ['x2', 'R']) if (this.barFlash[k] > 0) this.barFlash[k] = Math.max(0, this.barFlash[k] - dt * 4);
    for (const ball of this.balls) {
      if (!ball) continue;
      const { x, y } = ball.position;
      if (y + this.ballR >= this.barTop - 2) {
        const kind = x < this.width / 2 ? 'x2' : 'R';
        this.barFlash[kind] = 1;
        if (this.onLand) this.onLand(ball.team, kind);
        this.respawn(ball);
        continue;
      }
      // nudge any ball that has come to rest balanced on a peg or on another ball
      if (ball.speed < 0.3 && y > 0) ball.stillSteps++; else ball.stillSteps = 0;
      if (ball.stillSteps > 60) {
        Body.setVelocity(ball, { x: (Math.random() - 0.5) * 5, y: -3 });
        ball.stillSteps = 0;
      }
    }
  }

  // Draws the board. `colorOf(team)` supplies the ball colour.
  draw(ctx, colorOf, mult) {
    const W = this.width, H = this.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#3d3d3d';
    for (const p of this.pegs) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.pegR, 0, Math.PI * 2);
      ctx.fill();
    }
    // bottom bar: x2 | R
    const mid = W / 2;
    this.drawBarHalf(ctx, 0, mid, '#8cff00', '#ffffff', 'x2', this.barFlash.x2);
    this.drawBarHalf(ctx, mid, W, '#ff0a84', '#ffffff', 'R', this.barFlash.R);
    // divider triangle and wheel
    ctx.fillStyle = '#555';
    ctx.beginPath();
    this.divider.vertices.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
    ctx.closePath();
    ctx.fill();
    this.drawWheel(ctx, mid, this.barTop + this.barH / 2 + 4, 22);
    // balls
    for (const ball of this.balls) {
      if (!ball || ball.position.y < -this.ballR) continue;
      ctx.beginPath();
      ctx.arc(ball.position.x, ball.position.y, this.ballR, 0, Math.PI * 2);
      ctx.fillStyle = colorOf(ball.team);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.stroke();
    }
  }

  drawBarHalf(ctx, x0, x1, fill, flashFill, label, flash) {
    const y = this.barTop, h = this.barH;
    ctx.fillStyle = fill;
    ctx.fillRect(x0, y, x1 - x0, h);
    if (flash > 0) {
      ctx.globalAlpha = flash * 0.7;
      ctx.fillStyle = flashFill;
      ctx.fillRect(x0, y, x1 - x0, h);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#000';
    ctx.font = '900 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, (x0 + x1) / 2 + (label === 'x2' ? -22 : 22), y + h / 2 + 2);
  }

  drawWheel(ctx, cx, cy, r) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#d8d8d8';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r - 4, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4)); ctx.stroke();
    }
    ctx.restore();
  }
}
