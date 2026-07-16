// Core game: loop, camera, rendering, waves, combat resolution and HUD.
import { clamp, rand, randInt, chance, pick, angleTo, angleLerp, dist, dist2, TAU } from "./util.js";
import { Input } from "./input.js";
import { World, TILE, T, SETTINGS } from "./world.js";
import { Player, Zombie, Projectile, Particle, Pickup, Thrown, ZOMBIE_TYPES } from "./entities.js";
import { WEAPONS, WEAPON_ORDER, newLoadout } from "./weapons.js";
import { drawPlayer, drawZombie, drawPickup, drawMuzzle, drawFurniture, drawBodyDecal, drawGroundLimb } from "./sprites.js";
import { DeathBlood } from "./deathblood.js";

const PLAYER_PAL = { skin: "#d9a066", hair: "#3a2a1a", shirt: "#3b5a8c", vest: "#2c3e52", pants: "#2a2a33" };
const ZOMBIE_LIMB = { walker: "#72a83a", runner: "#8fb84a", crawler: "#a0c15a", brute: "#5c7a2e", spitter: "#9ab84a", leaper: "#8fb84a", prone: "#a0c15a", dog: "#8a9a52", rat: "#7a8a44" };
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
    if (this.blood) { this.blood.destroy(); this.blood = null; }
    this.death = null;
    this.floorLevel = 0;
    this.floorCache = {};
    this.floorCooldown = 0;
    this._onTransit = false;
    this.world = new World(settingIndex, 0);
    this.player = new Player(this.world.spawnPoint.x, this.world.spawnPoint.y, newLoadout());
    this.zombies = [];
    this.projectiles = [];
    this.particles = [];
    this.pickups = [];
    this.stains = [];
    this.corpses = [];
    this.bodies = [];  // persistent fallen zombie decals
    this.limbs = [];   // persistent severed-limb decals on the ground
    this.gibs = [];    // limbs mid-flight before they settle
    this.thrown = [];  // grenades / flares in flight or on the ground
    this.shockwaves = []; // expanding blast rings
    this.score = 0;
    this.wave = 0;
    this.waveActive = false;
    this.spawnQueue = 0;
    this.spawnTimer = 0;
    this.waveOrigins = []; // where the horde streams in from this wave
    this.betweenWaves = 2;
    this.exitReady = false;
    this.sideFlash = 0;              // red edge-flash intensity when hurt
    this._prevHp = this.player.health;
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
    this.floorLevel = 0;
    this.floorCache = {};
    this.floorCooldown = 0;
    this.world = new World(next, 0);
    const hp = this.player.health, sta = this.player.stamina;
    this.player = new Player(this.world.spawnPoint.x, this.world.spawnPoint.y, loadout);
    this.player.health = hp; this.player.stamina = sta;
    this.player.kills = kills;
    this.zombies = []; this.projectiles = []; this.particles = []; this.pickups = []; this.stains = []; this.corpses = [];
    this.bodies = []; this.limbs = []; this.gibs = []; this.thrown = []; this.shockwaves = [];
    this.score = score; this.wave = wave;
    this.waveActive = false; this.spawnQueue = 0; this.waveOrigins = []; this.betweenWaves = 2; this.exitReady = false;
    this.cam.x = this.player.x; this.cam.y = this.player.y;
    this._seedLevelLoot();
    this._announce(this.world.setting.name, "NEW GROUND");
    this.hooks.onSetting?.(this.world.setting.name);
  }

  _seedLevelLoot() {
    // The house hand-places its loot (key, axe, room rewards) via world.loot.
    if (this.world.loot) { this._seedHouseLoot(); return; }
    // Scatter weapon crates, ammo, and medkits across the map.
    const weaponPool = ["bat", "axe", "pistol22", "pistol357", "smg",
      "shotgun", "shotgun_semi", "shotgun_sxs",
      "rifle", "rifle_semi", "rifle_auto", "bazooka"];
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
    // Protective gear — sometimes light, sometimes heavier plating.
    for (let i = 0; i < randInt(1, 2); i++) {
      const p = this.world.randomFloor();
      const heavy = chance(0.4);
      this.pickups.push(new Pickup(p.x, p.y, "armor", { value: heavy ? 80 : 40, max: heavy ? 100 : 50 }));
    }
    if (chance(0.7)) {
      const p = this.world.randomFloor();
      const heavy = chance(0.4);
      this.pickups.push(new Pickup(p.x, p.y, "helmet", { value: heavy ? 50 : 25, max: heavy ? 60 : 30 }));
    }
    // Throwables: grenades everywhere, flares mostly outside.
    if (chance(0.8)) { const p = this.world.randomFloor(); this.pickups.push(new Pickup(p.x, p.y, "grenade", { amount: randInt(1, 3) })); }
    if (this.world.isStreets && chance(0.8)) { const p = this.world.randomFloor(); this.pickups.push(new Pickup(p.x, p.y, "flare", { amount: randInt(1, 2) })); }
  }

  // House floors carry a curated loot list (key/axe/room rewards).
  _seedHouseLoot() {
    for (const it of this.world.loot) {
      this.pickups.push(new Pickup((it.cx + 0.5) * TILE, (it.cy + 0.5) * TILE, it.kind, it.data));
    }
  }

  // Move between a level's two floors (house stairs, or street manholes <-> the
  // sewers). Each floor keeps its own world, decals and loot cached. arriveIdx
  // (optional) picks which ladder/manhole you surface at, so the sewers can drop
  // you off elsewhere in the neighbourhood.
  _changeFloor(target, arriveIdx) {
    // Stash the current floor's persistent state.
    this.floorCache[this.floorLevel] = {
      world: this.world, bodies: this.bodies, limbs: this.limbs, stains: this.stains,
      pickups: this.pickups, corpses: this.corpses, gibs: this.gibs,
    };
    this.floorLevel = target;
    const cached = this.floorCache[target];
    if (cached) {
      this.world = cached.world;
      this.bodies = cached.bodies; this.limbs = cached.limbs; this.stains = cached.stains;
      this.pickups = cached.pickups; this.corpses = cached.corpses; this.gibs = cached.gibs;
    } else {
      this.world = new World(this.settingIndex, target);
      this.bodies = []; this.limbs = []; this.stains = []; this.pickups = []; this.corpses = []; this.gibs = [];
      this._seedLevelLoot();
    }
    // Arrive at the mapped ladder/manhole, else the floor's default landing.
    let arrive = null;
    if (arriveIdx != null) {
      const cells = this.world.isSewers ? this.world.ladders : this.world.isStreets ? this.world.manholes : null;
      if (cells && cells[arriveIdx]) arrive = cells[arriveIdx];
    }
    if (arrive) { this.player.x = (arrive.cx + 0.5) * TILE; this.player.y = (arrive.cy + 0.5) * TILE; }
    else { this.player.x = this.world.landing.x; this.player.y = this.world.landing.y; }
    this.zombies = []; this.projectiles = []; this.particles = []; this.thrown = []; this.shockwaves = [];
    this.cam.x = this.player.x; this.cam.y = this.player.y;
    this.flow = null; this.flowTimer = 0; // rebuild the flow field for the new grid
    this.floorCooldown = 1.2;
    this._onTransit = true; // arriving on a ladder/manhole shouldn't instantly re-trigger
    this.hooks.onSetting?.(this.world.setting.name);
    const label = this.world.isSewers ? "The Sewers" : this.world.isHouse ? (target === 1 ? "Upstairs" : "Ground Floor") : "The Streets";
    const sub = this.world.isSewers ? "find a ladder up" : this.world.isHouse ? (target === 1 ? "bedrooms & bath" : "living room") : "back topside";
    this._announce(label, sub);
  }

  // Wood-chip debris when a door is chopped/shot; a bigger burst when it breaks.
  _splinter(x, y, big) {
    const n = big ? 14 : 5;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(30, big ? 170 : 90);
      this.particles.push(new Particle(x, y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.8),
        color: pick(["#8a6a44", "#6b4a28", "#5a4632", "#a0824e"]), size: randInt(2, 4), drag: 0.84,
      }));
    }
    this.shake += big ? 5 : 2;
    if (big) this.hooks.vibrate?.(25);
  }

  // ------------------------------------------------------- Waves
  _startWave() {
    this.wave++;
    this.waveActive = true;
    // Difficulty ramps: bigger hordes each wave (with a quadratic tail so later
    // waves swell), spawning faster.
    this.spawnQueue = 4 + Math.round(this.wave * 3 + this.wave * this.wave * 0.25);
    this.spawnTimer = 0;
    this._pickWaveOrigins();
    this.hooks.onWave?.(this.wave);
    this._announce("WAVE " + this.wave, this.spawnQueue + " incoming");
  }

  // Choose a fresh set of origin fronts the horde streams in from this wave, so
  // they don't always come from the same place.
  _pickWaveOrigins() {
    const n = 2 + (this.wave % 3); // 2..4 fronts
    const min = Math.max(this.bufW, this.bufH) * 0.5;
    this.waveOrigins = [];
    for (let i = 0; i < n; i++) {
      const p = this.world.randomFloorFar(this.player.x, this.player.y, min);
      if (p) this.waveOrigins.push(p);
    }
    if (!this.waveOrigins.length) { const p = this.world.randomFloor(); if (p) this.waveOrigins.push(p); }
  }

  _spawnPoint() {
    // Stream in near one of this wave's origin fronts (with jitter), but the
    // point must be reachable and not right on top of the player.
    const minFromPlayer = Math.max(this.bufW, this.bufH) * 0.5;
    const origins = this.waveOrigins;
    for (let i = 0; i < 70; i++) {
      let p;
      if (origins && origins.length && chance(0.8)) p = this.world.randomFloorNear(pick(origins), 96);
      else p = this.world.randomFloor();
      if (!p) continue;
      if (dist(p.x, p.y, this.player.x, this.player.y) < minFromPlayer) continue;
      if (this.flow && !this._flowAt(p.x, p.y).seen) continue; // must be able to path in
      return p;
    }
    return this.world.randomFloorFar(this.player.x, this.player.y, minFromPlayer);
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
    if (w >= 3) table.push(["leaper", 2]); // pouncers
    if (w >= 4) table.push(["spitter", 2]);
    if (w >= 5) table.push(["brute", 1 + Math.floor(w / 5)]);
    if (this.world.isSewers) table.push(["rat", 7 + w]);                              // swarms underground
    else if (this.world.isStreets && w >= 2) table.push(["dog", 2 + Math.floor(w / 4)]); // packs outside
    const total = table.reduce((s, t) => s + t[1], 0);
    let r = rand(0, total), type = "walker";
    for (const [k, wgt] of table) { if ((r -= wgt) <= 0) { type = k; break; } }
    const hpScale = 1 + (w - 1) * 0.16; // tougher each wave
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
    if (this.death) { this._updateDeath(dt); return; }
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
    this._waterT = (this._waterT || 0) + dt; // drives the flowing-water ripples

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

    // Entities. A burning flare on the ground lures the horde toward it.
    const hasFlare = this.thrown.some((t) => t.kind === "flare");
    for (const z of this.zombies) z.update(dt, this.player, this.world, nav, (x, y, a, kind) => this._spawnHostile(x, y, a, kind), hasFlare ? this._nearestFlare(z.x, z.y) : null);
    this._resolveCollisions(); // no two bodies share the same space
    this._updateProjectiles(dt);
    this._updateThrown(dt);
    this._updateBurning(dt);
    for (const p of this.particles) p.update(dt);
    for (const s of this.stains) s.life -= dt * 0.15;
    for (const pk of this.pickups) pk.update(dt);
    for (const c of this.corpses) { c.t += dt; if (c.bannerT > 0) c.bannerT -= dt; }
    this._updateGibs(dt);
    this._brutesSmashFurniture(dt);
    this._breakWindowsUnderZombies();
    for (const sw of this.shockwaves) { sw.life -= dt; sw.r += (sw.max - sw.r) * clamp(dt * 12, 0, 1); }
    this.shockwaves = this.shockwaves.filter((s) => s.life > 0);

    // A corpse that finished falling settles into a permanent body decal.
    for (const c of this.corpses) {
      if (c.t >= c.dur && !c._settled) {
        c._settled = true;
        this.bodies.push({ x: c.x, y: c.y, angle: c.angle, type: c.type, r: c.r, parts: c.parts, look: c.look });
        if (this.bodies.length > 60) this.bodies.shift();
      }
    }

    // Cull dead.
    this._reapZombies();
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.particles = this.particles.filter((p) => !p.dead);
    this.pickups = this.pickups.filter((p) => !p.dead);
    this.corpses = this.corpses.filter((c) => c.t < c.dur || c.bannerT > 0);
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
        this.spawnTimer = clamp(1.4 - this.wave * 0.08, 0.26, 1.4);
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

    // Stairs move the player between the house's floors (ground <-> upstairs).
    this.floorCooldown = Math.max(0, this.floorCooldown - dt);
    if (this.world.isHouse && this.floorCooldown <= 0 && this.world.stairsCells.length) {
      const pcx = Math.floor(this.player.x / TILE), pcy = Math.floor(this.player.y / TILE);
      if (this.world.stairsCells.some((s) => s.cx === pcx && s.cy === pcy)) {
        this._changeFloor(this.floorLevel === 0 ? 1 : 0);
      }
    }
    // Manholes (street) / ladders (sewer) — fire on stepping ONTO the cell.
    if (this.world.isStreets) {
      const pcx = Math.floor(this.player.x / TILE), pcy = Math.floor(this.player.y / TILE);
      const cells = this.world.isSewers ? this.world.ladders : this.world.manholes;
      const idx = cells ? cells.findIndex((c) => c.cx === pcx && c.cy === pcy) : -1;
      if (idx >= 0) {
        if (!this._onTransit && this.floorCooldown <= 0) {
          this._onTransit = true;
          this._changeFloor(this.world.isSewers ? 0 : 1, idx);
        }
      } else {
        this._onTransit = false;
      }
    }

    // Reached exit? On upper floors the "exit" is the staircase (handled above),
    // so only the ground floor's front door advances to the next setting.
    if (this.floorLevel === 0 && dist(this.player.x, this.player.y, this.world.exit.x, this.world.exit.y) < 20) {
      this.advanceSetting();
    }

    // Camera smoothly follows the player (kept centred).
    this.cam.x += (this.player.x - this.cam.x) * clamp(dt * 8, 0, 1);
    this.cam.y += (this.player.y - this.cam.y) * clamp(dt * 8, 0, 1);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 40);

    // Damage side-flash: intensity scales with the health actually lost this
    // frame (so armour soaking a hit yields a smaller flash), then fades.
    const drop = this._prevHp - this.player.health;
    if (drop > 0.5) this.sideFlash = Math.max(this.sideFlash, clamp(drop / 22, 0.28, 1));
    this._prevHp = this.player.health;
    if (this.sideFlash > 0) this.sideFlash = Math.max(0, this.sideFlash - dt * 1.6);
    // Announce armour breaking as it happens.
    if (this.player.armorBroke) {
      this._announce(this.player.armorBroke === "helmet" ? "Helmet destroyed" : "Armor destroyed", "");
      this.player.armorBroke = null;
    }

    // HUD + death.
    this.hooks.onStats?.(this._stats());
    if (this.player.health <= 0) this._gameOver();
  }

  _stats() {
    const l = this.player.loadout;
    const w = this.player.weapon;
    let ammoStr;
    if (w.melee) ammoStr = "∞";
    else if (w.throwable) ammoStr = "×" + (l.ammo[w.ammoType] || 0);
    else {
      const clip = l.clip[l.current] ?? 0;
      ammoStr = `${clip} / ${l.ammo[w.ammoType] ?? 0}`;
    }
    const armMax = l.armorMax || 0, helmMax = l.helmetMax || 0;
    return {
      hp: this.player.health / this.player.maxHealth,
      stamina: this.player.stamina / this.player.maxStamina,
      exhausted: this.player.exhausted,
      adrenaline: this.player.adrenaline > 0,
      armor: armMax > 0 ? (l.armor || 0) / armMax : 0,
      hasArmor: (l.armor || 0) > 0,
      helmet: helmMax > 0 ? (l.helmet || 0) / helmMax : 0,
      hasHelmet: (l.helmet || 0) > 0,
      wave: this.wave,
      score: this.score,
      weapon: w.name + (this.player.reloading > 0 ? " …" : ""),
      ammo: ammoStr,
      owned: WEAPON_ORDER.filter((k) => l.owned[k]),
      current: l.current,
      reloading: this.player.reloading > 0,
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

  // Directly equip a weapon (from the on-screen weapon buttons).
  selectWeapon(id) {
    const l = this.player.loadout;
    if (!l.owned[id] || l.current === id) return;
    l.current = id;
    this.player.reloading = 0;
    this._announce(WEAPONS[id].name);
    this.hooks.vibrate?.(10);
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
    // The knife has three attacks; other melee just swings.
    const variant = (w.melee && w.kind === "melee_knife") ? pick(["swing", "stab", "lunge"]) : "swing";
    p.triggerRecoil(w, variant); // kick the arms/weapon (gun recoil or melee attack)

    if (w.melee) { this._meleeSwing(w, variant); return; }
    if (w.throwable) { this._throw(w); return; }

    p.loadout.clip[p.loadout.current]--;
    const pellets = w.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const a = p.angle + rand(-w.spread, w.spread);
      const proj = new Projectile(p.x + Math.cos(p.angle) * 12, p.y + Math.sin(p.angle) * 12, a, {
        speed: w.speed, damage: w.damage, range: w.range, knockback: w.knockback,
        pierce: w.pierce || 0, explosive: w.explosive || 0, kind: w.explosive ? "rocket" : "bullet",
        sever: w.sever || 0, hs: w.hs || 0, r: w.explosive ? 3 : 1.6,
      });
      this.projectiles.push(proj);
    }
    // Feedback: muzzle smoke, casing, shake.
    this.shake += w.explosive ? 8 : w.pellets > 1 ? 4 : 2;
    this._ejectCasing(p);
    this._muzzleSmoke(p);
    if (w.explosive || w.pellets > 1) this.hooks.vibrate?.(30);
  }

  _meleeSwing(w, variant) {
    const p = this.player;
    // Stab/lunge reach a little further and narrower; swing is a wide arc.
    const thrust = variant === "lunge" ? 12 : variant === "stab" ? 8 : 0;
    const arc = variant === "swing" ? w.arc : w.arc * 0.55;
    const range = w.range + thrust;
    let hit = false;
    for (const z of this.zombies) {
      const d = dist(p.x, p.y, z.x, z.y);
      if (d > range + z.r) continue;
      // Anything pressed right up against you is hit regardless of facing — at
      // point-blank a small lateral offset is a huge angle, so small/fast foes
      // (dogs, crawlers, runners) would otherwise slip a strict arc.
      const a = angleTo(p.x, p.y, z.x, z.y);
      // Robust angular difference (correct for any facing, incl. near ±π).
      const da = Math.abs(((a - p.angle + Math.PI * 3) % TAU) - Math.PI);
      // Point-blank widens the reach to a broad front/side cone (not the rear).
      const contact = d <= p.r + z.r + 9 && da <= 2.0;
      if (contact || da <= arc / 2) {
        const dmg = w.damage * (variant === "lunge" ? 1.3 : 1);
        this._damageZombie(z, dmg, p.angle, w.knockback, w.sever || 0, w.hs || 0);
        this._hitGore(z.x, z.y, p.angle, z);
        hit = true;
      }
    }
    // Melee also smashes furniture / doors in front of the player (axe excels at doors).
    const fx = p.x + Math.cos(p.angle) * (range * 0.7), fy = p.y + Math.sin(p.angle) * (range * 0.7);
    const f = this.world.furnitureAt(fx, fy);
    if (f) { this._damageFurniture(f, w.damage, p.angle, w.knockback); hit = true; }
    const door = this.world.doorAt(Math.floor(fx / TILE), Math.floor(fy / TILE));
    if (door && !door.broken && (door.locked || !door.open)) {
      const broke = this.world.hitDoor(door, w.damage * (w.doorMul || 1));
      this._splinter(fx, fy, broke); hit = true;
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
      let hitZombie = false;
      for (const z of this.zombies) {
        if (z.dead || proj.hitSet.has(z)) continue;
        if (this._segHitsCircle(proj.px, proj.py, proj.x, proj.y, z.x, z.y, z.r + proj.r)) {
          proj.hitSet.add(z);
          hitZombie = true;
          if (proj.explosive) { this._explode(z.x, z.y, proj); proj.dead = true; break; }
          this._damageZombie(z, proj.damage, proj.angle, proj.knockback, proj.sever || 0, proj.hs || 0);
          this._hitGore(z.x, z.y, proj.angle, z);
          if (proj.pierce > 0) proj.pierce--;
          else { proj.dead = true; break; }
        }
      }
      // Bullet passed no zombie but struck TALL furniture — damage & (usually)
      // stop it. Low pieces (tables/chairs/couches) are shot clean over.
      if (!hitZombie && !proj.explosive && proj.kind === "bullet") {
        const f = this.world.furnitureHitBySegment(proj.px, proj.py, proj.x, proj.y, true);
        if (f) { this._damageFurniture(f, proj.damage, proj.angle, proj.knockback); if (proj.pierce > 0) proj.pierce--; else proj.dead = true; }
      }
      if (proj.dead && proj.explosive) this._explode(proj.x, proj.y, proj);
      else if (proj.dead && !proj.hostile && proj.kind === "bullet") {
        // Shatter a window / chew through a door the bullet stopped at; otherwise a spark.
        const cx = Math.floor(proj.x / TILE), cy = Math.floor(proj.y / TILE);
        const tile = this.world.tileAt(cx, cy);
        if (tile === T.WINDOW) { this.world.breakWindow(cx, cy); this._glass(proj.x, proj.y); }
        else if (tile === T.DOOR) {
          const d = this.world.doorAt(cx, cy);
          const broke = this.world.hitDoor(d, proj.damage);
          this._splinter(proj.x, proj.y, broke);
        } else this._spark(proj.x, proj.y);
      }
    }
  }

  _explode(x, y, proj) {
    const radius = proj.explosive;
    const blast = radius + 26; // the shockwave reaches a bit past the fireball
    const sever = proj.sever != null ? proj.sever : 0.6;
    // Everyone in the blast is hurt and hurled outward.
    for (const z of this.zombies) {
      const d = dist(x, y, z.x, z.y);
      if (d < blast + z.r) {
        const falloff = clamp(1 - d / (blast + z.r), 0.15, 1);
        const a = angleTo(x, y, z.x, z.y);
        this._damageZombie(z, proj.damage * falloff, a, 360 * falloff, sever * falloff);
        this._blood(z.x, z.y, a, 8);
      }
    }
    // Blow apart AND fling nearby furniture (wrecks skid outward).
    for (const f of this.world.furniture) {
      if (f.broken) continue;
      const d = dist(x, y, f.x, f.y);
      if (d < blast + Math.max(f.hw, f.hh)) {
        const a = angleTo(x, y, f.x, f.y);
        this._damageFurniture(f, 999, a, 260);
        const push = 44 * clamp(1 - d / blast, 0, 1);
        f.x += Math.cos(a) * push; f.y += Math.sin(a) * push;
      }
    }
    // The player is caught too: damaged AND blown back along the shockwave.
    const pd = dist(x, y, this.player.x, this.player.y);
    if (pd < blast) {
      const falloff = clamp(1 - pd / blast, 0, 1);
      this.player.hurt(34 * falloff);
      const a = pd < 0.001 ? rand(0, TAU) : angleTo(x, y, this.player.x, this.player.y);
      this.player.vx += Math.cos(a) * 440 * falloff;
      this.player.vy += Math.sin(a) * 440 * falloff;
    }
    // Break windows / doors in the blast so the shockwave really shatters things.
    const bc = Math.floor(blast / TILE);
    const ccx = Math.floor(x / TILE), ccy = Math.floor(y / TILE);
    for (let gy = ccy - bc; gy <= ccy + bc; gy++) for (let gx = ccx - bc; gx <= ccx + bc; gx++) {
      if (dist(x, y, (gx + 0.5) * TILE, (gy + 0.5) * TILE) > blast) continue;
      const t = this.world.tileAt(gx, gy);
      if (t === T.WINDOW) { this.world.breakWindow(gx, gy); this._glass((gx + 0.5) * TILE, (gy + 0.5) * TILE); }
      else if (t === T.DOOR) { const dd = this.world.doorAt(gx, gy); if (dd && !dd.broken) this.world.hitDoor(dd, 999); }
    }
    // Expanding shockwave ring + fireball FX.
    this.shockwaves.push({ x, y, r: 8, max: blast + 12, life: 0.45 });
    for (let i = 0; i < 30; i++) {
      const a = rand(0, TAU), s = rand(40, 220);
      this.particles.push(new Particle(x, y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.2, 0.65),
        color: pick(["#ffce54", "#ff7043", "#ffffff", "#6b6b6b", "#ffab40"]), size: randInt(2, 4), drag: 0.86,
      }));
    }
    this.shake += 16;
    this.hooks.vibrate?.(60);
  }

  // ------------------------------------------------------- Throwables
  _throw(w) {
    const p = this.player;
    p.loadout.ammo[w.ammoType] = (p.loadout.ammo[w.ammoType] || 0) - 1;
    this.thrown.push(new Thrown(p.x + Math.cos(p.angle) * 10, p.y + Math.sin(p.angle) * 10, p.angle, {
      kind: w.kind, speed: w.throwSpeed, fuse: w.fuse || 2.5,
      explosive: w.explosive || 0, damage: w.damage || 0, knockback: w.knockback || 0, sever: w.sever || 0,
    }));
    this._announce(w.name, "thrown");
    this.shake += 1;
  }

  _updateThrown(dt) {
    for (const t of this.thrown) {
      t.update(dt, this.world);
      if (t.kind === "grenade") {
        if (chance(0.5)) this.particles.push(new Particle(t.x, t.y - t.z, { vx: rand(-6, 6), vy: rand(-14, -4), life: rand(0.2, 0.4), color: "rgba(120,120,120,0.5)", size: 2, drag: 0.85 }));
        if (t.fuse <= 0) { this._explode(t.x, t.y, t); t.dead = true; }
      } else { // flare: hisses out red light and sparks while it burns
        if (chance(0.85)) this.particles.push(new Particle(t.x + rand(-2, 2), t.y - t.z, { vx: rand(-20, 20), vy: rand(-50, -12), life: rand(0.25, 0.55), color: pick(["#ff5a2a", "#ffce54", "#ff8a3a", "#ffffff"]), size: randInt(1, 2), drag: 0.84 }));
        if (chance(0.25)) this.stains.push({ x: t.x + rand(-3, 3), y: t.y + rand(-3, 3), r: rand(2, 4), life: rand(2, 4), color: "#5a1a08" });
        if (t.fuse <= 0) t.dead = true;
      }
    }
    this.thrown = this.thrown.filter((t) => !t.dead);
  }

  // The nearest burning flare on the ground (a lure the horde flocks toward).
  _nearestFlare(x, y) {
    let best = null, bd = Infinity;
    for (const t of this.thrown) {
      if (t.kind !== "flare") continue;
      const d = dist2(x, y, t.x, t.y);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
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
    for (const z of zs) { const r = w.collide(z.x, z.y, z.r, true); z.x = r.x; z.y = r.y; }
    const pr = w.collide(p.x, p.y, p.r, false, true); p.x = pr.x; p.y = pr.y;
  }

  _damageZombie(z, dmg, angle, force, sever = 0, hs = 0) {
    // Chance for an instant headshot kill (not from explosions).
    if (!z.dead && hs > 0 && Math.random() < hs) {
      z.hp = 0; z.dead = true;
      this._killZombie(z, angle, true);
      return;
    }
    const res = z.damage(dmg, angle, force, sever);
    if (res.severed) this._severFX(z, res.severed, angle);
    if (res.dead) this._killZombie(z, angle, false);
  }

  // A limb tears off: fling the actual body part (it lands and stays), spray blood.
  _severFX(z, part, angle) {
    this._blood(z.x, z.y, angle, 6);
    // The severed limb flies off with a spin and settles on the ground.
    const a = angle + rand(-0.7, 0.7), s = rand(70, 150);
    this.gibs.push({
      x: z.x, y: z.y - 5, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 50,
      z: 5, vz: rand(40, 90), angle: rand(0, TAU), spin: rand(-14, 14),
      part, color: part.endsWith("leg") ? "#6a7a34" : "#7a8f3a", limbColor: ZOMBIE_LIMB[z.type] || "#72a83a",
    });
    for (let i = 0; i < 3; i++) {
      const ba = angle + rand(-1, 1), bs = rand(40, 120);
      this.particles.push(new Particle(z.x, z.y, {
        vx: Math.cos(ba) * bs, vy: Math.sin(ba) * bs, life: rand(0.5, 1.1),
        color: pick(["#a01818", "#7a1010"]), size: randInt(2, 4), drag: 0.85, stain: true,
      }));
    }
    this.stains.push({ x: z.x + rand(-4, 4), y: z.y + rand(-4, 4), r: rand(3, 6), life: rand(8, 14), color: "#4a0c0c" });
    this.shake += 2;
    if (z.prone) this._announce("Legless!");
  }

  // Flying limbs fall under gravity, tumble, and settle into ground decals.
  _updateGibs(dt) {
    for (const g of this.gibs) {
      g.x += g.vx * dt; g.y += g.vy * dt;
      g.vx *= Math.pow(0.1, dt); g.vy *= Math.pow(0.1, dt);
      g.z += g.vz * dt; g.vz -= 260 * dt; // height above ground
      g.angle += g.spin * dt;
      if (g.z <= 0) {
        g.z = 0;
        this.limbs.push({ x: g.x, y: g.y, angle: g.angle, part: g.part, color: g.limbColor });
        if (this.limbs.length > 80) this.limbs.shift();
        this.stains.push({ x: g.x, y: g.y, r: rand(3, 5), life: rand(8, 14), color: "#4a0c0c" });
        g.dead = true;
      }
    }
    this.gibs = this.gibs.filter((g) => !g.dead);
  }

  _damageFurniture(f, dmg, angle, force) {
    const destroyed = this.world.hitFurniture(f, dmg, angle, force);
    // Splinter debris.
    for (let i = 0; i < (destroyed ? 10 : 3); i++) {
      const a = angle + rand(-1.2, 1.2), s = rand(40, destroyed ? 170 : 90);
      this.particles.push(new Particle(f.x + rand(-f.hw, f.hw), f.y + rand(-f.hh, f.hh), {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.8),
        color: pick(["#8a6a44", "#6b4a28", "#5a4632", "#a0824e"]), size: randInt(2, 4), drag: 0.84,
      }));
    }
    this.shake += destroyed ? 4 : 1;
    if (destroyed) this.hooks.vibrate?.(20);
  }

  // Zombies climbing through a window smash the glass into an open gap.
  _breakWindowsUnderZombies() {
    if (!this.world.isHouse) return;
    for (const z of this.zombies) {
      const cx = Math.floor(z.x / TILE), cy = Math.floor(z.y / TILE);
      if (this.world.tileAt(cx, cy) === T.WINDOW && this.world.breakWindow(cx, cy)) this._glass(z.x, z.y);
    }
  }

  _glass(x, y) {
    for (let i = 0; i < 10; i++) {
      const a = rand(0, TAU), s = rand(30, 110);
      this.particles.push(new Particle(x, y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.6),
        color: pick(["#bcd8e0", "#9fc4cf", "#e0f0f4", "#8aa8b0"]), size: randInt(1, 2), drag: 0.85,
      }));
    }
    this.shake += 2;
  }

  // Brutes barge through furniture, smashing anything they lean on.
  _brutesSmashFurniture(dt) {
    for (const z of this.zombies) {
      if (z.type !== "brute" && !z.leaping) continue;
      const f = this.world.furnitureAt(z.x + z.vx * 0.05, z.y + z.vy * 0.05) || this.world.furnitureAt(z.x, z.y);
      if (f) this._damageFurniture(f, (z.leaping ? 60 : 40) * dt * 6, z.angle, 0);
    }
  }

  // Wrecked vehicles smoulder: licking flames and rising smoke.
  _updateBurning(dt) {
    for (const f of this.world.furniture) {
      if (!f.burning || f.broken) continue;
      f._emberT = (f._emberT || 0) - dt;
      if (f._emberT > 0) continue;
      f._emberT = rand(0.05, 0.14);
      this.particles.push(new Particle(f.x + rand(-f.hw * 0.6, f.hw * 0.6), f.y + rand(-f.hh * 0.5, f.hh * 0.5), {
        vx: rand(-8, 8), vy: rand(-46, -16), life: rand(0.3, 0.7),
        color: pick(["#ff9030", "#ffce54", "#ff5a2a", "#c0341a"]), size: randInt(2, 3), drag: 0.86, gravity: -26,
      }));
      if (chance(0.6)) this.particles.push(new Particle(f.x + rand(-6, 6), f.y - 6, {
        vx: rand(-10, 10), vy: rand(-30, -12), life: rand(0.7, 1.3),
        color: pick(["rgba(60,60,60,0.5)", "rgba(90,90,90,0.4)", "rgba(40,40,40,0.5)"]), size: randInt(3, 5), drag: 0.9,
      }));
    }
  }

  _killZombie(z, angle, headshot = false) {
    this.score += z.def.score + (headshot ? 15 : 0);
    this.player.kills++;
    // Gore burst (plus brains + a HEADSHOT banner on a headshot).
    this._gore(z.x, z.y, angle, z.def.gore);
    if (headshot) this._brains(z.x, z.y, angle);
    // The body falls down: hand it to the corpse list for a collapse animation.
    this.corpses.push({
      x: z.x, y: z.y, angle: z.angle, type: z.type, r: z.r,
      parts: z.parts, prone: z.prone, t: 0, dur: 0.5, look: z.look,
      headshot, bannerT: headshot ? 1.3 : 0,
    });
    // Chance to drop loot.
    if (chance(0.14)) {
      const roll = rand(0, 1);
      if (roll < 0.4) this.pickups.push(new Pickup(z.x, z.y, "medkit"));
      else if (roll < 0.7) this.pickups.push(new Pickup(z.x, z.y, "adrenaline"));
      else this.pickups.push(new Pickup(z.x, z.y, "ammo", { type: pick(["rounds", "shells"]), amount: randInt(8, 20) }));
    }
    z.dead = true;
  }

  // Brain matter burst for a headshot.
  _brains(x, y, angle) {
    for (let i = 0; i < 16; i++) {
      const a = angle + rand(-1.3, 1.3), s = rand(60, 190);
      this.particles.push(new Particle(x, y - 6, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: rand(0.6, 1.4),
        color: pick(["#d98c9c", "#c07088", "#e6c2c8", "#a01818", "#7a1010"]),
        size: randInt(2, 4), drag: 0.84, gravity: 210, stain: true,
      }));
    }
    this.stains.push({ x, y, r: rand(5, 9), life: rand(10, 16), color: "#5a1020" });
    this.shake += 5;
    this.hooks.vibrate?.(45);
    this._announce("HEADSHOT!");
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

  // A wet hit: blood spray plus chunks of flesh & torn clothing that fly off.
  _hitGore(x, y, angle, z) {
    this._blood(x, y, angle, 7);
    const cloth = z && z.look ? z.look.cloth : "#5a5347";
    const n = randInt(3, 5);
    for (let i = 0; i < n; i++) {
      const a = angle + rand(-1.1, 1.1), s = rand(40, 160);
      this.particles.push(new Particle(x, y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.4, 1.0),
        color: chance(0.5) ? cloth : pick(["#7a1010", "#8a2a1a", "#6a8a2a", "#a01818"]),
        size: randInt(1, 3), drag: 0.82, stain: true,
      }));
    }
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
    // Brass tumbles out of the ejection port (to the player's right), arcs and lands.
    const a = p.angle + Math.PI / 2 + rand(-0.25, 0.25);
    const s = rand(80, 130);
    const bx = p.x + Math.cos(p.angle) * 6, by = p.y + Math.sin(p.angle) * 6;
    this.particles.push(new Particle(bx, by, {
      vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.7,
      color: "#e0b83a", size: 3, drag: 0.9, gravity: 260, kind: "casing",
      spin: rand(-24, 24), angle: p.angle,
    }));
  }

  _muzzleSmoke(p) {
    const tx = p.x + Math.cos(p.angle) * 15, ty = p.y + Math.sin(p.angle) * 15;
    for (let i = 0; i < 2; i++) {
      const a = p.angle + rand(-0.5, 0.5);
      this.particles.push(new Particle(tx, ty, {
        vx: Math.cos(a) * rand(10, 40), vy: Math.sin(a) * rand(10, 40) - 10, life: rand(0.25, 0.5),
        color: pick(["rgba(180,180,180,0.5)", "rgba(140,140,140,0.4)"]), size: randInt(2, 3), drag: 0.82,
      }));
    }
  }

  // ------------------------------------------------------- Pickups & doors
  _autoGrab() {
    for (const pk of this.pickups) {
      if (pk.dead) continue;
      if (dist(pk.x, pk.y, this.player.x, this.player.y) < this.player.r + pk.r) this._grab(pk);
    }
  }

  _interact() {
    // Doors first: unlock locked ones with a key, otherwise open/close.
    const d = this.world.doorNear(this.player.x, this.player.y);
    if (d && !d.broken) {
      if (d.locked) {
        if ((this.player.loadout.keys || 0) > 0) {
          this.player.loadout.keys--; d.locked = false; d.open = true;
          this._announce("Unlocked", "used a key");
        } else {
          this._announce("Locked", "find a key, or break it down");
        }
      } else {
        d.open = !d.open;
      }
      return;
    }
    let best = null, bd = 26 * 26;
    for (const pk of this.pickups) {
      const dd = dist2(pk.x, pk.y, this.player.x, this.player.y);
      if (dd < bd) { bd = dd; best = pk; }
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
        p.stamina = p.maxStamina; p.exhausted = false; p.invuln = 3; p.adrenaline = 14;
        this._announce("Adrenaline!", "rush — slow-burn stamina"); break;
      case "key":
        l.keys = (l.keys || 0) + 1; this._announce("Key", "keys: " + l.keys); break;
      case "armor": {
        const d = pk.data || { value: 40, max: 50 };
        l.armorMax = Math.max(l.armorMax || 0, d.max);
        l.armor = Math.min((l.armor || 0) + d.value, l.armorMax);
        this._announce("Body Armor", "+" + d.value); break;
      }
      case "helmet": {
        const d = pk.data || { value: 25, max: 30 };
        l.helmetMax = Math.max(l.helmetMax || 0, d.max);
        l.helmet = Math.min((l.helmet || 0) + d.value, l.helmetMax);
        this._announce("Helmet", "+" + d.value); break;
      }
      case "grenade": {
        const amt = (pk.data && pk.data.amount) || 1;
        l.owned.grenade = true; l.ammo.grenades = (l.ammo.grenades || 0) + amt;
        this._announce("Grenades", "+" + amt); break;
      }
      case "flare": {
        const amt = (pk.data && pk.data.amount) || 1;
        l.owned.flare = true; l.ammo.flares = (l.ammo.flares || 0) + amt;
        this._announce("Flares", "+" + amt); break;
      }
    }
    this.hooks.vibrate?.(15);
    pk.dead = true;
  }

  _gameOver() {
    if (this.death) return;
    // Don't cut to the game-over screen — bleed out. The world keeps running
    // while a sheet of blood floods the screen over the next minute; the YOU
    // DIED card fades in a beat later so the blood drips over it.
    this.player.deadPose = true;
    this.death = { t: 0, dur: 60, dialogShown: false };
    this.blood = new DeathBlood(this.death.dur);
    this.shake += 6;
    this.hooks.vibrate?.([80, 50, 160]);
  }

  // The bleed-out: the scene lingers (zombies feed over the corpse) while the
  // blood overlay floods the screen; the game-over card appears partway in.
  _updateDeath(dt) {
    const d = this.death;
    d.t += dt;
    const nav = this._nav || { flow: () => ({ seen: 0, fx: 0, fy: 0 }), los: () => false };
    for (const z of this.zombies) z.update(dt, this.player, this.world, nav, () => {});
    this._resolveCollisions();
    for (const p of this.particles) p.update(dt);
    for (const s of this.stains) s.life -= dt * 0.15;
    this._updateGibs(dt);
    this.particles = this.particles.filter((p) => !p.dead);
    this.stains = this.stains.filter((s) => s.life > 0);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 40);

    this.blood.update(dt);

    // Reveal the YOU DIED card a moment in, then let blood interact with it.
    if (!d.dialogShown && d.t > 1.6) {
      d.dialogShown = true;
      this.hooks.onGameOver?.({ score: this.score, wave: this.wave, kills: this.player.kills });
      this.blood.attachDialog();
    }
    // A minute in, the screen is drowned — stop the loop (card & blood remain).
    if (d.t >= d.dur) this.running = false;
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
    this._drawBodies(ctx);
    this._drawLimbs(ctx);
    this._drawFurniture(ctx);
    this._drawCorpses(ctx);
    this._drawPickups(ctx);
    this._drawZombiesBehind(ctx);
    this._drawThrown(ctx);
    this._drawPlayer(ctx);
    this._drawGibs(ctx);
    this._drawParticles(ctx);
    this._drawShockwaves(ctx);
    this._drawFog(ctx, -ox, -oy);
    this._drawProjectiles(ctx); // over the fog so tracers are always crisp
    this._drawBanners(ctx);
    this._drawExitBeacon(ctx);
    ctx.restore();

    this._drawMinimap();

    // Damage side-flash: blood-red bars sweeping in from both edges, fading.
    if (this.sideFlash > 0.01) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const a = this.sideFlash * 0.62, W = this.canvas.width, H = this.canvas.height, bw = W * 0.17;
      let g = ctx.createLinearGradient(0, 0, bw, 0);
      g.addColorStop(0, `rgba(150,0,0,${a.toFixed(3)})`); g.addColorStop(1, "rgba(150,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, bw, H);
      g = ctx.createLinearGradient(W, 0, W - bw, 0);
      g.addColorStop(0, `rgba(150,0,0,${a.toFixed(3)})`); g.addColorStop(1, "rgba(150,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(W - bw, 0, bw, H);
      ctx.restore();
    }

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

  // Ray-march from the player to a tile; visible unless a *different* solid
  // cell blocks the way (so the wall you're facing is lit, but not what's behind it).
  _tileVisible(cx, cy) {
    const px = this.player.x, py = this.player.y;
    const tx = (cx + 0.5) * TILE, ty = (cy + 0.5) * TILE;
    const dx = tx - px, dy = ty - py;
    const steps = Math.ceil(Math.hypot(dx, dy) / (TILE * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps, sx = px + dx * t, sy = py + dy * t;
      if ((Math.floor(sx / TILE) !== cx || Math.floor(sy / TILE) !== cy) && this.world.solidAt(sx, sy)) return false;
    }
    return true;
  }

  // Fog of war: dark unexplored, dim remembered, clear within sight (feathered).
  _drawFog(ctx, camX, camY) {
    const w = this.world, R = 6.4;
    const pcx = this.player.x / TILE, pcy = this.player.y / TILE;
    const startCX = Math.floor(camX / TILE) - 1, startCY = Math.floor(camY / TILE) - 1;
    const endCX = startCX + Math.ceil(this.bufW / TILE) + 2, endCY = startCY + Math.ceil(this.bufH / TILE) + 2;
    for (let cy = startCY; cy <= endCY; cy++) {
      for (let cx = startCX; cx <= endCX; cx++) {
        let a;
        if (!w.inBounds(cx, cy)) a = 0.98;
        else {
          const idx = w.idx(cx, cy);
          const d = Math.hypot(cx + 0.5 - pcx, cy + 0.5 - pcy);
          if (d <= R && this._tileVisible(cx, cy)) {
            w.explored[idx] = 1;
            a = clamp((d - (R - 1.8)) / 1.8, 0, 1) * 0.55; // feathered sight edge
          } else if (w.explored[idx]) a = 0.68; // remembered
          else a = 0.98;                        // never seen
        }
        if (a > 0.02) { ctx.fillStyle = `rgba(4,5,8,${a.toFixed(3)})`; ctx.fillRect(cx * TILE, cy * TILE, TILE + 1, TILE + 1); }
      }
    }
  }

  _drawMinimap() {
    if (!this.minimapCtx) {
      const el = document.getElementById("minimap");
      if (!el) return;
      this.minimapEl = el; this.minimapCtx = el.getContext("2d");
    }
    // Throttle to keep it cheap.
    this.minimapT = (this.minimapT || 0) + 1;
    if (this.minimapT % 4 !== 0 && this._miniDrew) return;
    this._miniDrew = true;
    const w = this.world, mc = this.minimapCtx, S = this.minimapEl.width;
    const scale = S / Math.max(w.cols, w.rows);
    const oxm = (S - w.cols * scale) / 2, oym = (S - w.rows * scale) / 2;
    mc.clearRect(0, 0, S, S);
    mc.fillStyle = "rgba(6,9,10,0.55)"; mc.fillRect(0, 0, S, S);
    for (let cy = 0; cy < w.rows; cy++) {
      for (let cx = 0; cx < w.cols; cx++) {
        if (!w.explored[w.idx(cx, cy)]) continue;
        const t = w.tileAt(cx, cy);
        mc.fillStyle = (t === T.WALL || t === T.PROP) ? "#3c4636" : t === T.FENCE ? "#4a5a3a" : t === T.WINDOW ? "#7fb0c0" : t === T.EXIT ? "#39d353" : t === T.STAIRS ? "#8a6d40" : t === T.MANHOLE ? "#d0c060" : "#6f7d5e";
        mc.fillRect(oxm + cx * scale, oym + cy * scale, scale + 0.6, scale + 0.6);
      }
    }
    // Exit marker (if discovered) pulsing.
    const ex = Math.floor(w.exit.x / TILE), ey = Math.floor(w.exit.y / TILE);
    if (w.explored[w.idx(ex, ey)]) { mc.fillStyle = "#8dffa0"; mc.fillRect(oxm + ex * scale - 0.5, oym + ey * scale - 0.5, scale + 1.5, scale + 1.5); }
    // Zombies currently in sight.
    mc.fillStyle = "#e0483a";
    for (const z of this.zombies) {
      const zcx = Math.floor(z.x / TILE), zcy = Math.floor(z.y / TILE);
      if (w.inBounds(zcx, zcy) && Math.hypot(z.x - this.player.x, z.y - this.player.y) < TILE * 6.4 && this._tileVisible(zcx, zcy)) {
        mc.fillRect(oxm + z.x / TILE * scale - 0.8, oym + z.y / TILE * scale - 0.8, 1.8, 1.8);
      }
    }
    // Player.
    mc.fillStyle = "#ffffff";
    mc.fillRect(oxm + this.player.x / TILE * scale - 1, oym + this.player.y / TILE * scale - 1, 2.4, 2.4);
    mc.fillStyle = "#72a83a";
    mc.fillRect(oxm + this.player.x / TILE * scale - 0.6, oym + this.player.y / TILE * scale - 0.6, 1.6, 1.6);
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
          if (w.isSewers) {
            // Grimy concrete tunnel wall with a lit top edge.
            ctx.fillStyle = "#232a2c"; ctx.fillRect(x, y, TILE, TILE);
            if (w.tileAt(cx, cy - 1) !== T.WALL && w.tileAt(cx, cy - 1) !== undefined) {
              ctx.fillStyle = "#33403f"; ctx.fillRect(x, y, TILE, 6);
              ctx.fillStyle = "rgba(0,0,0,0.32)"; ctx.fillRect(x, y + TILE - 4, TILE, 4);
            }
            ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(x, y + TILE / 2 - 1, TILE, 2); // grout line
          } else if (w.isStreets) {
            const border = cx === 0 || cy === 0 || cx === w.cols - 1 || cy === w.rows - 1;
            if (border) {
              // Hedge / tree-line along the edge of the neighbourhood.
              ctx.fillStyle = "#1c2a17"; ctx.fillRect(x, y, TILE, TILE);
              ctx.fillStyle = "#26381f"; ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 6);
              ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(x, y + TILE - 3, TILE, 3);
            } else {
              // Rooftop of a house or shed, coloured by its roof id.
              const rid = w.floorTint[w.idx(cx, cy)];
              const roof = rid === 11 ? "#4a5560" : rid === 12 ? "#5a4a34" : "#6e3b2c";
              const ridge = rid === 11 ? "#5c6a76" : rid === 12 ? "#6f5c42" : "#8a4c39";
              ctx.fillStyle = roof; ctx.fillRect(x, y, TILE, TILE);
              ctx.fillStyle = "rgba(0,0,0,0.16)";
              for (let sy = 0; sy < TILE; sy += 6) ctx.fillRect(x, y + sy, TILE, 1.5); // shingle rows
              if (w.tileAt(cx, cy - 1) !== T.WALL) { ctx.fillStyle = ridge; ctx.fillRect(x, y, TILE, 4); }       // sunlit ridge
              if (w.tileAt(cx, cy + 1) !== T.WALL) { ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(x, y + TILE - 4, TILE, 4); } // eave shadow
            }
          } else {
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
          }
        } else if (t === T.FENCE) {
          // Grass underfoot with a tidy wooden picket fence line.
          const rp = w.floorPair(cx, cy) || [set.floor, set.floor2];
          ctx.fillStyle = ((cx + cy) & 1) ? rp[0] : rp[1];
          ctx.fillRect(x, y, TILE, TILE);
          const hRun = w.tileAt(cx - 1, cy) === T.FENCE || w.tileAt(cx + 1, cy) === T.FENCE;
          const rail = "#5a4a2e", wood = "#7a6038", woodTop = "#96774c";
          if (hRun) {
            ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(x, y + TILE / 2 + 6, TILE, 2); // cast shadow
            ctx.fillStyle = rail; ctx.fillRect(x, y + TILE / 2 - 1, TILE, 3);               // top rail
            for (let px = 2; px < TILE; px += 7) { ctx.fillStyle = wood; ctx.fillRect(x + px, y + TILE / 2 - 8, 3, 15); ctx.fillStyle = woodTop; ctx.fillRect(x + px, y + TILE / 2 - 8, 3, 2); }
          } else {
            ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(x + TILE / 2 + 6, y, 2, TILE);
            ctx.fillStyle = rail; ctx.fillRect(x + TILE / 2 - 1, y, 3, TILE);
            for (let py = 2; py < TILE; py += 7) { ctx.fillStyle = wood; ctx.fillRect(x + TILE / 2 - 8, y + py, 15, 3); ctx.fillStyle = woodTop; ctx.fillRect(x + TILE / 2 - 8, y + py, 2, 3); }
          }
        } else if (t === T.WINDOW) {
          // Wall with a glass pane the horde can smash through.
          ctx.fillStyle = set.wall; ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = set.wallTop; ctx.fillRect(x, y, TILE, 6);
          ctx.fillStyle = "rgba(150,205,220,0.5)"; ctx.fillRect(x + 5, y + 8, TILE - 10, TILE - 15);
          ctx.strokeStyle = "#241a12"; ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 5, y + 8, TILE - 10, TILE - 15);
          ctx.beginPath(); ctx.moveTo(x + TILE / 2, y + 8); ctx.lineTo(x + TILE / 2, y + TILE - 7); ctx.stroke();
          ctx.lineWidth = 1;
        } else {
          // floor with a subtle checker (tinted by room in the house, by
          // terrain — grass / asphalt / sidewalk — in the streets)
          let fc0 = set.floor, fc1 = set.floor2;
          const rp = w.floorPair(cx, cy);
          if (rp) { fc0 = rp[0]; fc1 = rp[1]; }
          ctx.fillStyle = ((cx + cy) & 1) ? fc0 : fc1;
          ctx.fillRect(x, y, TILE, TILE);
          if (w.isStreets && !w.isSewers) {
            const rid = w.floorTint[w.idx(cx, cy)];
            if (rid === 5 && (cy & 1)) { ctx.fillStyle = "rgba(210,190,80,0.7)"; ctx.fillRect(x + TILE / 2 - 1, y + 4, 2, TILE - 8); }
            else if (rid === 6 && (cx & 1)) { ctx.fillStyle = "rgba(210,190,80,0.7)"; ctx.fillRect(x + 4, y + TILE / 2 - 1, TILE - 8, 2); }
          }
          if (w.isSewers && t === T.FLOOR) {
            // Flowing water: scrolling ripple lines; deep channels are darker.
            const deep = w.floorTint[w.idx(cx, cy)] === 2;
            if (deep) { ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.fillRect(x, y, TILE, TILE); }
            const flow = (this._waterT || 0) * 11;
            ctx.fillStyle = deep ? "rgba(80,150,140,0.11)" : "rgba(150,190,170,0.07)";
            for (let k = 0; k < 4; k++) { const yy = y + ((k * 8 + flow) % TILE); ctx.fillRect(x + 1, yy, TILE - 2, 1.4); }
          }
          if (t === T.STAIRS) {
            ctx.fillStyle = "#5f4a2c"; ctx.fillRect(x + 2, y + 1, TILE - 4, TILE - 2);
            ctx.fillStyle = "#3f2f1a";
            for (let st = 0; st < 4; st++) ctx.fillRect(x + 2, y + 2 + st * 7, TILE - 4, 2.5);
            ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fillRect(x + 2, y + 1, TILE - 4, 3);
          }
          if (t === T.MANHOLE) {
            const cxp = x + TILE / 2, cyp = y + TILE / 2;
            if (w.isSewers) {
              // A ladder up, lit by a shaft of daylight from the street.
              ctx.fillStyle = "#3a3a30"; ctx.beginPath(); ctx.arc(cxp, cyp, 11, 0, TAU); ctx.fill();
              ctx.fillStyle = "rgba(210,220,180,0.28)"; ctx.beginPath(); ctx.arc(cxp, cyp, 8, 0, TAU); ctx.fill();
              ctx.fillStyle = "#20242a"; for (let i = -1; i <= 1; i++) ctx.fillRect(cxp - 4, cyp + i * 4 - 1, 8, 2);
              ctx.strokeStyle = "#4a4a3a"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cxp, cyp, 11, 0, TAU); ctx.stroke();
            } else {
              // An open manhole in the road: dark shaft, rim, and shoved-aside cover.
              ctx.fillStyle = "#3a3a3e"; ctx.beginPath(); ctx.arc(cxp + 13, cyp + 3, 7, 0, TAU); ctx.fill(); // cover
              ctx.fillStyle = "#0a0c0e"; ctx.beginPath(); ctx.arc(cxp, cyp, 10, 0, TAU); ctx.fill();
              ctx.strokeStyle = "#4a4a4e"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cxp, cyp, 10, 0, TAU); ctx.stroke();
              ctx.fillStyle = "#20242a"; for (let i = -1; i <= 1; i++) ctx.fillRect(cxp - 3, cyp + i * 4 - 1, 6, 1.6);
            }
            ctx.lineWidth = 1;
          }
          if (t === T.PROP) {
            if (w.isStreets) {
              // A leafy tree: ground shadow, trunk, and a layered round canopy.
              const cxp = x + TILE / 2, cyp = y + TILE / 2;
              ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(cxp, cyp + 9, 9, 4, 0, 0, TAU); ctx.fill();
              ctx.fillStyle = "#3a2a18"; ctx.fillRect(cxp - 2, cyp, 4, TILE / 2 - 3);
              ctx.fillStyle = "#26401e"; ctx.beginPath(); ctx.arc(cxp, cyp - 3, 10, 0, TAU); ctx.fill();
              ctx.fillStyle = "#31502a"; for (const [ox, oy, rr] of [[-4, -4, 5], [4, -3, 5], [0, -7, 5], [2, 1, 5]]) { ctx.beginPath(); ctx.arc(cxp + ox, cyp + oy, rr, 0, TAU); ctx.fill(); }
              ctx.fillStyle = "#3e6234"; for (const [ox, oy, rr] of [[-3, -6, 3], [2, -5, 3]]) { ctx.beginPath(); ctx.arc(cxp + ox, cyp + oy, rr, 0, TAU); ctx.fill(); }
            } else {
              ctx.fillStyle = set.accent;
              ctx.fillRect(x + 5, y + 5, TILE - 10, TILE - 10);
              ctx.fillStyle = "rgba(0,0,0,0.25)";
              ctx.fillRect(x + 5, y + TILE - 9, TILE - 10, 4);
            }
          }
          if (t === T.DOOR) {
            const d = w.doorAt(cx, cy);
            if (d && d.broken) {
              // Smashed open: splintered stubs left clinging to the frame.
              ctx.fillStyle = "#4a3320";
              ctx.fillRect(x + 3, y + 3, 3, TILE - 6);
              ctx.fillRect(x + TILE - 6, y + 3, 3, TILE - 6);
              ctx.fillStyle = "#2a1d10";
              ctx.fillRect(x + 6, y + 5, 2, 6); ctx.fillRect(x + TILE - 9, y + TILE - 12, 2, 7);
            } else {
              const openAmt = d ? d.openT : 0;
              const slide = Math.round(openAmt * (TILE - 6));
              const w0 = TILE - 6 - slide;
              ctx.fillStyle = "#6b4a28";
              ctx.fillRect(x + 3, y + 3, w0, TILE - 6);
              ctx.fillStyle = "#8a6238";
              ctx.fillRect(x + 3, y + 3, w0, 3);
              if (d && d.locked && w0 > 6) {
                // Brass lock plate on the leading edge.
                ctx.fillStyle = "#d9b64a";
                ctx.fillRect(x + 3 + w0 - 6, y + TILE / 2 - 3, 4, 6);
                ctx.fillStyle = "#7a5a12";
                ctx.fillRect(x + 3 + w0 - 5, y + TILE / 2, 2, 1);
              }
              // Cracks deepen as the door is beaten down.
              if (d && d.hp < d.maxHp && w0 > 5) {
                const frac = 1 - d.hp / d.maxHp;
                ctx.strokeStyle = `rgba(20,12,6,${(0.3 + frac * 0.5).toFixed(2)})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x + 5, y + 5); ctx.lineTo(x + 3 + w0 * 0.6, y + TILE * 0.5); ctx.lineTo(x + 6, y + TILE - 6);
                if (frac > 0.5) { ctx.moveTo(x + 3 + w0 * 0.5, y + 6); ctx.lineTo(x + 3 + w0 - 3, y + TILE - 8); }
                ctx.stroke();
              }
            }
          }
          if (t === T.EXIT) {
            // Doorway to the outside — daylight spills across the threshold.
            const cxp = x + TILE / 2, cyp = y + TILE / 2;
            const g = ctx.createRadialGradient(cxp, cyp, 2, cxp, cyp, TILE);
            g.addColorStop(0, "#fbe9b0");
            g.addColorStop(0.6, "#c8d29a");
            g.addColorStop(1, "rgba(200,210,160,0)");
            ctx.fillStyle = g;
            ctx.fillRect(x - 6, y - 6, TILE + 12, TILE + 12);
            ctx.fillStyle = "#f2e7c0"; // bright opening
            ctx.fillRect(x + 7, y + 6, TILE - 14, TILE - 8);
            ctx.fillStyle = "#3a2c1a"; // door frame
            ctx.fillRect(x + 4, y + 2, 3, TILE - 4);
            ctx.fillRect(x + TILE - 7, y + 2, 3, TILE - 4);
            ctx.fillRect(x + 4, y + 2, TILE - 8, 3);
            ctx.fillStyle = "#1f7a2f"; // EXIT sign
            ctx.fillRect(cxp - 9, y - 3, 18, 6);
            ctx.fillStyle = "#bff0c0";
            ctx.font = "5px 'Courier New', monospace";
            ctx.textAlign = "center";
            ctx.fillText("EXIT", cxp, y + 2);
            ctx.textAlign = "left";
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

  _drawBodies(ctx) {
    for (const b of this.bodies) drawBodyDecal(ctx, b.x, b.y, b.angle, b.type, b.r, b.parts, b.look);
  }

  _drawLimbs(ctx) {
    for (const l of this.limbs) drawGroundLimb(ctx, l.x, l.y, l.angle, l.part, l.color, 0);
  }

  _drawGibs(ctx) {
    for (const g of this.gibs) drawGroundLimb(ctx, g.x, g.y, g.angle, g.part, g.limbColor, g.z);
  }

  _drawThrown(ctx) {
    for (const t of this.thrown) {
      // Ground shadow, then the item lifted by its arc height z.
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath(); ctx.ellipse(t.x, t.y, 3, 1.6, 0, 0, TAU); ctx.fill();
      const yy = t.y - t.z;
      if (t.kind === "grenade") {
        ctx.save(); ctx.translate(t.x, yy); ctx.rotate(t.angle);
        ctx.fillStyle = "#3a4a2c"; ctx.fillRect(-2.5, -2.5, 5, 5);
        ctx.fillStyle = "#2a3620"; ctx.fillRect(-2.5, -0.7, 5, 1.4);
        ctx.fillStyle = "#8a8f6a"; ctx.fillRect(-1, -3.5, 2, 1.4);
        // fuse blink as it's about to blow
        if (t.fuse < 0.6 && Math.floor(t.t * 14) % 2 === 0) { ctx.fillStyle = "#ffd27a"; ctx.fillRect(-0.8, -4.2, 1.6, 1.6); }
        ctx.restore();
      } else { // flare: a hot glowing stick with a red halo
        const halo = ctx.createRadialGradient(t.x, yy, 1, t.x, yy, 22);
        halo.addColorStop(0, "rgba(255,90,40,0.5)"); halo.addColorStop(1, "rgba(255,60,20,0)");
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(t.x, yy, 22, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(t.x, yy); ctx.rotate(t.angle);
        ctx.fillStyle = "#b03030"; ctx.fillRect(-1, -3, 2, 6);
        ctx.restore();
        ctx.fillStyle = "#fff2c0"; ctx.beginPath(); ctx.arc(t.x, yy, 2, 0, TAU); ctx.fill();
      }
    }
  }

  _drawShockwaves(ctx) {
    for (const sw of this.shockwaves) {
      const a = clamp(sw.life / 0.45, 0, 1);
      ctx.strokeStyle = `rgba(255,220,160,${(a * 0.6).toFixed(3)})`;
      ctx.lineWidth = 2 + (1 - a) * 4;
      ctx.beginPath(); ctx.arc(sw.x, sw.y, sw.r, 0, TAU); ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  _drawFurniture(ctx) {
    for (const f of this.world.furniture) drawFurniture(ctx, f);
  }

  _drawCorpses(ctx) {
    // Cross-fade the standing zombie out while the body decal fades/settles in.
    for (const c of this.corpses) {
      if (c.t >= c.dur) continue; // banner may outlive the body
      const k = clamp(c.t / c.dur, 0, 1);
      // Falling zombie (first half): topple + fade.
      if (k < 0.6) {
        ctx.save();
        ctx.globalAlpha = clamp(1 - k / 0.6, 0, 1);
        ctx.translate(c.x, c.y); ctx.scale(1, 1 - k * 0.5); ctx.translate(-c.x, -c.y);
        drawZombie(ctx, c.x, c.y, c.angle, 0, c.type, c.r, false, c.parts, true, 1, 0, 0, 0, c.look);
        ctx.restore();
      }
      // Body decal fades in and settles to full size.
      ctx.save();
      ctx.globalAlpha = clamp(k * 1.4, 0, 1);
      const grow = 0.82 + 0.18 * k;
      ctx.translate(c.x, c.y); ctx.scale(grow, grow); ctx.translate(-c.x, -c.y);
      drawBodyDecal(ctx, c.x, c.y, c.angle, c.type, c.r, c.parts, c.look);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  _drawBanners(ctx) {
    for (const c of this.corpses) {
      if (!c.headshot || c.bannerT <= 0) continue;
      const p = clamp(1 - c.bannerT / 1.3, 0, 1);
      const rise = p * 12;
      const alpha = c.bannerT > 0.3 ? 1 : clamp(c.bannerT / 0.3, 0, 1);
      const y = c.y - 16 - rise;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "bold 7px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#000";
      ctx.fillText("HEADSHOT", c.x + 0.6, y + 0.6);
      ctx.fillStyle = "#ff5a3c";
      ctx.fillText("HEADSHOT", c.x, y);
      ctx.textAlign = "left";
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  _drawZombiesBehind(ctx) {
    // Sort by y for pseudo-depth.
    const w = this.world, p = this.player;
    const sorted = this.zombies.slice().sort((a, b) => a.y - b.y);
    for (const z of sorted) {
      let alpha = 1;
      // Deep sewer water conceals the horde — they only surface into view as
      // they close in on you.
      if (w.isSewers) {
        const cx = Math.floor(z.x / TILE), cy = Math.floor(z.y / TILE);
        if (w.tileAt(cx, cy) === T.FLOOR && w.floorTint[w.idx(cx, cy)] === 2) {
          alpha = clamp(1 - (dist(z.x, z.y, p.x, p.y) - 40) / 120, 0.25, 1);
        }
      }
      if (alpha < 1) ctx.globalAlpha = alpha;
      drawZombie(ctx, z.x, z.y, z.angle, z.frame, z.type, z.r, z.hurtFlash > 0, z.parts, z.prone, z.strideAmp, z.jumpH, z.vx, z.vy, z.look);
      if (alpha < 1) ctx.globalAlpha = 1;
    }
  }

  _drawPlayer(ctx) {
    const p = this.player;
    if (p.deadPose) {
      // Collapsed on the floor: tip the figure over and let it lie still.
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.translate(p.x, p.y + 2); ctx.rotate(1.45); ctx.translate(-p.x, -p.y);
      drawPlayer(ctx, p.x, p.y, p.angle, 0, false, p.weapon.kind, PLAYER_PAL,
        { recoil: 0, swingT: 0, swingDur: 1, melee: false, variant: "swing", moving: false, run: false, vx: 0, vy: 0 });
      ctx.restore();
      return;
    }
    const action = {
      recoil: p.recoil, swingT: p.swingT, swingDur: p.swingDur, melee: p.weapon.melee,
      variant: p.meleeVariant, moving: p.moving, run: p.running, vx: p.vx, vy: p.vy,
      stamina: p.stamina / p.maxStamina, idleT: p.idleT,
      helmet: (p.loadout.helmet || 0) > 0, armor: (p.loadout.armor || 0) > 0,
    };
    drawPlayer(ctx, p.x, p.y, p.angle, p.walkFrame, p.hurtFlash > 0, p.weapon.kind, PLAYER_PAL, action);
    if (p.muzzle > 0 && !p.weapon.melee) drawMuzzle(ctx, p.x, p.y, p.angle, p.weapon.explosive ? 5 : 3, p.muzzle / 0.06);
    if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) {
      ctx.strokeStyle = "rgba(224,184,58,0.7)";
      ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, TAU); ctx.stroke();
    }
    // Reload cycle indicator: an arc sweeping around the player as it reloads.
    if (p.reloading > 0 && p.weapon.reload) {
      const prog = clamp(1 - p.reloading / p.weapon.reload, 0, 1);
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, TAU); ctx.stroke();
      ctx.strokeStyle = "#ffd24a";
      ctx.beginPath(); ctx.arc(p.x, p.y, 13, -Math.PI / 2, -Math.PI / 2 + prog * TAU); ctx.stroke();
      ctx.lineWidth = 1;
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
      // Bullet tracer — a soft glow, a bright core streak, and a hot head dot
      // so rounds stay clearly visible against any background or fog.
      ctx.strokeStyle = "rgba(255,220,120,0.5)";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(pr.px, pr.py); ctx.lineTo(pr.x, pr.y); ctx.stroke();
      ctx.strokeStyle = "#fff2c0";
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(pr.px, pr.py); ctx.lineTo(pr.x, pr.y); ctx.stroke();
      ctx.fillStyle = "#fff6e0";
      ctx.beginPath(); ctx.arc(pr.x, pr.y, 1.7, 0, TAU); ctx.fill();
    }
    ctx.lineWidth = 1;
  }

  _drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = p.settled ? clamp(p.life / 6, 0, 0.9) : clamp(p.life / p.maxLife, 0, 1);
      if (p.kind === "casing") {
        // Tumbling brass shell.
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = "#e0b83a";
        ctx.fillRect(-2, -1, 4, 2);
        ctx.fillStyle = "#8a6a1a";
        ctx.fillRect(-2, -1, 1.2, 2);
        ctx.restore();
        continue;
      }
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
