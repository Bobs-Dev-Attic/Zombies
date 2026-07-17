// Game entities: Player, Zombie, Projectile, Particle, Pickup.
import { clamp, rand, randInt, chance, angleTo, angleLerp, dist, TAU, pick } from "./util.js";
import { WEAPONS } from "./weapons.js";
import { makeZombieLook } from "./sprites.js";

// ---------------------------------------------------------------- Player
export class Player {
  constructor(x, y, loadout) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.r = 6;
    this.angle = 0;
    this.maxHealth = 100;
    this.health = 100;
    this.maxStamina = 140;
    this.stamina = 140;
    this.baseSpeed = 118;
    this.loadout = loadout;
    this.cooldown = 0;
    this.reloading = 0;
    this.walkFrame = 0;
    this.hurtFlash = 0;
    this.muzzle = 0;
    this.exhausted = false;
    this.kills = 0;
    this.invuln = 0;
    this.moving = false;
    this.running = false;
    this.idleT = 0;        // ever-advancing clock for the idle/breathing animation
    this.adrenaline = 0;   // seconds of adrenaline rush remaining
    this.armorFlash = 0;   // brief flash when armour soaks a hit
    // Arm animation: recoil (0..1 decaying) for guns; swing timer for melee.
    this.recoil = 0;
    this.swingT = 0;
    this.swingDur = 0.22;
    this.meleeVariant = "swing"; // swing | stab | lunge (knife)
    this.lungeT = 0;             // forward-dash timer for the two-handed lunge
    this.pumpT = 0;              // pump-action rack animation (pump shotgun)
    this.bloodyFeet = 0;         // px-budget of bloody footprints left to track
  }

  triggerRecoil(w, variant) {
    if (w.melee) {
      this.meleeVariant = variant || "swing";
      // A stab/lunge is a quick thrust; a swing is a wider arc.
      this.swingDur = this.meleeVariant === "swing" ? 0.24 : 0.18;
      this.swingT = this.swingDur;
      if (this.meleeVariant === "lunge") this.lungeT = 0.16;
    } else {
      this.recoil = 1;
      if (w.kind === "shotgun") this.pumpT = 1; // rack the pump after the shot
    }
  }

  get weapon() { return WEAPONS[this.loadout.current]; }

  // Movement speed accounts for wounds, exhaustion and sprint.
  speedFactor(sprinting) {
    let f = 1;
    const hp = this.health / this.maxHealth;
    if (hp < 0.25) f *= 0.62;         // badly wounded: limping
    else if (hp < 0.5) f *= 0.82;     // hurt: slowed
    if (this.exhausted) f *= 0.6;     // out of stamina
    if (sprinting && !this.exhausted && this.stamina > 0) f *= 1.5;
    return f;
  }

  update(dt, input, world) {
    this.idleT += dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.muzzle > 0) this.muzzle -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.adrenaline > 0) this.adrenaline -= dt;
    if (this.armorFlash > 0) this.armorFlash -= dt;
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 7);
    if (this.pumpT > 0) this.pumpT = Math.max(0, this.pumpT - dt * 2.6);
    if (this.swingT > 0) this.swingT = Math.max(0, this.swingT - dt);
    if (this.lungeT > 0) {
      this.lungeT = Math.max(0, this.lungeT - dt);
      this.vx += Math.cos(this.angle) * 340 * dt; // forward thrust of the two-handed lunge
      this.vy += Math.sin(this.angle) * 340 * dt;
    }

    const wantMove = input.moveMag > 0.08;
    const sprinting = input.moveMag > 0.92 && wantMove;

    // Stamina drain / regen. Adrenaline slows BOTH the drain and the regen, so
    // you can sprint far longer (but it also refills more gently).
    const rate = this.adrenaline > 0 ? 0.5 : 1;
    // Sprinting tires you faster the more hurt you are and the more gear you
    // haul (a helmet and body armour each add a little weight).
    const l = this.loadout;
    let drainMul = 1 + (1 - this.health / this.maxHealth) * 0.5;
    if (l && (l.helmet || 0) > 0) drainMul += 0.12;
    if (l && (l.armor || 0) > 0) drainMul += 0.2;
    if (sprinting && !this.exhausted && this.stamina > 0) {
      this.stamina = clamp(this.stamina - 24 * dt * rate * drainMul, 0, this.maxStamina);
      if (this.stamina <= 0) this.exhausted = true;
    } else if (!wantMove) {
      this.stamina = clamp(this.stamina + 26 * dt * rate, 0, this.maxStamina);
    } else {
      this.stamina = clamp(this.stamina + 12 * dt * rate, 0, this.maxStamina);
    }
    if (this.exhausted && this.stamina > this.maxStamina * 0.25) this.exhausted = false;

    // Expose gait state for the walk/run animation.
    this.moving = wantMove;
    this.running = sprinting && !this.exhausted && this.stamina > 0;

    const spd = this.baseSpeed * this.speedFactor(sprinting) * clamp(input.moveMag / 0.9, 0, 1);
    const tvx = wantMove ? input.moveX * spd : 0;
    const tvy = wantMove ? input.moveY * spd : 0;
    // Smooth acceleration for fluid motion.
    this.vx += (tvx - this.vx) * clamp(dt * 12, 0, 1);
    this.vy += (tvy - this.vy) * clamp(dt * 12, 0, 1);

    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;
    const res = world.collide(nx, ny, this.r, false, true); // player shoves movable furniture
    this.x = res.x; this.y = res.y;
    // Shoving furniture is hard work — bigger/heavier pieces drain more stamina.
    if (world.lastPushMass) {
      this.stamina = clamp(this.stamina - world.lastPushMass * 26 * dt, 0, this.maxStamina);
      if (this.stamina <= 0) this.exhausted = true;
    }

    if (wantMove) this.walkFrame += dt * (sprinting ? 16 : 10);

    // Slow health regen when calm and not badly hurt.
    if (this.health > 0 && this.health < this.maxHealth) {
      this.health = clamp(this.health + 1.2 * dt, 0, this.maxHealth);
    }

    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this._finishReload();
    }
  }

  faceTarget(tx, ty, dt) {
    const target = angleTo(this.x, this.y, tx, ty);
    this.angle = angleLerp(this.angle, target, clamp(dt * 14, 0, 1));
  }

  hurt(amount) {
    if (this.invuln > 0) return;
    let dmg = amount;
    const l = this.loadout;
    // A helmet soaks a slice of every blow (head protection) until it shatters.
    if (l && l.helmet > 0 && dmg > 0) {
      const soak = Math.min(l.helmet, dmg * 0.4);
      l.helmet -= soak; dmg -= soak; this.armorFlash = 0.18;
      if (l.helmet <= 0.001) { l.helmet = 0; this.armorBroke = "helmet"; }
    }
    // Body armour soaks the bulk of what's left, then breaks and falls away.
    if (l && l.armor > 0 && dmg > 0) {
      const soak = Math.min(l.armor, dmg * 0.6);
      l.armor -= soak; dmg -= soak; this.armorFlash = 0.18;
      if (l.armor <= 0.001) { l.armor = 0; this.armorBroke = "armor"; }
    }
    this.health = clamp(this.health - dmg, 0, this.maxHealth);
    this.hurtFlash = 0.18;
    this.invuln = 0.35;
  }

  heal(a) { this.health = clamp(this.health + a, 0, this.maxHealth); }

  canFire() {
    if (this.cooldown > 0 || this.reloading > 0) return false;
    const w = this.weapon;
    if (w.melee) return true;
    if (w.throwable) return (this.loadout.ammo[w.ammoType] || 0) > 0;
    const clip = this.loadout.clip[this.loadout.current] ?? 0;
    return clip > 0;
  }

  startReload() {
    const w = this.weapon;
    if (w.melee || this.reloading > 0) return false;
    const type = w.ammoType;
    const clip = this.loadout.clip[this.loadout.current] ?? 0;
    if (clip >= w.clip) return false;
    if ((this.loadout.ammo[type] ?? 0) <= 0) return false;
    this.reloading = w.reload;
    return true;
  }

  _finishReload() {
    const w = this.weapon;
    const type = w.ammoType;
    const clip = this.loadout.clip[this.loadout.current] ?? 0;
    const need = w.clip - clip;
    const have = this.loadout.ammo[type] ?? 0;
    const take = Math.min(need, have);
    this.loadout.clip[this.loadout.current] = clip + take;
    this.loadout.ammo[type] = have - take;
  }
}

