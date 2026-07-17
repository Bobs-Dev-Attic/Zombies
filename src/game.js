// Core game: loop, camera, rendering, waves, combat resolution and HUD.
import { clamp, rand, randInt, chance, pick, angleTo, angleLerp, dist, dist2, TAU } from "./util.js";
import { Input } from "./input.js";
import { World, TILE, T, SETTINGS, FLOOR_MAT } from "./world.js";
import { Player, Zombie, Projectile, Particle, Pickup, Thrown, ZOMBIE_TYPES } from "./entities.js";
import { WEAPONS, WEAPON_ORDER, newLoadout } from "./weapons.js";
import { drawPlayer, drawZombie, drawPickup, drawMuzzle, drawFurniture, drawBodyDecal, drawGroundLimb } from "./sprites.js";
import { DeathBlood } from "./deathblood.js";
import { sfx } from "./audio.js";

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
    this.player = new Player(this.world.spawnPoint.x, this.world.spawnPoint.y, this._buildLoadout());
    this._applyCheats(this.player);
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
    this.flies = [];   // ambient buzzing fly swarm
    this.birds = [];   // carrion birds that pick at corpses and flee from you
    this.prints = [];  // bloody footprints / drag smears left on the floor
    this.scorches = []; // smouldering scorch marks left by explosions
    this.mines = [];   // deployed land mines waiting for something to step on them
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

  // ------------------------------------------------------- Cheats / mutators
  // Build the starting loadout, honouring the "all weapons" / "swords" mutators.
  _buildLoadout() {
    const lo = newLoadout();
    const c = this.cheats || {};
    if (c.allWeapons) {
      for (const id of WEAPON_ORDER) { lo.owned[id] = true; if (WEAPONS[id].clip) lo.clip[id] = WEAPONS[id].clip; }
      lo.ammo = { shells: 999, rounds: 999, rockets: 99, fuel: 600, grenades: 20, flares: 20, mines: 20 };
      lo.current = "rifle_auto";
    }
    if (c.swords) lo.owned.sword = true;
    if (c.unlimitedAmmo) lo.ammo = { shells: 999, rounds: 999, rockets: 99, fuel: 600, grenades: 99, flares: 99, mines: 99 };
    return lo;
  }

  // Apply the per-player mutators (half damage, unlimited ammo) to a Player.
  _applyCheats(player) {
    const c = this.cheats || {};
    player.damageTakenMul = c.halfDamage ? 0.5 : 1;
    player.unlimitedAmmo = !!c.unlimitedAmmo;
    player.superStamina = !!c.superStamina;
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
    this._applyCheats(this.player);
    this.player.health = hp; this.player.stamina = sta;
    this.player.kills = kills;
    this.zombies = []; this.projectiles = []; this.particles = []; this.pickups = []; this.stains = []; this.corpses = [];
    this.bodies = []; this.limbs = []; this.gibs = []; this.thrown = []; this.shockwaves = []; this.flies = []; this.birds = []; this.prints = []; this.scorches = []; this.mines = [];
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
    const weaponPool = ["bat", "axe", "sword", "pistol22", "pistol357", "smg",
      "shotgun", "shotgun_semi", "shotgun_sxs",
      "rifle", "rifle_semi", "rifle_auto", "bazooka", "flamethrower", "mine"];
    const crates = randInt(3, 5);
    for (let i = 0; i < crates; i++) {
      const p = this.world.randomFloorFar(this.player.x, this.player.y, 120);
      if (p) this.pickups.push(new Pickup(p.x, p.y, "weapon", pick(weaponPool)));
    }
    const ammoTypes = ["rounds", "shells", "rockets", "fuel", "mines"];
    for (let i = 0; i < randInt(4, 7); i++) {
      const p = this.world.randomFloor();
      const type = pick(ammoTypes);
      const amount = type === "rockets" ? randInt(1, 2) : type === "mines" ? randInt(2, 4) : type === "fuel" ? randInt(40, 90) : type === "shells" ? randInt(6, 14) : randInt(20, 40);
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
      pickups: this.pickups, corpses: this.corpses, gibs: this.gibs, prints: this.prints, scorches: this.scorches, mines: this.mines,
    };
    this.floorLevel = target;
    const cached = this.floorCache[target];
    if (cached) {
      this.world = cached.world;
      this.bodies = cached.bodies; this.limbs = cached.limbs; this.stains = cached.stains;
      this.pickups = cached.pickups; this.corpses = cached.corpses; this.gibs = cached.gibs;
      this.prints = cached.prints || []; this.scorches = cached.scorches || []; this.mines = cached.mines || [];
    } else {
      this.world = new World(this.settingIndex, target);
      this.bodies = []; this.limbs = []; this.stains = []; this.pickups = []; this.corpses = []; this.gibs = []; this.prints = []; this.scorches = []; this.mines = [];
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
    this.zombies = []; this.projectiles = []; this.particles = []; this.thrown = []; this.shockwaves = []; this.flies = []; this.birds = [];
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
    sfx.play("splinter");
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
    if (chance(0.4)) sfx.play("groan");
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
    this._updateFootprints();
    this.world.update(dt);
    this._waterT = (this._waterT || 0) + dt; // drives the flowing-water ripples

    if (actions.swap) this._swapWeapon();
    if (actions.reload) { if (this.player.startReload()) { this._announce("Reloading…"); sfx.play("reload"); } }
    if (actions.interact) this._interact();
    if (inp.firing) this._tryFire();

    // Sustained flamethrower roar: spool the engine-thrust loop up while the
    // trigger's held and there's fuel to burn, and down the moment it stops.
    const cw = this.player.weapon;
    const flaming = inp.firing && cw.flame && this.player.reloading <= 0 &&
      (this.player.unlimitedAmmo || (this.player.loadout.clip[this.player.loadout.current] ?? 0) > 0);
    if (flaming && !this._flaming) { sfx.startFlame(); this._flaming = true; }
    else if (!flaming && this._flaming) { sfx.stopFlame(); this._flaming = false; }

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
    this._updateMines(dt);
    this._updateBurning(dt);
    this._updateZombieFire(dt);
    this._updateFlies(dt);
    this._updateBirds(dt);
    this._updateScorches(dt);
    for (const p of this.particles) p.update(dt);
    for (const s of this.stains) s.life -= dt * 0.15;
    for (const fp of this.prints) fp.life -= dt * 0.14;
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
    this.prints = this.prints.filter((fp) => fp.life > 0);

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
    if (drop > 0.5) { this.sideFlash = Math.max(this.sideFlash, clamp(drop / 22, 0.28, 1)); sfx.play("hurt"); }
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
    else if (w.throwable || w.deploy) ammoStr = "×" + (l.ammo[w.ammoType] || 0);
    else {
      const clip = l.clip[l.current] ?? 0;
      ammoStr = `${clip} / ${l.ammo[w.ammoType] ?? 0}` + (w.unit ? " " + w.unit : "");
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
    sfx.play("click");
  }

  // Directly equip a weapon (from the on-screen weapon buttons).
  selectWeapon(id) {
    const l = this.player.loadout;
    if (!l.owned[id] || l.current === id) return;
    l.current = id;
    this.player.reloading = 0;
    this._announce(WEAPONS[id].name);
    this.hooks.vibrate?.(10);
    sfx.play("click");
  }

  _tryFire() {
    const p = this.player, w = p.weapon;
    if (!p.canFire()) {
      // Auto-reload when the clip runs dry.
      if (!w.melee && !w.throwable && (p.loadout.clip[p.loadout.current] ?? 0) <= 0 && p.reloading <= 0 && p.startReload()) sfx.play("reload");
      return;
    }
    p.cooldown = 1 / w.fireRate;
    p.muzzle = 0.06;
    // The knife has three attacks; other melee just swings.
    const variant = (w.melee && w.kind === "melee_knife") ? pick(["swing", "stab", "lunge"]) : "swing";
    p.triggerRecoil(w, variant); // kick the arms/weapon (gun recoil or melee attack)

    if (w.melee) { this._meleeSwing(w, variant); return; }
    if (w.throwable) { this._throw(w); return; }
    if (w.deploy) { this._deployMine(w); return; }

    if (!p.unlimitedAmmo) p.loadout.clip[p.loadout.current]--;
    if (w.flame) { this._flame(w); return; }
    const laser = !!(this.cheats && this.cheats.lasers) && !w.explosive;
    const pellets = w.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const a = p.angle + rand(-w.spread, w.spread);
      const proj = new Projectile(p.x + Math.cos(p.angle) * 12, p.y + Math.sin(p.angle) * 12, a, {
        speed: laser ? Math.max(w.speed, 900) : w.speed, damage: w.damage, range: laser ? Math.max(w.range, 420) : w.range, knockback: w.knockback,
        pierce: laser ? 99 : (w.pierce || 0), explosive: w.explosive || 0, kind: w.explosive ? "rocket" : "bullet",
        sever: w.sever || 0, hs: w.hs || 0, r: w.explosive ? 3 : 1.6,
      });
      if (laser) proj.laser = true;
      this.projectiles.push(proj);
    }
    // Feedback: muzzle smoke, casing, shake.
    this.shake += w.explosive ? 8 : w.pellets > 1 ? 4 : 2;
    this._ejectCasing(p);
    this._muzzleSmoke(p);
    sfx.play(w.sound || "pop");
    if (w.explosive || w.pellets > 1) this.hooks.vibrate?.(30);
  }

  _meleeSwing(w, variant) {
    const p = this.player;
    sfx.play(w.sound || "swipe");
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
      // Anything pressed right up against you is hit on any swing, in ANY
      // direction — so when you're swarmed, every adjacent zombie/dog takes the
      // hit (small/fast foes stop nearer and would otherwise slip the arc).
      const contact = d <= p.r + z.r + 9;
      if (contact || da <= arc / 2) {
        const dmg = w.damage * (variant === "lunge" ? 1.3 : 1);
        this._damageZombie(z, dmg, p.angle, w.knockback, w.sever || 0, w.hs || 0, !!w.alwaysSever);
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
      // Carrion birds can be shot out of the air (they never fight back).
      if (!hitZombie && !proj.dead && this.birds.length) {
        for (const bird of this.birds) {
          if (bird.dead) continue;
          const by = bird.y - bird.alt; // birds are hit where they're drawn
          if (this._segHitsCircle(proj.px, proj.py, proj.x, proj.y, bird.x, by, bird.r + proj.r + 1)) {
            this._killBird(bird, proj.angle);
            if (!proj.explosive && proj.pierce <= 0) { proj.dead = true; }
            if (proj.pierce > 0) proj.pierce--;
            break;
          }
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
    // A charred, smouldering scorch mark seared into the ground at ground zero.
    this.scorches.push({ x, y, r: radius * 0.62, smolder: rand(7, 11), seed: (Math.random() * 1e9) | 0 });
    if (this.scorches.length > 40) this.scorches.shift();
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
    sfx.play("explode");
  }

  // ------------------------------------------------------- Throwables
  _throw(w) {
    const p = this.player;
    if (!p.unlimitedAmmo) p.loadout.ammo[w.ammoType] = (p.loadout.ammo[w.ammoType] || 0) - 1;
    this.thrown.push(new Thrown(p.x + Math.cos(p.angle) * 10, p.y + Math.sin(p.angle) * 10, p.angle, {
      kind: w.kind, speed: w.throwSpeed, fuse: w.fuse || 2.5,
      explosive: w.explosive || 0, damage: w.damage || 0, knockback: w.knockback || 0, sever: w.sever || 0,
    }));
    this._announce(w.name, "thrown");
    sfx.play(w.sound || "clink");
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

  // ------------------------------------------------------- Land mines
  // Drop a mine at the player's feet; it arms after a beat, then detonates when
  // a zombie steps on it. (It won't trigger on the player who laid it.)
  _deployMine(w) {
    const p = this.player;
    p.muzzle = 0; // you set it down — no muzzle flash
    if (!p.unlimitedAmmo) p.loadout.ammo[w.ammoType] = (p.loadout.ammo[w.ammoType] || 0) - 1;
    this.mines.push({ x: p.x, y: p.y, armT: 0.8, r: 15, blink: 0, w });
    if (this.mines.length > 24) this.mines.shift();
    this._announce("Mine armed", "step back");
    sfx.play("click");
  }

  _updateMines(dt) {
    for (const m of this.mines) {
      if (m.dead) continue;
      if (m.armT > 0) { m.armT -= dt; continue; } // arming — inert for a moment
      m.blink += dt;
      for (const z of this.zombies) {
        if (z.dead) continue;
        if (dist(m.x, m.y, z.x, z.y) < m.r + z.r) { this._mineBlast(m); m.dead = true; break; }
      }
    }
    this.mines = this.mines.filter((m) => !m.dead);
  }

  // A mine goes off: a hard blast (hurls everything), plus a shower of dirt and
  // shrapnel debris and a big spray of blood and gore flung about.
  _mineBlast(m) {
    const w = m.w;
    this._explode(m.x, m.y, { explosive: w.explosive, damage: w.damage, sever: w.sever });
    // Dirt clods + metal shrapnel kicked out of the ground.
    for (let i = 0; i < 26; i++) {
      const a = rand(0, TAU), s = rand(80, 340);
      this.particles.push(new Particle(m.x, m.y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: rand(0.4, 1.2),
        color: pick(["#4a4038", "#2c2620", "#6b5a42", "#8a8f95", "#3a3d40", "#5a4632"]), size: randInt(2, 4), drag: 0.86, gravity: 200,
      }));
    }
    // A heavy blood spray, plus bouncing blood droplets that spatter the walls.
    for (let i = 0; i < 40; i++) {
      const a = rand(0, TAU), s = rand(70, 320);
      this.particles.push(new Particle(m.x, m.y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 1.4),
        color: pick(["#a01818", "#7a1010", "#8a2a1a", "#611", "#c02828"]), size: randInt(2, 4), drag: 0.82, stain: true,
      }));
    }
    for (let i = 0; i < 12; i++) {
      const a = rand(0, TAU), s = rand(140, 380);
      this.gibs.push({ x: m.x, y: m.y - 3, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: rand(1, 6), vz: rand(40, 130), angle: 0, spin: 0, part: "blood", limbColor: "#7a1010", bounce: true });
    }
    // Any zombie right on top is torn apart outright.
    for (const z of this.zombies) if (!z.dead && dist(m.x, m.y, z.x, z.y) < w.explosive * 0.7) this._flingZombieGibs(z);
    this.stains.push({ x: m.x, y: m.y, r: rand(7, 12), life: rand(12, 20), color: "#4a0c0c" });
    this.shake += 10;
    this.hooks.vibrate?.(60);
  }

  _drawMines(ctx) {
    for (const m of this.mines) {
      // A squat metal disc pressed into the ground with a pressure plate.
      ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(m.x, m.y + 1.5, 6, 3.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#3a3d33"; ctx.beginPath(); ctx.arc(m.x, m.y, 5.5, 0, TAU); ctx.fill();
      ctx.fillStyle = "#4c5044"; ctx.beginPath(); ctx.arc(m.x, m.y, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = "#2a2c24"; ctx.beginPath(); ctx.arc(m.x, m.y, 2, 0, TAU); ctx.fill(); // plunger
      // A red LED: solid-dim while arming, blinking once armed.
      const armed = m.armT <= 0;
      const on = armed ? (Math.floor(m.blink * 6) % 2 === 0) : true;
      ctx.fillStyle = armed ? (on ? "#ff3020" : "#5a1410") : "#7a5a10";
      ctx.fillRect(Math.round(m.x - 0.8), Math.round(m.y - 0.8), 1.6, 1.6);
    }
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

  _damageZombie(z, dmg, angle, force, sever = 0, hs = 0, forceSever = false) {
    // Blades (axe/sword) lop a limb off with every blow — legs first, to disable
    // the zombie — even if the same swing goes on to kill it.
    if (forceSever && !z.dead) { const part = z._severRandom(true); if (part) this._severFX(z, part, angle); }
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
    // Snapping a limb off often exposes/flings a splinter of bone.
    if (chance(0.6)) {
      const ba = angle + rand(-0.9, 0.9), bs = rand(80, 170);
      this.gibs.push({ x: z.x, y: z.y - 5, vx: Math.cos(ba) * bs, vy: Math.sin(ba) * bs - 40, z: 5, vz: rand(50, 100), angle: rand(0, TAU), spin: rand(-18, 18), part: "bone", limbColor: pick(["#e8e2d0", "#ded6c0"]) });
    }
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
  // Fast, bouncy gibs (from an exploding zombie) ricochet off walls & furniture.
  _updateGibs(dt) {
    const w = this.world;
    for (const g of this.gibs) {
      const nx = g.x + g.vx * dt, ny = g.y + g.vy * dt;
      if (g.bounce) {
        // Reflect off any solid it would enter, per axis, shedding some energy.
        let hit = false;
        if (w.solidAt(nx, g.y)) { g.vx = -g.vx * 0.5; hit = true; } else g.x = nx;
        if (w.solidAt(g.x, ny)) { g.vy = -g.vy * 0.5; hit = true; } else g.y = ny;
        if (hit) { g.spin = -g.spin * 0.6; if (g.part === "blood" && chance(0.6)) { this.stains.push({ x: g.x, y: g.y, r: rand(1.5, 3), life: rand(6, 12), color: "#5a0f0f" }); g.dead = true; continue; } }
      } else { g.x = nx; g.y = ny; }
      g.vx *= Math.pow(g.bounce ? 0.25 : 0.1, dt); g.vy *= Math.pow(g.bounce ? 0.25 : 0.1, dt);
      g.z += g.vz * dt; g.vz -= 260 * dt; // height above ground
      g.angle += g.spin * dt;
      if (g.z <= 0) {
        g.z = 0;
        if (g.part === "blood") { this.stains.push({ x: g.x, y: g.y, r: rand(1.5, 3.5), life: rand(6, 12), color: "#5a0f0f" }); g.dead = true; continue; }
        this.limbs.push({ x: g.x, y: g.y, angle: g.angle, part: g.part, color: g.limbColor });
        if (this.limbs.length > 90) this.limbs.shift();
        this.stains.push({ x: g.x, y: g.y, r: rand(3, 5), life: rand(8, 14), color: "#4a0c0c" });
        g.dead = true;
      }
    }
    this.gibs = this.gibs.filter((g) => !g.dead);
  }

  // Blow a zombie apart: fling its head, attached limbs, torso, guts and a
  // spray of blood as bouncing gibs that ricochet off walls and furniture.
  _flingZombieGibs(z) {
    const skin = z.look ? z.look.skin : "#72a83a";
    const cloth = z.look ? z.look.cloth : "#5a5347";
    const limbCol = ZOMBIE_LIMB[z.type] || "#72a83a";
    const chunks = [["head", skin], ["torso", cloth]];
    for (const k of ["larm", "rarm", "lleg", "rleg"]) if (z.parts && z.parts[k]) chunks.push([k, k.endsWith("leg") ? cloth : limbCol]);
    for (const [part, color] of chunks) {
      const a = rand(0, TAU), s = rand(120, 300);
      this.gibs.push({ x: z.x, y: z.y - 4, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: rand(3, 7), vz: rand(60, 150), angle: rand(0, TAU), spin: rand(-18, 18), part, limbColor: color, bounce: true });
    }
    for (let i = 0; i < 5; i++) { // guts
      const a = rand(0, TAU), s = rand(80, 220);
      this.gibs.push({ x: z.x, y: z.y - 3, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: rand(2, 6), vz: rand(50, 120), angle: rand(0, TAU), spin: rand(-12, 12), part: "gut", limbColor: pick(["#9c3a4a", "#7a2030", "#8a2a3a"]), bounce: true });
    }
    for (let i = 0; i < randInt(3, 5); i++) { // shattered bones
      const a = rand(0, TAU), s = rand(120, 300);
      this.gibs.push({ x: z.x, y: z.y - 4, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: rand(3, 7), vz: rand(70, 150), angle: rand(0, TAU), spin: rand(-20, 20), part: "bone", limbColor: pick(["#e8e2d0", "#ded6c0", "#efe9d8"]), bounce: true });
    }
    for (let i = 0; i < 16; i++) { // blood droplets that also bounce
      const a = rand(0, TAU), s = rand(120, 340);
      this.gibs.push({ x: z.x, y: z.y - 3, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: rand(1, 5), vz: rand(40, 120), angle: 0, spin: 0, part: "blood", limbColor: "#7a1010", bounce: true });
    }
    if (this.gibs.length > 220) this.gibs.splice(0, this.gibs.length - 220);
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
    sfx.play("glass");
    // Shards burst out and rain down under gravity...
    for (let i = 0; i < 15; i++) {
      const a = rand(0, TAU), s = rand(40, 150);
      this.particles.push(new Particle(x, y - 2, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: rand(0.4, 0.95),
        color: pick(["#bcd8e0", "#9fc4cf", "#e0f0f4", "#8aa8b0"]), size: randInt(1, 2), drag: 0.86, gravity: 190,
      }));
    }
    // ...leaving broken glass littered on the ground.
    for (let i = 0; i < 5; i++) this.stains.push({ x: x + rand(-9, 9), y: y + rand(-9, 9), r: rand(1, 2.2), life: rand(6, 12), color: "#9fc4cf" });
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

  // Wrecked vehicles smoulder: licking flames and a rising column of smoke.
  // Fire consumes the furniture over time — vehicles blow up, other pieces
  // collapse to smouldering ash — and spreads to zombies and nearby furniture.
  _updateBurning(dt) {
    for (const f of this.world.furniture) {
      if (!f.burning || f.broken) continue;
      const vehicle = f.type === "car" || f.type === "truck";
      if (f.burnT === undefined) f.burnT = vehicle ? rand(12, 26) : rand(6, 12);
      f.burnT -= dt;
      // Fire is contagious — it catches the horde and neighbouring furniture alight.
      if (chance(dt * 2.5)) {
        for (const z of this.zombies) if (!z.dead && z.burning <= 0 && dist(f.x, f.y, z.x, z.y) < Math.max(f.hw, f.hh) + z.r + 8) this._igniteZombie(z, 4);
        for (const o of this.world.furniture) if (o !== f && !o.broken && !o.burning && dist(f.x, f.y, o.x, o.y) < Math.max(f.hw, f.hh) + Math.max(o.hw, o.hh) + 10) { this._igniteFurniture(o); break; }
      }
      if (f.burnT <= 0) {
        if (vehicle) this._explode(f.x, f.y, { explosive: 40, damage: 90, sever: 0.6 }); // vehicles blow up
        else { this.scorches.push({ x: f.x, y: f.y, r: Math.max(f.hw, f.hh), smolder: rand(3, 6), seed: (Math.random() * 1e9) | 0, kind: "ash" }); if (this.scorches.length > 50) this.scorches.shift(); }
        f.broken = true; f.overturned = true; f.burning = false;
        continue;
      }
      f._emberT = (f._emberT || 0) - dt;
      if (f._emberT > 0) continue;
      f._emberT = rand(0.04, 0.1);
      // flames
      this.particles.push(new Particle(f.x + rand(-f.hw * 0.6, f.hw * 0.6), f.y + rand(-f.hh * 0.5, f.hh * 0.5), {
        vx: rand(-8, 8), vy: rand(-50, -18), life: rand(0.3, 0.7),
        color: pick(["#ff9030", "#ffce54", "#ff5a2a", "#c0341a"]), size: randInt(2, 3), drag: 0.86, gravity: -26,
      }));
      // a fat, dark, rising plume of smoke (bigger and longer-lived than before)
      this.particles.push(new Particle(f.x + rand(-7, 7), f.y - 6, {
        vx: rand(-12, 12), vy: rand(-42, -20), life: rand(1.4, 2.6),
        color: pick(["rgba(50,50,50,0.55)", "rgba(80,80,80,0.45)", "rgba(30,30,30,0.55)", "rgba(64,60,58,0.5)"]),
        size: randInt(5, 9), drag: 0.94, gravity: -8,
      }));
      // a few embers drifting up with the column
      if (chance(0.4)) this.particles.push(new Particle(f.x + rand(-5, 5), f.y - 8, {
        vx: rand(-10, 10), vy: rand(-60, -30), life: rand(0.8, 1.6),
        color: pick(["#ffb040", "#ff7a2a", "#ffce54"]), size: 1, drag: 0.92, gravity: -14,
      }));
    }
  }

  // Ambient flies: a loose swarm that drifts around, gathering on corpses,
  // blood and burning wrecks, and buzzes when it's near you.
  _updateFlies(dt) {
    if (!this.flies.length) {
      for (let i = 0; i < 40; i++) {
        const a = rand(0, TAU), r = rand(30, 300);
        this.flies.push({ x: this.player.x + Math.cos(a) * r, y: this.player.y + Math.sin(a) * r, ax: 0, ay: 0, t: rand(0, TAU), p: rand(0, TAU), rt: rand(0, 3) });
      }
    }
    // Anchor points the flies are drawn to: recent corpses, blood, burning cars.
    const anchors = [];
    for (const b of this.bodies.slice(-6)) anchors.push({ x: b.x, y: b.y });
    for (const s of this.stains) if (s.r > 4 && chance(0.02)) anchors.push({ x: s.x, y: s.y });
    for (const f of this.world.furniture) if (f.burning && !f.broken) anchors.push({ x: f.x, y: f.y });

    let nearest = 1e9;
    for (const fly of this.flies) {
      fly.t += dt;
      fly.rt -= dt;
      if (fly.rt <= 0) {
        fly.rt = rand(1.2, 3.5);
        if (anchors.length && chance(0.6)) { const a = pick(anchors); fly.ax = a.x + rand(-14, 14); fly.ay = a.y + rand(-14, 14); }
        else { fly.ax = this.player.x + rand(-280, 280); fly.ay = this.player.y + rand(-280, 280); }
      }
      fly.x += (fly.ax - fly.x) * clamp(dt * 1.3, 0, 1) + Math.sin(fly.t * 24 + fly.p) * 0.7;
      fly.y += (fly.ay - fly.y) * clamp(dt * 1.3, 0, 1) + Math.cos(fly.t * 21 + fly.p) * 0.7;
      const d = dist2(fly.x, fly.y, this.player.x, this.player.y);
      if (d < nearest) nearest = d;
    }
    // Buzzing when flies are close to the player.
    this._buzzT = (this._buzzT || 0) - dt;
    if (nearest < 70 * 70 && this._buzzT <= 0) { sfx.play("buzz"); this._buzzT = rand(0.5, 0.9); }
  }

  _drawFlies(ctx) {
    ctx.fillStyle = "#161410";
    for (const fly of this.flies) {
      const jx = Math.sin(fly.t * 40 + fly.p) * 0.8, jy = Math.cos(fly.t * 37) * 0.8;
      ctx.fillRect(Math.round(fly.x + jx), Math.round(fly.y + jy), 1, 1);
    }
  }

  // Track bloody footprints: stepping through fresh blood coats your boots, then
  // you leave a fading trail of prints; crawlers drag a smear behind them.
  _updateFootprints() {
    const p = this.player;
    for (const s of this.stains) {
      if (s.life > 5 && dist2(s.x, s.y, p.x, p.y) < (s.r + 6) * (s.r + 6)) { p.bloodyFeet = Math.max(p.bloodyFeet, 200); break; }
    }
    if (p.bloodyFeet > 0) {
      if (!this._lastFoot) this._lastFoot = { x: p.x, y: p.y, side: 1 };
      const d = dist(p.x, p.y, this._lastFoot.x, this._lastFoot.y);
      if (d >= 11) {
        p.bloodyFeet = Math.max(0, p.bloodyFeet - d);
        const fade = clamp(p.bloodyFeet / 200, 0.12, 1);
        const side = (this._lastFoot.side = -this._lastFoot.side);
        const perp = p.angle + Math.PI / 2;
        this.prints.push({ x: p.x + Math.cos(perp) * 3.2 * side, y: p.y + Math.sin(perp) * 3.2 * side, angle: p.angle, kind: "foot", life: rand(16, 26), alpha: 0.5 * fade });
        this._lastFoot.x = p.x; this._lastFoot.y = p.y;
      }
    } else this._lastFoot = null;
    // Most of the horde tracks blood as they shamble: crawlers drag a smear,
    // the rest leave a trail of bloody footprints.
    for (const z of this.zombies) {
      if (z.dead || z.type === "rat") continue;
      if (Math.hypot(z.vx || 0, z.vy || 0) < 8) continue;
      if (z.prone) {
        if (chance(0.12)) this.prints.push({ x: z.x + rand(-3, 3), y: z.y + rand(-3, 3), angle: z.angle, kind: "smear", life: rand(14, 22), alpha: 0.3 });
      } else if (z.bloody) {
        if (!z._lp) z._lp = { x: z.x, y: z.y, side: 1 };
        const d = dist(z.x, z.y, z._lp.x, z._lp.y);
        if (d >= 15) {
          const side = (z._lp.side = -z._lp.side);
          const perp = z.angle + Math.PI / 2;
          const paw = z.quad ? 2 : 1; // dogs leave smaller, closer paw marks
          this.prints.push({ x: z.x + Math.cos(perp) * 2.6 * side, y: z.y + Math.sin(perp) * 2.6 * side, angle: z.angle, kind: z.quad ? "smear" : "foot", life: rand(11, 18), alpha: 0.26, scale: 1 / paw });
          z._lp.x = z.x; z._lp.y = z.y;
        }
      }
    }
    if (this.prints.length > 300) this.prints.splice(0, this.prints.length - 300);
  }

  _drawPrints(ctx) {
    for (const fp of this.prints) {
      const a = clamp(fp.life / 16, 0, 1) * fp.alpha;
      if (a < 0.02) continue;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(fp.x, fp.y);
      ctx.rotate(fp.angle);
      if (fp.scale && fp.scale !== 1) ctx.scale(fp.scale, fp.scale);
      ctx.fillStyle = "#5a0f10";
      if (fp.kind === "smear") {
        ctx.beginPath(); ctx.ellipse(-2, 0, 4.5, 1.8, 0, 0, TAU); ctx.fill();
      } else {
        // A boot print: heel + sole.
        ctx.fillRect(1.4, -1.3, 2.6, 2.6);
        ctx.fillRect(-2.2, -1.1, 2.4, 2.2);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // Scorch marks smoulder for a while after an explosion: a wisp of smoke and
  // the odd ember, then they settle into a permanent charred stain.
  _updateScorches(dt) {
    for (const sc of this.scorches) {
      if (sc.smolder <= 0) continue;
      sc.smolder -= dt;
      if (chance(dt * 6)) this.particles.push(new Particle(sc.x + rand(-sc.r * 0.5, sc.r * 0.5), sc.y + rand(-sc.r * 0.4, sc.r * 0.4), {
        vx: rand(-6, 6), vy: rand(-26, -12), life: rand(0.8, 1.8),
        color: pick(["rgba(40,40,40,0.5)", "rgba(60,58,56,0.42)", "rgba(28,28,28,0.5)"]), size: randInt(3, 6), drag: 0.94, gravity: -6,
      }));
      if (chance(dt * 3)) this.particles.push(new Particle(sc.x + rand(-sc.r * 0.4, sc.r * 0.4), sc.y + rand(-sc.r * 0.4, sc.r * 0.4), {
        vx: rand(-8, 8), vy: rand(-30, -12), life: rand(0.4, 0.9), color: pick(["#ff7a2a", "#ffab40", "#c0341a"]), size: 1, drag: 0.9, gravity: -10,
      }));
    }
  }

  _drawScorch(ctx) {
    for (const sc of this.scorches) {
      // Charred blast burn: a dark radial sear with a sooty ragged rim. Ash
      // piles (burned-up zombies/furniture) are greyer and mounded.
      const ash = sc.kind === "ash";
      const g = ctx.createRadialGradient(sc.x, sc.y, 1, sc.x, sc.y, sc.r);
      if (ash) { g.addColorStop(0, "rgba(46,44,42,0.85)"); g.addColorStop(0.5, "rgba(30,28,26,0.7)"); g.addColorStop(1, "rgba(24,22,20,0)"); }
      else { g.addColorStop(0, "rgba(8,7,6,0.82)"); g.addColorStop(0.55, "rgba(20,16,12,0.6)"); g.addColorStop(1, "rgba(24,20,16,0)"); }
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sc.x, sc.y, sc.r, 0, TAU); ctx.fill();
      // Flecks: pale ash crumbs, or dark soot around a crater (deterministic).
      let h = sc.seed >>> 0;
      ctx.fillStyle = ash ? "rgba(120,116,110,0.55)" : "rgba(10,9,8,0.6)";
      for (let i = 0; i < 10; i++) {
        h = (h * 1103515245 + 12345) >>> 0;
        const a = (h % 628) / 100, rr = sc.r * ((ash ? 0.2 : 0.6) + (h >> 9) % 45 / 100);
        ctx.fillRect(sc.x + Math.cos(a) * rr, sc.y + Math.sin(a) * rr, 1.6, 1.6);
      }
      // A faint ember glow while it's still smouldering.
      if (sc.smolder > 0) {
        ctx.globalAlpha = clamp(sc.smolder / 10, 0, 1) * (0.5 + 0.5 * Math.sin((this._lampClock || 0) * 5 + sc.seed));
        const eg = ctx.createRadialGradient(sc.x, sc.y, 1, sc.x, sc.y, sc.r * 0.6);
        eg.addColorStop(0, "rgba(200,70,20,0.5)"); eg.addColorStop(1, "rgba(120,30,10,0)");
        ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(sc.x, sc.y, sc.r * 0.6, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  // Static ground clutter: floor grime, scattered debris, trash and garbage.
  _drawDecor(ctx) {
    const cx0 = this.cam.x - this.bufW / 2 - 24, cx1 = this.cam.x + this.bufW / 2 + 24;
    const cy0 = this.cam.y - this.bufH / 2 - 24, cy1 = this.cam.y + this.bufH / 2 + 24;
    for (const d of this.world.decor) {
      if (d.x < cx0 || d.x > cx1 || d.y < cy0 || d.y > cy1) continue; // cull offscreen
      const h = d.seed;
      if (d.kind === "grime") {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = d.tone;
        ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.7, d.rot, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (d.kind === "debris") {
        ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
        ctx.fillStyle = "#4a4038"; ctx.fillRect(-3, -1, 4, 2); ctx.fillRect(1, 1, 3, 2);
        ctx.fillStyle = "#2c2620"; ctx.fillRect(-1, -3, 2, 2);
        ctx.fillStyle = "#5a5248"; ctx.fillRect(2 + (h % 3), -2, 2, 1.6);
        ctx.restore();
      } else if (d.kind === "trash") {
        ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
        ctx.fillStyle = (h & 1) ? "#8a8377" : "#6a5f4a"; // crumpled paper / wrapper
        ctx.beginPath(); ctx.ellipse(0, 0, 2.4, 1.8, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(-1, -0.4, 2, 0.8);
        if (h % 3 === 0) { ctx.fillStyle = "#7a2a24"; ctx.fillRect(2, 0, 3, 1.2); } // a can/bottle
        ctx.restore();
      } else if (d.kind === "garbage") {
        ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
        ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.beginPath(); ctx.ellipse(0, 2, 9, 4, 0, 0, TAU); ctx.fill(); // shadow
        ctx.fillStyle = "#26282a"; ctx.beginPath(); ctx.ellipse(-2, 0, 6, 5, 0, 0, TAU); ctx.fill();  // trash bag
        ctx.fillStyle = "#1c1e20"; ctx.beginPath(); ctx.ellipse(3, 1, 5, 4, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#3a3d40"; ctx.beginPath(); ctx.arc(-3, -2, 2, 0, TAU); ctx.fill();          // sheen
        ctx.fillStyle = (h & 1) ? "#7a6a3a" : "#5a4a3a"; ctx.fillRect(4, -3, 3, 2);                   // spilled junk
        ctx.fillStyle = "#8a8377"; ctx.fillRect(-6, 2, 3, 1.4);
        ctx.restore();
      }
    }
  }

  // Dim-lighting pass: a darkness veil over the floor with warm, flickering
  // pools of light around lamps and a soft torch around the player.
  _drawLighting(ctx) {
    const w = this.world;
    if (!w.ambient) return;
    const t = (this._lampClock = (this._lampClock || 0) + 0.016);
    const x0 = this.cam.x - this.bufW / 2, y0 = this.cam.y - this.bufH / 2;
    ctx.save();
    // Veil.
    ctx.fillStyle = `rgba(6,7,14,${w.ambient.toFixed(3)})`;
    ctx.fillRect(x0 - 4, y0 - 4, this.bufW + 8, this.bufH + 8);
    // Warm pools punched in with additive light.
    ctx.globalCompositeOperation = "lighter";
    for (const L of w.lamps) {
      if (L.x < x0 - L.r || L.x > x0 + this.bufW + L.r || L.y < y0 - L.r || L.y > y0 + this.bufH + L.r) continue;
      // Flicker: mostly steady with occasional dips (a bad bulb/candle).
      const f = 0.7 + 0.3 * Math.sin(t * 7 + L.phase) + (Math.sin(t * 23 + L.phase * 2) > 0.86 ? -0.35 : 0);
      const inten = clamp(L.flick * f, 0.12, 1) * w.ambient;
      const g = ctx.createRadialGradient(L.x, L.y, 2, L.x, L.y, L.r);
      g.addColorStop(0, `rgba(255,214,150,${(0.55 * inten).toFixed(3)})`);
      g.addColorStop(0.5, `rgba(255,190,120,${(0.24 * inten).toFixed(3)})`);
      g.addColorStop(1, "rgba(255,180,110,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L.x, L.y, L.r, 0, TAU); ctx.fill();
    }
    // Player torch so you're never in pure dark.
    const p = this.player, pr = 120;
    const pg = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, pr);
    pg.addColorStop(0, `rgba(230,220,190,${(0.5 * w.ambient + 0.12).toFixed(3)})`);
    pg.addColorStop(1, "rgba(210,200,170,0)");
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(p.x, p.y, pr, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // Carrion birds: crows, blackbirds and vultures glide in to peck at the dead
  // outdoors, scatter into the air when you come near, and can be shot down.
  // They never attack the player.
  _updateBirds(dt) {
    const outdoors = this.world.isStreets && !this.world.isSewers;
    // Fresh carcasses to feed on (settled bodies, not still-collapsing corpses).
    const carrion = this.bodies;
    // Occasionally spawn a bird gliding toward a carcass, up to a small flock.
    this._birdT = (this._birdT || 0) - dt;
    if (outdoors && this._birdT <= 0) {
      this._birdT = rand(1.4, 3.2);
      if (carrion.length && this.birds.length < 7 && chance(0.7)) this._spawnBird(pick(carrion));
    }
    const flee = 96, fleeSq = flee * flee;
    for (const bird of this.birds) {
      if (bird.dead) continue;
      bird.flap += dt * bird.flapRate;
      const px = this.player.x, py = this.player.y;
      // Anything close startles feeding/arriving birds into flight.
      if (bird.state !== "fleeing" && dist2(bird.x, bird.y, px, py) < fleeSq) {
        bird.state = "fleeing";
        const a = (dist2(bird.x, bird.y, px, py) < 1) ? rand(0, TAU) : angleTo(px, py, bird.x, bird.y);
        bird.tx = bird.x + Math.cos(a) * 640; bird.ty = bird.y + Math.sin(a) * 640;
        bird.flapRate = 26;
        if (this._birdCawT === undefined || this._birdCawT <= 0) { sfx.play(bird.type === "vulture" ? "screech" : "caw"); this._birdCawT = rand(0.15, 0.4); }
      }
      if (this._birdCawT !== undefined) this._birdCawT -= dt;
      if (bird.state === "arriving") {
        const d = dist(bird.x, bird.y, bird.tx, bird.ty);
        const sp = bird.speed;
        bird.x += (bird.tx - bird.x) / Math.max(d, 1) * sp * dt;
        bird.y += (bird.ty - bird.y) / Math.max(d, 1) * sp * dt;
        bird.alt += (2 - bird.alt) * clamp(dt * 1.5, 0, 1); // descend toward the ground
        if (d < 6) { bird.state = "feeding"; bird.alt = 1.5; bird.flapRate = 0; bird.peckT = rand(0.3, 0.8); }
      } else if (bird.state === "feeding") {
        bird.alt += (1.5 - bird.alt) * clamp(dt * 3, 0, 1);
        bird.peckT -= dt;
        if (bird.peckT <= 0) { bird.peckT = rand(0.4, 1.1); bird.peck = 0.18; } // bob down to peck
        bird.peck = Math.max(0, (bird.peck || 0) - dt);
        // Occasionally hop to a nearby spot on the carcass.
        if (chance(dt * 0.4)) { bird.x += rand(-6, 6); bird.y += rand(-5, 5); }
        // If the carcass is gone (culled), take off and drift.
        if (!carrion.length) { bird.state = "fleeing"; bird.tx = bird.x + rand(-500, 500); bird.ty = bird.y - rand(300, 600); bird.flapRate = 18; }
      } else { // fleeing
        const d = dist(bird.x, bird.y, bird.tx, bird.ty);
        const sp = bird.speed * 2.1;
        bird.x += (bird.tx - bird.x) / Math.max(d, 1) * sp * dt;
        bird.y += (bird.ty - bird.y) / Math.max(d, 1) * sp * dt;
        bird.alt += (16 - bird.alt) * clamp(dt * 1.6, 0, 1); // climb away
        if (dist2(bird.x, bird.y, px, py) > 560 * 560) bird.dead = true; // gone off-scene
      }
    }
    this.birds = this.birds.filter((b) => !b.dead);
  }

  _spawnBird(target) {
    const roll = rand(0, 1);
    const type = roll < 0.5 ? "crow" : roll < 0.82 ? "blackbird" : "vulture";
    const cfg = type === "vulture"
      ? { r: 6, speed: 60, flapRate: 9 }
      : type === "blackbird"
      ? { r: 3, speed: 108, flapRate: 20 }
      : { r: 3.6, speed: 96, flapRate: 17 };
    const a = rand(0, TAU), r = rand(320, 460);
    this.birds.push({
      type, x: this.player.x + Math.cos(a) * r, y: this.player.y + Math.sin(a) * r,
      tx: target.x + rand(-10, 10), ty: target.y + rand(-8, 8),
      state: "arriving", alt: 16, flap: rand(0, TAU), peck: 0, peckT: 0,
      r: cfg.r, speed: cfg.speed, flapRate: cfg.flapRate, dead: false,
    });
  }

  _drawBirds(ctx) {
    for (const bird of this.birds) {
      const gx = bird.x, gy = bird.y;          // ground point (shadow)
      const ay = gy - bird.alt - (bird.peck ? -1.5 : 0); // drawn body sits above by altitude
      // Ground shadow, shrinking with altitude.
      const sh = clamp(1 - bird.alt / 20, 0.12, 0.5);
      ctx.fillStyle = `rgba(0,0,0,${(sh * 0.5).toFixed(2)})`;
      ctx.beginPath(); ctx.ellipse(gx, gy, bird.r * (1.1 - bird.alt / 40), bird.r * 0.5 * (1.1 - bird.alt / 40), 0, 0, TAU); ctx.fill();
      const flap = Math.sin(bird.flap);
      const airborne = bird.state !== "feeding";
      const pal = bird.type === "vulture"
        ? { body: "#2c241d", wing: "#211a14", head: "#8a6152", beak: "#c9a24a" }
        : bird.type === "blackbird"
        ? { body: "#0d0d12", wing: "#050507", head: "#0d0d12", beak: "#e08a2a" }
        : { body: "#16171d", wing: "#0c0c11", head: "#16171d", beak: "#3a3d44" };
      const R = bird.r;
      if (airborne) {
        // Wings spread as two beating triangles; body a small ellipse between them.
        const span = R * (bird.type === "vulture" ? 3.4 : 2.6);
        const lift = flap * R * 1.2;
        ctx.fillStyle = pal.wing;
        ctx.beginPath(); ctx.moveTo(gx, ay); ctx.lineTo(gx - span, ay - lift); ctx.lineTo(gx - span * 0.5, ay + R * 0.5); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(gx, ay); ctx.lineTo(gx + span, ay - lift); ctx.lineTo(gx + span * 0.5, ay + R * 0.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = pal.body;
        ctx.beginPath(); ctx.ellipse(gx, ay, R * 0.7, R * 1.1, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = pal.head;
        ctx.beginPath(); ctx.arc(gx, ay - R * 0.9, R * 0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = pal.beak;
        ctx.fillRect(gx - 0.6, ay - R * 1.5, 1.2, 2);
      } else {
        // Perched/pecking: folded wings, body over the ground, head dipping down.
        const dip = bird.peck ? R * 1.1 : 0;
        ctx.fillStyle = pal.wing;
        ctx.beginPath(); ctx.ellipse(gx, ay + 0.5, R * 1.05, R * 0.8, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = pal.body;
        ctx.beginPath(); ctx.ellipse(gx, ay, R * 0.8, R * 0.62, 0, 0, TAU); ctx.fill();
        // Tail up, head/beak forward-down.
        ctx.fillStyle = pal.wing;
        ctx.beginPath(); ctx.moveTo(gx - R * 0.6, ay - R * 0.2); ctx.lineTo(gx - R * 1.7, ay - R * 0.7); ctx.lineTo(gx - R * 0.6, ay + R * 0.3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = pal.head;
        ctx.beginPath(); ctx.arc(gx + R * 0.7, ay - R * 0.3 + dip, R * 0.42, 0, TAU); ctx.fill();
        ctx.fillStyle = pal.beak;
        ctx.fillRect(gx + R * 0.95, ay - R * 0.3 + dip, R * 0.7, 1.2);
      }
    }
  }

  // Shot out of the air: a puff of feathers, a little blood, and it drops.
  _killBird(bird, angle) {
    bird.dead = true;
    this.score += 5;
    sfx.play(bird.type === "vulture" ? "screech" : "caw");
    const feather = bird.type === "blackbird" ? "#0d0d12" : bird.type === "vulture" ? "#2c241d" : "#16171d";
    const by = bird.y - bird.alt;
    for (let i = 0; i < (bird.type === "vulture" ? 16 : 10); i++) {
      const a = rand(0, TAU), s = rand(12, 90);
      this.particles.push(new Particle(bird.x, by, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: rand(0.5, 1.3),
        color: chance(0.3) ? "#3a2a22" : feather, size: randInt(1, 2), drag: 0.9, gravity: 40,
      }));
    }
    for (let i = 0; i < 4; i++) {
      const a = angle + rand(-0.6, 0.6), s = rand(20, 70);
      this.particles.push(new Particle(bird.x, by, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.2, 0.5), color: "#7a1414", size: 2, drag: 0.86 }));
    }
    // A small carcass mark on the ground where it lands.
    this.stains.push({ x: bird.x + rand(-3, 3), y: bird.y + rand(-2, 2), r: bird.r * 1.3, life: 8, color: "rgba(20,18,22,0.7)" });
    this.shake += 1;
  }

  // Cheat "exploding zombies": a small fireball on death that splashes damage
  // into the surrounding horde (which can chain-detonate), lightly scorches the
  // ground, and nudges the player if they're hugging the blast.
  _zombieBurst(z) {
    z._burst = true;
    const R = 58;
    this._flingZombieGibs(z); // head, limbs, guts and blood ricochet off the walls
    this.shockwaves.push({ x: z.x, y: z.y, r: 6, max: R + 8, life: 0.35 });
    for (let i = 0; i < 18; i++) {
      const a = rand(0, TAU), s = rand(40, 180);
      this.particles.push(new Particle(z.x, z.y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.2, 0.6), color: pick(["#ffce54", "#ff7043", "#ffffff", "#a01818", "#6a8a2a"]), size: randInt(2, 4), drag: 0.86 }));
    }
    this.scorches.push({ x: z.x, y: z.y, r: 15, smolder: rand(2, 4), seed: (Math.random() * 1e9) | 0 });
    if (this.scorches.length > 40) this.scorches.shift();
    for (const o of this.zombies) {
      if (o === z || o.dead) continue;
      const d = dist(z.x, z.y, o.x, o.y);
      if (d < R + o.r) {
        const a = angleTo(z.x, z.y, o.x, o.y), fall = clamp(1 - d / R, 0.25, 1);
        this._damageZombie(o, 85 * fall, a, 240 * fall, 0.4); // may chain-detonate
      }
    }
    const pd = dist(z.x, z.y, this.player.x, this.player.y);
    if (pd < R * 0.7) this.player.hurt(10 * clamp(1 - pd / (R * 0.7), 0, 1));
    this.shake += 4;
    const now = this._waterT || 0;
    if (now - (this._lastBurstSfx || -1) > 0.05) { sfx.play("explode"); this._lastBurstSfx = now; }
  }

  _killZombie(z, angle, headshot = false) {
    this.score += z.def.score + (headshot ? 15 : 0);
    this.player.kills++;
    // Gore burst (plus brains + a HEADSHOT banner on a headshot).
    this._gore(z.x, z.y, angle, z.def.gore);
    if (headshot) this._brains(z.x, z.y, angle);
    // Cheat: the dead detonate, splashing damage into the rest of the horde.
    if (this.cheats && this.cheats.explodingZombies && !z._burst) this._zombieBurst(z);
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
      sfx.play("hiss");
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
    // Spent case flips out of the ejection port (to the player's right), arcs
    // and lands. Shotguns kick out a fat red hull instead of a brass casing.
    const k = p.weapon.kind;
    const shell = k === "shotgun" || k === "shotgun_semi" || k === "shotgun_sxs";
    const a = p.angle + Math.PI / 2 + rand(-0.3, 0.3);
    const s = rand(shell ? 60 : 80, shell ? 120 : 130);
    const bx = p.x + Math.cos(p.angle) * 5 + Math.cos(a) * 3, by = p.y + Math.sin(p.angle) * 5 + Math.sin(a) * 3;
    this.particles.push(new Particle(bx, by, {
      vx: Math.cos(a) * s, vy: Math.sin(a) * s - (shell ? 50 : 40), life: shell ? 0.95 : 0.7,
      color: shell ? "#b3352b" : "#e0b83a", size: shell ? 4 : 3, drag: 0.9, gravity: 260, kind: "casing",
      shell, spin: rand(-24, 24), angle: p.angle,
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

  // ------------------------------------------------------- Fire
  // Flamethrower: belch a forward cone of flame + smoke that torches everything
  // it touches — zombies, furniture and vehicles catch fire.
  _flame(w) {
    const p = this.player;
    p.muzzle = 0; // no bullet muzzle-flash for the torch
    const c = Math.cos(p.angle), s = Math.sin(p.angle), perpX = -s, perpY = c;
    const ox = p.x + c * 12, oy = p.y + s * 12;
    // A tight, coherent JET of fire: particles launched nearly straight ahead
    // (only a little jitter) from a narrow nozzle, so it reads as a stream, not
    // a fanning spray. High speed carries it downrange before drag lets it
    // billow up and die.
    for (let i = 0; i < 6; i++) {
      const jit = rand(-0.07, 0.07), off = rand(-2.2, 2.2), a = p.angle + jit, sp = rand(360, 560);
      this.particles.push(new Particle(ox + perpX * off, oy + perpY * off, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.34, 0.8),
        color: pick(["#ffd24a", "#ff9030", "#ff5a2a", "#ffce54", "#c0341a"]), size: randInt(3, 6), drag: 0.955, gravity: -18,
      }));
    }
    if (chance(0.8)) this.particles.push(new Particle(ox + c * rand(60, 150), oy + s * rand(60, 150), {
      vx: rand(-16, 16), vy: rand(-44, -16), life: rand(1.0, 2.0), color: pick(["rgba(40,40,40,0.5)", "rgba(60,58,56,0.45)"]), size: randInt(4, 9), drag: 0.94, gravity: -8,
    }));
    // Ignite anything caught in the narrow stream.
    const half = w.spread + 0.13;
    for (const z of this.zombies) {
      if (z.dead) continue;
      const d = dist(ox, oy, z.x, z.y);
      if (d > w.range + z.r) continue;
      const da = Math.abs(((angleTo(ox, oy, z.x, z.y) - p.angle + Math.PI * 3) % TAU) - Math.PI);
      if (da <= half) { this._igniteZombie(z, 4.5); z.hp -= w.damage; if (z.hp <= 0 && !z.dead) this._burnToAsh(z); }
    }
    for (const f of this.world.furniture) {
      if (f.broken || f.burning) continue;
      const d = dist(ox, oy, f.x, f.y);
      if (d > w.range + Math.max(f.hw, f.hh)) continue;
      const da = Math.abs(((angleTo(ox, oy, f.x, f.y) - p.angle + Math.PI * 3) % TAU) - Math.PI);
      if (da <= half) this._igniteFurniture(f);
    }
    this.shake += 0.3;
  }

  _igniteZombie(z, secs) {
    if (z.type === "rat") { z.hp = 0; if (!z.dead) this._burnToAsh(z); return; } // too small to burn — just cremated
    z.burning = Math.max(z.burning, secs);
  }

  _igniteFurniture(f) {
    if (f.broken || f.burning) return;
    f.burning = true;
    const vehicle = f.type === "car" || f.type === "truck";
    f.burnT = vehicle ? rand(5, 10) : rand(4, 8); // then it's consumed / explodes
  }

  // Per-frame fire on the horde: burn damage over time, flames & smoke, spread
  // to neighbours, and — when it finally dies — collapse into smouldering ash.
  _updateZombieFire(dt) {
    for (const z of this.zombies) {
      if (z.dead || z.burning <= 0) continue;
      z.burning -= dt;
      z.hp -= 11 * dt; // fire damage over time (they can still attack meanwhile)
      // Flames licking up the body + a thread of smoke.
      if (chance(dt * 34)) this.particles.push(new Particle(z.x + rand(-z.r, z.r), z.y - rand(0, z.r), {
        vx: rand(-8, 8), vy: rand(-46, -18), life: rand(0.25, 0.55), color: pick(["#ffd24a", "#ff9030", "#ff5a2a", "#ffce54"]), size: randInt(2, 4), drag: 0.88, gravity: -22,
      }));
      if (chance(dt * 10)) this.particles.push(new Particle(z.x, z.y - z.r, {
        vx: rand(-8, 8), vy: rand(-30, -12), life: rand(0.8, 1.6), color: pick(["rgba(40,40,40,0.45)", "rgba(60,58,56,0.4)"]), size: randInt(3, 6), drag: 0.94, gravity: -8,
      }));
      // Fire is contagious: touch another zombie or a flammable piece and it spreads.
      if (chance(dt * 3)) {
        for (const o of this.zombies) { if (o !== z && !o.dead && o.burning <= 0 && dist(z.x, z.y, o.x, o.y) < z.r + o.r + 6) { this._igniteZombie(o, 4); break; } }
        for (const f of this.world.furniture) { if (!f.broken && !f.burning && dist(z.x, z.y, f.x, f.y) < Math.max(f.hw, f.hh) + z.r + 4) { this._igniteFurniture(f); break; } }
      }
      if (z.hp <= 0 && !z.dead) this._burnToAsh(z);
    }
  }

  // A zombie burned to death: no ordinary corpse — it slumps into a smouldering
  // pile of ash with a last gout of embers and smoke.
  _burnToAsh(z) {
    z.dead = true;
    this.score += z.def.score;
    this.player.kills++;
    for (let i = 0; i < 14; i++) {
      const a = rand(0, TAU), s = rand(20, 110);
      this.particles.push(new Particle(z.x, z.y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: rand(0.4, 1.1), color: pick(["#ff7a2a", "#ffab40", "#3a3a3a", "#1c1c1c", "#c0341a"]), size: randInt(2, 4), drag: 0.9, gravity: -6 }));
    }
    this.scorches.push({ x: z.x, y: z.y, r: z.r * 1.5, smolder: rand(4, 7), seed: (Math.random() * 1e9) | 0, kind: "ash" });
    if (this.scorches.length > 50) this.scorches.shift();
    if (this.cheats && this.cheats.explodingZombies && !z._burst) this._zombieBurst(z);
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
    sfx.play(pk.kind === "medkit" || pk.kind === "adrenaline" ? "heal" : "pickup");
    switch (pk.kind) {
      case "weapon": {
        const id = pk.data;
        // Clip-less deploy/throwable weapons (mines) come with a few charges.
        const grant = WEAPONS[id].clip || (WEAPONS[id].deploy || WEAPONS[id].throwable ? 3 : 0);
        if (!l.owned[id]) {
          l.owned[id] = true;
          if (WEAPONS[id].clip) l.clip[id] = WEAPONS[id].clip;
          else if (WEAPONS[id].ammoType && grant) l.ammo[WEAPONS[id].ammoType] = (l.ammo[WEAPONS[id].ammoType] || 0) + grant;
          l.current = id;
          this._announce("Picked up " + WEAPONS[id].name, "equipped");
        } else {
          // Already owned: give ammo instead.
          const t = WEAPONS[id].ammoType;
          if (t && grant) { l.ammo[t] = (l.ammo[t] || 0) + grant; this._announce("+" + grant + " " + t); }
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
    if (this._flaming) { sfx.stopFlame(); this._flaming = false; } // cut the torch roar
    // Don't cut to the game-over screen — bleed out. The world keeps running
    // while a sheet of blood floods the screen over the next minute; the YOU
    // DIED card fades in a beat later so the blood drips over it.
    this.player.deadPose = true;
    this.death = { t: 0, dur: 60, dialogShown: false };
    this.blood = new DeathBlood(this.death.dur);
    // The horde tears the player apart: body parts, organs and blood everywhere.
    this._dismemberPlayer();
    this.hooks.vibrate?.([120, 40, 200]);
  }

  // The player is ripped limb-from-limb: fling the head, arms, legs and torso as
  // tumbling gibs, spill organs, and spray blood across the whole area.
  _dismemberPlayer() {
    const px = this.player.x, py = this.player.y, P = PLAYER_PAL;
    this.player.torn = true;
    sfx.play("gib");
    // Body parts, flung out and tumbling; they settle as ground decals.
    const parts = [
      ["head", P.skin], ["larm", P.skin], ["rarm", P.skin],
      ["lleg", P.pants], ["rleg", P.pants], ["torso", P.shirt],
    ];
    for (const [part, color] of parts) {
      const a = rand(0, TAU), s = rand(80, 220);
      this.gibs.push({
        x: px + rand(-3, 3), y: py - 5 + rand(-3, 3),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
        z: 6, vz: rand(80, 160), angle: rand(0, TAU), spin: rand(-16, 16),
        part, limbColor: color,
      });
    }
    // Organs / guts spill and skitter out.
    for (let i = 0; i < 7; i++) {
      const a = rand(0, TAU), s = rand(50, 170);
      this.gibs.push({
        x: px, y: py - 4, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30,
        z: 5, vz: rand(50, 120), angle: rand(0, TAU), spin: rand(-12, 12),
        part: "gut", limbColor: pick(["#9c3a4a", "#7a2030", "#b04a54", "#8a2a3a"]),
      });
    }
    // A huge spray of blood and viscera flying everywhere.
    for (let i = 0; i < 64; i++) {
      const a = rand(0, TAU), s = rand(60, 280);
      this.particles.push(new Particle(px, py, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: rand(0.6, 1.7),
        color: pick(["#a01818", "#7a1010", "#8a2a1a", "#c02828", "#611", "#9c3a4a", "#d98c9c", "#6a1414"]),
        size: randInt(2, 4), drag: 0.82, gravity: 130, stain: true,
      }));
    }
    // ...settling into a wide, gore-soaked pool.
    for (let i = 0; i < 28; i++) {
      this.stains.push({ x: px + rand(-28, 28), y: py + rand(-24, 24), r: rand(3, 9), life: rand(14, 24), color: pick(["#4a0c0c", "#5a1020", "#3a0808"]) });
    }
    this.shake += 14;
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
    this._drawDecor(ctx);
    this._drawScorch(ctx);
    this._drawPrints(ctx);
    this._drawStains(ctx);
    this._drawMines(ctx);
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
    this._drawFlies(ctx);
    this._drawBirds(ctx);
    this._drawShockwaves(ctx);
    this._drawLighting(ctx); // dim veil + flickering lamp pools + player torch
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
    const w = this.world, R = 6.8, feather = 3.0;
    const pcx = this.player.x / TILE, pcy = this.player.y / TILE;
    const startCX = Math.floor(camX / TILE) - 1, startCY = Math.floor(camY / TILE) - 1;
    const endCX = startCX + Math.ceil(this.bufW / TILE) + 2, endCY = startCY + Math.ceil(this.bufH / TILE) + 2;
    const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t)); // smoothstep for a gradual edge
    for (let cy = startCY; cy <= endCY; cy++) {
      for (let cx = startCX; cx <= endCX; cx++) {
        let a;
        if (!w.inBounds(cx, cy)) a = 0.98;
        else {
          const idx = w.idx(cx, cy);
          const d = Math.hypot(cx + 0.5 - pcx, cy + 0.5 - pcy);
          if (d <= R && this._tileVisible(cx, cy)) {
            w.explored[idx] = 1;
            a = smooth((d - (R - feather)) / feather) * 0.6; // wide, gradual sight edge
          } else if (w.explored[idx]) a = 0.66; // remembered
          else a = 0.98;                        // never seen
        }
        if (a > 0.02) { ctx.fillStyle = `rgba(4,5,8,${a.toFixed(3)})`; ctx.fillRect(cx * TILE, cy * TILE, TILE + 1, TILE + 1); }
      }
    }
    // A soft player-centred radial gradient smooths the blocky per-tile edge
    // into a gentle falloff around your sight.
    const px = this.player.x, py = this.player.y, Rpx = R * TILE;
    const g = ctx.createRadialGradient(px, py, Rpx * 0.45, px, py, Rpx * 1.02);
    g.addColorStop(0, "rgba(4,5,8,0)");
    g.addColorStop(0.72, "rgba(4,5,8,0.10)");
    g.addColorStop(1, "rgba(4,5,8,0.34)");
    ctx.fillStyle = g;
    ctx.fillRect(camX, camY, this.bufW, this.bufH);
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
          // Framed window: wall, recessed sill, a reflective glass pane with a
          // sky gradient and sheen, and cross muntins. Zombies/bullets smash it.
          ctx.fillStyle = set.wall; ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = set.wallTop; ctx.fillRect(x, y, TILE, 6);
          const gx0 = x + 5, gy0 = y + 7, gw = TILE - 10, gh = TILE - 13;
          ctx.fillStyle = "#2a1f16"; ctx.fillRect(gx0 - 2, gy0 - 1, gw + 4, gh + 3); // frame + sill
          const g = ctx.createLinearGradient(gx0, gy0, gx0 + gw, gy0 + gh);
          g.addColorStop(0, "#a6d4e2"); g.addColorStop(0.5, "#6ea6ba"); g.addColorStop(1, "#8fbccc");
          ctx.fillStyle = g; ctx.fillRect(gx0, gy0, gw, gh);
          ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 1.4; // diagonal sheen
          ctx.beginPath(); ctx.moveTo(gx0 + 1.5, gy0 + gh - 2); ctx.lineTo(gx0 + gw * 0.55, gy0 + 1.5); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(gx0 + gw * 0.5, gy0 + gh - 1.5); ctx.lineTo(gx0 + gw - 1.5, gy0 + gh * 0.45); ctx.stroke();
          ctx.strokeStyle = "#241a12"; ctx.lineWidth = 1.5; // muntins
          ctx.strokeRect(gx0, gy0, gw, gh);
          ctx.beginPath(); ctx.moveTo(x + TILE / 2, gy0); ctx.lineTo(x + TILE / 2, gy0 + gh); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(gx0, y + TILE / 2); ctx.lineTo(gx0 + gw, y + TILE / 2); ctx.stroke();
          ctx.lineWidth = 1;
          // Torn curtains hang over most house windows — a valance plus two
          // ragged side panels of frayed cloth.
          if (w.isHouse) {
            const hh = ((cx * 73856093) ^ (cy * 19349663)) >>> 0;
            if (hh % 3 !== 0) {
              const col = (hh & 1) ? "#6a4230" : "#4a4650", dk = (hh & 1) ? "#432a1e" : "#322e39";
              ctx.fillStyle = col; ctx.fillRect(gx0 - 1, gy0 - 1, gw + 2, 3); // valance
              const panels = [[gx0 - 1, (hh >> 2) % 5], [gx0 + gw - 4, (hh >> 6) % 5]];
              for (const [px0, jag] of panels) {
                const wp = 5, len = gh * (0.5 + jag / 12);
                ctx.fillStyle = col; ctx.fillRect(px0, gy0, wp, len);
                ctx.fillStyle = dk; ctx.fillRect(px0 + wp - 1.5, gy0, 1.5, len);            // fold shadow
                ctx.fillStyle = col; // a frayed, tapering rip at the bottom hem
                ctx.beginPath(); ctx.moveTo(px0, gy0 + len); ctx.lineTo(px0 + 2, gy0 + len + 4); ctx.lineTo(px0 + wp, gy0 + len); ctx.fill();
              }
            }
          }
        } else {
          // floor with a subtle checker (tinted by room in the house, by
          // terrain — grass / asphalt / sidewalk — in the streets)
          let fc0 = set.floor, fc1 = set.floor2;
          const rp = w.floorPair(cx, cy);
          if (rp) { fc0 = rp[0]; fc1 = rp[1]; }
          ctx.fillStyle = ((cx + cy) & 1) ? fc0 : fc1;
          ctx.fillRect(x, y, TILE, TILE);
          // Indoor flooring gets a material texture: plank seams, tile grout,
          // brick courses, cement joints, or a flecked carpet weave.
          if (w.isHouse && (t === T.FLOOR || t === T.DOOR)) {
            this._drawFloorMat(ctx, x, y, cx, cy, FLOOR_MAT[w.floorTint[w.idx(cx, cy)]]);
          }
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
    if (w.rugs && w.rugs.length) this._drawRugs(ctx);
  }

  // Material texture drawn over a house floor tile. Deterministic in (cx,cy)
  // so it never shimmers as the camera scrolls.
  _drawFloorMat(ctx, x, y, cx, cy, mat) {
    if (mat === "wood") {
      // Long horizontal planks: a dark seam between boards plus staggered end-joints.
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      for (let py = 0; py < TILE; py += 8) ctx.fillRect(x, y + py, TILE, 1);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      for (let py = 1; py < TILE; py += 8) ctx.fillRect(x, y + py, TILE, 1);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      const jog = (cy & 1) ? TILE / 2 : 0; // brick-lay the board ends per row
      ctx.fillRect(x + jog, y, 1, 8); ctx.fillRect(x + ((jog + TILE / 2) % TILE), y + 16, 1, 8);
    } else if (mat === "tile") {
      // Ceramic grout grid: 2×2 tiles per cell with a bright edge highlight.
      ctx.strokeStyle = "rgba(0,0,0,0.28)"; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      ctx.beginPath();
      ctx.moveTo(x + TILE / 2, y); ctx.lineTo(x + TILE / 2, y + TILE);
      ctx.moveTo(x, y + TILE / 2); ctx.lineTo(x + TILE, y + TILE / 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(x + 1, y + 1, TILE / 2 - 2, 1); ctx.fillRect(x + TILE / 2 + 1, y + 1, TILE / 2 - 2, 1);
    } else if (mat === "brick") {
      // Running-bond brick courses with mortar joints, offset every other row.
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      for (let py = 0; py <= TILE; py += 8) ctx.fillRect(x, y + py - 0.5, TILE, 1);
      for (let r = 0; r < 4; r++) {
        const oy = y + r * 8, off = (r & 1) ? TILE / 2 : 0;
        ctx.fillRect(x + off, oy, 1, 8);
        ctx.fillRect(x + ((off + TILE / 2) % TILE), oy, 1, 8);
      }
      ctx.fillStyle = "rgba(255,255,255,0.04)"; // top-lit brick faces
      for (let py = 1; py < TILE; py += 8) ctx.fillRect(x + 1, y + py, TILE - 2, 1);
    } else if (mat === "cement") {
      // Poured slab: faint expansion joints and a hairline crack on some cells.
      ctx.fillStyle = "rgba(0,0,0,0.14)";
      ctx.fillRect(x, y + TILE - 1, TILE, 1); ctx.fillRect(x + TILE - 1, y, 1, TILE);
      const h = ((cx * 73856093) ^ (cy * 19349663)) >>> 0;
      ctx.fillStyle = "rgba(255,255,255,0.03)"; ctx.fillRect(x + (h % 20) + 4, y + (h >> 5) % 20 + 4, 3, 3); // mottle
      if (h % 7 === 0) {
        ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + 4, y + 6); ctx.lineTo(x + 12, y + 15); ctx.lineTo(x + 9, y + 24); ctx.stroke();
      }
    } else if (mat === "carpet") {
      // Woven pile: a fine deterministic fleck of lighter/darker tufts.
      let h = ((cx * 374761393) ^ (cy * 668265263)) >>> 0;
      for (let i = 0; i < 10; i++) {
        h = (h * 1103515245 + 12345) >>> 0;
        const px = x + (h % TILE), py = y + ((h >> 8) % TILE);
        ctx.fillStyle = (h & 1) ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.12)";
        ctx.fillRect(px, py, 1, 1);
      }
    }
  }

  // Decorative area rugs, drawn over the floor and under furniture/actors.
  _drawRugs(ctx) {
    for (const r of this.world.rugs) {
      const x = r.x0 * TILE + 3, y = r.y0 * TILE + 3;
      const wd = (r.x1 - r.x0 + 1) * TILE - 6, ht = (r.y1 - r.y0 + 1) * TILE - 6;
      const pal = r.style === "modern"
        ? { field: "#3d4a52", border: "#2a333a", motif: "#6b7f88", accent: "#546670" }
        : r.style === "runner"
        ? { field: "#5c2f2c", border: "#8a6a34", motif: "#caa25a", accent: "#3f2020" }
        : { field: "#6e2f2c", border: "#b6893f", motif: "#d8b063", accent: "#3c1a18" }; // persian
      // Soft drop shadow, then the rug body and a woven border.
      ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(x + 2, y + 3, wd, ht);
      ctx.fillStyle = pal.field; ctx.fillRect(x, y, wd, ht);
      ctx.fillStyle = pal.border; ctx.fillRect(x, y, wd, 3); ctx.fillRect(x, y + ht - 3, wd, 3); ctx.fillRect(x, y, 3, ht); ctx.fillRect(x + wd - 3, y, 3, ht);
      ctx.strokeStyle = pal.accent; ctx.lineWidth = 1; ctx.strokeRect(x + 4.5, y + 4.5, wd - 9, ht - 9);
      const cxp = x + wd / 2, cyp = y + ht / 2;
      if (r.style === "modern") {
        ctx.fillStyle = pal.motif; // parallel stripes
        for (let sy = y + 8; sy < y + ht - 6; sy += 6) ctx.fillRect(x + 6, sy, wd - 12, 1.5);
      } else if (r.style === "runner") {
        ctx.fillStyle = pal.motif; // repeating diamonds down the runner
        for (let dy = y + 10; dy < y + ht - 8; dy += 12) {
          ctx.beginPath(); ctx.moveTo(cxp, dy - 4); ctx.lineTo(cxp + 5, dy); ctx.lineTo(cxp, dy + 4); ctx.lineTo(cxp - 5, dy); ctx.closePath(); ctx.fill();
        }
      } else {
        // Persian: a central medallion with corner accents.
        ctx.fillStyle = pal.motif;
        ctx.beginPath(); ctx.moveTo(cxp, cyp - 9); ctx.lineTo(cxp + 12, cyp); ctx.lineTo(cxp, cyp + 9); ctx.lineTo(cxp - 12, cyp); ctx.closePath(); ctx.fill();
        ctx.fillStyle = pal.accent;
        ctx.beginPath(); ctx.moveTo(cxp, cyp - 4); ctx.lineTo(cxp + 6, cyp); ctx.lineTo(cxp, cyp + 4); ctx.lineTo(cxp - 6, cyp); ctx.closePath(); ctx.fill();
        ctx.fillStyle = pal.motif;
        for (const [sx, sy] of [[x + 8, y + 8], [x + wd - 8, y + 8], [x + 8, y + ht - 8], [x + wd - 8, y + ht - 8]]) ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
      }
      // Fringe tassels on the short ends.
      ctx.fillStyle = pal.border;
      for (let fx = x + 3; fx < x + wd - 3; fx += 4) { ctx.fillRect(fx, y - 2, 1.5, 2); ctx.fillRect(fx, y + ht, 1.5, 2); }
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
    for (const g of this.gibs) {
      if (g.part === "blood") { // a flying droplet with a faint ground shadow
        if (g.z > 0) { ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fillRect(Math.round(g.x), Math.round(g.y), 2, 1); }
        ctx.fillStyle = "#8a1414"; ctx.fillRect(Math.round(g.x), Math.round(g.y - g.z), 2, 2);
        continue;
      }
      drawGroundLimb(ctx, g.x, g.y, g.angle, g.part, g.limbColor, g.z);
    }
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
      // Sheath a burning zombie in a flickering flame aura.
      if (z.burning > 0) {
        const t = (this._waterT || 0);
        for (let i = 0; i < 4; i++) {
          const a = t * 9 + i * 1.7 + z.frame, fx = z.x + Math.cos(a) * z.r * 0.7, fy = z.y - z.r * 0.5 + Math.sin(a * 1.3) * z.r * 0.5;
          ctx.fillStyle = i & 1 ? "rgba(255,150,40,0.75)" : "rgba(255,206,84,0.7)";
          const s = z.r * (0.5 + 0.25 * Math.sin(t * 14 + i));
          ctx.beginPath(); ctx.moveTo(fx, fy - s); ctx.lineTo(fx - s * 0.5, fy + s * 0.4); ctx.lineTo(fx + s * 0.5, fy + s * 0.4); ctx.closePath(); ctx.fill();
        }
      }
    }
  }

  _drawPlayer(ctx) {
    const p = this.player;
    if (p.deadPose) {
      if (p.torn) {
        // Ripped apart — nothing left at the spot but a gore-soaked patch with a
        // bit of spine and shattered ribs; the rest is scattered as gibs/limbs.
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.fillStyle = "rgba(60,8,10,0.5)"; ctx.beginPath(); ctx.ellipse(0, 0, 15, 11, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "rgba(40,4,6,0.55)"; ctx.beginPath(); ctx.ellipse(4, 2, 9, 6, -0.4, 0, TAU); ctx.fill();
        ctx.fillStyle = "#5a1414"; ctx.beginPath(); ctx.ellipse(0, 0, 5, 3.4, 0.3, 0, TAU); ctx.fill(); // pelvic cavity
        ctx.fillStyle = "rgba(210,190,150,0.6)"; // spine + snapped ribs
        ctx.fillRect(-1, -5, 2, 10);
        for (let i = -4; i <= 4; i += 2) ctx.fillRect(-4, i, 3.5, 0.8);
        ctx.fillStyle = "#8a3a3a"; ctx.beginPath(); ctx.arc(1.5, -0.5, 1.1, 0, TAU); ctx.fill(); // stray viscera
        ctx.restore();
        return;
      }
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
      stamina: p.stamina / p.maxStamina, idleT: p.idleT, pump: p.pumpT,
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
      if (pr.laser) {
        // Neon energy bolt: a long fading beam behind a bright core and a hot tip.
        const dx = pr.x - pr.px, dy = pr.y - pr.py, m = Math.hypot(dx, dy) || 1;
        const tx = pr.x - (dx / m) * 16, ty = pr.y - (dy / m) * 16; // extend the trail
        ctx.strokeStyle = "rgba(90,230,120,0.5)"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(pr.x, pr.y); ctx.stroke();
        ctx.strokeStyle = "#eafff0"; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(pr.x, pr.y); ctx.stroke();
        ctx.fillStyle = "#b6ffcf"; ctx.beginPath(); ctx.arc(pr.x, pr.y, 2.2, 0, TAU); ctx.fill();
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
        // Tumbling spent case: a fat red shotgun hull, or a brass pistol/rifle casing.
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        if (p.shell) {
          ctx.fillStyle = p.color || "#b3352b";
          ctx.fillRect(-3, -1.5, 6, 3);
          ctx.fillStyle = "#c9a24a"; // brass base
          ctx.fillRect(-3, -1.5, 2.2, 3);
        } else {
          ctx.fillStyle = "#e0b83a";
          ctx.fillRect(-2, -1, 4, 2);
          ctx.fillStyle = "#8a6a1a";
          ctx.fillRect(-2, -1, 1.2, 2);
        }
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

  pause(v) { this.paused = v; this.lastT = performance.now(); if (v && this._flaming) { sfx.stopFlame(); this._flaming = false; } }
  stop() { this.running = false; }
}
