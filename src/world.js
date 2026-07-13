// World / level generation. Tile-based maps with walls, doors, floors and an exit.
import { randInt, rand, chance, pick, clamp } from "./util.js";

export const TILE = 32;
export const T = { FLOOR: 0, WALL: 1, DOOR: 2, EXIT: 3, PROP: 4, WINDOW: 5, STAIRS: 6 };

export const SETTINGS = [
  { id: "house", name: "The House", floor: "#4a3b2a", floor2: "#523f2c", wall: "#6a5340", wallTop: "#8a6d50", accent: "#4a3d2c" },
  { id: "streets", name: "The Streets", floor: "#2a2d24", floor2: "#31352b", wall: "#4a4034", wallTop: "#5c5142", accent: "#3a3d30" },
  { id: "mall", name: "Abandoned Mall", floor: "#3a3540", floor2: "#423c48", wall: "#5a4a60", wallTop: "#6e5a76", accent: "#4a4252" },
  { id: "hospital", name: "St. Mercy Hospital", floor: "#28343a", floor2: "#2e3c43", wall: "#3a5058", wallTop: "#48626c", accent: "#324248" },
  { id: "forest", name: "Blackpine Woods", floor: "#1f2a1c", floor2: "#243021", wall: "#2c3a22", wallTop: "#38492c", accent: "#26331e" },
];

// Per-room floor colours (checker pairs), keyed by floorTint value.
export const ROOM_FLOOR = {
  0: ["#22381b", "#284020"], // yard / grass
  1: ["#54402c", "#5b452f"], // living room
  2: ["#3b4147", "#42484f"], // kitchen tile
  3: ["#5a4632", "#604b36"], // dining room
  4: ["#403830", "#463e35"], // hall / landing
};

export class World {
  constructor(settingIndex = 0, floorLevel = 0) {
    this.setting = SETTINGS[settingIndex % SETTINGS.length];
    this.settingIndex = settingIndex;
    this.isHouse = this.setting.id === "house";
    this.floorLevel = floorLevel; // 0 = ground, 1 = upstairs
    this.cols = this.isHouse ? 40 : randInt(40, 52);
    this.rows = this.isHouse ? 38 : randInt(40, 52);
    this.grid = new Uint8Array(this.cols * this.rows);
    this.explored = new Uint8Array(this.cols * this.rows); // fog-of-war memory
    this.floorTint = new Uint8Array(this.cols * this.rows); // per-tile room colour id
    this.doors = []; // {cx, cy, open, openT, locked, hp, maxHp, broken}
    this.props = []; // decorative, non-blocking-ish
    this.furniture = []; // smashable / knock-over objects
    this.rooms = [];
    this.stairsCells = []; // tiles that move the player between floors
    this.landing = null;   // where the player arrives on this floor
    this.exit = { x: 0, y: 0 };
    this.exitFacing = "up";
    this.spawnPoint = { x: 0, y: 0 };
    if (this.isHouse) { if (floorLevel === 1) this._houseUpper(); else this._houseGround(); }
    else this._generate();
  }

  // Doorways: a normal open door, or a locked one to break/unlock.
  _doorway(cx, cy, opts = {}) {
    this._set(cx, cy, T.DOOR);
    const locked = !!opts.locked;
    this.doors.push({ cx, cy, open: !locked && opts.open !== false, openT: locked ? 0 : 1, locked, hp: opts.hp || (locked ? 140 : 70), maxHp: opts.hp || (locked ? 140 : 70), broken: false });
  }

  doorNear(x, y) {
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    for (let gy = cy - 1; gy <= cy + 1; gy++)
      for (let gx = cx - 1; gx <= cx + 1; gx++) { const d = this.doorAt(gx, gy); if (d) return d; }
    return null;
  }

  // Damage a shut door (bullets / melee). Returns true if this broke it open.
  hitDoor(d, dmg) {
    if (!d || d.broken || (d.open && !d.locked)) return false;
    d.hp -= dmg;
    if (d.hp <= 0) { d.broken = true; d.open = true; d.openT = 1; return true; }
    return false;
  }

  doorPassable(d) { return d && (d.broken || (d.open && !d.locked)); }