// ---------------------------------------------------------------- Zombies
// shamble = how much they weave off a straight line; lurch = gait stop/start pulse.
export const ZOMBIE_TYPES = {
  walker:  { hp: 46,  speed: 30, r: 7,  dmg: 9,  pattern: "direct",      knockResist: 0, score: 10, color: "walker",  gore: 1,   shamble: 0.5,  lurch: 0.38 },
  runner:  { hp: 30,  speed: 56, r: 6,  dmg: 7,  pattern: "direct",      knockResist: 0.1, score: 16, color: "runner",  gore: 1,   shamble: 0.2,  lurch: 0.15, leap: true },
  crawler: { hp: 22,  speed: 44, r: 5,  dmg: 6,  pattern: "wanderChase", knockResist: 0.1, score: 14, color: "crawler", gore: 0.7, shamble: 0.42, lurch: 0.32 },
  brute:   { hp: 180, speed: 22, r: 12, dmg: 22, pattern: "direct",      knockResist: 0.75, score: 40, color: "brute",   gore: 2,   shamble: 0.26, lurch: 0.42 },
  spitter: { hp: 40,  speed: 30, r: 7,  dmg: 5,  pattern: "ranged",      knockResist: 0.2, score: 24, color: "spitter", gore: 1,   shamble: 0.2,  lurch: 0.18 },
  // Leaper: a wiry zombie that pounces at the player in long jumps.
  leaper:  { hp: 34,  speed: 48, r: 6,  dmg: 12, pattern: "direct",      knockResist: 0.1, score: 26, color: "runner",  gore: 0.9, shamble: 0.28, lurch: 0.2, leap: true, leapEager: true },
  // Prone crawler: drags itself along the ground with no legs. High base speed
  // so the legless drag still lunges, but slower and more erratic than a walker.
  prone:   { hp: 30,  speed: 118, r: 6, dmg: 10, pattern: "wanderChase", knockResist: 0.15, score: 20, color: "crawler", gore: 0.9, shamble: 0.46, lurch: 0.4, bornProne: true },
  // Zombie dog: a fast, low four-legged runner that packs the streets outside.
  dog:     { hp: 26,  speed: 78, r: 6,  dmg: 8,  pattern: "direct",      knockResist: 0.05, score: 18, color: "runner",  gore: 0.7, shamble: 0.14, lurch: 0.12, quad: true },
  // Zombie rat: tiny, fast, weak — swarms the sewers in scurrying packs.
  rat:     { hp: 12,  speed: 96, r: 4,  dmg: 4,  pattern: "direct",      knockResist: 0,    score: 8,  color: "crawler", gore: 0.4, shamble: 0.1,  lurch: 0.08, quad: true },
};

