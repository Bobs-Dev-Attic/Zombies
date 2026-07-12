// Procedural pixel-art drawing. Everything is painted onto the low-res buffer,
// so filled rectangles become crisp pixels once the buffer is scaled up.
import { TAU } from "./util.js";

// Rotate a small offset (bx, by) around origin by angle and plot a filled block.
function px(ctx, cx, cy, ox, oy, w, h, cos, sin, color) {
  const rx = ox * cos - oy * sin;
  const ry = ox * sin + oy * cos;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(cx + rx - w / 2), Math.round(cy + ry - h / 2), w, h);
}

// Draw the player as a top-down figure holding a weapon, facing `angle`.
export function drawPlayer(ctx, cx, cy, angle, frame, hurtFlash, weaponKind, palette) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const skin = hurtFlash ? "#ff6b5e" : palette.skin;
  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 6, 7, 3.4, 0, 0, TAU);
  ctx.fill();
  // Legs (bob with frame for a walk cycle)
  const bob = Math.sin(frame) * 1.6;
  px(ctx, cx, cy, -2, 4 + bob, 3, 4, cos, sin, palette.pants);
  px(ctx, cx, cy, 2, 4 - bob, 3, 4, cos, sin, palette.pants);
  // Torso
  px(ctx, cx, cy, 0, 0, 9, 9, cos, sin, palette.shirt);
  px(ctx, cx, cy, 0, -3, 9, 3, cos, sin, palette.vest);
  // Arms holding weapon forward
  px(ctx, cx, cy, 5, -1, 3, 3, cos, sin, skin);
  px(ctx, cx, cy, 5, 3, 3, 3, cos, sin, skin);
  // Head
  px(ctx, cx, cy, 1, 0, 6, 6, cos, sin, skin);
  px(ctx, cx, cy, 3, 0, 2, 5, cos, sin, palette.hair);
  // Weapon in hand
  drawHeldWeapon(ctx, cx, cy, cos, sin, weaponKind);
}

function drawHeldWeapon(ctx, cx, cy, cos, sin, kind) {
  switch (kind) {
    case "melee_knife":
      px(ctx, cx, cy, 8, 2, 5, 2, cos, sin, "#cfd6e0");
      px(ctx, cx, cy, 6, 2, 2, 2, cos, sin, "#5a4632");
      break;
    case "melee_bat":
      px(ctx, cx, cy, 9, 2, 8, 3, cos, sin, "#9c6b3a");
      px(ctx, cx, cy, 5, 2, 3, 2, cos, sin, "#5a4632");
      break;
    case "pistol":
      px(ctx, cx, cy, 8, 2, 5, 3, cos, sin, "#2c2f33");
      break;
    case "shotgun":
      px(ctx, cx, cy, 10, 2, 11, 3, cos, sin, "#3a2f28");
      px(ctx, cx, cy, 14, 2, 4, 2, cos, sin, "#20242a");
      break;
    case "rifle":
      px(ctx, cx, cy, 11, 2, 13, 2, cos, sin, "#26411f");
      px(ctx, cx, cy, 6, 3, 3, 3, cos, sin, "#1a1c1a");
      break;
    case "smg":
      px(ctx, cx, cy, 9, 2, 8, 3, cos, sin, "#2a2a2f");
      px(ctx, cx, cy, 7, 4, 2, 4, cos, sin, "#1a1a1f");
      break;
    case "bazooka":
      px(ctx, cx, cy, 11, 1, 15, 5, cos, sin, "#3d4a2a");
      px(ctx, cx, cy, 3, 1, 4, 4, cos, sin, "#2a331d");
      break;
    default:
      px(ctx, cx, cy, 8, 2, 5, 3, cos, sin, "#2c2f33");
  }
}

// Muzzle flash at the barrel tip.
export function drawMuzzle(ctx, cx, cy, angle, size) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const tx = cx + 14 * cos, ty = cy + 14 * sin;
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

// Draw a zombie of a given type. r scales the body.
export function drawZombie(ctx, cx, cy, angle, frame, type, r, hurtFlash) {
  const pal = ZOMBIE_PAL[type] || ZOMBIE_PAL.walker;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const skin = hurtFlash ? "#ffffff" : pal.skin;
  const s = r / 7; // 7 == base radius
  const B = (ox, oy, w, h, c) => px(ctx, cx, cy, ox * s, oy * s, Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)), cos, sin, c);

  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 6 * s, 7 * s, 3.2 * s, 0, 0, TAU);
  ctx.fill();

  const bob = Math.sin(frame) * 1.8;
  if (type === "crawler") {
    // low, sprawled body
    B(-2, 5, 3, 3, pal.dark);
    B(2, -5, 3, 3, pal.dark);
    B(0, 0, 8, 6, pal.cloth);
    B(4, 0, 6, 6, skin);
    B(6, 0, 2, 4, pal.dark);
    return;
  }
  // Arms reaching forward (the classic zombie stagger)
  B(6, -3 + bob * 0.4, 3, 3, skin);
  B(6, 3 - bob * 0.4, 3, 3, skin);
  B(4, -3, 3, 2, pal.dark);
  B(4, 3, 3, 2, pal.dark);
  // Legs
  B(-2, 4 + bob, 3, 4, pal.cloth);
  B(2, 4 - bob, 3, 4, pal.cloth);
  // Torso (tattered)
  B(0, 0, 9, 9, pal.cloth);
  B(-1, 0, 6, 7, skin);
  B(0, 2, 2, 3, pal.dark); // wound
  // Head, lurched forward
  B(2, 0, 6, 6, skin);
  B(2, 0, 2, 5, pal.dark);
  // Eyes
  px(ctx, cx, cy, 4 * s, -1.5 * s, Math.max(1, Math.round(1.4 * s)), Math.max(1, Math.round(1.4 * s)), cos, sin, "#b81e1e");
  px(ctx, cx, cy, 4 * s, 1.5 * s, Math.max(1, Math.round(1.4 * s)), Math.max(1, Math.round(1.4 * s)), cos, sin, "#b81e1e");
  if (type === "brute") {
    B(0, 0, 12, 11, pal.dark); // bulk overlay
    B(1, 0, 7, 8, skin);
  }
}

// Pickup icons.
export function drawPickup(ctx, cx, cy, kind, t) {
  const float = Math.sin(t * 3) * 1.5;
  const y = cy + float;
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 5, 6, 2.5, 0, 0, TAU);
  ctx.fill();
  // glow
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
      // weapon crate
      box("#5a4632");
      ctx.fillStyle = "#8a6a44";
      ctx.fillRect(Math.round(cx - 6), Math.round(y - 1), 12, 2);
      ctx.fillStyle = "#cfd6e0";
      ctx.fillRect(Math.round(cx - 3), Math.round(y - 3), 6, 2);
    }
  }
}
