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

// Draw the player: body faces `angle`; arms hold and animate the weapon.
// action = { recoil (0..1), swingT, swingDur, melee }
export function drawPlayer(ctx, cx, cy, angle, frame, hurtFlash, weaponKind, palette, action) {
  action = action || { recoil: 0, swingT: 0, swingDur: 0.22, melee: false };
  const bc = Math.cos(angle), bs = Math.sin(angle);
  const perpX = -bs, perpY = bc;
  const skin = hurtFlash ? "#ff6b5e" : palette.skin;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 6, 7, 3.4, 0, 0, TAU);
  ctx.fill();

  // Legs (walk-cycle bob)
  const bob = Math.sin(frame) * 1.6;
  px(ctx, cx, cy, -2, 4 + bob, 3, 4, bc, bs, palette.pants);
  px(ctx, cx, cy, 2, 4 - bob, 3, 4, bc, bs, palette.pants);
  // Torso
  px(ctx, cx, cy, 0, 0, 9, 9, bc, bs, palette.shirt);
  px(ctx, cx, cy, 0, -3, 9, 3, bc, bs, palette.vest);

  // Weapon pose: recoil pulls the grip back on guns; melee sweeps it in an arc.
  const melee = action.melee;
  let sweep = 0, handFwd = 8, recoilBack = 0;
  if (melee) {
    if (action.swingT > 0) {
      const prog = 1 - action.swingT / (action.swingDur || 0.22); // 0..1 across the swing
      sweep = 1.0 - prog * 2.0;                                    // slash from +1 to -1 rad
      handFwd = 8 + Math.sin(prog * Math.PI) * 5;                  // lunge outward mid-swing
    } else {
      sweep = 0.55; handFwd = 7;                                   // rest: held out to the side
    }
  } else {
    recoilBack = (action.recoil || 0) * 3.5;
    handFwd = 8 - recoilBack;
  }
  const wa = angle + sweep;
  const wc = Math.cos(wa), ws = Math.sin(wa);
  const gx = cx + wc * handFwd, gy = cy + ws * handFwd; // grip point

  // Shoulders, then both arms reaching to the grip (two-handed hold).
  const lsx = cx + bc * 1 + perpX * 3.2, lsy = cy + bs * 1 + perpY * 3.2;
  const rsx = cx + bc * 1 - perpX * 3.2, rsy = cy + bs * 1 - perpY * 3.2;
  limb(ctx, lsx, lsy, gx, gy, 3, skin);
  limb(ctx, rsx, rsy, gx, gy, 3, skin);

  // Weapon at the grip, oriented along the (possibly swinging) weapon angle.
  drawHeldWeapon(ctx, gx, gy, wc, ws, weaponKind);

  // Head on top.
  px(ctx, cx, cy, 1, 0, 6, 6, bc, bs, skin);
  px(ctx, cx, cy, 3, 0, 2, 5, bc, bs, palette.hair);
}

// Weapon drawn relative to the grip point (gx,gy), extending forward.
function drawHeldWeapon(ctx, gx, gy, cos, sin, kind) {
  const B = (ox, oy, w, h, c) => px(ctx, gx, gy, ox, oy, w, h, cos, sin, c);
  switch (kind) {
    case "melee_knife": B(4, 1, 5, 2, "#cfd6e0"); B(1, 1, 2, 2, "#5a4632"); break;
    case "melee_bat": B(6, 1, 9, 3, "#9c6b3a"); B(1, 1, 3, 2, "#5a4632"); break;
    case "pistol": B(3, 1, 5, 3, "#2c2f33"); break;
    case "shotgun": B(6, 1, 11, 3, "#3a2f28"); B(11, 1, 4, 2, "#20242a"); break;
    case "rifle": B(7, 1, 13, 2, "#26411f"); B(1, 2, 3, 3, "#1a1c1a"); break;
    case "smg": B(4, 1, 8, 3, "#2a2a2f"); B(2, 3, 2, 4, "#1a1a1f"); break;
    case "bazooka": B(7, 1, 15, 5, "#3d4a2a"); B(0, 1, 4, 4, "#2a331d"); break;
    default: B(3, 1, 5, 3, "#2c2f33");
  }
}

// Muzzle flash at the barrel tip.
export function drawMuzzle(ctx, cx, cy, angle, size) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const tx = cx + 15 * cos, ty = cy + 15 * sin;
  ctx.fillStyle = "#ffe9a8";
  ctx.beginPath();
  ctx.arc(tx, ty, size, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,180,60,0.6)";
  ctx.beginPath();
  ctx.arc(tx, ty, size * 1.8, 0, TAU);
  ctx.fill();
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
export function drawZombie(ctx, cx, cy, angle, frame, type, r, hurtFlash, parts, prone) {
  parts = parts || { larm: 1, rarm: 1, lleg: 1, rleg: 1 };
  const pal = ZOMBIE_PAL[type] || ZOMBIE_PAL.walker;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const perpX = -sin, perpY = cos;
  const skin = hurtFlash ? "#ffffff" : pal.skin;
  const s = r / 7; // 7 == base radius
  const B = (ox, oy, w, h, c) => px(ctx, cx, cy, ox * s, oy * s, Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)), cos, sin, c);
  const eye = (ox, oy) => px(ctx, cx, cy, ox * s, oy * s, Math.max(1, Math.round(1.4 * s)), Math.max(1, Math.round(1.4 * s)), cos, sin, "#b81e1e");

  // A reaching, clawing arm (or a stump if severed).
  const reachArm = (side, longReach) => {
    const ok = side < 0 ? parts.larm : parts.rarm;
    const shoulderSide = 3 * s * side;
    const sx = cx + cos * (1.5 * s) + perpX * shoulderSide;
    const sy = cy + sin * (1.5 * s) + perpY * shoulderSide;
    if (!ok) { ctx.fillStyle = STUMP; ctx.fillRect(Math.round(sx - 1), Math.round(sy - 1), Math.max(2, Math.round(2 * s)), Math.max(2, Math.round(2 * s))); return; }
    const sway = Math.sin(frame * 3 + (side < 0 ? 0 : Math.PI)) * 0.22;
    const armA = angle + side * 0.3 + sway;
    const reach = (longReach ? r * 2.3 : r * 1.7) + Math.sin(frame * 2 + (side < 0 ? 0 : 1.5)) * (r * 0.28);
    const hx = cx + Math.cos(armA) * reach, hy = cy + Math.sin(armA) * reach;
    limb(ctx, sx, sy, hx, hy, Math.max(2, Math.round(2.2 * s)), skin);
    ctx.fillStyle = pal.dark; // clawed hand
    ctx.fillRect(Math.round(hx - 1), Math.round(hy - 1), Math.max(2, Math.round(2 * s)), Math.max(2, Math.round(2 * s)));
  };

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + (prone ? 3 : 6) * s, (prone ? 8 : 7) * s, 3.0 * s, 0, 0, TAU);
  ctx.fill();

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

  // Legs (shuffle bob); severed legs become bloody stumps and it limps.
  const legBob = Math.sin(frame * 1.5) * 1.6;
  B(-1 + legBob * 0.3, 3, parts.rleg ? 3 : 2, parts.rleg ? 4 : 2, parts.rleg ? pal.cloth : STUMP);
  B(-1 - legBob * 0.3, -3, parts.lleg ? 3 : 2, parts.lleg ? 4 : 2, parts.lleg ? pal.cloth : STUMP);

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