export class Zombie {
  constructor(x, y, type, hpScale = 1) {
    const t = ZOMBIE_TYPES[type];
    this.type = type;
    this.def = t;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.r = t.r;
    this.maxHp = t.hp * hpScale;
    this.hp = this.maxHp;
    this.speed = t.speed * rand(0.9, 1.12);
    this.angle = rand(0, TAU);
    this.frame = rand(0, TAU);
    this.hurtFlash = 0;
    this.state = "idle";
    this.wanderAngle = rand(0, TAU);
    this.wanderTimer = rand(0.5, 2);
    this.attackCd = 0;
    this.spitCd = rand(1, 3);
    this.dead = false;
    this.knock = { x: 0, y: 0 };
    this.flankSign = chance(0.5) ? 1 : -1;
    this.mass = t.r; // heavier things shove lighter ones in collisions
    this.look = makeZombieLook(type); // per-zombie skin/clothes/hair variety
    this.bloody = chance(0.8);        // most of the horde tracks bloody prints
    this.quad = !!t.quad;              // four-legged (dog)
    this.accuracy = rand(0.5, 1);      // some aim their spit far better than others

    // Per-zombie gait so they shamble on differing strides and paths, not lines.
    const shamble = t.shamble ?? 0.3, lurch = t.lurch ?? 0.25;
    this.shambleAmp = shamble * rand(0.7, 1.3);
    this.shambleFreq = rand(1.3, 3.1);
    this.shamblePhase = rand(0, TAU);
    this.curveBias = rand(-0.13, 0.13) * (shamble / 0.4); // lean their whole approach to one side
    this.lurchDepth = lurch * rand(0.7, 1.2);
    this.lurchRate = rand(0.7, 1.7);
    this.lurchPhase = rand(0, TAU);
    this.gaitT = rand(0, 6);
    this.strideRate = rand(0.8, 1.35); // animation stride speed
    this.strideAmp = rand(0.7, 1.4);   // animation stride size

    // Dismemberment: each limb is attached (1) or severed (0).
    this.parts = { larm: 1, rarm: 1, lleg: 1, rleg: 1 };
    if (t.bornProne) { this.parts.lleg = 0; this.parts.rleg = 0; }
    this.speedMul = 1;
    this.dmgMul = 1;
    this.prone = false;
    this._recomputeParts();

    // Leap / pounce ability.
    this.canLeap = !!t.leap && !t.bornProne;
    this.leaping = false;
    this.leapT = 0; this.leapDur = 0.5; this.leapHeight = 0;
    this.jumpH = 0;
    this.leapVX = 0; this.leapVY = 0;
    this.leapCd = rand(t.leapEager ? 1.2 : 2.5, t.leapEager ? 3 : 5);
  }