  // Damage a piece of furniture; returns it if this hit destroyed it, else null.
  hitFurniture(f, dmg, angle, force) {
    if (f.broken) return null;
    f.hp -= dmg;
    if (force) f.angle += (force / 400) * (Math.cos(angle) * -f.hh + Math.sin(angle) * f.hw) * 0.01;
    if (f.hp <= 0) {
      f.broken = true;
      f.overturned = Math.random() < 0.5; // tipped over vs smashed to bits
      return f;
    }
    return null;
  }

  // Furniture whose intact AABB the segment (ax,ay)->(bx,by) crosses.
  furnitureHitBySegment(ax, ay, bx, by) {
    const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 4));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const f = this.furnitureAt(ax + (bx - ax) * t, ay + (by - ay) * t);
      if (f) return f;
    }
    return null;
  }

  idx(cx, cy) { return cy * this.cols + cx; }
  inBounds(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows; }
  tileAt(cx, cy) { return this.inBounds(cx, cy) ? this.grid[this.idx(cx, cy)] : T.WALL; }

  _set(cx, cy, v) { if (this.inBounds(cx, cy)) this.grid[this.idx(cx, cy)] = v; }
  _tint(cx, cy, v) { if (this.inBounds(cx, cy)) this.floorTint[this.idx(cx, cy)] = v; }

  // Hand-shaped ground-floor house: living room, kitchen, dining room, a yard
  // with windows & doors the zombies break in through, and a staircase.
  _houseShell(bw, bh) {
    const cols = this.cols, rows = this.rows;
    this.grid.fill(T.FLOOR);
    for (let x = 0; x < cols; x++) { this._set(x, 0, T.WALL); this._set(x, rows - 1, T.WALL); }
    for (let y = 0; y < rows; y++) { this._set(0, y, T.WALL); this._set(cols - 1, y, T.WALL); }
    const bx = (cols - bw) >> 1, by = (rows - bh) >> 1;
    const x1 = bx + bw - 1, y1 = by + bh - 1;
    for (let x = bx; x <= x1; x++) { this._set(x, by, T.WALL); this._set(x, y1, T.WALL); }
    for (let y = by; y <= y1; y++) { this._set(bx, y, T.WALL); this._set(x1, y, T.WALL); }
    return { bx, by, x1, y1 };
  }

  _addWindows(bx, by, x1, y1, skip) {
    const winOk = (cx, cy) => this.tileAt(cx, cy) === T.WALL;
    for (let x = bx + 2; x <= x1 - 2; x += 4) {
      if (winOk(x, by)) this._set(x, by, T.WINDOW);
      if ((!skip || x !== skip) && winOk(x, y1)) this._set(x, y1, T.WINDOW);
    }
    for (let y = by + 3; y <= y1 - 2; y += 4) {
      if (winOk(bx, y)) this._set(bx, y, T.WINDOW);
      if (winOk(x1, y)) this._set(x1, y, T.WINDOW);
    }
  }

  _place(cx, cy, type) {
    if (this.tileAt(cx, cy) !== T.FLOOR) return;
    const F = { crate: [10, 10, 40], table: [13, 9, 55], chair: [7, 7, 22], barrel: [8, 8, 48], shelf: [13, 7, 60], couch: [15, 9, 72], bed: [13, 9, 60] };
    const d = F[type] || F.crate;
    this.furniture.push({ cx, cy, x: (cx + 0.5) * TILE, y: (cy + 0.5) * TILE, hw: d[0], hh: d[1], type: type === "bed" ? "couch" : type, hp: d[2], maxHp: d[2], broken: false, overturned: false, angle: rand(-0.05, 0.05) });
  }

  _fillTint(rx0, ry0, rx1, ry1, tint) {
    for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) if (this.tileAt(x, y) === T.FLOOR) this._tint(x, y, tint);
  }

  // Ground floor: living room, kitchen, a locked dining room, staircase, yard.
  _houseGround() {
    const rows = this.rows;
    const { bx, by, x1, y1 } = this._houseShell(26, 20);
    const vx = bx + 14, hy = by + 10;
    for (let y = by + 1; y <= y1 - 1; y++) this._set(vx, y, T.WALL);
    for (let x = vx; x <= x1 - 1; x++) this._set(x, hy, T.WALL);

    this._doorway(vx, by + 4);                 // living <-> kitchen (open)
    this._doorway(vx + 5, hy, { locked: true }); // kitchen <-> dining (LOCKED)
    const fdx = bx + 7;
    this._doorway(fdx, y1);                     // front door
    this._addWindows(bx, by, x1, y1, fdx);

    this._fillTint(bx + 1, by + 1, vx - 1, y1 - 1, 1); // living
    this._fillTint(vx + 1, by + 1, x1 - 1, hy - 1, 2); // kitchen
    this._fillTint(vx + 1, hy + 1, x1 - 1, y1 - 1, 3); // dining

    this.rooms = [{ name: "living", cx: bx + 7, cy: by + 10 }, { name: "kitchen", cx: vx + 5, cy: by + 5 }, { name: "dining", cx: vx + 5, cy: hy + 5 }];

    // Staircase up, in the living room's top corner.
    for (let y = by + 1; y <= by + 4; y++) for (let x = bx + 1; x <= bx + 2; x++) { this._set(x, y, T.STAIRS); this.stairsCells.push({ cx: x, cy: y }); }
    this.landing = { x: (bx + 3 + 0.5) * TILE, y: (by + 3 + 0.5) * TILE }; // arrive here coming down

    // Furniture.
    this._place(bx + 6, y1 - 3, "couch"); this._place(bx + 9, y1 - 6, "table"); this._place(bx + 4, by + 8, "shelf");
    this._place(x1 - 2, by + 2, "shelf"); this._place(x1 - 5, by + 2, "shelf"); this._place(vx + 2, by + 5, "barrel");
    this._place(vx + 6, hy + 5, "table"); this._place(vx + 4, hy + 5, "chair"); this._place(vx + 8, hy + 5, "chair");
    this._place(vx + 6, hy + 3, "chair"); this._place(vx + 6, hy + 7, "chair");

    // Loot hints (game turns these into pickups): key in living, axe in kitchen, reward in the locked dining room.
    this.loot = [
      { cx: bx + 4, cy: by + 12, kind: "key" },
      { cx: vx + 3, cy: by + 3, kind: "weapon", data: "axe" },
      { cx: vx + 8, cy: hy + 7, kind: "weapon", data: "shotgun" },
      { cx: vx + 4, cy: hy + 8, kind: "ammo", data: { type: "shells", amount: 16 } },
    ];

    this.spawnPoint = { x: (bx + 7 + 0.5) * TILE, y: (by + 12 + 0.5) * TILE };
    const exCx = fdx, exCy = rows - 3;
    this._set(exCx, exCy, T.EXIT);
    this.exit = { x: (exCx + 0.5) * TILE, y: (exCy + 0.5) * TILE };
    this.exitFacing = "down";
  }

  // Upper floor: landing (down-stairs) + hallway to two bedrooms and a bathroom.
  _houseUpper() {
    const { bx, by, x1, y1 } = this._houseShell(26, 20);
    const vx = bx + 14, hy = by + 10;
    // A hallway runs along the left of the building; rooms open off it.
    for (let y = by + 1; y <= y1 - 1; y++) this._set(vx, y, T.WALL);
    for (let x = vx; x <= x1 - 1; x++) this._set(x, hy, T.WALL);
    // Hallway is the left strip (like living); doors into the two right rooms.
    this._doorway(vx, by + 4);   // hall <-> bedroom 1 (top-right)
    this._doorway(vx + 5, hy);   // bedroom 1 <-> bathroom (bottom-right)
    this._doorway(bx + 10, y1 - 5, { open: false }); // a closet door in the hall (closed)
    this._addWindows(bx, by, x1, y1, null);

    this._fillTint(bx + 1, by + 1, vx - 1, y1 - 1, 4); // landing / hall
    this._fillTint(vx + 1, by + 1, x1 - 1, hy - 1, 1); // bedroom 1 (carpet)
    this._fillTint(vx + 1, hy + 1, x1 - 1, y1 - 1, 2); // bathroom (tile)

    this.rooms = [{ name: "landing", cx: bx + 5, cy: by + 5 }, { name: "bedroom", cx: vx + 5, cy: by + 5 }, { name: "bathroom", cx: vx + 5, cy: hy + 5 }];

    // Down staircase at the top of the landing.
    for (let y = by + 1; y <= by + 4; y++) for (let x = bx + 1; x <= bx + 2; x++) { this._set(x, y, T.STAIRS); this.stairsCells.push({ cx: x, cy: y }); }
    this.landing = { x: (bx + 3 + 0.5) * TILE, y: (by + 3 + 0.5) * TILE }; // arrive here coming up

    // Bedroom & bathroom furniture.
    this._place(vx + 3, by + 3, "bed"); this._place(x1 - 3, by + 7, "shelf");
    this._place(vx + 3, hy + 3, "barrel"); this._place(x1 - 3, y1 - 3, "shelf");
    this._place(bx + 6, y1 - 4, "couch");

    this.loot = [
      { cx: vx + 6, cy: by + 4, kind: "medkit" },
      { cx: vx + 3, cy: hy + 6, kind: "weapon", data: "rifle" },
      { cx: vx + 7, cy: hy + 3, kind: "ammo", data: { type: "rounds", amount: 40 } },
      { cx: bx + 10, cy: y1 - 6, kind: "adrenaline" },
    ];

    this.spawnPoint = { x: this.landing.x, y: this.landing.y + TILE };
    // No setting-exit up here — the way down is the staircase. Point the beacon at it.
    this.exit = { x: (bx + 2 + 0.5) * TILE, y: (by + 2 + 0.5) * TILE };
    this.exitFacing = "up";
  }

  _generate() {
    const { cols, rows } = this;
    this.grid.fill(T.WALL);

    // Carve a grid of rooms connected by corridors.
    const roomsX = randInt(3, 4), roomsY = randInt(3, 4);
    const cellW = Math.floor(cols / roomsX), cellH = Math.floor(rows / roomsY);
    const rooms = [];
    for (let ry = 0; ry < roomsY; ry++) {
      for (let rx = 0; rx < roomsX; rx++) {
        const pad = 1;
        const rw = randInt(cellW - 5, cellW - pad - 2);
        const rh = randInt(cellH - 5, cellH - pad - 2);
        const x0 = rx * cellW + randInt(1, Math.max(1, cellW - rw - 1));
        const y0 = ry * cellH + randInt(1, Math.max(1, cellH - rh - 1));
        for (let y = y0; y < y0 + rh; y++)
          for (let x = x0; x < x0 + rw; x++) this._set(x, y, T.FLOOR);
        rooms.push({ x0, y0, rw, rh, cx: x0 + (rw >> 1), cy: y0 + (rh >> 1) });
      }
    }

    // Connect adjacent rooms with corridors + a door at the junction.
    const roomAt = (rx, ry) => rooms[ry * roomsX + rx];
    for (let ry = 0; ry < roomsY; ry++) {
      for (let rx = 0; rx < roomsX; rx++) {
        const a = roomAt(rx, ry);
        if (rx < roomsX - 1) this._corridor(a, roomAt(rx + 1, ry));
        if (ry < roomsY - 1) this._corridor(a, roomAt(rx, ry + 1));
      }
    }

    // Scatter some interior wall props / obstacles inside rooms.
    for (const r of rooms) {
      const blobs = randInt(0, 2);
      for (let b = 0; b < blobs; b++) {
        const px = randInt(r.x0 + 1, r.x0 + r.rw - 2);
        const py = randInt(r.y0 + 1, r.y0 + r.rh - 2);
        if (this.tileAt(px, py) === T.FLOOR && chance(0.6)) this._set(px, py, T.PROP);
      }
    }

    // Furniture the player can shoot / smash and zombies can knock over.
    this._placeFurniture(rooms);

    // Player starts at first room centre; exit at the farthest room.
    const first = rooms[0];
    this.spawnPoint = { x: (first.cx + 0.5) * TILE, y: (first.cy + 0.5) * TILE };
    let far = rooms[0], best = -1;
    for (const r of rooms) {
      const d = Math.abs(r.cx - first.cx) + Math.abs(r.cy - first.cy);
      if (d > best) { best = d; far = r; }
    }
    this._set(far.cx, far.cy, T.EXIT);
    this.exit = { x: (far.cx + 0.5) * TILE, y: (far.cy + 0.5) * TILE };
    // Face the exit doorway toward the nearest map border (leads "outside").
    const distToBorder = { up: far.cy, down: this.rows - 1 - far.cy, left: far.cx, right: this.cols - 1 - far.cx };
    this.exitFacing = Object.entries(distToBorder).sort((a, b) => a[1] - b[1])[0][0];
    this.rooms = rooms;
    // Keep no furniture on the spawn or exit tiles.
    this.furniture = this.furniture.filter((f) =>
      !(f.cx === first.cx && f.cy === first.cy) && !(f.cx === far.cx && f.cy === far.cy));
  }

  _placeFurniture(rooms) {
    const TYPES = {
      crate:  { hw: 10, hh: 10, hp: 40 },
      table:  { hw: 13, hh: 9,  hp: 55 },
      chair:  { hw: 7,  hh: 7,  hp: 22 },
      barrel: { hw: 8,  hh: 8,  hp: 48 },
      shelf:  { hw: 13, hh: 7,  hp: 60 },
      couch:  { hw: 15, hh: 9,  hp: 72 },
    };
    const kinds = Object.keys(TYPES);
    this.furniture = [];
    const used = new Set();
    for (const r of rooms) {
      const n = randInt(1, 4);
      for (let i = 0; i < n; i++) {
        const cx = randInt(r.x0 + 1, r.x0 + r.rw - 2);
        const cy = randInt(r.y0 + 1, r.y0 + r.rh - 2);
        const key = cx + "," + cy;
        if (used.has(key) || this.tileAt(cx, cy) !== T.FLOOR) continue;
        used.add(key);
        const type = pick(kinds);
        const def = TYPES[type];
        this.furniture.push({
          cx, cy, x: (cx + 0.5) * TILE, y: (cy + 0.5) * TILE,
          hw: def.hw, hh: def.hh, type, hp: def.hp, maxHp: def.hp,
          broken: false, overturned: false, angle: rand(-0.15, 0.15),
        });
      }
    }
  }

  furnitureAt(x, y) {
    for (const f of this.furniture) {
      if (f.broken) continue;
      if (Math.abs(x - f.x) <= f.hw && Math.abs(y - f.y) <= f.hh) return f;
    }
    return null;
  }

  _corridor(a, b) {
    let x = a.cx, y = a.cy;
    const midX = b.cx, midY = b.cy;
    let doorPlaced = false;
    const carve = (cx, cy) => {
      if (this.tileAt(cx, cy) === T.WALL) {
        // Turn a wall we punch through between rooms into a door once.
        if (!doorPlaced && this._borderline(cx, cy)) {
          this._set(cx, cy, T.DOOR);
          // Doors start open so the map is connected; the player can shut them for chokepoints.
          this.doors.push({ cx, cy, open: true, openT: 1 });
          doorPlaced = true;
        } else {
          this._set(cx, cy, T.FLOOR);
        }
      }
    };
    while (x !== midX) { x += Math.sign(midX - x); carve(x, y); }
    while (y !== midY) { y += Math.sign(midY - y); carve(x, y); }
  }

  _borderline(cx, cy) {
    // Heuristic: a spot flanked by walls on the perpendicular axis reads like a doorway.
    const h = this.tileAt(cx - 1, cy) === T.WALL && this.tileAt(cx + 1, cy) === T.WALL;
    const v = this.tileAt(cx, cy - 1) === T.WALL && this.tileAt(cx, cy + 1) === T.WALL;
    return h || v;
  }

  doorAt(cx, cy) { return this.doors.find((d) => d.cx === cx && d.cy === cy); }

  // Is a world-space point blocked for an entity of radius r?
  solidAt(x, y) {
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    const t = this.tileAt(cx, cy);
    if (t === T.WALL || t === T.PROP || t === T.WINDOW) return true;
    if (t === T.DOOR) return !this.doorPassable(this.doorAt(cx, cy));
    return this.furnitureAt(x, y) != null;
  }

  // Circle-vs-tile resolution. throughWindows lets zombies climb through windows.
  collide(x, y, r, throughWindows) {
    let nx = x, ny = y;
    for (let i = 0; i < 3; i++) {
      const cx = Math.floor(nx / TILE), cy = Math.floor(ny / TILE);
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          if (!this._tileSolid(gx, gy, throughWindows)) continue;
          const tx0 = gx * TILE, ty0 = gy * TILE;
          const closestX = clamp(nx, tx0, tx0 + TILE);
          const closestY = clamp(ny, ty0, ty0 + TILE);
          const dx = nx - closestX, dy = ny - closestY;
          const d2 = dx * dx + dy * dy;
          if (d2 < r * r && d2 > 0.0001) {
            const d = Math.sqrt(d2);
            const push = (r - d) / d;
            nx += dx * push;
            ny += dy * push;
          } else if (d2 <= 0.0001) {
            // centre inside tile: shove out along smallest axis
            nx = closestX + (nx < tx0 + TILE / 2 ? -r : r);
          }
        }
      }
      // Push out of intact furniture (circle vs AABB).
      for (const f of this.furniture) {
        if (f.broken) continue;
        const closestX = clamp(nx, f.x - f.hw, f.x + f.hw);
        const closestY = clamp(ny, f.y - f.hh, f.y + f.hh);
        const dx = nx - closestX, dy = ny - closestY;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r && d2 > 0.0001) {
          const d = Math.sqrt(d2), push = (r - d) / d;
          nx += dx * push; ny += dy * push;
        } else if (d2 <= 0.0001) {
          // centre inside: eject along the nearest edge
          const toL = nx - (f.x - f.hw), toR = (f.x + f.hw) - nx;
          const toT = ny - (f.y - f.hh), toB = (f.y + f.hh) - ny;
          const m = Math.min(toL, toR, toT, toB);
          if (m === toL) nx = f.x - f.hw - r; else if (m === toR) nx = f.x + f.hw + r;
          else if (m === toT) ny = f.y - f.hh - r; else ny = f.y + f.hh + r;
        }
      }
    }
    return { x: nx, y: ny };
  }

  _tileSolid(cx, cy, throughWindows) {
    const t = this.tileAt(cx, cy);
    if (t === T.WALL || t === T.PROP) return true;
    if (t === T.WINDOW) return !throughWindows; // zombies climb through windows
    if (t === T.DOOR) return !this.doorPassable(this.doorAt(cx, cy));
    return false;
  }

  // Blocks bullets? (closed doors & walls do; open doors don't)
  blocksShot(x, y) { return this.solidAt(x, y); }

  // Clear line of sight between two world-space points?
  lineClear(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.ceil(Math.hypot(dx, dy) / (TILE / 2));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.solidAt(x0 + dx * t, y0 + dy * t)) return false;
    }
    return true;
  }

  passableTile(cx, cy) {
    const t = this.tileAt(cx, cy);
    if (t === T.WALL || t === T.PROP) return false;
    if (t === T.DOOR) return this.doorPassable(this.doorAt(cx, cy)); // locked doors block pathing
    // Windows & stairs are passable to the pathing flow (zombies climb / ascend).
    for (const f of this.furniture) if (!f.broken && f.cx === cx && f.cy === cy) return false;
    return true;
  }

  // Smash a window into an open gap (bullets or a climbing zombie).
  breakWindow(cx, cy) {
    if (this.tileAt(cx, cy) !== T.WINDOW) return false;
    this._set(cx, cy, T.FLOOR);
    return true;
  }

  update(dt) {
    for (const d of this.doors) {
      d.openT = clamp(d.openT + (d.open ? dt * 4 : -dt * 4), 0, 1);
    }
  }

  tryOpenDoorNear(x, y) {
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        const d = this.doorAt(gx, gy);
        if (d) { d.open = !d.open; return true; }
      }
    }
    return false;
  }

  // Pick a random floor tile far enough from a point (for enemy spawns).
  randomFloorFar(px, py, minDist) {
    for (let tries = 0; tries < 60; tries++) {
      const cx = randInt(1, this.cols - 2), cy = randInt(1, this.rows - 2);
      if (this.tileAt(cx, cy) !== T.FLOOR) continue;
      const wx = (cx + 0.5) * TILE, wy = (cy + 0.5) * TILE;
      if (Math.hypot(wx - px, wy - py) >= minDist) return { x: wx, y: wy };
    }
    return null;
  }

  randomFloor() {
    for (let tries = 0; tries < 80; tries++) {
      const cx = randInt(1, this.cols - 2), cy = randInt(1, this.rows - 2);
      if (this.tileAt(cx, cy) === T.FLOOR) return { x: (cx + 0.5) * TILE, y: (cy + 0.5) * TILE };
    }
    return { x: this.spawnPoint.x, y: this.spawnPoint.y };
  }
}
