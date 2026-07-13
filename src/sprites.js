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
  const bounce = moving ? Math.abs(Math.sin(frame)) * (run ? 3.8 : 2.6) : 0; // body bob
  const rock = moving ? Math.sin(frame) * (run ? 0.12 : 0.08) : 0;           // side-to-side sway

  // Ground point at local (ox forward, oy sideways) — feet live here (no bob).
  const gpt = (ox, oy) => [cx + c * ox - s * oy, cy + s * ox + c * oy];
  // Bobbed point — hips/body live here.
  const bpt = (ox, oy) => [cx + c * ox - s * oy, cy - bounce + s * ox + c * oy];

  // --- Shadow (planted; shifts with movement, shrinks as the body bounces).
  drawShadow(ctx, cx, cy + 6, action.vx || 0, action.vy || 0, 7, 3.4, bounce / 4.2);

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
  ctx.translate(cx, cy - bounce);
  ctx.rotate(angle + rock);
  const R = (ox, oy, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(ox - w / 2, oy - h / 2, w, h); };

  R(0, 0, 9, 9, palette.shirt);
  R(-2.5, 0, 3, 9, palette.vest); // vest/pack toward the back

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

  // Head (forward) + hair.
  R(2, 0, 6, 6, skin);
  R(3, 0, 2, 5, palette.hair);

  ctx.restore();
}

// Player sprite-sheet atlas (frame rects measured from src/assets/player.png).
// Columns are UP / DOWN / LEFT / RIGHT.
export const PLAYER_ATLAS = {
  IDLE:  { up: [408, 74, 92, 109], down: [621, 73, 90, 110], left: [834, 73, 89, 112], right: [1048, 74, 82, 111] },
  WALK:  { up: [407, 217, 94, 106], down: [616, 215, 99, 110], left: [835, 217, 104, 104], right: [1045, 218, 108, 100] },
  RUN:   { up: [403, 358, 104, 98], down: [613, 358, 107, 97], left: [829, 359, 120, 90], right: [1039, 360, 125, 88] },
  REACH: { up: [399, 485, 114, 96], down: [607, 485, 120, 95], left: [823, 486, 137, 87], right: [1031, 486, 143, 89] },
  DIE: [
    { up: [398, 677, 109, 90], down: [589, 677, 142, 92], left: [801, 678, 154, 87], right: [1006, 680, 161, 84] },
    { up: [393, 801, 138, 64], down: [602, 799, 144, 64], left: [805, 799, 152, 69], right: [1011, 800, 153, 66] },
    { up: [379, 904, 152, 76], down: [587, 902, 157, 74], left: [795, 904, 163, 71], right: [1007, 904, 170, 73] },
  ],
};

// Snap an aim angle to one of the four sheet facings.
export function facing4(angle) {
  const a = ((angle % TAU) + TAU) % TAU; // 0..2π, 0 = right
  if (a < Math.PI / 4 || a >= (7 * Math.PI) / 4) return "right";
  if (a < (3 * Math.PI) / 4) return "down";
  if (a < (5 * Math.PI) / 4) return "left";
  return "up";
}

// Weapon overlaid on the sprite: drawn at a forward offset along the aim angle.
export function drawWeaponOverlay(ctx, x, y, aimAngle, recoil, kind) {
  const fwd = 9 - (recoil || 0) * 3.5;
  ctx.save();
  ctx.translate(x + Math.cos(aimAngle) * fwd, y + Math.sin(aimAngle) * fwd);
  ctx.rotate(aimAngle);
  drawWeaponLocal(ctx, kind);
  ctx.restore();
}