  _startLeap(player) {
    const d = dist(this.x, this.y, player.x, player.y);
    const a = angleTo(this.x, this.y, player.x, player.y);
    this.leaping = true;
    this.leapDur = 0.5;
    this.leapT = 0.5;
    this.leapHeight = 11;
    this.angle = a;
    const reach = Math.min(d + 12, 230);
    const sp = reach / this.leapDur;
    this.leapVX = Math.cos(a) * sp;
    this.leapVY = Math.sin(a) * sp;
  }

  // Recompute mobility & damage from remaining limbs. No legs => prone crawl.
  _recomputeParts() {
    const legs = this.parts.lleg + this.parts.rleg;
    const arms = this.parts.larm + this.parts.rarm;
    this.speedMul = legs === 2 ? 1 : legs === 1 ? 0.58 : 0.34;
    this.dmgMul = arms === 2 ? 1 : arms === 1 ? 0.6 : 0.28;
    this.prone = legs === 0;
  }

  // Sever a random still-attached limb; returns its name or null.
  _severRandom(preferLegs) {
    let pool = Object.keys(this.parts).filter((k) => this.parts[k]);
    if (preferLegs) {
      const legs = pool.filter((k) => k.endsWith("leg"));
      if (legs.length) pool = legs;
    }
    if (!pool.length) return null;
    const part = pool[(Math.random() * pool.length) | 0];
    this.parts[part] = 0;
    this._recomputeParts();
    return part;
  }

  // Heading toward the player: straight line when there's LOS or we're close,
  // otherwise follow the BFS flow field around walls.
  _seek(player, world, nav) {
    const d = dist(this.x, this.y, player.x, player.y);
    const los = nav ? nav.los(this.x, this.y) : true;
    if (los || d < 44) {
      const a = angleTo(this.x, this.y, player.x, player.y);
      return { hx: Math.cos(a), hy: Math.sin(a), d, los };
    }
    const f = nav ? nav.flow(this.x, this.y) : null;
    if (f && f.seen) return { hx: f.fx, hy: f.fy, d, los };
    const a = angleTo(this.x, this.y, player.x, player.y);
    return { hx: Math.cos(a), hy: Math.sin(a), d, los };
  }

