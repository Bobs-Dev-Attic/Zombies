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
    // Slow, natural cadence: ~13 breaths/min resting up to ~36/min when winded.
    const amp = 0.6 + tired * 2.0, rate = 1.4 + tired * 2.4;
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

  const isBazooka = !melee && weaponKind === "bazooka";
  const isShotgun = !melee && (weaponKind === "shotgun" || weaponKind === "shotgun_semi" || weaponKind === "shotgun_sxs");
  const isFlamer = !melee && weaponKind === "flamethrower";
  const isRifle = !melee && weaponKind === "rifle"; // bolt-action hunting rifle
  const isSmg = !melee && weaponKind === "smg";     // waist-fired machine gun
  if (isSmg) {
    // Waist-fired machine gun: gripped at the hip with the compact body angling
    // across to the aim line, rattling back as it chatters.
    const recoil = action.recoil || 0;
    const hipX = 2.0 - recoil * 2.4, hipY = 3.2;
    const barAng = -0.22 - recoil * 0.05;          // muzzle climbs a touch on recoil
    const cA = Math.cos(barAng), sA = Math.sin(barAng);
    const foreHX = hipX + cA * 7, foreHY = hipY + sA * 7 + 0.2;
    limb2(ctx, 1, 3.0, hipX, hipY, 3, skin);       // trigger hand at the hip
    limb2(ctx, 1, -1.2, foreHX, foreHY, 3, skin);  // support hand forward on the grip
    ctx.save();
    ctx.translate(hipX, hipY);
    ctx.rotate(barAng);
    drawSmgLocal(ctx, recoil);
    ctx.restore();
  } else if (isFlamer) {
    // Hip-fired flamethrower: the fuel tank rides low at the hip and the nozzle
    // wand angles across to the aim line, gripped in both hands — like the
    // shotgun, but belching fire instead of shot.
    const recoil = action.recoil || 0;
    const hipX = 1.8 - recoil * 1.0, hipY = 3.2;   // wand grip at the hip; a light shove as it belches
    const barAng = -0.24;                          // wand angles in toward the aim line
    const cA = Math.cos(barAng), sA = Math.sin(barAng);
    const foreD = 7;
    const foreHX = hipX + cA * foreD, foreHY = hipY + sA * foreD + 0.4;
    limb2(ctx, 1, 3.0, hipX, hipY, 3, skin);       // rear hand on the wand grip at the hip
    limb2(ctx, 1, -1.2, foreHX, foreHY, 3, skin);  // front hand steadies the wand
    ctx.save();
    ctx.translate(hipX, hipY);
    ctx.rotate(barAng);
    drawFlamerLocal(ctx);
    ctx.restore();
  } else if (isRifle) {
    // Shouldered bolt-action hunting rifle: the butt is pulled tight into the
    // shoulder and the barrel runs straight down the sightline, held with both
    // hands. It rides back hard on recoil; then the trigger hand comes off the
    // grip to work the bolt — lift, draw to the rear, shove home — before
    // returning to fire again.
    const recoil = action.recoil || 0;
    const bolt = action.bolt || 0;                 // 1 just fired -> 0
    const cyc = bolt > 0 ? 1 - bolt : -1;          // 0..1 across the bolt cycle
    const shX = 1.4 - recoil * 3.6, shY = 1.7;     // butt at the shoulder; kicks straight back
    // Front support hand well forward under the forestock.
    limb2(ctx, 1, -2.8, shX + 10, shY - 1.2, 3, skin);
    // Trigger hand at the grip — or up on the bolt knob mid-cycle.
    let rhX = shX + 3.4, rhY = shY + 1.4, boltBack = 0, boltLift = 0;
    if (cyc >= 0) {
      const s1 = Math.sin(cyc * Math.PI);          // 0 -> 1 -> 0 rearward sweep
      boltBack = s1 * 3.2;                          // draw the bolt to the rear
      boltLift = s1 * 1.6;                          // lifted up out of its notch
      rhX = shX + 4.4 - boltBack;                   // hand rides the bolt knob
      rhY = shY + 2.2 + boltLift;
    }
    limb2(ctx, 1, 2.8, rhX, rhY, 3, skin);
    ctx.save();
    ctx.translate(shX, shY);
    drawHuntingRifleLocal(ctx, boltBack, boltLift);
    ctx.restore();
  } else if (isBazooka) {
    // Shoulder-mounted RPG: the launch tube rests on the right shoulder and runs
    // fore-and-aft along the aim, its rear vent sticking out behind the shoulder.
    const recoil = action.recoil || 0;
    const shX = 2.5 - recoil * 3.2, shY = 3.0; // rides the shoulder; kicks back on recoil
    limb2(ctx, 1, 3.0, shX, shY, 3, skin);              // trigger hand at the shoulder grip
    limb2(ctx, 1, -1.2, shX + 9, shY - 0.6, 3, skin);   // support hand forward on the tube
    ctx.save();
    ctx.translate(shX, shY);
    drawBazookaLocal(ctx);
    ctx.restore();
  } else if (isShotgun) {
    // Hip-fired shotgun: the butt is tucked at the right hip and the barrel
    // angles across to the aim line, so from above the gun sits off to one side.
    // It kicks back on recoil and, for the pump gun, the fore-end racks a shell.
    const recoil = action.recoil || 0;
    const pumpP = action.pump || 0;                       // 1 just fired -> 0
    const hipX = 2.0 - recoil * 3.2, hipY = 3.4;          // grip at the hip, driven back on recoil
    const barAng = -0.26 - recoil * 0.14;                 // barrel toward centre; muzzle rises on recoil
    const slide = weaponKind === "shotgun" ? Math.sin((1 - pumpP) * Math.PI) * 3.2 : 0; // pump rack
    const cA = Math.cos(barAng), sA = Math.sin(barAng);
    // Support hand rides the fore-end (moves with the pump slide).
    const foreD = 6 - slide;
    const foreHX = hipX + cA * foreD - sA * 0.8;
    const foreHY = hipY + sA * foreD + cA * 0.8;
    limb2(ctx, 1, 3.0, hipX, hipY, 3, skin);              // rear / trigger hand at the hip
    limb2(ctx, 1, -1.2, foreHX, foreHY, 3, skin);         // support hand on the fore-end
    ctx.save();
    ctx.translate(hipX, hipY);
    ctx.rotate(barAng);
    drawShotgunLocal(ctx, weaponKind, slide, recoil);
    ctx.restore();
  } else {
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
  }

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
    case "melee_sword": R(-3, 0, 3, 2, "#2a1c12"); ctx.fillStyle = "#c8a040"; ctx.fillRect(-0.5, -2.5, 2, 5); R(1, 0, 15, 1.8, "#dfe6ee"); ctx.fillStyle = "#aeb6c0"; ctx.fillRect(1, 0.3, 15, 0.9); ctx.fillStyle = "#eef3f8"; ctx.fillRect(14.5, -0.9, 2, 1.8); break; // guard + long steel blade
    case "pistol": R(-1, 1.5, 2, 3, "#20242a"); R(0, 0, 6, 3, "#2c2f33"); break;
    case "pistol22": R(-1, 1.2, 2, 2.4, "#20242a"); R(0, 0, 5, 2, "#3a3f45"); break; // slim & short
    case "pistol357": // revolver: wood grip, frame, cylinder bump, longer barrel
      R(-1, 1.5, 2, 3, "#3a2a18"); R(0, 0, 5, 3, "#4a4e54"); R(2, 0, 3, 4, "#5a5e64"); R(5, 0, 4, 2, "#33373d"); break;
    case "laserpistol": // sleek sci-fi frame with a glowing pink emitter
      R(-1, 1.6, 2, 3, "#2a2f3a"); R(-1, 0, 7, 3, "#3a4250"); R(0, -1.4, 5, 1.2, "#5a6472"); ctx.fillStyle = "#ff3c78"; ctx.fillRect(6, -1, 2, 2); ctx.fillStyle = "#ffd0e2"; ctx.fillRect(6.5, -0.5, 1, 1); break;
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
    case "flamethrower": R(-4, 1, 4, 5, "#7a2a1a"); R(-3.5, 1, 1.5, 5, "#a03a24"); R(-1, 0, 10, 2.4, "#3a3a3e"); R(9, 0, 3, 3.4, "#26262a"); ctx.fillStyle = "#1a1a1e"; ctx.fillRect(11, -1, 2, 2); break; // fuel tank + nozzle
    case "mine": ctx.fillStyle = "#3a3d33"; ctx.beginPath(); ctx.arc(3, 0, 3.2, 0, TAU); ctx.fill(); ctx.fillStyle = "#4c5044"; ctx.beginPath(); ctx.arc(3, 0, 2, 0, TAU); ctx.fill(); ctx.fillStyle = "#ff3020"; ctx.fillRect(2.4, -0.6, 1.2, 1.2); break; // a mine held ready to drop
    default: R(0, 0, 6, 3, "#2c2f33");
  }
}

