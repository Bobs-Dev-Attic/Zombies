// Death sequence overlay: a dynamic, fluid sheet of blood.
// A ragged curtain bleeds down from the top of the screen while a wavy pool
// rises from the bottom; the two fronts converge until the screen is drowned.
// Surface tension between neighbouring columns, random rivulet surges and
// detached droplets keep it looking like a live fluid. The "YOU DIED" card is
// kept a clear window that blood pools on top of and drips off the bottom of.
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class DeathBlood {
  constructor(dur = 60) {
    this.canvas = document.getElementById("blood");
    this.ctx = this.canvas.getContext("2d");
    this.t = 0;
    this.dur = dur;
    this.pool = 0;         // px risen from the bottom
    this.drops = [];       // free-falling droplets
    this.splashes = [];    // splash particles thrown up on impact
    this.dialog = null;    // {l,t,r,b} of the YOU DIED card in CSS px
    this.dialogDrips = []; // hanging drips along the card's bottom edge
    this._onResize = () => this._resize();
    window.addEventListener("resize", this._onResize);
    this._resize(true);
  }

  destroy() {
    window.removeEventListener("resize", this._onResize);
    if (this.ctx) this.ctx.clearRect(0, 0, this.w, this.h);
  }

  _resize(init) {
    const w = window.innerWidth, h = window.innerHeight;
    this.w = w; this.h = h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cw = 6; // column width in px
    const n = Math.ceil(w / this.cw) + 1;
    if (init || !this.cols || this.cols.length !== n) {
      this.cols = [];
      for (let i = 0; i < n; i++) {
        this.cols.push({
          y: rnd(-34, 2),  // ragged top edge start (above screen)
          v: rnd(4, 14),   // descent speed px/s
          a: rnd(6, 22),   // acceleration
          uy: null,        // under-card front (set once it reaches the card)
          uv: rnd(10, 26),
        });
      }
    }
    if (this.dialog) this._readDialog();
  }

  // Called once the YOU DIED card is on screen so blood can interact with it.
  attachDialog() { this._readDialog(); }

  _readDialog() {
    const card = document.querySelector("#gameover .menu-card");
    if (!card) { this.dialog = null; return; }
    const r = card.getBoundingClientRect();
    this.dialog = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    this.dialogDrips = [];
    const count = Math.max(4, Math.floor(r.width / 44));
    for (let i = 0; i < count; i++) {
      this.dialogDrips.push({
        x: r.left + r.width * ((i + 0.5) / count) + rnd(-7, 7),
        len: 0, max: rnd(12, 40), v: rnd(6, 16), hang: rnd(0.3, 2.6), fall: null,
      });
    }
  }

  update(dt) {
    this.t += dt;
    const h = this.h, d = this.dialog;

    // The pool rises, accelerating so the screen is fully drowned by the end.
    const flood = clamp((this.t - 6) / (this.dur - 12), 0, 1);
    const targetPool = flood * flood * h * 1.06;
    this.pool += (targetPool - this.pool) * clamp(dt * 0.6, 0, 1);
    const poolTop = h - this.pool;

    const cols = this.cols, n = cols.length, cw = this.cw;
    for (let i = 0; i < n; i++) {
      const c = cols[i];
      c.v = Math.min(c.v + c.a * dt, 200);
      const prevY = c.y;
      // The curtain flows full-width down the WHOLE screen; the card is punched
      // out as a clear window afterwards, so the sheet above and below it is the
      // same continuous width (no separate, narrower under-card band).
      c.y = Math.min(c.y + c.v * dt, poolTop);
      // A fast front smacking the rising pool throws up a splash.
      if (prevY < poolTop && c.y >= poolTop - 0.6 && c.v > 70 && Math.random() < dt * 6) {
        this._splash(i * cw, poolTop, c.v);
      }
    }

    // Surface tension: neighbours pull together so the front reads as a fluid.
    const ys = cols.map((c) => c.y);
    for (let i = 0; i < n; i++) {
      const l = ys[i - 1] ?? ys[i], r = ys[i + 1] ?? ys[i];
      cols[i].y += ((l + r) * 0.5 - ys[i]) * 0.14;
    }

    // Occasional fast rivulets: surge a random column so a tendril races down.
    if (Math.random() < dt * 20) cols[(Math.random() * n) | 0].v += rnd(30, 95);

    // Detached droplets fall ahead of the front and splash into the pool.
    if (this.t > 0.4 && Math.random() < dt * 24 && this.drops.length < 380) {
      const i = (Math.random() * n) | 0;
      this.drops.push({ x: i * cw + rnd(-2, 2), y: cols[i].y + rnd(0, 8), v: rnd(60, 150), r: rnd(1.6, 3.8) });
    }
    for (const dp of this.drops) {
      dp.v += 320 * dt; dp.y += dp.v * dt;
      const floor = (d && dp.x >= d.l && dp.x <= d.r && dp.y < d.b) ? d.t : poolTop;
      if (dp.y >= floor) { this._splash(dp.x, floor, dp.v * 0.6); dp.dead = true; }
    }
    this.drops = this.drops.filter((dp) => !dp.dead);

    // Dialog drips: hang, elongate, release a falling blob, then re-grow.
    if (d) {
      for (const dr of this.dialogDrips) {
        if (dr.fall == null) {
          if (this.t > 2 + dr.hang) dr.len = Math.min(dr.len + dr.v * dt, dr.max);
          if (dr.len >= dr.max) { dr.fall = { y: d.b + dr.len, v: rnd(30, 70) }; dr.len = rnd(4, 8); dr.hang = rnd(1.4, 4); }
        } else {
          dr.fall.v += 300 * dt; dr.fall.y += dr.fall.v * dt;
          if (dr.fall.y >= poolTop) { this._splash(dr.x, poolTop, dr.fall.v * 0.5); dr.fall = null; }
        }
      }
    }

    // Splash droplets arc up off impacts and rain back down.
    for (const sp of this.splashes) { sp.vy += 380 * dt; sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.life -= dt; }
    this.splashes = this.splashes.filter((s) => s.life > 0);

    this._draw();
  }

  // A little burst of blood droplets kicked up where something lands.
  _splash(x, y, power) {
    if (this.splashes.length > 260) return;
    const n = 2 + ((Math.random() * 3) | 0);
    const sp = clamp(power * 0.5, 24, 150);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rnd(-1, 1);
      this.splashes.push({ x, y, vx: Math.cos(a) * sp * rnd(0.4, 1), vy: Math.sin(a) * sp * rnd(0.6, 1.15), r: rnd(1, 2.8), life: rnd(0.18, 0.5) });
    }
  }

  _draw() {
    const ctx = this.ctx, w = this.w, h = this.h;
    ctx.clearRect(0, 0, w, h);
    const cols = this.cols, n = cols.length, cw = this.cw, d = this.dialog;
    const poolTop = h - this.pool;
    const opa = clamp(0.5 + this.t / this.dur * 0.55, 0.5, 1);

    const curtain = ctx.createLinearGradient(0, 0, 0, h);
    curtain.addColorStop(0, "#2a0303");
    curtain.addColorStop(0.5, "#590a0a");
    curtain.addColorStop(1, "#7a1010");

    // ---- TOP CURTAIN ----
    ctx.save();
    ctx.globalAlpha = opa;
    ctx.fillStyle = curtain;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, cols[0].y);
    for (let i = 0; i < n; i++) ctx.lineTo(i * cw, cols[i].y);
    ctx.lineTo((n - 1) * cw, 0);
    ctx.closePath();
    ctx.fill();

    // Glossy front edge.
    ctx.strokeStyle = "rgba(150,22,22,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const x = i * cw, y = cols[i].y; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
    // Vertical specular streaks for a wet sheen.
    ctx.strokeStyle = "rgba(255,90,90,0.08)";
    ctx.lineWidth = 1;
    for (let i = 3; i < n; i += 10) { ctx.beginPath(); ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, cols[i].y - 3); ctx.stroke(); }
    ctx.restore();

    // ---- BOTTOM POOL ----
    if (this.pool > 0.5) {
      const A = 4 + Math.sin(this.t * 0.7) * 2;
      const surfY = (x) => poolTop + Math.sin(x * 0.03 + this.t * 2) * A + Math.sin(x * 0.011 - this.t * 1.3) * A * 0.6;
      const pg = ctx.createLinearGradient(0, poolTop - 10, 0, h);
      pg.addColorStop(0, "#6b0d0d");
      pg.addColorStop(1, "#360404");
      ctx.save();
      ctx.globalAlpha = opa;
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, surfY(0));
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, surfY(x));
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(185,45,45,0.4)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) { x === 0 ? ctx.moveTo(x, surfY(x)) : ctx.lineTo(x, surfY(x)); }
      ctx.stroke();
      ctx.restore();
    }

    // ---- DROPLETS ----
    ctx.save();
    ctx.globalAlpha = opa;
    ctx.fillStyle = "#7a0f0f";
    for (const dp of this.drops) { ctx.beginPath(); ctx.ellipse(dp.x, dp.y, dp.r * 0.7, dp.r * 1.5, 0, 0, TAU); ctx.fill(); }
    // Splash droplets kicked up from impacts.
    ctx.fillStyle = "#8f1414";
    for (const sp of this.splashes) { ctx.beginPath(); ctx.ellipse(sp.x, sp.y, sp.r, sp.r * 1.2, 0, 0, TAU); ctx.fill(); }
    ctx.restore();

    // ---- DIALOG: clear window, blood pooled on top, dripping off the bottom ----
    if (d) {
      ctx.clearRect(d.l, d.t, d.r - d.l, d.b - d.t);
      ctx.save();
      ctx.globalAlpha = opa;
      // A creeping band of blood over the card's top edge.
      ctx.fillStyle = "#5a0a0a";
      const band = clamp((this.t - 3) * 3, 0, 11);
      for (let i = 0; i < n; i++) {
        const x = i * cw;
        if (x < d.l - 2 || x > d.r + 2) continue;
        if (cols[i].y >= d.t - 0.5) ctx.fillRect(x - 0.5, d.t - band, cw + 1, band + 1);
      }
      // Hanging drips (and their released blobs) off the bottom edge.
      ctx.fillStyle = "#6b0d0d";
      for (const dr of this.dialogDrips) {
        if (dr.len > 0) {
          ctx.beginPath();
          ctx.moveTo(dr.x - 2.6, d.b);
          ctx.lineTo(dr.x + 2.6, d.b);
          ctx.lineTo(dr.x + 1.6, d.b + dr.len);
          ctx.quadraticCurveTo(dr.x, d.b + dr.len + 3, dr.x - 1.6, d.b + dr.len);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath(); ctx.arc(dr.x, d.b + dr.len, 2.7, 0, TAU); ctx.fill();
        }
        if (dr.fall) { ctx.beginPath(); ctx.ellipse(dr.x, dr.fall.y, 2, 3.4, 0, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }
  }
}