  // Weave a heading into a shambling gait: perpendicular sway + a constant
  // curve bias, with a stop/start lurch pulse on the speed.
  _applyShamble(hx, hy, spd) {
    const lurch = 1 - this.lurchDepth * (0.5 + 0.5 * Math.sin(this.gaitT * this.lurchRate + this.lurchPhase));
    const sway = Math.sin(this.gaitT * this.shambleFreq + this.shamblePhase) * this.shambleAmp + this.curveBias;
    const px = -hy, py = hx; // perpendicular to heading
    const s = spd * lurch;
    return { tvx: (hx + px * sway) * s, tvy: (hy + py * sway) * s };
  }

  update(dt, player, world, nav, spawnProjectile, lure) {
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.attackCd > 0) this.attackCd -= dt;
    this.gaitT += dt;
    // A flare on the ground draws the horde toward it instead of the player.
    this.lured = lure && dist(this.x, this.y, lure.x, lure.y) < 320;

    // Mid-leap: fly along the pounce arc, land, and (maybe) maul the player.
    if (this.leaping) {
      this.leapT -= dt;
      const prog = 1 - this.leapT / this.leapDur;
      this.jumpH = Math.sin(clamp(prog, 0, 1) * Math.PI) * this.leapHeight;
      this.frame += dt * 8;
      const nx = this.x + this.leapVX * dt, ny = this.y + this.leapVY * dt;
      const res = world.collide(nx, ny, this.r, true);
      this.x = res.x; this.y = res.y;
      this.vx = this.leapVX; this.vy = this.leapVY;
      if (this.leapT <= 0) {
        this.leaping = false; this.jumpH = 0;
        this.leapCd = rand(this.def.leapEager ? 1.4 : 2.6, this.def.leapEager ? 3.2 : 5.5);
        if (dist(this.x, this.y, player.x, player.y) < this.r + player.r + 10 && this.attackCd <= 0) {
          player.hurt(this.def.dmg * 1.5 * this.dmgMul);
          this.attackCd = 0.6;
          const a = angleTo(this.x, this.y, player.x, player.y);
          player.vx += Math.cos(a) * 120; player.vy += Math.sin(a) * 120;
        }
      }
      return;
    }
    if (this.canLeap) this.leapCd -= dt;

    this.frame += dt * (2 + this.speed * this.speedMul * 0.05) * this.strideRate;

    const seekTarget = this.lured ? lure : player;
    const seek = this._seek(seekTarget, world, this.lured ? null : nav);
    const d = seek.d;
    const pdist = dist(this.x, this.y, player.x, player.y);
    const sees = d < 560;
    // The more wounded (low HP) it is, the slower it moves — on top of dismemberment.
    const hpFrac = clamp(this.hp / this.maxHp, 0, 1);
    this.woundMul = 0.55 + 0.45 * hpFrac;
    const spd = this.speed * this.speedMul * this.woundMul;
    let tvx = 0, tvy = 0;

    // Pounce when in range with a clear line to the player (not while lured).
    if (this.canLeap && !this.lured && this.leapCd <= 0 && seek.los && d > 55 && d < 240) {
      this._startLeap(player);
      this.vx = this.leapVX; this.vy = this.leapVY;
      return;
    }