// Weapon drawn from the grip (0,0) extending along +x (forward).
function drawWeaponLocal(ctx, kind) {
  const R = (ox, oy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox, oy - h / 2, w, h); };
  switch (kind) {
    case "melee_knife": R(-1, 0, 2, 2, "#5a4632"); R(1, 0, 6, 2, "#cfd6e0"); break;
    case "melee_bat": R(-3, 0, 3, 2, "#5a4632"); R(0, 0, 11, 3, "#9c6b3a"); break;
    case "pistol": R(-1, 1.5, 2, 3, "#20242a"); R(0, 0, 6, 3, "#2c2f33"); break;
    case "shotgun": R(0, 0, 13, 3, "#3a2f28"); R(11, 0, 4, 2, "#20242a"); break;
    case "rifle": R(-3, 0, 4, 3, "#1a1c1a"); R(0, 0, 15, 2, "#26411f"); break;
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

// Draw a zombie. parts = {larm,rarm,lleg,rleg} (1 attached / 0 severed); prone = dragging.
export function drawZombie(ctx, cx, cy, angle, frame, type, r, hurtFlash, parts, prone, strideAmp, jumpH, vx, vy) {
  parts = parts || { larm: 1, rarm: 1, lleg: 1, rleg: 1 };
  strideAmp = strideAmp || 1;
  jumpH = jumpH || 0;
  const pal = ZOMBIE_PAL[type] || ZOMBIE_PAL.walker;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const perpX = -sin, perpY = cos;
  const skin = hurtFlash ? "#ffffff" : pal.skin;
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
    const sway = Math.sin(frame * 3 * strideAmp + (side < 0 ? 0 : Math.PI)) * 0.24;
    const armA = angle + side * 0.3 + sway;
    const reach = (longReach ? r * 2.3 : r * 1.7) + Math.sin(frame * 2 + (side < 0 ? 0 : 1.5)) * (r * 0.28);
    const hx = bx + Math.cos(armA) * reach, hy = by + Math.sin(armA) * reach;
    limb(ctx, sx, sy, hx, hy, Math.max(2, Math.round(2.2 * s)), skin);
    ctx.fillStyle = pal.dark; // clawed hand
    ctx.fillRect(Math.round(hx - 1), Math.round(hy - 1), Math.max(2, Math.round(2 * s)), Math.max(2, Math.round(2 * s)));
  };

  // Dynamic shadow: shifts/stretches with movement, shrinks as it leaps.
  drawShadow(ctx, cx, cy + (prone ? 3 : 6) * s, vx || 0, vy || 0, (prone ? 8 : 7) * s, 3.0 * s, jumpH / 11);

  if (prone) {
    // Legless, flat, dragging body pulling forward with both arms.
    B(-4, -2, 3, 2, parts.lleg ? pal.cloth : STUMP); // trailing leg stumps
    B(-4, 2, 3, 2, parts.rleg ? pal.cloth : STUMP);
    B(-1, 0, 10, 7, pal.cloth);   // long torso dragging behind
    B(2, 0, 6, 6, skin);          // shoulders
    B(0, 2, 2, 3, pal.dark);      // wound
    reachArm(-1, true);
    reachArm(1, true);
    B(7, 0, 5, 5, skin);          // head, low and forward
    B(7, 0, 2, 4, pal.dark);
    eye(8, -1.3); eye(8, 1.3);
    return;
  }

  // Legs (shuffle bob, planted at the feet); severed legs become stumps and it limps.
  const L = (ox, oy, w, h, c) => px(ctx, cx, cyB, ox * s, oy * s, Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)), cos, sin, c);
  const legBob = Math.sin(frame * 1.5) * 1.7 * strideAmp;
  L(-1 + legBob * 0.35, 3, parts.rleg ? 3 : 2, parts.rleg ? 4 : 2, parts.rleg ? pal.cloth : STUMP);
  L(-1 - legBob * 0.35, -3, parts.lleg ? 3 : 2, parts.lleg ? 4 : 2, parts.lleg ? pal.cloth : STUMP);

  // Reaching arms behind the torso so claws read out front.
  reachArm(-1, false);
  reachArm(1, false);

  // Torso (tattered) + head, lurched forward.
  B(0, 0, 9, 9, pal.cloth);
  B(-1, 0, 6, 7, skin);
  B(0, 2, 2, 3, pal.dark); // wound
  if (type === "brute") { B(0, 0, 12, 11, pal.dark); B(1, 0, 7, 8, skin); }
  B(2, 0, 6, 6, skin);
  B(2, 0, 2, 5, pal.dark);
  eye(4, -1.5); eye(4, 1.5);
}

// A dead zombie settled on the ground (permanent decal).
export function drawBodyDecal(ctx, x, y, angle, type, r, parts) {
  const pal = ZOMBIE_PAL[type] || ZOMBIE_PAL.walker;
  const s = r / 7;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = "rgba(60,10,10,0.45)"; // blood pool
  ctx.beginPath(); ctx.ellipse(0, 0, 10 * s, 6.5 * s, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = pal.skin;
  const limbR = (ang, len, ok) => { if (!ok) return; ctx.save(); ctx.rotate(ang); ctx.fillRect(2, -1.3, len, 2.6); ctx.restore(); };
  limbR(-0.7, 7 * s, parts.rarm); limbR(0.7, 7 * s, parts.larm);
  limbR(Math.PI - 0.5, 6 * s, parts.rleg); limbR(Math.PI + 0.5, 6 * s, parts.lleg);
  ctx.fillStyle = pal.dark;
  ctx.beginPath(); ctx.ellipse(0, 0, 6.5 * s, 4.2 * s, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = pal.skin;
  ctx.beginPath(); ctx.arc(5 * s, 0, 2.6 * s, 0, TAU); ctx.fill();
  ctx.fillStyle = "#7a1010";
  ctx.fillRect(-1, -1, 2, 2);
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
    default: {
      box("#5a4632");
      ctx.fillStyle = "#8a6a44";
      ctx.fillRect(Math.round(cx - 6), Math.round(y - 1), 12, 2);
      ctx.fillStyle = "#cfd6e0";
      ctx.fillRect(Math.round(cx - 3), Math.round(y - 3), 6, 2);
    }
  }
}