// Hip-fired shotgun, drawn from the grip (0,0) extending forward (+x). `slide`
// racks the pump fore-end back; `recoil` (0..1) pops a spent shell at the port.
function drawShotgunLocal(ctx, kind, slide, recoil) {
  const R = (ox, oy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox, oy - h / 2, w, h); };
  // Stock tucked back at the hip.
  R(-6, 0.6, 6, 3.2, "#4a3826");
  R(-6, 0.6, 1.6, 3.2, "#3a2c1d");
  // Receiver / grip.
  R(-1.5, 0, 4, 3.4, "#26262b");
  if (kind === "shotgun_sxs") {
    R(1, -1.3, 13, 1.7, "#4a4038"); R(1, 1.3, 13, 1.7, "#4a4038"); // twin barrels
    R(13, 0, 1.6, 3.4, "#2a2622");                                 // muzzles
  } else if (kind === "shotgun_semi") {
    R(1, -0.3, 12, 2.4, "#3a2f28"); R(1, 1.7, 10, 1.4, "#20242a"); // barrel + mag tube
    R(12.6, -0.3, 1.6, 2.4, "#20242a");                           // muzzle
  } else {
    R(1, -0.3, 12, 2.4, "#3a2f28"); R(1, 1.7, 11, 1.4, "#20242a"); // barrel + mag tube
    R(12.6, -0.3, 1.6, 2.4, "#20242a");                           // muzzle
    const fx = 5 - slide;                                          // sliding pump fore-end
    R(fx, 1.2, 4, 2.8, "#171a1f");
    R(fx, 1.2, 4, 0.9, "#2c3138");
  }
  // A fat red hull flipping out of the top ejection port as it fires / racks.
  if (recoil > 0.35 || slide > 1.4) {
    R(2, -2.4, 2.4, 1.6, "#b3352b");
    R(2, -2.4, 0.9, 1.6, "#c9a24a");
  }
}

// Waist-fired machine gun, drawn from the hip grip (0,0) with the compact body
// running forward (+x). `recoil` (0..1) flicks a spent case out the ejection port.
function drawSmgLocal(ctx, recoil) {
  const R = (ox, oy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox, oy - h / 2, w, h); };
  // Folding wire stock tucked back at the hip.
  R(-6, 0.4, 5, 2.4, "#2a2a2e");
  R(-6, 0.4, 1.4, 2.4, "#1a1a1e");
  // Receiver + short barrel + muzzle.
  R(-1.5, 0, 5, 3.2, "#26262b");
  R(1, -1.8, 5, 1, "#33373d");     // top rail / sight
  R(3, 0, 8, 2, "#20242a");        // barrel
  R(10.5, 0, 2, 2.4, "#15181c");   // muzzle
  // Stubby box magazine hanging down under the receiver.
  R(0.5, 2.2, 3.2, 4, "#141418");
  R(0.5, 2.2, 3.2, 1, "#2c2c32");
  // Spent brass flicking out the top as it rattles.
  if (recoil > 0.4) { R(1.4, -2.4, 1.6, 1, "#e0b83a"); R(1.4, -2.4, 0.6, 1, "#8a6a1a"); }
}

// Hip-fired flamethrower, drawn from the wand grip (0,0) with the fuel tank
// slung back at the hip (-x) and the nozzle wand running forward (+x).
function drawFlamerLocal(ctx) {
  const R = (ox, oy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox, oy - h / 2, w, h); };
  // Squat fuel tank behind the grip, at the hip.
  R(-8, 1.4, 5.5, 6.5, "#7a2a1a");
  R(-8, 1.4, 5.5, 1.8, "#a03a24");            // top highlight
  R(-8, -1.4, 1.6, 6.5, "#5a1e12");           // shaded back edge
  R(-3.6, -0.2, 2, 3.2, "#3a3a3e");           // regulator / neck valve
  // Hose slinging down from the tank to the wand.
  R(-3.2, 2.4, 4, 1.3, "#26262a");
  // Nozzle wand forward to the muzzle.
  R(-1.5, 0, 11, 2.4, "#3a3a3e");
  R(-1.5, -1.0, 11, 0.7, "#4a4a4e");          // wand top glint
  R(9, 0, 3.4, 3.4, "#26262a");               // nozzle bell
  ctx.fillStyle = "#1a1a1e"; ctx.fillRect(12, -1, 2, 2); // bore
  ctx.fillStyle = "#ff8a3a"; ctx.fillRect(12.4, -0.6, 1.2, 1.2); // pilot flame glow
}