    switch (this.def.pattern) {
      case "wanderChase": {
        if (d < 340) this.state = "chase";
        if (this.state !== "chase") {
          this.wanderTimer -= dt;
          if (this.wanderTimer <= 0) { this.wanderAngle = rand(0, TAU); this.wanderTimer = rand(0.6, 2.2); }
          tvx = Math.cos(this.wanderAngle) * spd * 0.4;
          tvy = Math.sin(this.wanderAngle) * spd * 0.4;
        } else {
          const sh = this._applyShamble(seek.hx, seek.hy, spd);
          tvx = sh.tvx; tvy = sh.tvy;
        }
        break;
      }
      case "ranged": {
        const a = angleTo(this.x, this.y, player.x, player.y);
        this.angle = angleLerp(this.angle, a, clamp(dt * 6, 0, 1));
        const ideal = 180;
        if (!seek.los || d > ideal + 40) { tvx = seek.hx * spd; tvy = seek.hy * spd; }
        else if (d < ideal - 40) { tvx = -Math.cos(a) * spd * 0.7; tvy = -Math.sin(a) * spd * 0.7; }
        else { // strafe
          tvx = Math.cos(a + Math.PI / 2) * spd * 0.5 * this.flankSign;
          tvy = Math.sin(a + Math.PI / 2) * spd * 0.5 * this.flankSign;
        }
        this.spitCd -= dt;
        if (sees && seek.los && this.spitCd <= 0 && d < 320) {
          this.spitCd = rand(2.2, 3.6);
          // Accuracy varies per zombie — sharp shooters barely miss, sloppy ones spray.
          const spread = 0.03 + (1 - this.accuracy) * 0.22;
          spawnProjectile(this.x, this.y, a + rand(-spread, spread), "spit");
        }
        break;
      }
      default: { // direct — but shamble it so it isn't a straight beeline
        const sh = this._applyShamble(seek.hx, seek.hy, spd);
        tvx = sh.tvx; tvy = sh.tvy;
      }
    }

    if (this.def.pattern !== "ranged") {
      const moveA = Math.atan2(tvy, tvx);
      if (tvx || tvy) this.angle = angleLerp(this.angle, moveA, clamp(dt * 6, 0, 1));
    }

    // Apply knockback impulse, decaying.
    tvx += this.knock.x; tvy += this.knock.y;
    this.knock.x *= Math.pow(0.001, dt);
    this.knock.y *= Math.pow(0.001, dt);
    this.vx = tvx; this.vy = tvy; // remembered for the dynamic shadow

    const nx = this.x + tvx * dt;
    const ny = this.y + tvy * dt;
    const res = world.collide(nx, ny, this.r, true); // climb through windows
    this.x = res.x; this.y = res.y;

    // Melee the player on contact. Fewer arms & heavier wounds => weaker hits.
    if (pdist < this.r + player.r + 2 && this.attackCd <= 0) {
      player.hurt(this.def.dmg * this.dmgMul * (0.55 + 0.45 * hpFrac));
      this.attackCd = 0.7;
      const a = angleTo(this.x, this.y, player.x, player.y);
      player.vx += Math.cos(a) * 60;
      player.vy += Math.sin(a) * 60;
    }
  }

  applyKnockback(angle, force) {
    const f = force * (1 - this.def.knockResist);
    this.knock.x += Math.cos(angle) * f;
    this.knock.y += Math.sin(angle) * f;
  }

  // Returns { dead, severed } where severed is the limb name lost (or null).
  damage(amount, angle, force, sever = 0) {
    this.hp -= amount;
    this.hurtFlash = 0.08;
    if (force) this.applyKnockback(angle, force);
    let severed = null;
    if (this.hp > 0) {
      // Bigger hits and dismembering weapons are likelier to tear a limb off —
      // now with a base chance on every hit, so bits come off readily.
      const p = 0.02 + sever + amount * 0.009;
      if (Math.random() < p) severed = this._severRandom();
    } else {
      this.dead = true;
    }
    return { dead: this.dead, severed };
  }
}

// ---------------------------------------------------------------- Projectiles
export class Projectile {
  constructor(x, y, angle, opts) {
    this.x = x; this.y = y;
    this.px = x; this.py = y;
    this.vx = Math.cos(angle) * opts.speed;
    this.vy = Math.sin(angle) * opts.speed;
    this.angle = angle;
    this.damage = opts.damage;
    this.range = opts.range;
    this.traveled = 0;
    this.dead = false;
    this.hostile = !!opts.hostile;
    this.explosive = opts.explosive || 0;
    this.knockback = opts.knockback || 0;
    this.pierce = opts.pierce || 0;
    this.sever = opts.sever || 0;
    this.hs = opts.hs || 0;
    this.hitSet = new Set();
    this.kind = opts.kind || "bullet";
    this.r = opts.r || 1.6;
  }

