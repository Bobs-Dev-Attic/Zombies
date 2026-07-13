// Core game: loop, camera, rendering, waves, combat resolution and HUD.
import { clamp, rand, randInt, chance, pick, angleTo, angleLerp, dist, dist2, TAU } from "./util.js";
import { Input } from "./input.js";
import { World, TILE, T, SETTINGS } from "./world.js";
import { Player, Zombie, Projectile, Particle, Pickup, ZOMBIE_TYPES } from "./entities.js";
import { WEAPONS, WEAPON_ORDER, newLoadout } from "./weapons.js";
import { drawPlayer, drawZombie, drawPickup, drawMuzzle } from "./sprites.js";

const PLAYER_PAL = { skin: "#d9a066", hair: "#3a2a1a", shirt: "#3b5a8c", vest: "#2c3e52", pants: "#2a2a33" };
const MIN_BUFFER = 220; // logical px on the short screen axis

export class Game {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.hooks = hooks;
    this.input = new Input(canvas);
    this.running = false;
    this.paused = false;
    this.lastT = 0;
    this.shake = 0;
    this.cam = { x: 0, y: 0 };
    this.bufW = MIN_BUFFER; this.bufH = MIN_BUFFER;
    this.dpr = 1;

    this.stains = []; // persistent ground blood (capped)
    this._resize();
    window.addEventListener("resize", () => this._resize());
    window.addEventListener("orientationchange", () => setTimeout(() => this._resize(), 200));
    this._loop = this._loop.bind(this);
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    // Scale so the shorter axis shows ~MIN_BUFFER logical px (more zoom on phones).
    const shortPx = Math.min(w, h);
    this.scale = Math.max(1, Math.floor((shortPx * this.dpr) / MIN_BUFFER));
    this.bufW = this.canvas.width / this.scale;
    this.bufH = this.canvas.height / this.scale;
    this.ctx.imageSmoothingEnabled = false;
  }

  start(settingIndex = 0) {
    this.settingIndex = settingIndex;
    this.world = new World(settingIndex);
    this.player = new Player(this.world.spawnPoint.x, this.world.spawnPoint.y, newLoadout());
    this.zombies = [];
    this.projectiles = [];
    this.particles = [];
    this.pickups = [];
    this.stains = [];
    this.score = 0;
    this.wave = 0;
    this.waveActive = false;
    this.spawnQueue = 0;
    this.spawnTimer = 0;
    this.betweenWaves = 2;
    this.exitReady = false;
    this.cam.x = this.player.x;
    this.cam.y = this.player.y;
    this._seedLevelLoot();
    this._announce(this.world.setting.name, "SURVIVE");
    this.hooks.onSetting?.(this.world.setting.name);
    this.running = true;
    this.paused = false;
    this.lastT = performance.now();
    requestAnimationFrame(this._loop);
  }

  advanceSetting() {
    const next = (this.settingIndex + 1) % SETTINGS.length;
    // Carry loadout & score forward into the next setting.
    const loadout = this.player.loadout;
    const score = this.score;
    const kills = this.player.kills;
    const wave = this.wave;
    this.settingIndex = next;
    this.world = new World(next);
    const hp = this.player.health, sta = this.player.stamina;
    this.player = new Player(this.world.spawnPoint.x, this.world.spawnPoint.y, loadout);
    this.player.health = hp; this.player.stamina = sta;
    this.player.kills = kills;
    this.zombies = []; this.projectiles = []; this.particles = []; this.pickups = []; this.stains = [];
    this.score = score; this.wave = wave;
    this.waveActive = false; this.spawnQueue = 0; this.betweenWaves = 2; this.exitReady = false;
    this.cam.x = this.player.x; this.cam.y = this.player.y;
    this._seedLevelLoot();
    this._announce(this.world.setting.name, "NEW GROUND");
    this.hooks.onSetting?.(this.world.setting.name);
  }

  _seedLevelLoot() {
    // Scatter weapon crates, ammo, and medkits across the map.
    const weaponPool = ["bat", "shotgun", "smg", "rifle", "bazooka"];
    const crates = randInt(3, 5);
    for (let i = 0; i < crates; i++) {
      const p = this.world.randomFloorFar(this.player.x, this.player.y, 120);
      if (p) this.pickups.push(new Pickup(p.x, p.y, "weapon", pick(weaponPool)));
    }
    const ammoTypes = ["rounds", "shells", "rockets"];
    for (let i = 0; i < randInt(4, 7); i++) {
      const p = this.world.randomFloor();
      const type = pick(ammoTypes);
      const amount = type === "rockets" ? randInt(1, 2) : type === "shells" ? randInt(6, 14) : randInt(20, 40);
      this.pickups.push(new Pickup(p.x, p.y, "ammo", { type, amount }));
    }
    for (let i = 0; i < randInt(2, 3); i++) {
      const p = this.world.randomFloor();
      this.pickups.push(new Pickup(p.x, p.y, chance(0.7) ? "medkit" : "adrenaline"));
    }
  }

  // ------------------------------------------------------- Waves
  _startWave() {
    this.wave++;
    this.waveActive = true;
    const base = 4 + this.wave * 2;
    this.spawnQueue = base;
    this.spawnTimer = 0;
    this.hooks.onWave?.(this.wave);
    this._announce("WAVE " + this.wave, this.spawnQueue + " incoming");
  }

  _spawnPoint() {
    // Spawn just off-screen (reachable) so zombies converge quickly instead of
    // trekking across the whole map.
    const view = Math.max(this.bufW, this.bufH);
    const min = view * 0.5, max = view * 0.85;
    for (let i = 0; i < 60; i++) {
      const p = this.world.randomFloor();
      const d = dist(p.x, p.y, this.player.x, this.player.y);
      if (d < min || d > max) continue;
      if (this.flow && !this._flowAt(p.x, p.y).seen) continue; // must be able to path in
      return p;
    }
    return this.world.randomFloorFar(this.player.x, this.player.y, min);
  }

  _spawnZombie() {
    const p = this._spawnPoint();
    if (!p) return;
    // Weighted type table that shifts toward tougher foes over time.
    const w = this.wave;
    const table = [["walker", 5]];
    table.push(["prone", w >= 2 ? 4 : 2]); // draggers from the very first wave
    if (w >= 2) table.push(["runner", 3]);
    if (w >= 2) table.push(["crawler", 3]);
    if (w >= 4) table.push(["spitter", 2]);
    if (w >= 5) table.push(["brute", 1 + Math.floor(w / 6)]);
    const total = table.reduce((s, t) => s + t[1], 0);
    let r = rand(0, total), type = "walker";
    for (const [k, wgt] of table) { if ((r -= wgt) <= 0) { type = k; break; } }
    const hpScale = 1 + (w - 1) * 0.12;
    this.zombies.push(new Zombie(p.x, p.y, type, hpScale));
  }

  // ------------------------------------------------------- Loop
  _loop(t) {
    if (!this.running) return;
    let dt = (t - this.lastT) / 1000;
    this.lastT = t;
    dt = Math.min(dt, 0.05); // clamp big frame gaps
    if (!this.paused) this._update(dt);
    this._render();
    requestAnimationFrame(this._loop);
  }

  _update(dt) {
    const inp = this.input;
    inp.sampleKeyboard();
    const actions = inp.consume();

    // Player-controlled aiming: face the mouse (desktop) or the direction of
    // movement (touch / keyboard). Facing holds when idle so you can stop and
    // keep firing the same way. No auto-aim — you shoot where you face.
    let desired = this.player.angle;
    if (inp.hasMouse && !inp.usingTouch) {
      desired = Math.atan2(inp.mouseY - window.innerHeight / 2, inp.mouseX - window.innerWidth / 2);
    } else if (inp.moveMag > 0.12) {
      desired = Math.atan2(inp.moveY, inp.moveX);
    }
    this.player.angle = angleLerp(this.player.angle, desired, clamp(dt * 18, 0, 1));

    this.player.update(dt, inp, this.world);
    this.world.update(dt);

    if (actions.swap) this._swapWeapon();
    if (actions.reload) { if (this.player.startReload()) this._announce("Reloading…"); }
    if (actions.interact) this._interact();
    if (inp.firing) this._tryFire();

    // Auto-grab nearby pickups.
    this._autoGrab();

    // Refresh the navigation flow field toward the player periodically.
    this.flowTimer = (this.flowTimer || 0) - dt;
    if (this.flowTimer <= 0) { this._computeFlow(); this.flowTimer = 0.3; }
    const nav = this._nav || (this._nav = {
      flow: (x, y) => this._flowAt(x, y),
      los: (x, y) => this.world.lineClear(x, y, this.player.x, this.player.y),
    });

    // Entities.
    for (const z of this.zombies) z.update(dt, this.player, this.world, nav, (x, y, a, kind) => this._spawnHostile(x, y, a, kind));
    this._resolveCollisions(); // no two bodies share the same space
    this._updateProjectiles(dt);
    for (const p of this.particles) p.update(dt);
    for (const s of this.stains) s.life -= dt * 0.15;
    for (const pk of this.pickups) pk.update(dt);

    // Cull dead.
    this._reapZombies();
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.particles = this.particles.filter((p) => !p.dead);
    this.pickups = this.pickups.filter((p) => !p.dead);
    if (this.stains.length > 220) this.stains.splice(0, this.stains.length - 220);
    this.stains = this.stains.filter((s) => s.life > 0);

    // Wave director.
    if (!this.waveActive) {
      this.betweenWaves -= dt;
      if (this.betweenWaves <= 0) this._startWave();
    } else {
      this.spawnTimer -= dt;
      if (this.spawnQueue > 0 && this.spawnTimer <= 0) {
        this._spawnZombie();
        this.spawnQueue--;
        this.spawnTimer = clamp(1.4 - this.wave * 0.05, 0.35, 1.4);
      }
      if (this.spawnQueue <= 0 && this.zombies.length === 0) {
        this.waveActive = false;
        this.betweenWaves = 5;
        this.exitReady = true;
        this._announce("WAVE CLEARED", "Reach the EXIT or hold out");
        this.hooks.onWaveClear?.(this.wave);
        // Reward drop.
        const p = this.world.randomFloorFar(this.player.x, this.player.y, 60);
        if (p) this.pickups.push(new Pickup(p.x, p.y, chance(0.5) ? "medkit" : "ammo",
          chance(0.5) ? undefined : { type: pick(["rounds", "shells"]), amount: 24 }));
      }
    }

    // Reached exit?
    if (dist(this.player.x, this.player.y, this.world.exit.x, this.world.exit.y) < 20) {
      this.advanceSetting();
    }

    // Camera smoothly follows the player (kept centred).
    this.cam.x += (this.player.x - this.cam.x) * clamp(dt * 8, 0, 1);
    this.cam.y += (this.player.y - this.cam.y) * clamp(dt * 8, 0, 1);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 40);

    // HUD + death.
    this.hooks.onStats?.(this._stats());
    if (this.player.health <= 0) this._gameOver();
  }

  _stats() {
    const l = this.player.loadout;
    const w = this.player.weapon;
    let ammoStr;
    if (w.melee) ammoStr = "∞";
    else {
      const clip = l.clip[l.current] ?? 0;
      ammoStr = `${clip} / ${l.ammo[w.ammoType] ?? 0}`;
    }
    return {
      hp: this.player.health / this.player.maxHealth,
      stamina: this.player.stamina / this.player.maxStamina,
      exhausted: this.player.exhausted,
      wave: this.wave,
      score: this.score,
      weapon: w.name + (this.player.reloading > 0 ? " …" : ""),
      ammo: ammoStr,
    };
  }

  // ------------------------------------------------------- Navigation (flow field)
  _computeFlow() {
    const w = this.world;
    const cols = w.cols, rows = w.rows, n = cols * rows;
    if (!this.flow) {
      this.flow = { fx: new Float32Array(n), fy: new Float32Array(n), seen: new Uint8Array(n), queue: new Int32Array(n) };
    }
    const { fx, fy, seen, queue } = this.flow;
    seen.fill(0);
    const scx = clamp(Math.floor(this.player.x / TILE), 0, cols - 1);
    const scy = clamp(Math.floor(this.player.y / TILE), 0, rows - 1);
    const start = scy * cols + scx;
    let head = 0, tail = 0;
    seen[start] = 1; fx[start] = 0; fy[start] = 0; queue[tail++] = start;
    const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (head < tail) {
      const ci = queue[head++];
      const cx = ci % cols, cy = (ci - cx) / cols;
      for (const [dx, dy] of N8) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (seen[ni] || !w.passableTile(nx, ny)) continue;
        if (dx && dy && (!w.passableTile(cx + dx, cy) || !w.passableTile(cx, cy + dy))) continue; // no corner cutting
        seen[ni] = 1;
        const len = dx && dy ? 1.41421356 : 1;
        fx[ni] = -dx / len; fy[ni] = -dy / len; // point back toward the player
        queue[tail++] = ni;
      }
    }
  }

  _flowAt(x, y) {
    if (!this.flow) return { seen: 0, fx: 0, fy: 0 };
    const w = this.world;
    const cx = clamp(Math.floor(x / TILE), 0, w.cols - 1);
    const cy = clamp(Math.floor(y / TILE), 0, w.rows - 1);
    const i = cy * w.cols + cx;
    return { seen: this.flow.seen[i], fx: this.flow.fx[i], fy: this.flow.fy[i] };
  }

  // ------------------------------------------------------- Combat
  _nearestZombie(x, y, maxR) {
    let best = null, bestD = maxR * maxR;
    for (const z of this.zombies) {
      const d = dist2(x, y, z.x, z.y);
      if (d < bestD) { bestD = d; best = z; }
    }
    return best;
  }

  _swapWeapon() {
    const owned = WEAPON_ORDER.filter((k) => this.player.loadout.owned[k]);
    if (owned.length < 2) return;
    const i = owned.indexOf(this.player.loadout.current);
    this.player.loadout.current = owned[(i + 1) % owned.length];
    this.player.reloading = 0;
    this._announce(this.player.weapon.name);
  }

  _tryFire() {
    const p = this.player, w = p.weapon;
    if (!p.canFire()) {
      // Auto-reload when the clip runs dry.
      if (!w.melee && (p.loadout.clip[p.loadout.current] ?? 0) <= 0 && p.reloading <= 0) p.startReload();
      return;
    }
    p.cooldown = 1 / w.fireRate;
    p.muzzle = 0.06;
    p.triggerRecoil(w); // kick the arms/weapon (gun recoil or melee swing)

    if (w.melee) { this._meleeSwing(w); return; }

    p.loadout.clip[p.loadout.current]--;
    const pellets = w.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const a = p.angle + rand(-w.spread, w.spread);
      const proj = new Projectile(p.x + Math.cos(p.angle) * 12, p.y + Math.sin(p.angle) * 12, a, {
        speed: w.speed, damage: w.damage, range: w.range, knockback: w.knockback,
        pierce: w.pierce || 0, explosive: w.explosive || 0, kind: w.explosive ? "rocket" : "bullet",
        sever: w.sever || 0, r: w.explosive ? 3 : 1.6,
      });
      this.projectiles.push(proj);
    }
    // Feedback: casing, shake.
    this.shake += w.explosive ? 8 : w.pellets > 1 ? 4 : 2;
    this._ejectCasing(p);
    if (w.explosive || w.pellets > 1) this.hooks.vibrate?.(30);
  }

  _meleeSwing(w) {
    const p = this.player;
    let hit = false;
    for (const z of this.zombies) {
      const d = dist(p.x, p.y, z.x, z.y);
      if (d > w.range + z.r) continue;
      const a = angleTo(p.x, p.y, z.x, z.y);
      let da = Math.abs(((a - p.angle + Math.PI) % TAU) - Math.PI);
      if (da <= w.arc / 2) {
        this._damageZombie(z, w.damage, p.angle, w.knockback, w.sever || 0);
        this._blood(z.x, z.y, p.angle, 6);
        hit = true;
      }
    }
    this.shake += hit ? 3 : 1;
    if (hit) this.hooks.vibrate?.(20);
  }

  _updateProjectiles(dt) {
    for (const proj of this.projectiles) {
      proj.update(dt, this.world);
      if (proj.hostile) {
        // Enemy spit: only hits player.
        if (dist(proj.x, proj.y, this.player.x, this.player.y) < this.player.r + proj.r + 1) {
          this.player.hurt(proj.damage);
          this._blood(proj.x, proj.y, proj.angle, 3, "#8fbf3a");
          proj.dead = true;
        }
        continue;
      }
      // Player projectile vs zombies (segment check for fast bullets).
      for (const z of this.zombies) {
        if (z.dead || proj.hitSet.has(z)) continue;
        if (this._segHitsCircle(proj.px, proj.py, proj.x, proj.y, z.x, z.y, z.r + proj.r)) {
          proj.hitSet.add(z);
          if (proj.explosive) { this._explode(z.x, z.y, proj); proj.dead = true; break; }
          this._damageZombie(z, proj.damage, proj.angle, proj.knockback, proj.sever || 0);
          this._blood(z.x, z.y, proj.angle, 5);
          if (proj.pierce > 0) proj.pierce--;
          else { proj.dead = true; break; }
        }
      }
      if (proj.dead && proj.explosive) this._explode(proj.x, proj.y, proj);
      else if (proj.dead && !proj.hostile && proj.kind === "bullet") this._spark(proj.x, proj.y);
    }
  }

  _explode(x, y, proj) {
    const radius = proj.explosive;
    for (const z of this.zombies) {
      const d = dist(x, y, z.x, z.y);
      if (d < radius + z.r) {
        const falloff = clamp(1 - d / (radius + z.r), 0.2, 1);
        const a = angleTo(x, y, z.x, z.y);
        this._damageZombie(z, proj.damage * falloff, a, 220 * falloff, 0.6 * falloff);
        this._blood(z.x, z.y, a, 8);
      }
    }
    // Splash damage to player too if close.
    const pd = dist(x, y, this.player.x, this.player.y);
    if (pd < radius) this.player.hurt(30 * clamp(1 - pd / radius, 0, 1));
    // FX
    for (let i = 0; i < 26; i++) {
      const a = rand(0, TAU), s = rand(40, 200);
      this.particles.push(new Particle(x, y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.2, 0.6),
        color: pick(["#ffce54", "#ff7043", "#ffffff", "#6b6b6b"]), size: randInt(2, 4), drag: 0.86,
      }));
    }
    this.shake += 14;
    this.hooks.vibrate?.(60);
  }

  // Separate overlapping bodies: zombie-vs-zombie and zombie-vs-player.
  // Heavier bodies (higher mass) get pushed less. Runs a couple of iterations.
  _resolveCollisions() {
    const zs = this.zombies, p = this.player, w = this.world;
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < zs.length; i++) {
        const a = zs[i];
        for (let j = i + 1; j < zs.length; j++) {
          const b = zs[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          const rr = a.r + b.r;
          let d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          if (d2 < 0.0001) { dx = rand(-1, 1); dy = rand(-1, 1); d2 = dx * dx + dy * dy; }
          const d = Math.sqrt(d2);
          const overlap = rr - d;
          const nx = dx / d, ny = dy / d;
          const total = a.mass + b.mass;
          const aPush = overlap * (b.mass / total);
          const bPush = overlap * (a.mass / total);
          a.x -= nx * aPush; a.y -= ny * aPush;
          b.x += nx * bPush; b.y += ny * bPush;
        }
        // Zombie vs player: shove the zombie out, nudge the player a little.
        let dx = a.x - p.x, dy = a.y - p.y;
        const rr = a.r + p.r;
        let d2 = dx * dx + dy * dy;
        if (d2 < rr * rr) {
          if (d2 < 0.0001) { dx = rand(-1, 1); dy = 1; d2 = dx * dx + dy * dy; }
          const d = Math.sqrt(d2);
          const overlap = rr - d, nx = dx / d, ny = dy / d;
          a.x += nx * overlap * 0.8; a.y += ny * overlap * 0.8;
          p.x -= nx * overlap * 0.2; p.y -= ny * overlap * 0.2;
        }
      }
    }
    // Keep everyone out of walls after the shove.
    for (const z of zs) { const r = w.collide(z.x, z.y, z.r); z.x = r.x; z.y = r.y; }
    const pr = w.collide(p.x, p.y, p.r); p.x = pr.x; p.y = pr.y;
  }

  _damageZombie(z, dmg, angle, force, sever = 0) {
    const res = z.damage(dmg, angle, force, sever);
    if (res.severed) this._severFX(z, res.severed, angle);
    if (res.dead) this._killZombie(z, angle);
  }

  // A limb tears off: fling a gore chunk, spray blood, leave a stain.
  _severFX(z, part, angle) {
    const pal = { larm: "#7a8f3a", rarm: "#7a8f3a", lleg: "#6a7a34", rleg: "#6a7a34" }[part] || "#7a8f3a";
    this._blood(z.x, z.y, angle, 6);
    for (let i = 0; i < 4; i++) {
      const a = angle + rand(-1, 1), s = rand(50, 150);
      this.particles.push(new Particle(z.x, z.y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.7, 1.5),
        color: pick([pal, "#a01818", "#7a1010"]), size: randInt(3, 5), drag: 0.85, stain: true,
      }));
    }
    this.stains.push({ x: z.x + rand(-4, 4), y: z.y + rand(-4, 4), r: rand(3, 6), life: rand(8, 14), color: "#4a0c0c" });
    this.shake += 2;
    if (z.prone) this._announce("Legless!");
  }

  _killZombie(z, angle) {
    this.score += z.def.score;
    this.player.kills++;
    // Gore burst.
    this._gore(z.x, z.y, angle, z.def.gore);
    // Chance to drop loot.
    if (chance(0.14)) {
      const roll = rand(0, 1);
      if (roll < 0.4) this.pickups.push(new Pickup(z.x, z.y, "medkit"));
      else if (roll < 0.7) this.pickups.push(new Pickup(z.x, z.y, "adrenaline"));
      else this.pickups.push(new Pickup(z.x, z.y, "ammo", { type: pick(["rounds", "shells"]), amount: randInt(8, 20) }));
    }
    z.dead = true;
  }

  _reapZombies() {
    if (!this.zombies.some((z) => z.dead)) return;
    this.zombies = this.zombies.filter((z) => !z.dead);
  }

  _spawnHostile(x, y, angle, kind) {
    if (kind === "spit") {
      this.projectiles.push(new Projectile(x, y, angle, {
        speed: 190, damage: 10, range: 340, hostile: true, kind: "spit", r: 2.4,
      }));
    }
  }

  _segHitsCircle(ax, ay, bx, by, cx, cy, r) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((cx - ax) * dx + (cy - ay) * dy) / len2;
    t = clamp(t, 0, 1);
    const px = ax + dx * t, py = ay + dy * t;
    return dist2(px, py, cx, cy) <= r * r;
  }

  // ------------------------------------------------------- FX
  _blood(x, y, angle, count, color = "#a01818") {
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-0.9, 0.9);
      const s = rand(30, 130);
      this.particles.push(new Particle(x, y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.4, 1.1),
        color, size: randInt(1, 3), drag: 0.82, stain: true,
      }));
    }
    if (chance(0.6)) this.stains.push({ x: x + rand(-3, 3), y: y + rand(-3, 3), r: rand(2, 5), life: rand(6, 12), color: "#5a0f0f" });
  }

  _gore(x, y, angle, amount) {
    const n = Math.round(8 * amount);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(40, 170);
      this.particles.push(new Particle(x, y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 1.4),
        color: pick(["#7a1010", "#a01818", "#611", "#8a2a1a", "#6a8a2a"]),
        size: randInt(2, 4), drag: 0.8, stain: true,
      }));
    }
    for (let i = 0; i < Math.round(4 * amount); i++) {
      this.stains.push({ x: x + rand(-8, 8), y: y + rand(-8, 8), r: rand(3, 8), life: rand(8, 16), color: "#4a0c0c" });
    }
    this.shake += 2;
  }

  _spark(x, y) {
    this.particles.push(new Particle(x, y, { vx: rand(-30, 30), vy: rand(-30, 30), life: 0.12, color: "#ffd27a", size: 1, drag: 0.7 }));
  }

  _ejectCasing(p) {
    const a = p.angle + Math.PI / 2 + rand(-0.3, 0.3);
    this.particles.push(new Particle(p.x, p.y, { vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, life: 0.5, color: "#c9a227", size: 1, drag: 0.8 }));
  }

  // ------------------------------------------------------- Pickups & doors
  _autoGrab() {
    for (const pk of this.pickups) {
      if (pk.dead) continue;
      if (dist(pk.x, pk.y, this.player.x, this.player.y) < this.player.r + pk.r) this._grab(pk);
    }
  }

  _interact() {
    // Prefer opening a door; otherwise grab the nearest pickup within reach.
    if (this.world.tryOpenDoorNear(this.player.x, this.player.y)) { this._announce("Door"); return; }
    let best = null, bd = 26 * 26;
    for (const pk of this.pickups) {
      const d = dist2(pk.x, pk.y, this.player.x, this.player.y);
      if (d < bd) { bd = d; best = pk; }
    }
    if (best) this._grab(best);
  }

  _grab(pk) {
    const p = this.player, l = p.loadout;
    switch (pk.kind) {
      case "weapon": {
        const id = pk.data;
        if (!l.owned[id]) {
          l.owned[id] = true;
          if (WEAPONS[id].clip) l.clip[id] = WEAPONS[id].clip;
          l.current = id;
          this._announce("Picked up " + WEAPONS[id].name, "equipped");
        } else {
          // Already owned: give ammo instead.
          const t = WEAPONS[id].ammoType;
          if (t) { l.ammo[t] = (l.ammo[t] || 0) + WEAPONS[id].clip; this._announce("+" + WEAPONS[id].clip + " " + t); }
        }
        break;
      }
      case "ammo": {
        const { type, amount } = pk.data;
        l.ammo[type] = (l.ammo[type] || 0) + amount;
        this._announce("+" + amount + " " + type);
        break;
      }
      case "medkit":
        p.heal(45); this._announce("+45 HP", "medkit"); break;
      case "adrenaline":
        p.stamina = p.maxStamina; p.exhausted = false; p.invuln = 3; this._announce("Adrenaline!", "boosted"); break;
    }
    this.hooks.vibrate?.(15);
    pk.dead = true;
  }

  _gameOver() {
    this.running = false;
    this.hooks.onGameOver?.({ score: this.score, wave: this.wave, kills: this.player.kills });
  }

  _announce(a, b) { this.hooks.onToast?.(a, b); }

  // ------------------------------------------------------- Render
  _render() {
    const ctx = this.ctx;
    const s = this.scale;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    // Camera offset in buffer space, with shake.
    const shx = this.shake ? rand(-this.shake, this.shake) : 0;
    const shy = this.shake ? rand(-this.shake, this.shake) : 0;
    const ox = Math.round(this.bufW / 2 - this.cam.x + shx);
    const oy = Math.round(this.bufH / 2 - this.cam.y + shy);

    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, this.bufW, this.bufH);

    ctx.translate(ox, oy);
    this._drawWorld(ctx, -ox, -oy);
    this._drawStains(ctx);
    this._drawPickups(ctx);
    this._drawZombiesBehind(ctx);
    this._drawPlayer(ctx);
    this._drawProjectiles(ctx);
    this._drawParticles(ctx);
    this._drawExitBeacon(ctx);
    ctx.restore();

    // Low-HP vignette.
    const hp = this.player ? this.player.health / this.player.maxHealth : 1;
    if (hp < 0.35) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const a = (0.35 - hp) * 1.4;
      const g = ctx.createRadialGradient(this.canvas.width / 2, this.canvas.height / 2, this.canvas.height * 0.2, this.canvas.width / 2, this.canvas.height / 2, this.canvas.height * 0.6);
      g.addColorStop(0, "rgba(120,0,0,0)");
      g.addColorStop(1, `rgba(120,0,0,${clamp(a, 0, 0.5)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.restore();
    }
  }

  _drawWorld(ctx, camX, camY) {
    const w = this.world;
    const set = w.setting;
    const startCX = Math.floor(camX / TILE) - 1;
    const startCY = Math.floor(camY / TILE) - 1;
    const endCX = startCX + Math.ceil(this.bufW / TILE) + 2;
    const endCY = startCY + Math.ceil(this.bufH / TILE) + 2;
    for (let cy = startCY; cy <= endCY; cy++) {
      for (let cx = startCX; cx <= endCX; cx++) {
        const t = w.tileAt(cx, cy);
        const x = cx * TILE, y = cy * TILE;
        if (t === T.WALL) {
          // Solid, darker body for deep wall; lit cap only where a wall face is exposed to floor above.
          const exposed = w.tileAt(cx, cy - 1) !== T.WALL;
          ctx.fillStyle = exposed ? set.wall : set.accent;
          ctx.fillRect(x, y, TILE, TILE);
          if (exposed) {
            ctx.fillStyle = set.wallTop;
            ctx.fillRect(x, y, TILE, 7);
            ctx.fillStyle = "rgba(0,0,0,0.28)";
            ctx.fillRect(x, y + TILE - 4, TILE, 4);
          }
        } else {
          // floor with a subtle checker
          ctx.fillStyle = ((cx + cy) & 1) ? set.floor : set.floor2;
          ctx.fillRect(x, y, TILE, TILE);
          if (t === T.PROP) {
            ctx.fillStyle = set.accent;
            ctx.fillRect(x + 5, y + 5, TILE - 10, TILE - 10);
            ctx.fillStyle = "rgba(0,0,0,0.25)";
            ctx.fillRect(x + 5, y + TILE - 9, TILE - 10, 4);
          }
          if (t === T.DOOR) {
            const d = w.doorAt(cx, cy);
            const openAmt = d ? d.openT : 0;
            ctx.fillStyle = "#6b4a28";
            const slide = Math.round(openAmt * (TILE - 6));
            ctx.fillRect(x + 3, y + 3, TILE - 6 - slide, TILE - 6);
            ctx.fillStyle = "#8a6238";
            ctx.fillRect(x + 3, y + 3, TILE - 6 - slide, 3);
          }
          if (t === T.EXIT) {
            ctx.fillStyle = "#123a12";
            ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
            ctx.fillStyle = "#39d353";
            ctx.fillRect(x + 6, y + 8, TILE - 12, 4);
            ctx.fillRect(x + TILE / 2 - 2, y + 8, 4, TILE - 14);
          }
        }
      }
    }
  }

  _drawStains(ctx) {
    for (const s of this.stains) {
      ctx.fillStyle = s.color;
      ctx.globalAlpha = clamp(s.life / 8, 0, 0.85);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawPickups(ctx) {
    for (const pk of this.pickups) drawPickup(ctx, pk.x, pk.y, pk.kind === "weapon" ? "weapon" : pk.kind, pk.t);
  }

  _drawZombiesBehind(ctx) {
    // Sort by y for pseudo-depth.
    const sorted = this.zombies.slice().sort((a, b) => a.y - b.y);
    for (const z of sorted) drawZombie(ctx, z.x, z.y, z.angle, z.frame, z.type, z.r, z.hurtFlash > 0, z.parts, z.prone, z.strideAmp);
  }

  _drawPlayer(ctx) {
    const p = this.player;
    const action = { recoil: p.recoil, swingT: p.swingT, swingDur: p.swingDur, melee: p.weapon.melee, moving: p.moving, run: p.running };
    drawPlayer(ctx, p.x, p.y, p.angle, p.walkFrame, p.hurtFlash > 0, p.weapon.kind, PLAYER_PAL, action);
    if (p.muzzle > 0 && !p.weapon.melee) drawMuzzle(ctx, p.x, p.y, p.angle, p.weapon.explosive ? 5 : 3);
    if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) {
      ctx.strokeStyle = "rgba(224,184,58,0.7)";
      ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, TAU); ctx.stroke();
    }
  }

  _drawProjectiles(ctx) {
    for (const pr of this.projectiles) {
      if (pr.kind === "spit") { ctx.fillStyle = "#8fbf3a"; ctx.beginPath(); ctx.arc(pr.x, pr.y, 2.4, 0, TAU); ctx.fill(); continue; }
      if (pr.kind === "rocket") {
        ctx.fillStyle = "#ffb347"; ctx.fillRect(Math.round(pr.x - 2), Math.round(pr.y - 2), 4, 4);
        ctx.fillStyle = "rgba(255,120,40,0.5)";
        ctx.fillRect(Math.round(pr.px - 1), Math.round(pr.py - 1), 2, 2);
        continue;
      }
      // Bullet tracer.
      ctx.strokeStyle = "#ffe9a0";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(pr.px, pr.py);
      ctx.lineTo(pr.x, pr.y);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  _drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = p.settled ? clamp(p.life / 6, 0, 0.9) : clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  _drawExitBeacon(ctx) {
    // Guide arrow to the exit once a wave is cleared.
    if (!this.exitReady) return;
    const p = this.player, e = this.world.exit;
    const d = dist(p.x, p.y, e.x, e.y);
    if (d < 60) return;
    const a = angleTo(p.x, p.y, e.x, e.y);
    const bx = p.x + Math.cos(a) * 24, by = p.y + Math.sin(a) * 24;
    ctx.fillStyle = "rgba(57,211,83,0.8)";
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(4, 0); ctx.lineTo(-3, -3); ctx.lineTo(-3, 3); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  pause(v) { this.paused = v; this.lastT = performance.now(); }
  stop() { this.running = false; }
}