// Bolt-action hunting rifle, drawn from the shoulder origin (0,0) with the
// stock running back (-x) into the shoulder and the barrel forward (+x).
// `boltBack`/`boltLift` slide & raise the bolt handle while it's being cycled.
function drawHuntingRifleLocal(ctx, boltBack, boltLift) {
  const R = (ox, oy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox, oy - h / 2, w, h); };
  // Wooden stock into the shoulder, with a comb rising to the receiver.
  R(-6, 0.5, 6.5, 3, "#5a3f26");
  R(-6, 0.5, 1.6, 3, "#442e1a");                 // butt plate
  R(-1.5, -0.4, 3, 2.2, "#6a4a2c");              // wrist/comb of the stock
  // Receiver + long blued barrel straight down the aim line.
  R(0.5, 0, 4, 3, "#20241f");                     // receiver
  R(4, -0.2, 13, 1.8, "#26411f");                 // barrel (deep hunting green)
  R(4, -0.9, 13, 0.6, "#375a2c");                 // barrel top glint
  R(16.5, -0.2, 2, 1.2, "#161a15");               // muzzle crown
  // Scope mounted over the receiver.
  R(3.5, -2.1, 7, 1.1, "#2a2a26");                // scope rail/mounts
  R(4.5, -2.7, 4.5, 1.5, "#12140e");              // scope tube
  ctx.fillStyle = "#8fd0ff"; ctx.fillRect(8.6, -2.7, 0.9, 1.4); // glinting objective lens
  // Bolt handle out the right side of the receiver; draws back & lifts on cycle.
  const bx = 1.6 - boltBack, by = 2.0 + boltLift;
  R(bx, by - 0.1, 2.4, 1.1, "#8a8f96");           // bolt arm
  ctx.fillStyle = "#c2c7cd"; ctx.beginPath(); ctx.arc(bx + 2.4, by, 1.1, 0, TAU); ctx.fill(); // knob
  // Spent brass flicking out of the port as the bolt is drawn back.
  if (boltBack > 1.4) {
    R(1.5, -2.1, 1.8, 1.1, "#c9a24a");
    R(1.5, -2.1, 0.7, 1.1, "#e6c877");
  }
}