  update(dt, world) {
    this.px = this.x; this.py = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const step = Math.hypot(this.vx, this.vy) * dt;
    this.traveled += step;
    if (this.traveled >= this.range) this.dead = true;
    if (world.blocksShot(this.x, this.y)) this.dead = true;
  }
}

// ---------------------------------------------------------------- Particles
export class Particle {
  constructor(x, y, opts) {
    this.x = x; this.y = y;
    this.vx = opts.vx; this.vy = opts.vy;
    this.life = opts.life; this.maxLife = opts.life;
    this.color = opts.color;
    this.size = opts.size || 2;
    this.gravity = opts.gravity || 0;
    this.drag = opts.drag ?? 0.9;
    this.stain = opts.stain || false; // blood that settles on the ground
    this.kind = opts.kind || "bit";   // 'bit' | 'casing'
    this.shell = opts.shell || false; // a fat shotgun hull (vs a brass casing)
    this.spin = opts.spin || 0;
    this.angle = opts.angle || 0;
    this.dead = false;
    this.settled = false;
  }
  update(dt) {
    if (this.settled) { this.life -= dt; if (this.life <= 0) this.dead = true; return; }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= Math.pow(this.drag, dt * 60);
    this.vy *= Math.pow(this.drag, dt * 60);
    this.vy += this.gravity * dt;
    this.angle += this.spin * dt;
    this.life -= dt;
    if (this.stain && Math.hypot(this.vx, this.vy) < 12) { this.settled = true; this.life = 6; }
    if (this.life <= 0) this.dead = true;
  }
}

// ---------------------------------------------------------------- Pickups
export class Pickup {
  constructor(x, y, kind, data) {
    this.x = x; this.y = y;
    this.kind = kind;   // 'weapon' | 'ammo' | 'medkit' | 'adrenaline'
    this.data = data;   // weapon id or ammo {type, amount}
    this.t = rand(0, TAU);
    this.dead = false;
    this.r = 9;
  }
  update(dt) { this.t += dt; }
}

// ---------------------------------------------------------------- Thrown items
// Grenades and flares: lobbed on an arc (z = height above ground), bounce off
// walls, settle, and count down a fuse. The game reads .kind / .fuse to detonate
// a grenade or keep a flare burning as a lure.
export class Thrown {
  constructor(x, y, angle, opts) {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * opts.speed;
    this.vy = Math.sin(angle) * opts.speed;
    this.z = 4; this.vz = 95;          // arc height above the ground
    this.kind = opts.kind;             // 'grenade' | 'flare'
    this.fuse = opts.fuse;
    this.explosive = opts.explosive || 0;
    this.damage = opts.damage || 0;
    this.knockback = opts.knockback || 0;
    this.sever = opts.sever || 0;
    this.spin = rand(-16, 16);
    this.angle = angle;
    this.landed = false;
    this.dead = false;
    this.t = 0;
  }
  update(dt, world) {
    this.t += dt; this.fuse -= dt; this.angle += this.spin * dt;
    if (!this.landed) {
      this.z += this.vz * dt; this.vz -= 300 * dt;
      const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
      const res = world.collide(nx, ny, 3);
      if (Math.abs(res.x - nx) > 0.01 || Math.abs(res.y - ny) > 0.01) { this.vx *= -0.4; this.vy *= -0.4; }
      this.x = res.x; this.y = res.y;
      if (this.z <= 0) { this.z = 0; this.landed = true; this.vx *= 0.3; this.vy *= 0.3; this.spin *= 0.25; }
    } else {
      this.vx *= Math.pow(0.02, dt); this.vy *= Math.pow(0.02, dt);
      const res = world.collide(this.x + this.vx * dt, this.y + this.vy * dt, 3);
      this.x = res.x; this.y = res.y;
    }
  }
}
