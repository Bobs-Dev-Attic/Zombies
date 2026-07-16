// Procedural pixel-art drawing. Everything is painted onto the low-res buffer,
// so filled rectangles become crisp pixels once the buffer is scaled up.
import { TAU } from "./util.js";

// Rotate a small offset (ox, oy) around origin (cx, cy) by angle and plot a block.
function px(ctx, cx, cy, ox, oy, w, h, cos, sin, color) {
  const rx = ox * cos - oy * sin;
  const ry = ox * sin + oy * cos;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(cx + rx - w / 2), Math.round(cy + ry - h / 2), w, h);
}

// Chunky pixel limb: a run of blocks from (x0,y0) to (x1,y1).
function limb(ctx, x0, y0, x1, y1, w, color) {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(1, Math.round(Math.hypot(dx, dy) / 1.6));
  ctx.fillStyle = color;
  const o = w / 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    ctx.fillRect(Math.round(x0 + dx * t - o), Math.round(y0 + dy * t - o), w, w);
  }
}

// Chunky pixel limb in the current (already-transformed) coordinate space.
function limb2(ctx, x0, y0, x1, y1, w, color) {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(1, Math.round(Math.hypot(dx, dy) / 1.4));
  ctx.fillStyle = color;
  const o = w / 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    ctx.fillRect(x0 + dx * t - o, y0 + dy * t - o, w, w);
  }
}