// Shoulder-mounted RPG launcher, drawn from the shoulder origin (0,0) with the
// tube running forward (+x) and its exhaust vent poking out behind (-x).
function drawBazookaLocal(ctx) {
  const R = (ox, oy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox, oy - h / 2, w, h); };
  // Rear section behind the shoulder, with a flared exhaust vent (the mouth).
  R(-10, 0, 5, 5.6, "#2a331d");
  ctx.fillStyle = "#12160d"; ctx.beginPath(); ctx.ellipse(-10, 0, 1.8, 3.2, 0, 0, TAU); ctx.fill(); // vent opening
  // Main launch tube.
  R(-5, 0, 21, 5, "#3d4a2a");
  R(-5, -2.4, 21, 1.1, "#4c5c34");   // top highlight
  R(-5, 2.1, 21, 0.9, "#2c3620");    // underside shadow
  // Pistol grip + trigger below.
  R(-1, 2.4, 3, 3, "#242019");
  // Front sight ring and post.
  R(14, 0, 2, 6.4, "#2a331d");
  R(9, -3.6, 1.6, 2.2, "#20281a");
  // Muzzle mouth.
  ctx.fillStyle = "#12160d"; ctx.beginPath(); ctx.ellipse(16, 0, 1.5, 2.6, 0, 0, TAU); ctx.fill();
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
  // Woodland wildlife — skin is the rot showing through, cloth is the fur/feathers.
  squirrel: { skin: "#8a9a52", dark: "#5a3a1e", cloth: "#8a5230" },
  rabbit:   { skin: "#93a35a", dark: "#54504a", cloth: "#8a8276" },
  raccoon:  { skin: "#8a9a52", dark: "#26262a", cloth: "#6a6e74" },
  fox:      { skin: "#93a35a", dark: "#8a3a14", cloth: "#c06a24" },
  bear:     { skin: "#5c7a2e", dark: "#211812", cloth: "#3a2a1c" },
  bigbird:  { skin: "#8a9a52", dark: "#2a2620", cloth: "#4a4038" },
};
// Animals whose fur/feather colour comes from their palette (not random clothing).
const FUR_ANIMALS = new Set(["squirrel", "rabbit", "raccoon", "fox", "bear", "bigbird"]);
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
  // Wildlife keeps its own fur/feather colour; the horde wears grubby scavenged clothes.
  const cloth = FUR_ANIMALS.has(type) ? jitterHex(base.cloth, 18)
    : (Math.random() < 0.7 ? ZCLOTHES[(Math.random() * ZCLOTHES.length) | 0] : jitterHex(base.cloth, 30));
  const roll = Math.random();
  return {
    skin: jitterHex(base.skin, 26),
    dark: jitterHex(base.dark, 20),
    cloth,
    cloth2: jitterHex(cloth, 24),                 // trousers / accent
    hair: ZHAIR[(Math.random() * ZHAIR.length) | 0],
    hairLen: roll < 0.16 ? -1 : roll < 0.62 ? 0 : 1, // -1 bald, 0 short, 1 long
    // Per-individual gait: how big/fast the arms swing and legs stride, plus
    // whether it drags a leg (a limp) and which side.
    armAmp: rand(0.55, 1.6), armRate: rand(0.7, 1.6), legAmp: rand(0.7, 1.5),
    legStyle: Math.random() < 0.3 ? 1 : 0, // ~30% drag a leg
    dragSide: Math.random() < 0.5 ? -1 : 1,
    // ~30% drag a torn scrap of clothing/sheet snagged behind them.
    dragCloth: Math.random() < 0.3 ? { col: ZCLOTHES[(Math.random() * ZCLOTHES.length) | 0], len: rand(6, 12) } : null,
    // Over half of spitters have jagged bones jutting out of their ravaged bodies.
    bonesOut: type === "spitter" && Math.random() < 0.55,
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

  // A torn scrap of cloth snagged and dragging behind (drawn under the body).
  if (look.dragCloth && type !== "rat" && type !== "dog" && !FUR_ANIMALS.has(type)) {
    const dc = look.dragCloth;
    let ax = cx - cos * (r * 0.5), ay = cyB - sin * (r * 0.5);
    for (let i = 1; i <= 3; i++) {
      const back = r * 0.5 + dc.len * s * (i / 3);
      const sway = Math.sin(frame * 1.1 + i) * (1.6 * s) * i;
      const nx = cx - cos * back - sin * sway, ny = cyB - sin * back + cos * sway;
      limb(ctx, ax, ay, nx, ny, Math.max(1.5, (2.7 - i * 0.6) * s), dc.col);
      ax = nx; ay = ny;
    }
  }

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

  // Zombie squirrel: tiny, twitchy, with a big bushy tail curling up behind.
  if (type === "squirrel") {
    const g = Math.sin(frame * 3.2) * strideAmp, fur = cloth, belly = skin;
    const L = (ox, oy, ww, hh, cc) => px(ctx, cx, cyB, ox * s, oy * s, Math.max(1, Math.round(ww * s)), Math.max(1, Math.round(hh * s)), cos, sin, cc);
    L(-6, 0, 4, 6, dark); L(-8, -1, 3, 5, fur); L(-7, 0, 2, 3.4, belly);  // bushy tail
    L(2 + g, -2, 1.2, 1.6, dark); L(2 - g, 2, 1.2, 1.6, dark);            // little legs
    L(-1 - g, -2, 1.2, 1.6, dark); L(-1 + g, 2, 1.2, 1.6, dark);
    B(-1, 0, 6, 4, fur); B(0, 0, 2.5, 2.5, belly);
    B(3.6, 0, 3.4, 3.4, fur);
    B(2.7, -2, 1.4, 1.8, fur); B(2.7, 2, 1.4, 1.8, fur);                 // tufted ears
    B(5.4, 0, 1.6, 1.6, belly);                                          // snout
    eye(4.6, -1); eye(4.6, 1);
    return;
  }

  // Zombie rabbit: hoppy, with long ears and a fluffy tail.
  if (type === "rabbit") {
    const g = Math.sin(frame * 3) * strideAmp, fur = cloth, belly = skin;
    const L = (ox, oy, ww, hh, cc) => px(ctx, cx, cyB, ox * s, oy * s, Math.max(1, Math.round(ww * s)), Math.max(1, Math.round(hh * s)), cos, sin, cc);
    L(-5, 0, 2.6, 2.6, belly);                                           // fluffy tail
    L(1 + g, -2, 1.4, 2.4, dark); L(1 - g, 2, 1.4, 2.4, dark);           // strong hind legs
    L(-2, -1.6, 1.2, 1.4, dark); L(-2, 1.6, 1.2, 1.4, dark);
    B(-1, 0, 7, 4.5, fur); B(0, 0, 3, 3, belly);
    B(4, 0, 3.4, 3.2, fur);
    B(4.6, -2.2, 1.3, 4.6, fur); B(4.6, 2.2, 1.3, 4.6, fur);             // long ears
    B(6, 0, 1.4, 1.4, belly);                                            // nose
    eye(5, -1); eye(5, 1);
    return;
  }

  // Zombie raccoon: bandit mask and a ringed tail.
  if (type === "raccoon") {
    const gait = Math.sin(frame * 2.6) * strideAmp, fur = cloth;
    const L = (ox, oy, ww, hh, cc) => px(ctx, cx, cyB, ox * s, oy * s, Math.max(1, Math.round(ww * s)), Math.max(1, Math.round(hh * s)), cos, sin, cc);
    L(4 + gait * 1.6, -2.4, 1.8, 3, dark); L(4 - gait * 1.6, 2.4, 1.8, 3, dark);
    L(-3 - gait * 1.6, -2.4, 1.8, 3, dark); L(-3 + gait * 1.6, 2.4, 1.8, 3, dark);
    L(-6, 0, 3, 3, fur); L(-7.6, 0, 2.4, 2.6, dark); L(-9, 0, 2, 2.2, fur); // ringed tail
    B(-1, 0, 9, 5.5, fur); B(0, 0, 4, 4, skin);
    B(5, 0, 4.4, 4.4, fur);
    B(4, -2.6, 1.8, 1.8, fur); B(4, 2.6, 1.8, 1.8, fur);                 // ears
    B(5.6, 0, 2.6, 3.4, dark);                                           // dark bandit mask
    B(7, 0, 2, 2.4, "#d8d2c4");                                          // pale muzzle
    eye(5.8, -1.1); eye(5.8, 1.1);
    return;
  }

  // Zombie fox: russet hunter with pointed ears, a white-tipped brush and snout.
  if (type === "fox") {
    const fur = cloth, gait = Math.sin(frame * 2.6) * strideAmp;
    const L = (ox, oy, ww, hh, cc) => px(ctx, cx, cyB, ox * s, oy * s, Math.max(1, Math.round(ww * s)), Math.max(1, Math.round(hh * s)), cos, sin, cc);
    L(5 + gait * 2, -2.4, 1.8, 3.6, dark); L(5 - gait * 2, 2.4, 1.8, 3.6, dark);
    L(-4 - gait * 2, -2.4, 1.8, 3.6, dark); L(-4 + gait * 2, 2.4, 1.8, 3.6, dark);
    L(-7, 0, 4, 4, fur); L(-9.4, 0, 3, 3, "#e8e2d4");                    // bushy white-tipped tail
    B(-1, 0, 11, 5.5, fur); B(0, 0, 5, 4.5, skin);
    B(6, 0, 4.5, 4.5, fur);
    B(4.6, -2.6, 2, 2.6, fur); B(4.6, 2.6, 2, 2.6, fur);                 // pointed ears
    B(8.6, 0, 2.6, 2.4, "#e8e2d4"); B(9.8, 0, 1.4, 1.4, dark);           // white snout + nose
    eye(7.4, -1.2); eye(7.4, 1.2);
    return;
  }

  // Zombie bear: a hulking, dark, apex mound — the woods' answer to the brute.
  if (type === "bear") {
    const fur = cloth, gait = Math.sin(frame * 1.8) * strideAmp;
    const L = (ox, oy, ww, hh, cc) => px(ctx, cx, cyB, ox * s, oy * s, Math.max(1, Math.round(ww * s)), Math.max(1, Math.round(hh * s)), cos, sin, cc);
    L(4 + gait * 1.4, -4, 3.2, 4.5, dark); L(4 - gait * 1.4, 4, 3.2, 4.5, dark);
    L(-4 - gait * 1.4, -4, 3.2, 4.5, dark); L(-4 + gait * 1.4, 4, 3.2, 4.5, dark);
    L(-7, 0, 3, 3, fur);                                                 // stub tail
    B(-1, 0, 13, 10, fur); B(0, 0, 7, 7, skin); B(1, 2, 3, 3, dark);
    B(7, 0, 6, 6, fur);
    B(5.5, -3, 2.4, 2.4, fur); B(5.5, 3, 2.4, 2.4, fur);                 // round ears
    B(10, 0, 3, 3, dark);                                                // snout
    eye(8.2, -1.6); eye(8.2, 1.6);
    return;
  }

  // Zombie big bird: a ragged flightless fowl with flapping wings and a beak.
  if (type === "bigbird") {
    const fea = cloth, gait = Math.sin(frame * 2.4) * strideAmp, flap = Math.abs(gait) * 2;
    const L = (ox, oy, ww, hh, cc) => px(ctx, cx, cyB, ox * s, oy * s, Math.max(1, Math.round(ww * s)), Math.max(1, Math.round(hh * s)), cos, sin, cc);
    L(0 + gait * 2, -1.8, 1.4, 4, "#b89030"); L(0 - gait * 2, 1.8, 1.4, 4, "#b89030"); // scaly legs
    B(-2, -4 - flap, 5, 3, dark); B(-2, 4 + flap, 5, 3, dark);           // ragged flapping wings
    B(-1, 0, 8, 7, fea); B(0, 0, 4, 4, skin);                            // plump rotting body
    B(4, 0, 2.5, 2.5, fea);                                              // neck
    B(6.6, 0, 3.2, 3.2, fea);                                            // head
    B(6, -1.9, 1.6, 2, "#a02818");                                       // ragged wattle
    B(9, 0, 3, 1.4, "#e0b040"); B(9.8, 0, 1.6, 1, "#c08a1a");            // beak
    eye(7, -1.2); eye(7, 1.2);
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

  // Legs & feet: a shambling scissor stride with planted feet — the legs step
  // fore/aft (not just a lateral bob) and each has a chunky foot. Some zombies
  // drag a leg (a limp); severed legs leave a bloody stump.
  const stride = Math.sin(frame * 1.5) * (2.9 * strideAmp) * (look.legAmp || 1);
  const toW = (ox, oy, ax, ay) => [ax + (cos * ox - sin * oy) * s, ay + (sin * ox + cos * oy) * s];
  const drawLeg = (side) => {
    const attached = side < 0 ? parts.lleg : parts.rleg;
    const [hx, hy] = toW(-1.2, side * 2.2, bx, by); // hip on the swaying body
    if (!attached) { ctx.fillStyle = STUMP; const ss = Math.max(2, Math.round(2.4 * s)); ctx.fillRect(Math.round(hx - ss / 2), Math.round(hy - ss / 2), ss, ss); return; }
    const drag = look.legStyle === 1 && side === look.dragSide; // this leg drags
    const fwd = drag ? -2.6 + Math.sin(frame * 1.5) * 0.5 : (side < 0 ? stride : -stride);
    const [fx, fy] = toW(fwd, side * 3.0, cx, cyB); // planted foot
    limb(ctx, hx, hy, fx, fy, Math.max(2, Math.round((drag ? 2 : 2.7) * s)), cloth2);
    px(ctx, fx, fy, 1.1 * s, 0, Math.max(2, Math.round(3.4 * s)), Math.max(1, Math.round(2 * s)), cos, sin, dark); // foot
  };
  drawLeg(-1); drawLeg(1);

  // Reaching arms behind the torso so claws read out front.
  reachArm(-1, false);
  reachArm(1, false);

  // Torso (tattered) + head, lurched forward.
  B(0, 0, 9, 9, cloth);
  B(-1, 0, 6, 7, skin);
  B(0, 2, 2, 3, dark); // wound
  if (look.bonesOut) {
    // Jagged bone shards punched out through the ravaged flesh, bloody at the root.
    B(-1.6, -3, 1.8, 1.8, "#7a1414"); B(-3.6, -3.6, 4, 1.3, "#e8e2d0"); // rib jutting back-left
    B(-1.6, 3, 1.8, 1.8, "#7a1414");  B(-3.6, 3.6, 4, 1.3, "#ded6c0");  // rib jutting back-right
    B(1.2, -0.4, 1.7, 1.7, "#8a1a10"); B(1.6, -3.6, 1.3, 3.2, "#efe9d8"); // shard poking up from the shoulder
  }
  if (type === "brute") { B(0, 0, 12, 11, dark); B(1, 0, 7, 8, skin); }
  B(2, 0, 6, 6, skin);
  hairOn(2);
  eye(4, -1.5); eye(4, 1.5);
}

// Slightly darken/mute a hex colour for a "dead" look, but keep enough of the
// original hue that a corpse is recognisably the same zombie that fell.
function deadTint(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const gray = (r + g + b) / 3;
  r = (r * 0.74 + gray * 0.26) * k; g = (g * 0.74 + gray * 0.26) * k; b = (b * 0.74 + gray * 0.26) * k;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// A dead zombie settled on the ground (permanent decal), lying face-down.
export function drawBodyDecal(ctx, x, y, angle, type, r, parts, look) {
  const pal = ZOMBIE_PAL[type] || ZOMBIE_PAL.walker;
  look = look || { skin: pal.skin, cloth: pal.cloth, dark: pal.dark, cloth2: pal.dark, hair: "#20160e", hairLen: 0 };
  parts = parts || { larm: 1, rarm: 1, lleg: 1, rleg: 1 };
  const s = r / 7;
  const skin = deadTint(look.skin, 0.9);
  const cloth = deadTint(look.cloth || look.dark, 0.86);
  const cloth2 = deadTint(look.cloth2 || look.cloth || look.dark, 0.82);
  const dark = deadTint(look.dark, 0.76);
  const hair = deadTint(look.hair || "#20160e", 0.72);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Layered, irregular blood pool (larger for a brute).
  const pool = type === "brute" ? 1.4 : 1;
  ctx.fillStyle = "rgba(70,8,10,0.5)";
  ctx.beginPath(); ctx.ellipse(-1 * s, 0, 12 * s * pool, 7.5 * s * pool, 0.3, 0, TAU); ctx.fill();
  ctx.fillStyle = "rgba(40,4,6,0.55)";
  ctx.beginPath(); ctx.ellipse(3 * s, 1 * s, 6.5 * s * pool, 4.2 * s * pool, -0.4, 0, TAU); ctx.fill();

  // --- Rat carcass: tiny, on its side, tail trailing. ---
  if (type === "rat") {
    ctx.fillStyle = cloth; ctx.beginPath(); ctx.ellipse(0, 0, 6 * s, 3.4 * s, 0, 0, TAU); ctx.fill();       // body
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(1 * s, 0.6 * s, 3 * s, 1.8 * s, 0, 0, TAU); ctx.fill(); // belly
    ctx.fillStyle = dark; for (const [ox, oy] of [[1, -3], [-1.5, -3.2], [1, 3], [-1.5, 3.2]]) ctx.fillRect((ox - 0.7) * s, (oy - 0.7) * s, 1.6 * s, 1.6 * s); // splayed legs
    ctx.fillStyle = cloth; ctx.beginPath(); ctx.arc(4.6 * s, 0, 2.4 * s, 0, TAU); ctx.fill();                // head
    ctx.strokeStyle = cloth; ctx.lineWidth = Math.max(1, 1.2 * s);                                            // tail
    ctx.beginPath(); ctx.moveTo(-5 * s, 0); ctx.quadraticCurveTo(-9 * s, -1 * s, -11 * s, 2 * s); ctx.stroke(); ctx.lineWidth = 1;
    ctx.restore(); return;
  }

  // --- Dog carcass: bigger, four legs splayed, snout forward. ---
  if (type === "dog") {
    ctx.fillStyle = cloth; ctx.beginPath(); ctx.ellipse(-8 * s, 0, 3 * s, 1.5 * s, 0, 0, TAU); ctx.fill();     // tail base
    ctx.fillStyle = dark; for (const [ox, oy] of [[4, -4], [4.5, 4], [-4, -4], [-3.5, 4]]) ctx.fillRect((ox - 1) * s, (oy - 2.5) * s, 2 * s, 5 * s); // splayed legs
    ctx.fillStyle = cloth; ctx.beginPath(); ctx.ellipse(-0.5 * s, 0, 10 * s, 4.4 * s, 0, 0, TAU); ctx.fill();  // torso
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(1 * s, 0.5 * s, 4.5 * s, 2.6 * s, 0, 0, TAU); ctx.fill(); // rotting shoulders
    ctx.fillStyle = cloth; ctx.beginPath(); ctx.arc(7 * s, 0, 3.4 * s, 0, TAU); ctx.fill();                    // head
    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(9.6 * s, 0, 1.8 * s, 0, TAU); ctx.fill();                   // snout
    ctx.restore(); return;
  }

  // --- Small woodland critter carcass (squirrel / rabbit / raccoon / fox). ---
  if (type === "squirrel" || type === "rabbit" || type === "raccoon" || type === "fox") {
    const bushy = type === "squirrel" || type === "fox";
    ctx.fillStyle = cloth; ctx.beginPath(); ctx.ellipse(0, 0, 7 * s, 4 * s, 0, 0, TAU); ctx.fill();             // body
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(1 * s, 0.5 * s, 3.4 * s, 2 * s, 0, 0, TAU); ctx.fill();  // belly rot
    ctx.fillStyle = dark; for (const [ox, oy] of [[3, -3.5], [3.5, 3.5], [-3, -3.5], [-2.5, 3.5]]) ctx.fillRect((ox - 0.9) * s, (oy - 2) * s, 1.8 * s, 4 * s); // splayed legs
    ctx.fillStyle = cloth; ctx.beginPath(); ctx.arc(6 * s, 0, 3 * s, 0, TAU); ctx.fill();                       // head
    if (type === "rabbit") { ctx.fillStyle = cloth; ctx.fillRect(6 * s, -3.4 * s, 1.4 * s, 4 * s); ctx.fillRect(6 * s, 1.4 * s, 1.4 * s, 4 * s); } // ears
    if (bushy) { ctx.fillStyle = cloth; ctx.beginPath(); ctx.arc(-7 * s, 0, 3 * s, 0, TAU); ctx.fill(); }       // brush tail
    ctx.restore(); return;
  }

  // --- Bear carcass: a big dark mound, paws splayed. ---
  if (type === "bear") {
    ctx.fillStyle = dark; for (const [ox, oy] of [[5, -6], [5.5, 6], [-5, -6], [-4.5, 6]]) ctx.fillRect((ox - 1.4) * s, (oy - 3) * s, 2.8 * s, 6 * s); // splayed paws
    ctx.fillStyle = cloth; ctx.beginPath(); ctx.ellipse(-0.5 * s, 0, 12 * s, 7 * s, 0, 0, TAU); ctx.fill();     // torso
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(1 * s, 0.5 * s, 6 * s, 3.6 * s, 0, 0, TAU); ctx.fill();  // rot
    ctx.fillStyle = cloth; ctx.beginPath(); ctx.arc(9 * s, 0, 5 * s, 0, TAU); ctx.fill();                       // head
    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(12.5 * s, 0, 2.4 * s, 0, TAU); ctx.fill();                   // snout
    ctx.restore(); return;
  }

  // --- Big bird carcass: wings splayed, beak forward. ---
  if (type === "bigbird") {
    ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(-1 * s, -6 * s, 6 * s, 3 * s, 0.3, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(-1 * s, 6 * s, 6 * s, 3 * s, -0.3, 0, TAU); ctx.fill(); // wings
    ctx.fillStyle = cloth; ctx.beginPath(); ctx.ellipse(0, 0, 7 * s, 4.4 * s, 0, 0, TAU); ctx.fill();           // body
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(1 * s, 0.5 * s, 3.4 * s, 2 * s, 0, 0, TAU); ctx.fill();  // rot
    ctx.fillStyle = cloth; ctx.beginPath(); ctx.arc(7 * s, 0, 3 * s, 0, TAU); ctx.fill();                       // head
    ctx.fillStyle = "#d8a838"; ctx.beginPath(); ctx.moveTo(9 * s, -1.4 * s); ctx.lineTo(12 * s, 0); ctx.lineTo(9 * s, 1.4 * s); ctx.fill(); // beak
    ctx.restore(); return;
  }

  // --- Humanoid corpse: splayed on its back, torn open, face up. ---
  const bigT = type === "brute" ? 1.32 : 1;
  const limb = (ang, x0, len, wide, col, ok) => {
    ctx.save(); ctx.rotate(ang);
    if (!ok) { ctx.fillStyle = STUMP; ctx.beginPath(); ctx.arc(x0 + 1, 0, wide * 1.05, 0, TAU); ctx.fill(); ctx.restore(); return; }
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(x0 + len / 2, 0, len / 2 + 0.6, wide, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.12)"; // shading toward the extremity
    ctx.beginPath(); ctx.ellipse(x0 + len * 0.76, 0, len * 0.26, wide * 0.85, 0, 0, TAU); ctx.fill();
    ctx.restore();
  };
  // Legs (trousers = cloth2) trail back, arms (skin) fling out to the sides.
  limb(Math.PI - 0.30, 2 * s, 7.5 * s, 1.8 * s * bigT, cloth2, parts.rleg);
  limb(Math.PI + 0.30, 2 * s, 7.5 * s, 1.8 * s * bigT, cloth2, parts.lleg);
  limb(-1.05, 2.2 * s, 6 * s, 1.5 * s * bigT, skin, parts.rarm);
  limb(1.05, 2.2 * s, 6 * s, 1.5 * s * bigT, skin, parts.larm);

  // Torso (same shirt colour it wore).
  ctx.fillStyle = cloth;
  ctx.beginPath(); ctx.ellipse(0, 0, 7 * s * bigT, 4.8 * s * bigT, 0, 0, TAU); ctx.fill();
  // Torn-open belly showing viscera (organs) and a couple of exposed ribs.
  ctx.fillStyle = "#5a1414";
  ctx.beginPath(); ctx.ellipse(-1 * s, 0, 3.4 * s, 2.4 * s, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = "#8a3a3a";
  for (const [ox, oy] of [[-1.6, -0.8], [-0.4, 0.6], [-2.2, 0.5]]) { ctx.beginPath(); ctx.arc(ox * s, oy * s, 1.1 * s, 0, TAU); ctx.fill(); }
  ctx.fillStyle = "rgba(210,190,150,0.5)";
  ctx.fillRect(-3 * s, -2 * s, 4 * s, 0.7 * s); ctx.fillRect(-3 * s, 1.4 * s, 4 * s, 0.7 * s);

  // Head (same skin), hair drawn to match the zombie's style/length, face up.
  const hr = 3.2 * s * (type === "brute" ? 1.12 : 1);
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(6 * s, 0, hr, 0, TAU); ctx.fill();
  if (look.hairLen === -1) { ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(6.4 * s, 0, 1.7 * s, 0, TAU); ctx.fill(); } // bald: bare scalp/scar
  else if (look.hairLen === 1) { ctx.fillStyle = hair; ctx.beginPath(); ctx.ellipse(4.4 * s, 0, 2.8 * s, 3.6 * s, 0, 0, TAU); ctx.fill(); } // long, trailing back
  else { ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(4.8 * s, 0, 2.5 * s, 0, TAU); ctx.fill(); }                    // short cap on the crown
  ctx.fillStyle = "#20140c"; // slack, shut eyes
  ctx.fillRect(6.5 * s, -1.3 * s, 1.4 * s, 0.7 * s); ctx.fillRect(6.5 * s, 0.6 * s, 1.4 * s, 0.7 * s);

  ctx.restore();
}

// A severed limb lying on the ground (or, when zHeight>0, tumbling in the air).
// Bones take an optional scale (relative to the body they came from) and a kind
// (long / short / rib / little).
export function drawGroundLimb(ctx, x, y, angle, part, color, zHeight, boneScale, boneKind) {
  const big = part === "head" || part === "torso" || part === "gut";
  const bsc = boneScale || 1;
  const len = part && part.endsWith("leg") ? 8 : 6;
  const shW = part === "bone" ? 3.5 * bsc : (big ? 4.5 : len * 0.5);
  if (zHeight > 0) {
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(x, y, shW, 2 * (part === "bone" ? bsc : 1), 0, 0, TAU); ctx.fill();
  }
  ctx.save();
  ctx.translate(x, y - (zHeight || 0));
  ctx.rotate(angle);
  if (!zHeight) { ctx.fillStyle = "rgba(60,10,10,0.4)"; ctx.beginPath(); ctx.ellipse(0, 0, (part === "bone" ? 4 * bsc : big ? 5 : len * 0.7), 3 * (part === "bone" ? bsc : 1), 0, 0, TAU); ctx.fill(); }
  if (part === "head") {
    ctx.fillStyle = color || "#d9a066"; ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, TAU); ctx.fill();
    ctx.fillStyle = "#3a2a1a"; ctx.beginPath(); ctx.arc(-1.5, 0, 2.3, 0, TAU); ctx.fill();          // hair on the back
    ctx.fillStyle = "#20140c"; ctx.fillRect(1, -1.4, 1.5, 0.8); ctx.fillRect(1, 0.6, 1.5, 0.8);     // shut eyes
    ctx.fillStyle = "#5a1010"; ctx.beginPath(); ctx.arc(-3, 0, 1.4, 0, TAU); ctx.fill();            // torn neck
  } else if (part === "torso") {
    ctx.fillStyle = color || "#3b5a8c"; ctx.beginPath(); ctx.ellipse(0, 0, 5.5, 3.7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#5a1414"; ctx.beginPath(); ctx.ellipse(0.5, 0, 2.7, 1.9, 0, 0, TAU); ctx.fill(); // ripped-open cavity
    ctx.fillStyle = "#8a3a3a"; ctx.beginPath(); ctx.arc(0, -0.6, 1, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(1, 0.7, 0.9, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(210,190,150,0.6)"; ctx.fillRect(-4, -2.3, 3, 0.7); ctx.fillRect(-4, 1.6, 3, 0.7); // ribs
  } else if (part === "gut") {
    ctx.fillStyle = color || "#9c3a4a";
    for (const [ox, oy] of [[0, 0], [1.4, 0.4], [-1.2, 0.6], [0.4, -1]]) { ctx.beginPath(); ctx.arc(ox, oy, 1.5, 0, TAU); ctx.fill(); }
    ctx.fillStyle = "#7a2030"; ctx.beginPath(); ctx.arc(0.4, 0.2, 0.9, 0, TAU); ctx.fill();
  } else if (part === "bone") {
    // Bloody bone shards in a few shapes, scaled to the body they came from:
    // a long femur, a shorter bone, a curved rib, or a tiny little bone.
    ctx.scale(bsc, bsc);
    const ivory = color || "#e8e2d0";
    if (boneKind === "rib") {
      ctx.strokeStyle = ivory; ctx.lineWidth = 1.3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(0, 2.6, 3.3, -Math.PI * 0.86, -Math.PI * 0.14); ctx.stroke();
      ctx.fillStyle = "rgba(120,20,20,0.5)"; ctx.beginPath(); ctx.arc(-2.9, 1.4, 0.8, 0, TAU); ctx.fill();
      ctx.lineWidth = 1; ctx.lineCap = "butt";
    } else if (boneKind === "little") {
      ctx.fillStyle = ivory; ctx.fillRect(-1.4, -0.6, 2.8, 1.2);
      for (const ex of [-1.4, 1.4]) { ctx.beginPath(); ctx.arc(ex, -0.5, 0.8, 0, TAU); ctx.arc(ex, 0.5, 0.8, 0, TAU); ctx.fill(); }
    } else {
      const L = boneKind === "short" ? 4 : 6; // femur-ish long bone vs a shorter one
      ctx.fillStyle = ivory; ctx.fillRect(-L / 2, -0.9, L, 1.8);
      for (const ex of [-L / 2, L / 2]) { ctx.beginPath(); ctx.arc(ex, -0.7, 1.1, 0, TAU); ctx.arc(ex, 0.7, 1.1, 0, TAU); ctx.fill(); }
      ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.fillRect(-L / 2, 0.4, L, 0.6); // shading groove
      ctx.fillStyle = "rgba(120,20,20,0.5)"; ctx.beginPath(); ctx.arc(L / 2, 0, 1.1, 0, TAU); ctx.fill(); // bloody snapped end
    }
  } else {
    ctx.fillStyle = color || "#72a83a";
    ctx.fillRect(-len / 2, -1.6, len, 3.2);
    ctx.fillStyle = "#5a1010"; // bloody torn end
    ctx.fillRect(len / 2 - 1.6, -1.6, 1.6, 3.2);
  }
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
  shrub:  { body: "#37502a", top: "#4a6636", edge: "#243a1c" },
  dresser:{ body: "#6a4a2a", top: "#835c38", edge: "#472f18" },
  boulder:{ body: "#6a6e72", top: "#888c92", edge: "#43474b" },
  rock:   { body: "#71757a", top: "#8e9298", edge: "#4a4e52" },
  log:    { body: "#5a3f26", top: "#74542f", edge: "#3a2818" },
  plane:  { body: "#c8ccd2", top: "#e4e8ee", edge: "#8a8f98" },
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
  if (f.type === "plane") {
    // A top-down airliner: nose toward +x. Swept wings & tailplane, engine pods,
    // a fin, cockpit glass and a cabin window line.
    const L = f.hw, W = f.hh;
    ctx.fillStyle = c.edge; // swept wings
    ctx.beginPath(); ctx.moveTo(2, -W * 0.6); ctx.lineTo(-L * 0.5, -W * 2.6); ctx.lineTo(-L * 0.78, -W * 2.6); ctx.lineTo(-4, W * 0.1); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(2, W * 0.6); ctx.lineTo(-L * 0.5, W * 2.6); ctx.lineTo(-L * 0.78, W * 2.6); ctx.lineTo(-4, -W * 0.1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#42464c"; // engine pods slung under the wings
    ctx.fillRect(-L * 0.36, -W * 2.0, W * 1.1, W * 0.8); ctx.fillRect(-L * 0.36, W * 1.2, W * 1.1, W * 0.8);
    ctx.fillStyle = c.edge; // tailplane
    ctx.beginPath(); ctx.moveTo(-L + 3, -W * 0.4); ctx.lineTo(-L - 3, -W * 1.5); ctx.lineTo(-L - 5, -W * 1.5); ctx.lineTo(-L - 1, W * 0.1); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-L + 3, W * 0.4); ctx.lineTo(-L - 3, W * 1.5); ctx.lineTo(-L - 5, W * 1.5); ctx.lineTo(-L - 1, -W * 0.1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c.body; ctx.beginPath(); ctx.ellipse(0, 0, L, W, 0, 0, TAU); ctx.fill();        // fuselage
    ctx.fillStyle = c.body; ctx.beginPath(); ctx.ellipse(L * 0.72, 0, L * 0.4, W * 0.82, 0, 0, TAU); ctx.fill(); // nose
    ctx.fillStyle = c.top; ctx.fillRect(-L * 0.82, -W * 0.5, L * 1.55, W * 0.5);                     // top highlight
    ctx.fillStyle = c.edge; ctx.beginPath(); ctx.moveTo(-L * 0.72, 0); ctx.lineTo(-L * 1.18, -W * 0.22); ctx.lineTo(-L * 0.86, W * 0.22); ctx.closePath(); ctx.fill(); // fin
    ctx.fillStyle = "#26333d"; ctx.beginPath(); ctx.ellipse(L * 0.66, 0, W * 0.55, W * 0.5, 0, 0, TAU); ctx.fill(); // cockpit glass
    ctx.fillStyle = "rgba(40,55,66,0.75)"; for (let wx = -L * 0.62; wx < L * 0.5; wx += 4) ctx.fillRect(wx, -1, 2, 2); // cabin windows
    ctx.restore();
    return;
  }
  if (f.type === "bench") {
    ctx.fillStyle = c.edge; ctx.fillRect(-f.hw, -f.hh, f.hw * 2, f.hh * 2);
    ctx.fillStyle = c.body; for (let i = -1; i <= 1; i++) ctx.fillRect(-f.hw, i * 2 - 0.7, f.hw * 2, 1.4);
    ctx.restore();
    return;
  }
  if (f.type === "bush" || f.type === "shrub") {
    // A leafy shrub: a few overlapping blobs with a lit top. Shrubs are a touch
    // smaller and scrubbier, with a couple of dry twigs poking out.
    const sc = f.type === "shrub" ? 0.82 : 1;
    ctx.fillStyle = c.body;
    for (const [ox, oy, rr] of [[-4, 0, 6], [4, 1, 6], [0, -3, 6], [0, 2, 7]]) { ctx.beginPath(); ctx.arc(ox * sc, oy * sc, rr * sc, 0, TAU); ctx.fill(); }
    ctx.fillStyle = c.top;
    for (const [ox, oy, rr] of [[-3, -2, 3], [3, -1, 3], [0, -1, 3.4]]) { ctx.beginPath(); ctx.arc(ox * sc, oy * sc, rr * sc, 0, TAU); ctx.fill(); }
    if (f.type === "shrub") { ctx.strokeStyle = c.edge; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-3, 2); ctx.lineTo(-5, -3); ctx.moveTo(3, 2); ctx.lineTo(5, -2); ctx.stroke(); ctx.lineWidth = 1; }
    ctx.restore();
    return;
  }
  if (f.type === "boulder" || f.type === "rock") {
    // A rounded stone: a shaded base lump, a lit crown, a pocket of shadow and
    // a couple of cracks.
    ctx.fillStyle = c.edge; ctx.beginPath(); ctx.ellipse(0, 1, f.hw, f.hh * 0.92, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = c.body; ctx.beginPath(); ctx.ellipse(-0.4, 0, f.hw * 0.92, f.hh * 0.82, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = c.top; ctx.beginPath(); ctx.ellipse(-f.hw * 0.28, -f.hh * 0.32, f.hw * 0.5, f.hh * 0.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(f.hw * 0.32, f.hh * 0.32, f.hw * 0.42, f.hh * 0.36, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-f.hw * 0.3, -f.hh * 0.1); ctx.lineTo(f.hw * 0.2, f.hh * 0.5); ctx.stroke();
    ctx.restore(); return;
  }
  if (f.type === "log") {
    // A fallen log: a long timber cylinder with end-grain rings.
    const vert = f.hh >= f.hw; if (!vert) ctx.rotate(Math.PI / 2);
    const hw = vert ? f.hw : f.hh, hh = vert ? f.hh : f.hw;
    ctx.fillStyle = c.edge; ctx.fillRect(-hw, -hh, hw * 2, hh * 2);
    ctx.fillStyle = c.body; ctx.fillRect(-hw + 1, -hh, hw * 2 - 2, hh * 2);
    ctx.fillStyle = c.top; ctx.fillRect(-hw + 1, -hh, hw * 0.7, hh * 2);       // lit length
    ctx.fillStyle = "#8a6a3e"; ctx.beginPath(); ctx.arc(0, -hh + 1.5, hw * 0.7, 0, TAU); ctx.fill(); // end grain
    ctx.strokeStyle = c.edge; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, -hh + 1.5, hw * 0.4, 0, TAU); ctx.stroke();
    ctx.restore(); return;
  }
  if (f.type === "dresser") {
    ctx.fillStyle = c.edge; ctx.fillRect(-f.hw, -f.hh, f.hw * 2, f.hh * 2);
    ctx.fillStyle = c.body; ctx.fillRect(-f.hw + 1, -f.hh + 1, f.hw * 2 - 2, f.hh * 2 - 2);
    ctx.fillStyle = c.edge; ctx.fillRect(-f.hw + 1, -0.6, f.hw * 2 - 2, 1.2); // drawer seam
    ctx.fillStyle = c.top; for (const sy of [-f.hh * 0.5, f.hh * 0.5]) { ctx.fillRect(-3, sy - 0.8, 2, 1.6); ctx.fillRect(1, sy - 0.8, 2, 1.6); } // handles
    ctx.restore(); return;
  }
  if (f.type === "swings") {
    ctx.strokeStyle = "#6a6f76"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-f.hw + 2, -f.hh + 1); ctx.lineTo(f.hw - 2, -f.hh + 1); ctx.stroke(); // top bar
    for (const sx of [-f.hw + 3, f.hw - 3]) { ctx.beginPath(); ctx.moveTo(sx - 3, f.hh - 1); ctx.lineTo(sx, -f.hh + 1); ctx.lineTo(sx + 3, f.hh - 1); ctx.stroke(); } // A-frames
    ctx.strokeStyle = "#8a8f96"; ctx.lineWidth = 1;
    for (const sx of [-4, 4]) { ctx.beginPath(); ctx.moveTo(sx, -f.hh + 1); ctx.lineTo(sx, f.hh - 3); ctx.stroke(); ctx.fillStyle = "#c0392b"; ctx.fillRect(sx - 2.5, f.hh - 4, 5, 2); }
    ctx.lineWidth = 1; ctx.restore(); return;
  }
  if (f.type === "slide") {
    ctx.fillStyle = "#5a7a58"; ctx.fillRect(-f.hw, -f.hh, f.hw * 0.8, f.hh * 2); // platform
    ctx.fillStyle = "#9aa7b5"; ctx.fillRect(-f.hw * 0.2, -3, f.hw * 1.2, 6);      // metal chute
    ctx.fillStyle = "#c4d0dd"; ctx.fillRect(-f.hw * 0.2, -1.5, f.hw * 1.2, 1.5);  // shine
    ctx.fillStyle = "#6a6f76"; for (let i = -1; i <= 1; i++) ctx.fillRect(-f.hw + 1, i * 3 - 0.7, f.hw * 0.8 - 2, 1.4); // ladder rungs
    ctx.restore(); return;
  }
  if (f.type === "seesaw") {
    ctx.fillStyle = "#8a5a30"; ctx.fillRect(-f.hw, -1.6, f.hw * 2, 3.2); // plank
    ctx.fillStyle = "#c0392b"; ctx.fillRect(-f.hw, -2, 3, 4);
    ctx.fillStyle = "#2f6b4a"; ctx.fillRect(f.hw - 3, -2, 3, 4);          // seats
    ctx.fillStyle = "#4a4e54"; ctx.fillRect(-2, -2.5, 4, 5);              // pivot
    ctx.restore(); return;
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