// Dynamic ground shadow: shifts & stretches along movement, shrinks/fades as
// the body lifts (walk bounce or a leap). lift is 0..1.
function drawShadow(ctx, cx, footY, vx, vy, rx, ry, lift) {
  lift = Math.max(0, Math.min(1, lift || 0));
  const sp = Math.hypot(vx || 0, vy || 0);
  const dir = sp > 1 ? Math.atan2(vy, vx) : 0;
  const stretch = Math.min(sp / 90, 0.6);          // elongate in the move direction
  const ox = sp > 1 ? (vx / sp) * (1.5 + stretch * 3) : 0;
  const k = 1 - lift * 0.55;                        // shrink as it lifts
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${(0.34 * k).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(cx + ox, footY, rx * (1 + stretch) * k, ry * k, dir, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// Draw a rotated rectangle centred at world (wx,wy).
function rrect(ctx, wx, wy, ang, w, h, color) {
  ctx.save();
  ctx.translate(wx, wy);
  ctx.rotate(ang);
  ctx.fillStyle = color;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

// Draw the player. Feet are planted on the ground and scissor fore/aft while
// the upper body bounces above them (against a fixed shadow) — so it reads as
// walking/running, not floating. Body & weapon rotate to face `angle`.
// action = { recoil, swingT, swingDur, melee, moving, run }
export function drawPlayer(ctx, cx, cy, angle, frame, hurtFlash, weaponKind, palette, action) {
  action = action || {};
  const skin = hurtFlash ? "#ff6b5e" : palette.skin;
  const c = Math.cos(angle), s = Math.sin(angle);
  const moving = !!action.moving, run = !!action.run;

  // Gait timing.
  const strideAmp = run ? 8.5 : 6.5;
  const stride = moving ? Math.sin(frame) * strideAmp : 0;      // feet swing fore/aft
  let lift, rock;
  if (moving) {
    lift = Math.abs(Math.sin(frame)) * (run ? 3.8 : 2.6);       // body bob
    rock = Math.sin(frame) * (run ? 0.12 : 0.08);              // side-to-side sway
  } else {
    // Idle breathing — heaves harder and faster the more winded you are.
    const tired = 1 - (action.stamina == null ? 1 : action.stamina);
    const idleT = action.idleT || 0;
    const amp = 0.6 + tired * 2.0, rate = 3.0 + tired * 4.6;
    lift = (Math.sin(idleT * rate) * 0.5 + 0.5) * amp;         // chest rise/fall (>=0)
    rock = Math.sin(idleT * rate * 0.5) * (0.02 + tired * 0.06);
  }

  // Ground point at local (ox forward, oy sideways) — feet live here (no bob).
  const gpt = (ox, oy) => [cx + c * ox - s * oy, cy + s * ox + c * oy];
  // Bobbed point — hips/body live here.
  const bpt = (ox, oy) => [cx + c * ox - s * oy, cy - lift + s * ox + c * oy];

  // --- Shadow (planted; shifts with movement, shrinks as the body bounces).
  drawShadow(ctx, cx, cy + 6, action.vx || 0, action.vy || 0, 7, 3.4, lift / 4.2);

  // --- Legs & feet: hips (bobbed) down to planted, scissoring boots. The lead
  // foot swings out past the torso so the stride is clearly visible from above.
  const drawLeg = (footFwd, side) => {
    const hip = bpt(-2, side * 2.2);
    const foot = gpt(footFwd, side * 2.8);
    limb2(ctx, hip[0], hip[1], foot[0], foot[1], 3.5, palette.pants);
    rrect(ctx, foot[0], foot[1], angle, 6, 3.5, "#161a14"); // chunky boot, points forward
  };
  drawLeg(stride, -1);
  drawLeg(-stride, 1);

  // --- Upper body (bobbed & rocked), rotated to face `angle`.
  ctx.save();
  ctx.translate(cx, cy - lift);
  ctx.rotate(angle + rock);
  const R = (ox, oy, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(ox - w / 2, oy - h / 2, w, h); };

  R(0, 0, 9, 9, palette.shirt);
  R(-2.5, 0, 3, 9, palette.vest); // vest/pack toward the back
  // Body armour plate over the chest (with shoulder straps) when equipped.
  if (action.armor) {
    R(0.3, 0, 8.4, 8.4, "#465264");
    R(0.3, -3, 8.4, 1.8, "#586576");
    R(0.3, 3, 8.4, 1.8, "#586576");
    R(1.6, 0, 3.4, 6.5, "#3a4453");
  }

  // Weapon pose. Guns recoil; the knife has three attacks (one-handed swing,
  // one-handed stab, two-handed lunge); other melee is a two-handed swing.
  const melee = !!action.melee;
  const isKnife = weaponKind === "melee_knife";
  const variant = action.variant || "swing";
  const prog = melee && action.swingT > 0 ? 1 - action.swingT / (action.swingDur || 0.22) : -1;
  const active = prog >= 0;
  let sweep = 0, handFwd = 8, oneHanded = false;
  if (melee) {
    if (isKnife && variant === "stab") {
      oneHanded = true;
      handFwd = 8 + (active ? Math.sin(prog * Math.PI) * 7 : 0);   // straight thrust
    } else if (isKnife && variant === "lunge") {
      oneHanded = false;
      handFwd = 8 + (active ? Math.sin(prog * Math.PI) * 9 : 0);   // two-handed lunge thrust
    } else {
      oneHanded = isKnife;                                         // one-handed knife swing / two-handed bat
      sweep = active ? 1.05 - prog * 2.1 : 0;
      handFwd = 8 + (active ? Math.sin(prog * Math.PI) * 5 : 0);
    }
  } else {
    handFwd = 8 - (action.recoil || 0) * 3.5;
  }
  const gx = Math.cos(sweep) * handFwd, gy = Math.sin(sweep) * handFwd;

  // Arms: one or two hands to the grip.
  if (oneHanded) {
    limb2(ctx, 1, 2.2, gx, gy, 3, skin);   // weapon hand
    limb2(ctx, 1, -3, 3, -4.5, 3, skin);   // off hand tucked at the side
  } else {
    limb2(ctx, 1, -3.2, gx, gy, 3, skin);
    limb2(ctx, 1, 3.2, gx, gy, 3, skin);
  }

  // Weapon at the grip, aligned to facing (plus any melee sweep).
  ctx.save();
  ctx.translate(gx, gy);
  ctx.rotate(sweep);
  drawWeaponLocal(ctx, weaponKind);
  ctx.restore();

  // Head (faces forward = +x): skin, ears, hair over the crown, brow, eyes and
  // a nose tip — or a helmet shell over the top when one is equipped.
  R(2, 0, 6.2, 6, skin);
  R(2, -3.2, 1.6, 2, skin);   // ears
  R(2, 3.2, 1.6, 2, skin);
  if (action.helmet) {
    R(1.8, 0, 6.6, 6.6, "#3a4657");                 // helmet shell
    R(0.8, 0, 4.6, 6.6, "#4c5a6d");                 // crown highlight
    R(4.7, 0, 1.5, 5.2, "#2a333f");                 // front rim / visor
  } else {
    R(1.1, 0, 3.2, 6.2, palette.hair);              // hair over crown/back
    R(0.7, -2.7, 2, 2, palette.hair);
    R(0.7, 2.7, 2, 2, palette.hair);
    ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(3.4 - 1, -3, 1.4, 6); // brow shadow
    R(4.4, -1.5, 1.5, 1.5, "#241c14");              // eyes
    R(4.4, 1.5, 1.5, 1.5, "#241c14");
    ctx.fillStyle = skin; ctx.fillRect(5.4 - 0.7, -0.7, 1.4, 1.4);         // nose tip
  }

  ctx.restore();
}

// Weapon drawn from the grip (0,0) extending along +x (forward).
function drawWeaponLocal(ctx, kind) {
  const R = (ox, oy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox, oy - h / 2, w, h); };
  switch (kind) {
    case "melee_knife": R(-1, 0, 2, 2, "#5a4632"); R(1, 0, 6, 2, "#cfd6e0"); break;
    case "melee_bat": R(-3, 0, 3, 2, "#5a4632"); R(0, 0, 11, 3, "#9c6b3a"); break;
    case "melee_axe": R(-2, 0, 3, 2, "#6a4a2c"); R(1, 0, 8, 2, "#7a5636"); ctx.fillStyle = "#c0c8d0"; ctx.beginPath(); ctx.moveTo(8, -1); ctx.lineTo(12, -4); ctx.lineTo(12, 3); ctx.lineTo(8, 1); ctx.closePath(); ctx.fill(); break;
    case "pistol": R(-1, 1.5, 2, 3, "#20242a"); R(0, 0, 6, 3, "#2c2f33"); break;
    case "pistol22": R(-1, 1.2, 2, 2.4, "#20242a"); R(0, 0, 5, 2, "#3a3f45"); break; // slim & short
    case "pistol357": // revolver: wood grip, frame, cylinder bump, longer barrel
      R(-1, 1.5, 2, 3, "#3a2a18"); R(0, 0, 5, 3, "#4a4e54"); R(2, 0, 3, 4, "#5a5e64"); R(5, 0, 4, 2, "#33373d"); break;
    case "shotgun": R(0, 0, 13, 3, "#3a2f28"); R(11, 0, 4, 2, "#20242a"); break;
    case "shotgun_semi": // receiver + barrel with an under mag-tube
      R(-2, 0, 3, 3, "#2a2a2e"); R(0, 0, 12, 3, "#3a2f28"); R(1, 2, 8, 1.6, "#20242a"); R(11, 0, 3, 2, "#20242a"); break;
    case "shotgun_sxs": // two side-by-side barrels
      R(-2, 0, 3, 3, "#3a2f28"); R(-1, 0, 2, 4, "#2a2018"); R(0, -1.3, 13, 1.7, "#4a4038"); R(0, 1.3, 13, 1.7, "#4a4038"); break;
    case "rifle": R(-3, 0, 4, 3, "#1a1c1a"); R(0, 0, 15, 2, "#26411f"); break;
    case "rifle_semi": // battle rifle: stock, barrel, box mag
      R(-3, 0, 4, 3, "#2a2620"); R(0, 0, 14, 2, "#3a4a2a"); R(2, 2.4, 3, 3, "#141414"); R(3, -1.4, 5, 1.2, "#333"); break;
    case "rifle_auto": // assault rifle: curved mag, rail, short muzzle
      R(-3, 0, 4, 3, "#141414"); R(0, 0, 11, 2.4, "#2a2f2a"); R(2, 2.6, 3.6, 4, "#111"); R(1, -1.7, 5, 1.3, "#333"); R(10, 0, 3, 1.6, "#0d0d0d"); break;
    case "smg": R(1, 2, 3, 3, "#1a1a1f"); R(0, 0, 9, 3, "#2a2a2f"); break;
    case "bazooka": R(-3, 0, 3, 3, "#2a331d"); R(-2, 0, 18, 5, "#3d4a2a"); break;
    default: R(0, 0, 6, 3, "#2c2f33");
  }
}

// Animated muzzle flash at the barrel tip. intensity 0..1 fades it out.
export function drawMuzzle(ctx, cx, cy, angle, size, intensity) {
  intensity = intensity == null ? 1 : Math.max(0, Math.min(1, intensity));
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const tx = cx + 15 * cos, ty = cy + 15 * sin;
  const sz = size * (0.55 + intensity * 0.65);
  ctx.save();
  ctx.translate(tx, ty);
  ctx.rotate(angle);
  ctx.fillStyle = `rgba(255,150,40,${(0.5 * intensity).toFixed(3)})`;
  ctx.beginPath(); ctx.arc(0, 0, sz * 2.3, 0, TAU); ctx.fill();      // glow
  ctx.fillStyle = "#ffd27a";
  ctx.beginPath(); ctx.moveTo(sz * 3.4, 0); ctx.lineTo(0, -sz * 1.2); ctx.lineTo(0, sz * 1.2); ctx.closePath(); ctx.fill(); // flame
  ctx.fillStyle = "#ffe9a8";
  ctx.fillRect(-sz * 0.6, -sz * 0.45, sz * 2.6, sz * 0.9);           // side spikes
  ctx.fillStyle = "#fff6d8";
  ctx.beginPath(); ctx.arc(sz * 0.5, 0, sz, 0, TAU); ctx.fill();     // hot core
  ctx.restore();
}

const ZOMBIE_PAL = {
  walker: { skin: "#72a83a", dark: "#4f7a24", cloth: "#5a5347" },
  runner: { skin: "#8fb84a", dark: "#63852f", cloth: "#6b3a3a" },
  crawler: { skin: "#a0c15a", dark: "#6f8a34", cloth: "#4a4238" },
  brute: { skin: "#5c7a2e", dark: "#3d5420", cloth: "#3a3a3a" },
  spitter: { skin: "#9ab84a", dark: "#6a8030", cloth: "#7a6a2a" },
};
const STUMP = "#7a1414";

// Nudge a hex colour by a random amount per channel (per-zombie variety).
export function jitterHex(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const j = () => (Math.random() * 2 - 1) * amt;
  const clip = (v) => (v < 0 ? 0 : v > 255 ? 255 : v) | 0;
  return `rgb(${clip(((n >> 16) & 255) + j())},${clip(((n >> 8) & 255) + j())},${clip((n & 255) + j())})`;
}

// A spread of grubby clothing colours and hair shades for the horde.
const ZCLOTHES = ["#5a5347", "#6b3a3a", "#3f5168", "#4a5a3a", "#6a5a2a", "#5a3a5a", "#7a5236", "#40484f", "#772d2d", "#2f5d54", "#8a8f95", "#3a3f2a"];
const ZHAIR = ["#20160e", "#3a2a18", "#6a5232", "#b0a060", "#8a8a8a", "#a44a20", "#4a3a2a", "#111111", "#d8d8d0"];

// Build a per-zombie appearance: jittered skin, random clothes and hair style.
export function makeZombieLook(type) {
  const base = ZOMBIE_PAL[type] || ZOMBIE_PAL.walker;
  const cloth = Math.random() < 0.7 ? ZCLOTHES[(Math.random() * ZCLOTHES.length) | 0] : jitterHex(base.cloth, 30);
  const roll = Math.random();
  return {
    skin: jitterHex(base.skin, 26),
    dark: jitterHex(base.dark, 20),
    cloth,
    cloth2: jitterHex(cloth, 24),                 // trousers / accent
    hair: ZHAIR[(Math.random() * ZHAIR.length) | 0],
    hairLen: roll < 0.16 ? -1 : roll < 0.62 ? 0 : 1, // -1 bald, 0 short, 1 long
    // Per-individual gait: how big/fast the arms swing and legs stride.
    armAmp: rand(0.55, 1.6), armRate: rand(0.7, 1.6), legAmp: rand(0.7, 1.5),
  };
}

function rand(a, b) { return a + Math.random() * (b - a); }

// Draw a zombie. parts = {larm,rarm,lleg,rleg} (1 attached / 0 severed); prone = dragging.
export function drawZombie(ctx, cx, cy, angle, frame, type, r, hurtFlash, parts, prone, strideAmp, jumpH, vx, vy, look) {
  parts = parts || { larm: 1, rarm: 1, lleg: 1, rleg: 1 };
  strideAmp = strideAmp || 1;
  jumpH = jumpH || 0;
  const pal = ZOMBIE_PAL[type] || ZOMBIE_PAL.walker;
  look = look || { skin: pal.skin, dark: pal.dark, cloth: pal.cloth, cloth2: pal.dark, hair: "#20160e", hairLen: 0 };
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const perpX = -sin, perpY = cos;
  const skin = hurtFlash ? "#ffffff" : look.skin;
  const cloth = look.cloth, dark = look.dark, cloth2 = look.cloth2 || look.dark;
  const s = r / 7; // 7 == base radius
  const cyB = cy - jumpH; // body lifts when leaping; shadow stays on the ground
  // Upper body sways side-to-side for a shambling gait; feet stay planted.
  const lean = Math.sin(frame * 1.5) * (prone ? 1.4 : 0.9) * strideAmp * s;
  const bx = cx + perpX * lean, by = cyB + perpY * lean;
  const B = (ox, oy, w, h, c) => px(ctx, bx, by, ox * s, oy * s, Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)), cos, sin, c);
  const eye = (ox, oy) => px(ctx, bx, by, ox * s, oy * s, Math.max(1, Math.round(1.4 * s)), Math.max(1, Math.round(1.4 * s)), cos, sin, "#b81e1e");

  // A reaching, clawing arm (or a stump if severed).
  const reachArm = (side, longReach) => {
    const ok = side < 0 ? parts.larm : parts.rarm;
    const shoulderSide = 3 * s * side;
    const sx = bx + cos * (1.5 * s) + perpX * shoulderSide;
    const sy = by + sin * (1.5 * s) + perpY * shoulderSide;
    if (!ok) { ctx.fillStyle = STUMP; ctx.fillRect(Math.round(sx - 1), Math.round(sy - 1), Math.max(2, Math.round(2 * s)), Math.max(2, Math.round(2 * s))); return; }
    const armRate = look.armRate || 1, armAmp = look.armAmp || 1;
    const sway = Math.sin(frame * (2.6 * armRate) * strideAmp + (side < 0 ? 0 : Math.PI)) * (0.24 * armAmp);
    const armA = angle + side * 0.3 + sway;
    const reach = (longReach ? r * 2.3 : r * 1.7) + Math.sin(frame * 2 * armRate + (side < 0 ? 0 : 1.5)) * (r * 0.28 * armAmp);
    const hx = bx + Math.cos(armA) * reach, hy = by + Math.sin(armA) * reach;
    limb(ctx, sx, sy, hx, hy, Math.max(2, Math.round(2.2 * s)), skin);
    ctx.fillStyle = dark; // clawed hand
    ctx.fillRect(Math.round(hx - 1), Math.round(hy - 1), Math.max(2, Math.round(2 * s)), Math.max(2, Math.round(2 * s)));
  };

  // Dynamic shadow: shifts/stretches with movement, shrinks as it leaps.
  drawShadow(ctx, cx, cy + (prone ? 3 : 6) * s, vx || 0, vy || 0, (prone ? 8 : 7) * s, 3.0 * s, jumpH / 11);

  // Hair painted onto the crown/back of a head centred at forward offset `hx`,
  // leaving the front (face + eyes) as bare skin. Drawn AFTER the head skin.
  const hairOn = (hx) => {
    if (look.hairLen === 0) B(hx - 0.6, 0, 3.4, 5.6, look.hair);            // short cap over the crown
    else if (look.hairLen === 1) {                                          // long: trails back & down the sides
      B(hx - 1, 0, 4.6, 6.4, look.hair);
      B(hx - 0.4, -3, 2.4, 2.8, look.hair); B(hx - 0.4, 3, 2.4, 2.8, look.hair);
    } else B(hx - 0.2, 0, 1.8, 2.2, look.dark);                            // bald: bare scalp with a scar
  };

  // Zombie rat: tiny, scurrying, long-tailed.
  if (type === "rat") {
    const g = Math.sin(frame * 3.4) * strideAmp, fur = dark, belly = skin;
    const Lr = (ox, oy, ww, hh, cc) => px(ctx, cx, cyB, ox * s, oy * s, Math.max(1, Math.round(ww * s)), Math.max(1, Math.round(hh * s)), cos, sin, cc);
    Lr(-7, 0, 5, 1, fur); Lr(-9, g * 1.6, 3, 1, fur);          // whippy tail
    Lr(2 + g, -2, 1.4, 2, fur); Lr(2 - g, 2, 1.4, 2, fur);      // legs
    Lr(-2 - g, -2, 1.4, 2, fur); Lr(-2 + g, 2, 1.4, 2, fur);
    B(-1, 0, 8, 5, fur);   // body
    B(0, 0, 3, 3, belly);  // rotting patch
    B(4, 0, 4, 4, fur);    // head
    B(6.4, 0, 2, 2, belly);// snout
    B(3.4, -2, 1.6, 1.6, fur); B(3.4, 2, 1.6, 1.6, fur); // ears
    eye(5.4, -1); eye(5.4, 1);
    return;
  }

  // Zombie dog: a low, mangy four-legged runner.
  if (type === "dog") {
    const fur = cloth, gait = Math.sin(frame * 2.4) * strideAmp;
    const Ld = (ox, oy, w, h, cc) => px(ctx, cx, cyB, ox * s, oy * s, Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)), cos, sin, cc);
    Ld(5 + gait * 2, -2.6, 2, 4, dark); Ld(5 - gait * 2, 2.6, 2, 4, dark);   // front legs
    Ld(-4 - gait * 2, -2.6, 2, 4, dark); Ld(-4 + gait * 2, 2.6, 2, 4, dark); // back legs
    B(-6, 0, 4, 2, fur);   // tail
    B(-1, 0, 12, 6, fur);  // long torso
    B(0, 0, 6, 5, skin);   // rotting shoulders
    B(0, 2, 2, 2, dark);   // wound
    B(6, 0, 5, 5, fur);    // head
    B(8.6, 0, 3, 3, dark); // snout
    B(5, -2.4, 2, 2, dark); B(5, 2.4, 2, 2, dark); // ears
    eye(7.5, -1.2); eye(7.5, 1.2);
    return;
  }

  if (prone) {
    // Legless, flat, dragging body pulling forward with both arms.
    B(-4, -2, 3, 2, parts.lleg ? cloth2 : STUMP); // trailing leg stumps
    B(-4, 2, 3, 2, parts.rleg ? cloth2 : STUMP);
    B(-1, 0, 10, 7, cloth);       // long torso dragging behind
    B(2, 0, 6, 6, skin);          // shoulders
    B(0, 2, 2, 3, dark);          // wound
    reachArm(-1, true);
    reachArm(1, true);
    B(7, 0, 5, 5, skin);          // head, low and forward
    hairOn(7);
    eye(8, -1.3); eye(8, 1.3);
    return;
  }

  // Legs (shuffle bob, planted at the feet); severed legs become stumps and it limps.
  const L = (ox, oy, w, h, c) => px(ctx, cx, cyB, ox * s, oy * s, Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)), cos, sin, c);
  const legBob = Math.sin(frame * 1.5) * 1.7 * strideAmp * (look.legAmp || 1);
  L(-1 + legBob * 0.35, 3, parts.rleg ? 3 : 2, parts.rleg ? 4 : 2, parts.rleg ? cloth2 : STUMP);
  L(-1 - legBob * 0.35, -3, parts.lleg ? 3 : 2, parts.lleg ? 4 : 2, parts.lleg ? cloth2 : STUMP);

  // Reaching arms behind the torso so claws read out front.
  reachArm(-1, false);
  reachArm(1, false);

  // Torso (tattered) + head, lurched forward.
  B(0, 0, 9, 9, cloth);
  B(-1, 0, 6, 7, skin);
  B(0, 2, 2, 3, dark); // wound
  if (type === "brute") { B(0, 0, 12, 11, dark); B(1, 0, 7, 8, skin); }
  B(2, 0, 6, 6, skin);
  hairOn(2);
  eye(4, -1.5); eye(4, 1.5);
}

// Desaturate + darken a hex colour for a "dead" look.
function deadTint(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const gray = (r + g + b) / 3;
  r = (r * 0.55 + gray * 0.45) * k; g = (g * 0.55 + gray * 0.45) * k; b = (b * 0.55 + gray * 0.45) * k;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// A dead zombie settled on the ground (permanent decal), lying face-down.
export function drawBodyDecal(ctx, x, y, angle, type, r, parts, look) {
  const pal = ZOMBIE_PAL[type] || ZOMBIE_PAL.walker;
  look = look || { skin: pal.skin, cloth: pal.cloth, dark: pal.dark, hair: "#20160e" };
  const s = r / 7;
  const skin = deadTint(look.skin, 0.82);
  const cloth = deadTint(look.cloth || look.dark, 0.8);
  const dark = deadTint(look.dark, 0.68);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Layered, irregular blood pool.
  ctx.fillStyle = "rgba(70,8,10,0.5)";
  ctx.beginPath(); ctx.ellipse(-1 * s, 0, 11 * s, 7 * s, 0.3, 0, TAU); ctx.fill();
  ctx.fillStyle = "rgba(40,4,6,0.55)";
  ctx.beginPath(); ctx.ellipse(2 * s, 1 * s, 6 * s, 4 * s, -0.4, 0, TAU); ctx.fill();

  const limb = (ang, x0, len, wide, col, ok) => {
    if (!ok) return;
    ctx.save(); ctx.rotate(ang);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(x0 + len / 2, 0, len / 2 + 0.6, wide, 0, 0, TAU); ctx.fill();
    ctx.restore();
  };
  // Legs trail behind, arms out to the sides — a slumped, face-down sprawl.
  limb(Math.PI - 0.35, 2 * s, 7 * s, 1.7 * s, cloth, parts.rleg);
  limb(Math.PI + 0.35, 2 * s, 7 * s, 1.7 * s, cloth, parts.lleg);
  limb(-1.15, 2.2 * s, 6 * s, 1.5 * s, skin, parts.rarm);
  limb(1.15, 2.2 * s, 6 * s, 1.5 * s, skin, parts.larm);

  // Torso (tattered shirt) then a hint of exposed back.
  ctx.fillStyle = cloth;
  ctx.beginPath(); ctx.ellipse(0, 0, 7 * s, 4.6 * s, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.ellipse(-0.5 * s, 0, 4.5 * s, 3 * s, 0, 0, TAU); ctx.fill();

  // Head, face-down, at the front.
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(6 * s, 0, 3 * s, 0, TAU); ctx.fill();
  ctx.fillStyle = deadTint(look.hair, 0.5);
  ctx.beginPath(); ctx.arc(6.4 * s, 0, 1.8 * s, 0, TAU); ctx.fill(); // hair/wound

  ctx.restore();
}

// A severed limb lying on the ground (or, when zHeight>0, tumbling in the air).
export function drawGroundLimb(ctx, x, y, angle, part, color, zHeight) {
  const len = part && part.endsWith("leg") ? 8 : 6;
  if (zHeight > 0) {
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(x, y, len * 0.5, 2, 0, 0, TAU); ctx.fill();
  }
  ctx.save();
  ctx.translate(x, y - (zHeight || 0));
  ctx.rotate(angle);
  if (!zHeight) { ctx.fillStyle = "rgba(60,10,10,0.4)"; ctx.beginPath(); ctx.ellipse(0, 0, len * 0.7, 3, 0, 0, TAU); ctx.fill(); }
  ctx.fillStyle = color || "#72a83a";
  ctx.fillRect(-len / 2, -1.6, len, 3.2);
  ctx.fillStyle = "#5a1010"; // bloody torn end
  ctx.fillRect(len / 2 - 1.6, -1.6, 1.6, 3.2);
  ctx.restore();
}

const FURN = {
  crate:  { body: "#6b4a28", top: "#8a6a44", edge: "#4a3420" },
  table:  { body: "#7a542e", top: "#96703e", edge: "#573a1e" },
  chair:  { body: "#6b4a28", top: "#86633c", edge: "#4a3420" },
  barrel: { body: "#5a4632", top: "#7a5f42", edge: "#3a2c1e" },
  shelf:  { body: "#5f4326", top: "#7d5c34", edge: "#412e1a" },
  couch:  { body: "#48566a", top: "#5a6a80", edge: "#333e4c" },
  car:    { body: "#8a3b33", top: "#b0554b", edge: "#1a1a1e" },
  truck:  { body: "#3f5a6b", top: "#557488", edge: "#1a1a1e" },
  bench:  { body: "#6b4a28", top: "#86633c", edge: "#4a3420" },
  bush:   { body: "#2f4a24", top: "#3c5c2e", edge: "#213617" },
};

// Furniture: intact obstacle, or a broken / overturned pile once destroyed.
export function drawFurniture(ctx, f) {
  const c = FURN[f.type] || FURN.crate;
  ctx.save();
  ctx.translate(f.x, f.y);
  // Shadow.
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.ellipse(0, f.hh * 0.7, f.hw, f.hh * 0.55, 0, 0, TAU); ctx.fill();

  if (f.broken) {
    ctx.rotate(f.overturned ? f.angle + 0.5 : f.angle);
    ctx.globalAlpha = 0.9;
    if (f.overturned) {
      // Tipped over: a squashed body still slightly there.
      ctx.fillStyle = c.edge; ctx.fillRect(-f.hw, -f.hh * 0.5, f.hw * 2, f.hh);
      ctx.fillStyle = c.body; ctx.fillRect(-f.hw + 1, -f.hh * 0.5 + 1, f.hw * 2 - 2, f.hh * 0.5);
    } else {
      // Smashed to planks.
      for (let i = 0; i < 5; i++) {
        ctx.save();
        ctx.rotate((i - 2) * 0.5 + f.angle);
        ctx.fillStyle = i % 2 ? c.body : c.edge;
        ctx.fillRect(-f.hw * 0.8, -1.5, f.hw * 1.6, 3);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }

  ctx.rotate(f.angle);

  // Vehicles: a body with a cabin, windows and a dark underbody.
  if (f.type === "car" || f.type === "truck") {
    const vert = f.hh >= f.hw;
    if (!vert) ctx.rotate(Math.PI / 2);
    const hw = vert ? f.hw : f.hh, hh = vert ? f.hh : f.hw;
    const CARS = ["#8a3b33", "#c0a040", "#6b6f76", "#7a5230", "#2f6b4a", "#3a5a8a", "#b5b5b8"];
    const body = f.burning ? "#2b2622" : f.type === "truck" ? "#3f5a6b" : CARS[(((f.cx * 7 + f.cy * 13) % CARS.length) + CARS.length) % CARS.length];
    ctx.fillStyle = "#111114"; ctx.fillRect(-hw, -hh, hw * 2, hh * 2);              // underbody / tyres
    ctx.fillStyle = body; ctx.fillRect(-hw + 1, -hh + 2, hw * 2 - 2, hh * 2 - 4);   // painted shell
    if (f.type === "truck") {
      ctx.fillStyle = "#6a7280"; ctx.fillRect(-hw + 1, 1, hw * 2 - 2, hh - 2);      // cargo bed
      ctx.fillStyle = "#2a2e33"; ctx.fillRect(-hw + 2, -hh + 4, hw * 2 - 4, hh * 0.55); // cab roof
      ctx.fillStyle = "rgba(160,205,225,0.7)"; ctx.fillRect(-hw + 2, -hh + 3, hw * 2 - 4, 2); // windshield
    } else {
      ctx.fillStyle = "#2a2e33"; ctx.fillRect(-hw + 2, -hh * 0.35, hw * 2 - 4, hh * 0.7);     // roof
      ctx.fillStyle = "rgba(160,205,225,0.7)";
      ctx.fillRect(-hw + 2, -hh + 3, hw * 2 - 4, 3); // windshield
      ctx.fillRect(-hw + 2, hh - 6, hw * 2 - 4, 3);  // rear window
    }
    ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(-hw + 1, -hh + 2, 2, hh * 2 - 4);  // side sheen
    if (f.hp < f.maxHp * 0.5) { ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-hw * 0.5, -hh * 0.3); ctx.lineTo(hw * 0.4, hh * 0.4); ctx.stroke(); }
    ctx.restore();
    return;
  }
  if (f.type === "bench") {
    ctx.fillStyle = c.edge; ctx.fillRect(-f.hw, -f.hh, f.hw * 2, f.hh * 2);
    ctx.fillStyle = c.body; for (let i = -1; i <= 1; i++) ctx.fillRect(-f.hw, i * 2 - 0.7, f.hw * 2, 1.4);
    ctx.restore();
    return;
  }
  if (f.type === "bush") {
    // A leafy shrub: a few overlapping blobs with a lit top.
    ctx.fillStyle = c.body;
    for (const [ox, oy, rr] of [[-4, 0, 6], [4, 1, 6], [0, -3, 6], [0, 2, 7]]) { ctx.beginPath(); ctx.arc(ox, oy, rr, 0, TAU); ctx.fill(); }
    ctx.fillStyle = c.top;
    for (const [ox, oy, rr] of [[-3, -2, 3], [3, -1, 3], [0, -1, 3.4]]) { ctx.beginPath(); ctx.arc(ox, oy, rr, 0, TAU); ctx.fill(); }
    ctx.restore();
    return;
  }

  ctx.fillStyle = c.edge;
  ctx.fillRect(-f.hw, -f.hh, f.hw * 2, f.hh * 2);
  ctx.fillStyle = c.body;
  ctx.fillRect(-f.hw + 1, -f.hh + 1, f.hw * 2 - 2, f.hh * 2 - 2);
  ctx.fillStyle = c.top;
  if (f.type === "barrel") {
    ctx.beginPath(); ctx.arc(0, 0, Math.min(f.hw, f.hh) - 1, 0, TAU); ctx.fillStyle = c.body; ctx.fill();
    ctx.strokeStyle = c.edge; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, Math.min(f.hw, f.hh) - 1, 0, TAU); ctx.stroke();
    ctx.fillStyle = c.top; ctx.beginPath(); ctx.arc(0, 0, Math.min(f.hw, f.hh) * 0.5, 0, TAU); ctx.fill();
  } else if (f.type === "table" || f.type === "shelf" || f.type === "couch") {
    ctx.fillRect(-f.hw + 2, -f.hh + 2, f.hw * 2 - 4, f.hh * 2 - 4);
    ctx.fillStyle = c.edge;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) ctx.fillRect(sx * (f.hw - 3) - 1, sy * (f.hh - 3) - 1, 2, 2);
  } else {
    // crate / chair: slats
    ctx.fillStyle = c.edge;
    ctx.fillRect(-f.hw + 1, -1, f.hw * 2 - 2, 1.5);
    ctx.fillRect(-1, -f.hh + 1, 1.5, f.hh * 2 - 2);
  }
  // Damage cracks as it weakens.
  if (f.hp < f.maxHp * 0.5) {
    ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-f.hw * 0.5, -f.hh * 0.4); ctx.lineTo(f.hw * 0.3, f.hh * 0.5); ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.restore();
}

// Pickup icons.
export function drawPickup(ctx, cx, cy, kind, t) {
  const float = Math.sin(t * 3) * 1.5;
  const y = cy + float;
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 5, 6, 2.5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.arc(cx, y, 9, 0, TAU);
  ctx.fill();

  const box = (c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(cx - 6), Math.round(y - 5), 12, 10); };
  switch (kind) {
    case "medkit":
      box("#e8e8e8");
      ctx.fillStyle = "#c0392b";
      ctx.fillRect(Math.round(cx - 1), Math.round(y - 4), 2, 8);
      ctx.fillRect(Math.round(cx - 4), Math.round(y - 1), 8, 2);
      break;
    case "adrenaline":
      ctx.fillStyle = "#e0b83a";
      ctx.fillRect(Math.round(cx - 1), Math.round(y - 6), 3, 12);
      ctx.fillStyle = "#fff";
      ctx.fillRect(Math.round(cx - 1), Math.round(y - 6), 3, 2);
      break;
    case "ammo":
      ctx.fillStyle = "#b8942a";
      ctx.fillRect(Math.round(cx - 5), Math.round(y - 4), 10, 8);
      ctx.fillStyle = "#5a4a1a";
      ctx.fillRect(Math.round(cx - 5), Math.round(y - 4), 10, 2);
      break;
    case "key":
      ctx.fillStyle = "#e8c24a";
      ctx.beginPath(); ctx.arc(cx - 3, y, 3, 0, TAU); ctx.fill();
      ctx.fillRect(Math.round(cx - 1), Math.round(y - 1), 7, 2); // shaft
      ctx.fillRect(Math.round(cx + 4), Math.round(y - 1), 2, 4); // teeth
      ctx.fillStyle = "#3a2c10";
      ctx.beginPath(); ctx.arc(cx - 3, y, 1.2, 0, TAU); ctx.fill();
      break;
    case "armor": // a vest / chest plate
      ctx.fillStyle = "#465264"; ctx.fillRect(Math.round(cx - 5), Math.round(y - 5), 10, 9);
      ctx.fillStyle = "#586576"; ctx.fillRect(Math.round(cx - 5), Math.round(y - 5), 10, 2);
      ctx.fillStyle = "#2c3642";
      ctx.fillRect(Math.round(cx - 1), Math.round(y - 4), 2, 8);
      ctx.fillRect(Math.round(cx - 5), Math.round(y + 1), 10, 1.5);
      break;
    case "helmet": // a domed helmet
      ctx.fillStyle = "#3a4657";
      ctx.beginPath(); ctx.arc(cx, y + 1, 5, Math.PI, 0); ctx.fill();
      ctx.fillRect(Math.round(cx - 5), Math.round(y + 1), 10, 2);
      ctx.fillStyle = "#4c5a6d"; ctx.fillRect(Math.round(cx - 4), Math.round(y - 3), 8, 2);
      break;
    case "grenade": // a fragmentation grenade
      ctx.fillStyle = "#3a4a2c"; ctx.beginPath(); ctx.arc(cx, y + 1, 4.5, 0, TAU); ctx.fill();
      ctx.fillStyle = "#2a3620"; ctx.fillRect(Math.round(cx - 4), Math.round(y - 1), 8, 1.5); ctx.fillRect(Math.round(cx - 1), Math.round(y - 3), 2, 6);
      ctx.fillStyle = "#8a8f6a"; ctx.fillRect(Math.round(cx - 1.5), Math.round(y - 6), 3, 3); // spoon/lever
      break;
    case "flare": // a signal flare
      ctx.fillStyle = "#b03030"; ctx.fillRect(Math.round(cx - 1.5), Math.round(y - 6), 3, 11);
      ctx.fillStyle = "#e8e0d0"; ctx.fillRect(Math.round(cx - 1.5), Math.round(y - 6), 3, 3);
      ctx.fillStyle = "#ff7a3a"; ctx.beginPath(); ctx.arc(cx, y - 7, 2.4, 0, TAU); ctx.fill();
      break;
    default: {
      box("#5a4632");
      ctx.fillStyle = "#8a6a44";
      ctx.fillRect(Math.round(cx - 6), Math.round(y - 1), 12, 2);
      ctx.fillStyle = "#cfd6e0";
      ctx.fillRect(Math.round(cx - 3), Math.round(y - 3), 6, 2);
    }
  }
}
