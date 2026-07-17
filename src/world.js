// World / level generation. Tile-based maps with walls, doors, floors and an exit.
import { randInt, rand, chance, pick, clamp } from "./util.js";

export const TILE = 32;
export const T = { FLOOR: 0, WALL: 1, DOOR: 2, EXIT: 3, PROP: 4, WINDOW: 5, STAIRS: 6, FENCE: 7, MANHOLE: 8 };

export const SETTINGS = [
  { id: "house", name: "The House", floor: "#4a3b2a", floor2: "#523f2c", wall: "#6a5340", wallTop: "#8a6d50", accent: "#4a3d2c" },
  { id: "streets", name: "The Streets", floor: "#2a2d24", floor2: "#31352b", wall: "#4a4034", wallTop: "#5c5142", accent: "#3a3d30" },
  { id: "mall", name: "Abandoned Mall", floor: "#3a3540", floor2: "#423c48", wall: "#5a4a60", wallTop: "#6e5a76", accent: "#4a4252" },
  { id: "hospital", name: "St. Mercy Hospital", floor: "#28343a", floor2: "#2e3c43", wall: "#3a5058", wallTop: "#48626c", accent: "#324248" },
  { id: "forest", name: "Blackpine Woods", floor: "#1f2a1c", floor2: "#243021", wall: "#2c3a22", wallTop: "#38492c", accent: "#26331e" },
  { id: "city", name: "Downtown", floor: "#26282d", floor2: "#2c2f34", wall: "#474b53", wallTop: "#5c616b", accent: "#383c43" },
  { id: "airport", name: "Ashford Airport", floor: "#3a3d42", floor2: "#40434a", wall: "#565b63", wallTop: "#6b7178", accent: "#44484f" },
];

// Per-room floor colours (checker pairs), keyed by floorTint value.
export const ROOM_FLOOR = {
  0: ["#22381b", "#284020"], // yard / grass
  1: ["#6a4f3c", "#725643"], // carpet (living room, bedroom)
  2: ["#3b4147", "#42484f"], // ceramic tile (kitchen, bathroom)
  3: ["#6b4e30", "#755636"], // hardwood planks (dining)
  4: ["#464a4e", "#4d5155"], // poured cement (landing / hall)
  5: ["#6e4133", "#764636"], // brick (foyer / hearth)
};

// The surfacing material for each ROOM_FLOOR id — drives the floor texture
// (plank seams, grout, mortar courses, carpet fleck) drawn over the checker.
export const FLOOR_MAT = {
  0: "grass",
  1: "carpet",
  2: "tile",
  3: "wood",
  4: "cement",
  5: "brick",
};

// Outdoor "streets" terrain colours (checker pairs), keyed by floorTint value.
export const STREET_TERRAIN = {
  0: ["#2e3a24", "#334026"], // grass (fallback)
  1: ["#2e3a24", "#334026"], // yard / grass
  2: ["#26262b", "#2b2b31"], // road asphalt
  3: ["#4c4e4a", "#525450"], // sidewalk concrete
  4: ["#4a3d29", "#524331"], // dirt driveway
  5: ["#26262b", "#2b2b31"], // vertical road centre-line
  6: ["#26262b", "#2b2b31"], // horizontal road centre-line
  7: ["#7a6838", "#847043"], // playground sand
};

// Furniture you can shove around, and how heavy each type is (higher = stiffer).
const MOVABLE = new Set(["table", "chair", "couch", "dresser"]);
const FURN_MASS = { chair: 0.25, table: 0.35, couch: 0.68, dresser: 0.85 };

// Downtown city terrain colours (checker pairs), keyed by floorTint value.
// Shares ids 2/3/5/6 with the streets (asphalt, sidewalk, road centre-lines)
// so the road-line renderer works for both.
export const CITY_TERRAIN = {
  0: ["#2a2d24", "#30342a"], // fallback
  1: ["#2a2d24", "#30342a"], // scrubby lot
  2: ["#26262b", "#2b2b31"], // road asphalt
  3: ["#54565a", "#5a5c60"], // sidewalk concrete
  4: ["#3a3d42", "#40434a"], // plaza pavers
  5: ["#26262b", "#2b2b31"], // vertical road centre-line
  6: ["#26262b", "#2b2b31"], // horizontal road centre-line
  7: ["#3f4247", "#45484e"], // parking-deck concrete
  8: ["#4a4d52", "#50535a"], // painted parking stall
  9: ["#5a5c60", "#606268"], // crosswalk / lobby tile
};

// Ashford Airport terrain colours (checker pairs), keyed by floorTint value.
export const AIRPORT_TERRAIN = {
  0: ["#3a4a2a", "#41522f"], // airfield grass
  1: ["#3a4a2a", "#41522f"], // grass
  2: ["#2a2d33", "#2f333a"], // runway / taxiway asphalt
  3: ["#494d55", "#4f535b"], // apron / tarmac concrete
  4: ["#2a2d33", "#2f333a"], // runway centre (asphalt; dashes drawn over)
  5: ["#54585f", "#5b5f67"], // terminal tile
  6: ["#2a2d33", "#2f333a"], // taxi line base (yellow drawn over)
  7: ["#2a2d33", "#2f333a"], // runway edge stripe base (white line drawn over)
};

// Blackpine Woods terrain colours (checker pairs), keyed by floorTint value.
export const FOREST_TERRAIN = {
  0: ["#1f2e1a", "#243620"], // mossy forest floor
  1: ["#1f2e1a", "#243620"], // grass / clearing
  2: ["#3a2e1c", "#43361f"], // dirt trail
  3: ["#1a333c", "#204049"], // river / stream water (deep)
  4: ["#33373c", "#3a3e44"], // cave stone floor
  5: ["#2a3a2c", "#314331"], // muddy grassy bank
};

// Sewer tunnel terrain — murky water over concrete.
export const SEWER_TERRAIN = {
  0: ["#1c2a26", "#213330"], // shallow channel water
  1: ["#2a2f30", "#30383a"], // dry ledge
  2: ["#132420", "#173028"], // deep flowing water (conceals what's in it)
};

export class World {
  constructor(settingIndex = 0, floorLevel = 0) {
    this.setting = SETTINGS[settingIndex % SETTINGS.length];
    this.settingIndex = settingIndex;
    this.isHouse = this.setting.id === "house";
    this.isStreets = this.setting.id === "streets";
    this.isCity = this.setting.id === "city";
    this.isForest = this.setting.id === "forest";
    this.isAirport = this.setting.id === "airport";
    this.isSewers = this.isStreets && floorLevel === 1; // sewer maze beneath the streets
    this.floorLevel = floorLevel; // 0 = ground/street, 1 = upstairs/sewers
    this.cols = this.isHouse ? 40 : this.isStreets ? 48 : this.isCity ? 54 : this.isForest ? 66 : this.isAirport ? 72 : randInt(40, 52);
    this.rows = this.isHouse ? 38 : this.isStreets ? 46 : this.isCity ? 52 : this.isForest ? 62 : this.isAirport ? 56 : randInt(40, 52);
    this.grid = new Uint8Array(this.cols * this.rows);
    this.explored = new Uint8Array(this.cols * this.rows); // fog-of-war memory
    this.floorTint = new Uint8Array(this.cols * this.rows); // per-tile room colour id
    this.doors = []; // {cx, cy, open, openT, locked, hp, maxHp, broken}
    this.props = []; // decorative, non-blocking-ish
    this.rugs = []; // decorative floor rugs (tile-rects drawn over the floor)
    this.decor = []; // static ground clutter: grime, debris, trash, garbage piles
    this.lamps = []; // light sources that cast a (flickering) warm glow
    this.ambient = 0; // baseline darkness veil for this floor (0 = daylight)
    this.furniture = []; // smashable / knock-over objects
    this.rooms = [];
    this.stairsCells = []; // tiles that move the player between floors
    this.manholes = [];    // street manhole cells (down into the sewers)
    this.ladders = [];     // sewer ladder cells (up to the street)
    this.landing = null;   // where the player arrives on this floor
    this.exit = { x: 0, y: 0 };
    this.exitFacing = "up";
    this.spawnPoint = { x: 0, y: 0 };
    if (this.isHouse) { if (floorLevel === 1) this._houseUpper(); else this._houseGround(); }
    else if (this.isStreets) { if (floorLevel === 1) this._sewers(); else this._streets(); }
    else if (this.isCity) this._city();
    else if (this.isForest) this._forest();
    else if (this.isAirport) this._airport();
    else this._generate();
    this._decorate();
  }

  // Sprinkle static atmosphere across the floor: floor grime, scattered debris,
  // trash, and heavier garbage piles; set the ambient darkness and lamp glows.
  _decorate() {
    const area = this.cols * this.rows;
    const R = (a, b) => rand(a, b);
    const cellFloor = () => { const p = this.randomFloor(); return p; };
    // How much clutter, and how dark, depends on the setting.
    let grime, debris, trash, garbage;
    if (this.isSewers) { this.ambient = 0.52; grime = area * 0.05; debris = area * 0.03; trash = area * 0.02; garbage = area * 0.006; }
    else if (this.isHouse) { this.ambient = 0.30; grime = area * 0.035; debris = area * 0.02; trash = area * 0.014; garbage = area * 0.003; }
    else if (this.isCity) { this.ambient = 0.14; grime = area * 0.03; debris = area * 0.028; trash = area * 0.024; garbage = area * 0.007; } // downtown: littered, dusk-lit
    else if (this.isForest) { this.ambient = 0.34; grime = area * 0.02; debris = area * 0.03; trash = area * 0.004; garbage = area * 0.001; } // woods: shady canopy, leaf litter
    else if (this.isAirport) { this.ambient = 0.12; grime = area * 0.02; debris = area * 0.022; trash = area * 0.012; garbage = area * 0.003; } // airfield: dusk, wind-blown litter
    else { this.ambient = 0.06; grime = area * 0.02; debris = area * 0.02; trash = area * 0.016; garbage = area * 0.004; } // streets: near-daylight
    const push = (kind, extra) => { const p = cellFloor(); if (p) this.decor.push({ x: p.x + R(-12, 12), y: p.y + R(-12, 12), kind, seed: (Math.random() * 1e9) | 0, rot: R(-Math.PI, Math.PI), ...extra }); };
    for (let i = 0; i < grime; i++) push("grime", { r: R(6, 16), tone: pick(["#171a12", "#1c160f", "#141414", "#181c1e"]) });
    for (let i = 0; i < debris; i++) push("debris");
    for (let i = 0; i < trash; i++) push("trash");
    for (let i = 0; i < garbage; i++) push("garbage");
    // Tufts of grass, ferns and fallen leaves carpet the woods (and a lighter
    // scatter of weeds greens up the airfield infield).
    if (this.isForest) for (let i = 0; i < area * 0.09; i++) push("grass", { tone: pick(["#2e4a24", "#35521f", "#3c5a2a", "#436327"]) });
    else if (this.isAirport) for (let i = 0; i < area * 0.03; i++) push("grass", { tone: pick(["#3a4a28", "#42502c", "#48582f"]) });

    // Light sources. Interiors get flickery ceiling lamps; sewers a few grimy
    // bulbs; streets stay lit by daylight (no lamps, tiny ambient).
    if (this.isHouse) {
      for (const rm of this.rooms) this.lamps.push({ x: (rm.cx + 0.5) * TILE, y: (rm.cy + 0.5) * TILE, r: R(150, 190), warm: "#ffd9a0", flick: R(0.6, 1), phase: R(0, 6.28) });
    } else if (this.isSewers) {
      for (let i = 0; i < 5; i++) { const p = this.randomFloor(); if (p) this.lamps.push({ x: p.x, y: p.y, r: R(90, 130), warm: "#c8d8a0", flick: R(0.3, 0.8), phase: R(0, 6.28) }); }
    }
  }

  // Floor checker-pair for a tile, tinted by terrain (house rooms / streets / sewers).
  floorPair(cx, cy) {
    if (!this.isHouse && !this.isStreets && !this.isCity && !this.isForest && !this.isAirport) return null;
    const id = this.floorTint[this.idx(cx, cy)];
    const pal = this.isSewers ? SEWER_TERRAIN : this.isHouse ? ROOM_FLOOR : this.isCity ? CITY_TERRAIN : this.isForest ? FOREST_TERRAIN : this.isAirport ? AIRPORT_TERRAIN : STREET_TERRAIN;
    return pal[id] || pal[0];
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

  // Furniture whose intact AABB the segment (ax,ay)->(bx,by) crosses. With
  // skipLow, low pieces (tables/chairs/couches) are ignored so bullets fly over
  // them — only tall cover (shelves, crates, barrels, cars, bushes) stops rounds.
  furnitureHitBySegment(ax, ay, bx, by, skipLow) {
    const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 4));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const f = this.furnitureAt(ax + (bx - ax) * t, ay + (by - ay) * t);
      if (f && !(skipLow && f.low)) return f;
    }
    return null;
  }

  // Low furniture you can shoot over (still blocks movement).
  _isLowFurniture(type) { return type === "table" || type === "chair" || type === "couch" || type === "bench" || type === "bed" || type === "rock" || type === "log" || type === "bush" || type === "shrub"; }

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
    const F = { crate: [10, 10, 40], table: [13, 9, 55], chair: [7, 7, 22], barrel: [8, 8, 48], shelf: [13, 7, 60], couch: [15, 9, 72], bed: [13, 9, 60], dresser: [12, 8, 80], swings: [15, 6, 140], slide: [10, 9, 120], seesaw: [13, 4, 60] };
    const d = F[type] || F.crate;
    const ft = type === "bed" ? "couch" : type;
    const f = { cx, cy, x: (cx + 0.5) * TILE, y: (cy + 0.5) * TILE, hw: d[0], hh: d[1], type: ft, hp: d[2], maxHp: d[2], broken: false, overturned: false, angle: rand(-0.05, 0.05), low: this._isLowFurniture(ft), movable: MOVABLE.has(ft), mass: FURN_MASS[ft] || 1, vx: 0, vy: 0 };
    // Some pieces are already wrecked when you arrive — smashed or tipped over.
    if (ft !== "swings" && ft !== "slide" && ft !== "seesaw" && chance(0.16)) { f.broken = true; f.overturned = chance(0.5); f.hp = 0; f.angle = rand(-0.6, 0.6); }
    this.furniture.push(f);
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

    this._fillTint(bx + 1, by + 1, vx - 1, y1 - 1, 1); // living (carpet)
    this._fillTint(vx + 1, by + 1, x1 - 1, hy - 1, 2); // kitchen (tile)
    this._fillTint(vx + 1, hy + 1, x1 - 1, y1 - 1, 3); // dining (hardwood)
    this._fillTint(fdx - 1, y1 - 2, fdx + 1, y1 - 1, 5); // brick foyer inside the front door

    // Area rugs over the carpet/wood.
    this.rugs = [
      { x0: bx + 4, y0: y1 - 7, x1: bx + 10, y1: y1 - 2, style: "persian" },
      { x0: vx + 3, y0: hy + 2, x1: vx + 9, y1: hy + 8, style: "modern" },
    ];

    this.rooms = [{ name: "living", cx: bx + 7, cy: by + 10 }, { name: "kitchen", cx: vx + 5, cy: by + 5 }, { name: "dining", cx: vx + 5, cy: hy + 5 }];

    // Staircase up, in the living room's top corner.
    for (let y = by + 1; y <= by + 4; y++) for (let x = bx + 1; x <= bx + 2; x++) { this._set(x, y, T.STAIRS); this.stairsCells.push({ cx: x, cy: y }); }
    this.landing = { x: (bx + 3 + 0.5) * TILE, y: (by + 3 + 0.5) * TILE }; // arrive here coming down

    // Furniture.
    this._place(bx + 6, y1 - 3, "couch"); this._place(bx + 9, y1 - 6, "table"); this._place(bx + 4, by + 8, "shelf");
    this._place(bx + 2, y1 - 3, "dresser"); this._place(bx + 10, y1 - 3, "chair");
    this._place(x1 - 2, by + 2, "shelf"); this._place(x1 - 5, by + 2, "shelf"); this._place(vx + 2, by + 5, "barrel");
    this._place(vx + 6, hy + 5, "table"); this._place(vx + 4, hy + 5, "chair"); this._place(vx + 8, hy + 5, "chair");
    this._place(vx + 6, hy + 3, "chair"); this._place(vx + 6, hy + 7, "chair");

    // Loot hints (game turns these into pickups): key in living, axe in kitchen, reward in the locked dining room.
    this.loot = [
      { cx: bx + 4, cy: by + 12, kind: "key" },
      { cx: vx + 3, cy: by + 3, kind: "weapon", data: "axe" },
      { cx: vx + 8, cy: hy + 7, kind: "weapon", data: "shotgun" },
      { cx: vx + 4, cy: hy + 8, kind: "ammo", data: { type: "shells", amount: 16 } },
      { cx: bx + 9, cy: by + 7, kind: "helmet", data: { value: 25, max: 30 } },
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

    this._fillTint(bx + 1, by + 1, vx - 1, y1 - 1, 4); // landing / hall (cement)
    this._fillTint(vx + 1, by + 1, x1 - 1, hy - 1, 1); // bedroom 1 (carpet)
    this._fillTint(vx + 1, hy + 1, x1 - 1, y1 - 1, 2); // bathroom (tile)

    // A hall runner down the cement landing and a rug beside the bed.
    this.rugs = [
      { x0: bx + 4, y0: by + 6, x1: bx + 6, y1: y1 - 3, style: "runner" },
      { x0: vx + 4, y0: by + 4, x1: x1 - 2, y1: by + 8, style: "persian" },
    ];

    this.rooms = [{ name: "landing", cx: bx + 5, cy: by + 5 }, { name: "bedroom", cx: vx + 5, cy: by + 5 }, { name: "bathroom", cx: vx + 5, cy: hy + 5 }];

    // Down staircase at the top of the landing.
    for (let y = by + 1; y <= by + 4; y++) for (let x = bx + 1; x <= bx + 2; x++) { this._set(x, y, T.STAIRS); this.stairsCells.push({ cx: x, cy: y }); }
    this.landing = { x: (bx + 3 + 0.5) * TILE, y: (by + 3 + 0.5) * TILE }; // arrive here coming up

    // Bedroom & bathroom furniture.
    this._place(vx + 3, by + 3, "bed"); this._place(x1 - 3, by + 7, "shelf");
    this._place(x1 - 2, by + 3, "dresser"); this._place(vx + 7, by + 6, "dresser");
    this._place(vx + 3, hy + 3, "barrel"); this._place(x1 - 3, y1 - 3, "shelf");
    this._place(bx + 6, y1 - 4, "couch"); this._place(bx + 3, y1 - 6, "table");

    this.loot = [
      { cx: vx + 6, cy: by + 4, kind: "medkit" },
      { cx: vx + 3, cy: hy + 6, kind: "weapon", data: "rifle" },
      { cx: vx + 7, cy: hy + 3, kind: "ammo", data: { type: "rounds", amount: 40 } },
      { cx: bx + 10, cy: y1 - 6, kind: "adrenaline" },
      { cx: vx + 5, cy: by + 6, kind: "armor", data: { value: 40, max: 50 } },
    ];

    this.spawnPoint = { x: this.landing.x, y: this.landing.y + TILE };
    // No setting-exit up here — the way down is the staircase. Point the beacon at it.
    this.exit = { x: (bx + 2 + 0.5) * TILE, y: (by + 2 + 0.5) * TILE };
    this.exitFacing = "up";
  }

  // A free-standing obstacle placed at world coords (vehicles, benches...).
  _furn(x, y, type, hw, hh, hp, angle = 0) {
    this.furniture.push({
      cx: Math.floor(x / TILE), cy: Math.floor(y / TILE), x, y, hw, hh, type,
      hp, maxHp: hp, broken: false, overturned: false, angle, low: this._isLowFurniture(type),
      movable: MOVABLE.has(type), mass: FURN_MASS[type] || 1, vx: 0, vy: 0,
    });
  }

  // The Streets: an outdoor neighbourhood — a grid of roads & sidewalks with
  // fenced yards, houses, sheds, parked cars/trucks, trees and small parks.
  _streets() {
    const cols = this.cols, rows = this.rows;
    this.grid.fill(T.FLOOR);
    this.floorTint.fill(1); // grass everywhere by default
    this.furniture = [];
    this.rooms = [];
    // Hedge border around the whole block.
    for (let x = 0; x < cols; x++) { this._set(x, 0, T.WALL); this._set(x, rows - 1, T.WALL); }
    for (let y = 0; y < rows; y++) { this._set(0, y, T.WALL); this._set(cols - 1, y, T.WALL); }

    const vC = [9, 24, 39];  // vertical-road centre columns
    const hC = [11, 23, 35]; // horizontal-road centre rows
    const inRoadV = (x) => vC.some((c) => Math.abs(x - c) <= 1);
    const inRoadH = (y) => hC.some((c) => Math.abs(y - c) <= 1);

    // Lay the asphalt, centre-lines and flanking sidewalks.
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const rv = inRoadV(x), rh = inRoadH(y);
        if (rv || rh) {
          let tint = 2;
          if (rv && vC.includes(x) && !rh) tint = 5;      // vertical centre-line
          else if (rh && hC.includes(y) && !rv) tint = 6; // horizontal centre-line
          this._tint(x, y, tint);
        } else if (inRoadV(x - 1) || inRoadV(x + 1) || inRoadH(y - 1) || inRoadH(y + 1)) {
          this._tint(x, y, 3); // sidewalk hugging the kerb
        }
      }
    }

    // Blocks are the gaps between the road+sidewalk bands.
    const xB = [[1, 6], [12, 21], [26, 36], [41, 46]];
    const yB = [[1, 8], [14, 20], [26, 32], [38, 44]];
    this._homeSpawn = null;
    for (let bi = 0; bi < xB.length; bi++) {
      for (let bj = 0; bj < yB.length; bj++) {
        const opts = {};
        if (bi === 1 && bj === 1) opts.home = true; // start in this house's front yard
        if (bi === 2 && bj === 2) opts.park = true; // a neighbourhood park w/ playground
        this._streetBlock(xB[bi][0], yB[bj][0], xB[bi][1], yB[bj][1], opts);
      }
    }

    // Parked cars & trucks along the kerbs.
    const laneSpots = [];
    for (const c of vC) for (let y = 3; y < rows - 3; y += 5) laneSpots.push({ x: c + 1, y, vert: true });
    for (const c of hC) for (let x = 4; x < cols - 4; x += 6) laneSpots.push({ x, y: c + 1, vert: false });
    for (const s of laneSpots) {
      if (!chance(0.32)) continue;
      if (this.tileAt(s.x, s.y) !== T.FLOOR) continue;
      const truck = chance(0.35);
      const wx = (s.x + 0.5) * TILE, wy = (s.y + 0.5) * TILE;
      const L = truck ? 30 : 22, W = truck ? 13 : 11;
      this._furn(wx, wy, truck ? "truck" : "car", s.vert ? W : L, s.vert ? L : W, truck ? 220 : 160);
      this.furniture[this.furniture.length - 1].burning = chance(0.22); // some are ablaze
    }

    // Open manholes at four intersections drop into the sewers below.
    const holeCells = [[vC[0], hC[0]], [vC[2], hC[0]], [vC[0], hC[2]], [vC[2], hC[2]]];
    for (const [hx, hy] of holeCells) { this._set(hx, hy, T.MANHOLE); this.manholes.push({ cx: hx, cy: hy }); }

    // Player starts in their house's front yard (falling back to the central
    // intersection); the exit road runs off the bottom of the map.
    this.spawnPoint = this._homeSpawn || { x: (vC[1] + 0.5) * TILE, y: (hC[1] + 0.5) * TILE };
    const exCx = vC[1];
    this._set(exCx, rows - 1, T.EXIT); this._tint(exCx, rows - 1, 2);
    this._set(exCx - 1, rows - 1, T.FLOOR); this._tint(exCx - 1, rows - 1, 2);
    this._set(exCx + 1, rows - 1, T.FLOOR); this._tint(exCx + 1, rows - 1, 2);
    this.exit = { x: (exCx + 0.5) * TILE, y: (rows - 1 + 0.5) * TILE };
    this.exitFacing = "down";
  }

  // Furnish one neighbourhood block: a fenced yard with a house (or a park /
  // empty lot), a driveway, maybe a shed, and some trees.
  _streetBlock(x0, y0, x1, y1, opts) {
    opts = opts || {};
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const roll = Math.random();
    const treeAt = (cx, cy) => { if (this.tileAt(cx, cy) === T.FLOOR && this.floorTint[this.idx(cx, cy)] === 1) this._set(cx, cy, T.PROP); };

    // A dedicated park with a playground.
    if (opts.park) { this._buildPark(x0, y0, x1, y1); return; }

    // Small lots become parks / empty lots: open grass with trees (and a bench).
    if (!opts.home && (w < 5 || h < 5 || roll < 0.22)) {
      const trees = randInt(2, 5);
      for (let i = 0; i < trees; i++) treeAt(randInt(x0, x1), randInt(y0, y1));
      if (w >= 4 && h >= 4 && chance(0.5)) this._furn((x0 + 1.5) * TILE, (y0 + 1.5) * TILE, "bench", 12, 5, 40);
      return;
    }

    // Fence the yard perimeter, leaving a gate gap on the bottom edge.
    const gate = Math.floor((x0 + x1) / 2);
    for (let x = x0; x <= x1; x++) {
      if (this.tileAt(x, y0) === T.FLOOR) this._set(x, y0, T.FENCE);
      if (x !== gate && x !== gate + 1 && this.tileAt(x, y1) === T.FLOOR) this._set(x, y1, T.FENCE);
    }
    for (let y = y0; y <= y1; y++) {
      if (this.tileAt(x0, y) === T.FLOOR) this._set(x0, y, T.FENCE);
      if (this.tileAt(x1, y) === T.FLOOR) this._set(x1, y, T.FENCE);
    }

    // The house occupies the back of the lot; front yard faces the gate.
    const hx0 = x0 + 1, hx1 = x1 - 1, hy0 = y0 + 1, hy1 = y1 - 3;
    const roof = chance(0.5) ? 10 : 11;
    if (hy1 >= hy0 && hx1 >= hx0) {
      for (let y = hy0; y <= hy1; y++) for (let x = hx0; x <= hx1; x++) { this._set(x, y, T.WALL); this._tint(x, y, roof); }
    }

    // Driveway (dirt) from the gate up toward the house front.
    for (let y = y1 - 1; y > hy1; y--) { if (this.tileAt(gate, y) === T.FLOOR) this._tint(gate, y, 4); }

    // A shed in a back corner of some yards.
    if (chance(0.5) && hy1 - 1 >= hy0) {
      const sx = chance(0.5) ? hx0 : hx1 - 1;
      const sy = hy1 + 1;
      if (sy < y1 && this.tileAt(sx, sy) === T.FLOOR) {
        for (let yy = sy; yy <= Math.min(sy + 1, y1 - 1); yy++) for (let xx = sx; xx <= Math.min(sx + 1, x1 - 1); xx++) {
          if (this.tileAt(xx, yy) === T.FLOOR) { this._set(xx, yy, T.WALL); this._tint(xx, yy, 12); }
        }
      }
    }

    // A parked car on the driveway now and then (never on the start home lot).
    if (!opts.home && chance(0.45) && this.tileAt(gate, y1 - 1) === T.FLOOR && this.tileAt(gate, y1 - 2) === T.FLOOR) {
      this._furn((gate + 0.5) * TILE, (y1 - 1 + 0.5) * TILE, chance(0.3) ? "truck" : "car", 11, 20, 160);
    }

    // A tree or two in the front yard, and a shrub by the fence.
    for (let i = 0; i < randInt(0, 2); i++) treeAt(randInt(x0 + 1, x1 - 1), y1 - 1);
    if (chance(0.6)) {
      const bxg = chance(0.5) ? x0 + 1 : x1 - 1, byg = y1 - 1;
      if (this.tileAt(bxg, byg) === T.FLOOR) this._furn((bxg + 0.5) * TILE, (byg + 0.5) * TILE, "bush", 9, 8, 26);
    }

    // Your house: you step out of the front door into this front yard.
    if (opts.home) this._homeSpawn = { x: (gate + 0.5) * TILE, y: (y1 - 1 + 0.5) * TILE };
  }

  // A neighbourhood park: open grass, a sandy playground with swings/slide/
  // seesaw, benches and shade trees.
  _buildPark(x0, y0, x1, y1) {
    const cxm = Math.floor((x0 + x1) / 2), cym = Math.floor((y0 + y1) / 2);
    for (let y = cym - 1; y <= cym + 1; y++) for (let x = cxm - 2; x <= cxm + 2; x++) if (this.tileAt(x, y) === T.FLOOR) this._tint(x, y, 7); // sand
    const putF = (cx, cy, type, hw, hh, hp) => { if (this.tileAt(cx, cy) === T.FLOOR) this._furn((cx + 0.5) * TILE, (cy + 0.5) * TILE, type, hw, hh, hp); };
    putF(cxm - 2, y0 + 2, "swings", 15, 6, 140);
    putF(cxm + 3, cym, "slide", 10, 9, 120);
    putF(cxm, cym + 2, "seesaw", 13, 4, 60);
    putF(x0 + 1, cym, "bench", 12, 5, 40);
    putF(x1 - 1, cym, "bench", 12, 5, 40);
    for (const [tx, ty] of [[x0 + 1, y0 + 1], [x1 - 1, y0 + 1], [x0 + 1, y1 - 1], [x1 - 1, y1 - 1]]) if (this.tileAt(tx, ty) === T.FLOOR) this._set(tx, ty, T.PROP);
    this.rooms.push({ name: "park", cx: cxm, cy: cym });
  }

  // Downtown: a dense city grid of roads & sidewalks between office towers,
  // open parking garages and paved plazas. You fight in the streets, ducking
  // into lobbies and garages for cover.
  _city() {
    const cols = this.cols, rows = this.rows;
    this.grid.fill(T.FLOOR);
    this.floorTint.fill(1); // scrubby lot by default
    this.furniture = [];
    this.rooms = [];
    // Concrete border wall around downtown.
    for (let x = 0; x < cols; x++) { this._set(x, 0, T.WALL); this._set(x, rows - 1, T.WALL); }
    for (let y = 0; y < rows; y++) { this._set(0, y, T.WALL); this._set(cols - 1, y, T.WALL); }

    const vC = [13, 27, 41];  // vertical-road centre columns
    const hC = [13, 26, 39];  // horizontal-road centre rows
    const nearV = (x) => vC.some((c) => Math.abs(x - c) <= 1);
    const nearH = (y) => hC.some((c) => Math.abs(y - c) <= 1);

    // Roads (asphalt + centre lines) flanked by concrete sidewalks.
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const rv = nearV(x), rh = nearH(y);
        if (rv || rh) {
          let tint = 2;
          if (rv && vC.includes(x) && !rh) tint = 5;      // vertical centre-line
          else if (rh && hC.includes(y) && !rv) tint = 6; // horizontal centre-line
          this._tint(x, y, tint);
        } else if (nearV(x - 1) || nearV(x + 1) || nearH(y - 1) || nearH(y + 1)) {
          this._tint(x, y, 3); // sidewalk hugging the kerb
        }
      }
    }
    // Zebra-striped crosswalks flanking each intersection.
    for (const cx of vC) for (const cy of hC) {
      for (let d = -1; d <= 1; d++) { this._tint(cx + d, cy - 2, 9); this._tint(cx + d, cy + 2, 9); this._tint(cx - 2, cy + d, 9); this._tint(cx + 2, cy + d, 9); }
    }

    // The blocks between the road bands; a layout of building types with a
    // central plaza to start in.
    const xB = [[1, 10], [16, 24], [30, 38], [44, cols - 2]];
    const yB = [[1, 10], [16, 23], [29, 36], [42, rows - 2]];
    const layout = [
      ["office", "garage", "office", "plaza"],
      ["plaza",  "office", "garage", "office"],
      ["garage", "office", "office", "garage"],
      ["office", "plaza",  "office", "office"],
    ];
    this._citySpawn = null;
    for (let bi = 0; bi < xB.length; bi++) {
      for (let bj = 0; bj < yB.length; bj++) {
        const [x0, x1] = xB[bi], [y0, y1] = yB[bj];
        const kind = layout[bj][bi];
        if (kind === "garage") this._cityGarage(x0, y0, x1, y1);
        else if (kind === "plaza") this._cityPlaza(x0, y0, x1, y1, bi === 1 && bj === 1);
        else this._cityOffice(x0, y0, x1, y1, bj < 2 ? "down" : "up");
      }
    }

    // Parked cars & trucks along the kerbs.
    const spots = [];
    for (const c of vC) for (let y = 4; y < rows - 4; y += 6) spots.push({ x: c + 2, y, vert: true });
    for (const c of hC) for (let x = 5; x < cols - 5; x += 7) spots.push({ x, y: c + 2, vert: false });
    for (const s of spots) {
      if (!chance(0.35) || this.tileAt(s.x, s.y) !== T.FLOOR) continue;
      const truck = chance(0.3);
      const wx = (s.x + 0.5) * TILE, wy = (s.y + 0.5) * TILE;
      const L = truck ? 30 : 22, W = truck ? 13 : 11;
      this._furn(wx, wy, truck ? "truck" : "car", s.vert ? W : L, s.vert ? L : W, truck ? 220 : 160);
      if (chance(0.16)) this.furniture[this.furniture.length - 1].burning = true; // a few are ablaze
    }

    // Start in the central plaza; the exit road runs off the bottom of the map.
    this.spawnPoint = this._citySpawn || { x: (vC[0] + 0.5) * TILE, y: (hC[0] + 0.5) * TILE };
    const exCx = vC[1];
    this._set(exCx, rows - 1, T.EXIT); this._tint(exCx, rows - 1, 2);
    this._set(exCx - 1, rows - 1, T.FLOOR); this._tint(exCx - 1, rows - 1, 2);
    this._set(exCx + 1, rows - 1, T.FLOOR); this._tint(exCx + 1, rows - 1, 2);
    this.exit = { x: (exCx + 0.5) * TILE, y: (rows - 1 + 0.5) * TILE };
    this.exitFacing = "down";
  }

  // A solid office tower: glass-fronted facade with a ground-floor lobby you can
  // duck into for cover and loot.
  _cityOffice(x0, y0, x1, y1, facing) {
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w < 3 || h < 3) { // too small: a scrubby lot with a planter or two
      for (let i = 0; i < randInt(1, 3); i++) { const px = randInt(x0, x1), py = randInt(y0, y1); if (this.tileAt(px, py) === T.FLOOR) this._set(px, py, T.PROP); }
      return;
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this._set(x, y, T.WALL);
    // Glass facade: windows every other tile around the perimeter.
    const winEdge = (x, y) => { if (this.tileAt(x, y) === T.WALL) this._set(x, y, T.WINDOW); };
    for (let x = x0 + 1; x <= x1 - 1; x += 2) { winEdge(x, y0); winEdge(x, y1); }
    for (let y = y0 + 1; y <= y1 - 1; y += 2) { winEdge(x0, y); winEdge(x1, y); }
    // Carve a lobby into the road-facing side, with a glass door.
    const lobW = Math.min(w - 2, 4), lobH = Math.min(h - 2, 2);
    if (lobW >= 2 && lobH >= 1) {
      const lx0 = x0 + Math.floor((w - lobW) / 2), lx1 = lx0 + lobW - 1;
      const down = facing !== "up";
      const ly0 = down ? y1 - lobH : y0 + 1, ly1 = down ? y1 - 1 : y0 + lobH;
      for (let y = ly0; y <= ly1; y++) for (let x = lx0; x <= lx1; x++) { this._set(x, y, T.FLOOR); this._tint(x, y, 9); }
      const dxg = Math.floor((lx0 + lx1) / 2);
      this._doorway(dxg, down ? y1 : y0); // lobby entrance from the sidewalk
      // Front desk and a shelf of loot inside.
      const dy = down ? ly0 : ly1;
      this._furn((lx0 + 0.5) * TILE, (dy + 0.5) * TILE, "table", 12, 6, 55);
      if (lobW >= 3 && chance(0.6)) this._furn((lx1 + 0.5) * TILE, (dy + 0.5) * TILE, "shelf", 12, 6, 60);
    }
    this.rooms.push({ name: "office", cx: Math.floor((x0 + x1) / 2), cy: Math.floor((y0 + y1) / 2) });
  }

  // An open parking garage: a concrete deck ringed by a low parapet with drive-in
  // gaps on the road sides, regular support pillars and parked cars to fight among.
  _cityGarage(x0, y0, x1, y1) {
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w < 4 || h < 4) return this._cityPlaza(x0, y0, x1, y1, false);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { this._set(x, y, T.FLOOR); this._tint(x, y, 7); }
    // Parapet wall around the deck.
    for (let x = x0; x <= x1; x++) { this._set(x, y0, T.WALL); this._set(x, y1, T.WALL); }
    for (let y = y0; y <= y1; y++) { this._set(x0, y, T.WALL); this._set(x1, y, T.WALL); }
    // Drive-in gaps wherever the parapet backs onto a road.
    const mx = Math.floor((x0 + x1) / 2), my = Math.floor((y0 + y1) / 2);
    const opener = (gx, gy, ox, oy) => { if (this.tileAt(gx + ox, gy + oy) === T.FLOOR) { this._set(gx, gy, T.FLOOR); this._tint(gx, gy, 7); } };
    opener(mx, y1, 0, 1); opener(mx + 1, y1, 0, 1); opener(mx, y0, 0, -1); opener(mx + 1, y0, 0, -1);
    opener(x0, my, -1, 0); opener(x0, my + 1, -1, 0); opener(x1, my, 1, 0); opener(x1, my + 1, 1, 0);
    // Support pillars on a regular grid; painted stalls & parked cars between them.
    for (let y = y0 + 2; y <= y1 - 2; y += 3) for (let x = x0 + 2; x <= x1 - 2; x += 3) this._set(x, y, T.PROP);
    for (let y = y0 + 2; y <= y1 - 2; y += 3) for (let x = x0 + 1; x <= x1 - 1; x += 4) {
      if (this.tileAt(x, y) === T.FLOOR) { this._tint(x, y, 8); if (chance(0.45)) this._furn((x + 0.5) * TILE, (y + 0.5) * TILE, "car", 11, 13, 160); }
    }
    this.rooms.push({ name: "garage", cx: mx, cy: my });
  }

  // A paved plaza: open pavers with planters, benches and a central fountain —
  // and the block the player starts in.
  _cityPlaza(x0, y0, x1, y1, isSpawn) {
    const cxm = Math.floor((x0 + x1) / 2), cym = Math.floor((y0 + y1) / 2);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.tileAt(x, y) === T.FLOOR) this._tint(x, y, 4);
    const putF = (cx, cy, type, hw, hh, hp) => { if (this.tileAt(cx, cy) === T.FLOOR) this._furn((cx + 0.5) * TILE, (cy + 0.5) * TILE, type, hw, hh, hp); };
    for (const [tx, ty] of [[x0 + 1, y0 + 1], [x1 - 1, y0 + 1], [x0 + 1, y1 - 1], [x1 - 1, y1 - 1]]) putF(tx, ty, "bush", 9, 8, 26); // planters
    putF(x0 + 1, cym, "bench", 12, 5, 40);
    putF(x1 - 1, cym, "bench", 12, 5, 40);
    // A central fountain (skipped on the plaza you spawn in, so you don't stand in it).
    if (!isSpawn && x1 - x0 >= 5 && y1 - y0 >= 5) { this._set(cxm, cym, T.PROP); putF(cxm - 1, cym, "barrel", 8, 8, 48); putF(cxm + 1, cym, "barrel", 8, 8, 48); }
    this.rooms.push({ name: "plaza", cx: cxm, cy: cym });
    if (isSpawn) this._citySpawn = { x: (cxm + 0.5) * TILE, y: (cym + 0.5) * TILE };
  }

  // Blackpine Woods: a dense forest of pines and clearings split by a winding
  // river, with log cabins, a rocky cave, scattered boulders — and risen
  // woodland wildlife stalking it all.
  _forest() {
    const cols = this.cols, rows = this.rows;
    this.grid.fill(T.FLOOR);
    this.floorTint.fill(1); // mossy forest floor
    this.furniture = [];
    this.rooms = [];
    // Dense treeline border.
    for (let x = 0; x < cols; x++) { this._set(x, 0, T.WALL); this._set(x, rows - 1, T.WALL); }
    for (let y = 0; y < rows; y++) { this._set(0, y, T.WALL); this._set(cols - 1, y, T.WALL); }

    // Cells kept clear of trees (clearings, trails, water, structure fronts).
    const clearSet = new Set();
    const reserve = (cx, cy) => { if (this.inBounds(cx, cy)) clearSet.add(cy * cols + cx); };
    const reserved = (cx, cy) => clearSet.has(cy * cols + cx);
    const clearing = (cxm, cym, rr) => {
      for (let y = cym - rr; y <= cym + rr; y++) for (let x = cxm - rr; x <= cxm + rr; x++)
        if (Math.hypot(x - cxm, y - cym) <= rr + 0.4) reserve(x, y);
    };

    // A river winding top -> bottom (waded through, but drawn as a flowing
    // channel with muddy banks), plus a tributary from the left.
    const riverX = [];
    let rx = randInt(22, 30);
    for (let y = 1; y < rows - 1; y++) {
      rx = clamp(rx + randInt(-1, 1), 7, cols - 9);
      riverX[y] = rx;
      for (let d = -1; d <= 1; d++) { this._tint(rx + d, y, 3); reserve(rx + d, y); }   // channel
      this._tint(rx - 2, y, 5); this._tint(rx + 2, y, 5); reserve(rx - 2, y); reserve(rx + 2, y); // banks
    }
    const joinY = randInt(20, 32);
    for (let tx = 4; tx < riverX[joinY] - 1; tx++) {
      this._tint(tx, joinY, 3); reserve(tx, joinY);
      this._tint(tx, joinY - 1, 5); this._tint(tx, joinY + 1, 5); reserve(tx, joinY - 1); reserve(tx, joinY + 1);
    }
    // Log foot-bridges across the river (decorative — you can wade anywhere).
    for (const by of [randInt(6, 14), randInt(30, 42)]) this._furn((riverX[by] + 0.5) * TILE, (by + 0.5) * TILE, "log", 4, 20, 400);

    // Clearings: the spawn glade plus a few open glades for combat.
    const spawnCx = clamp(riverX[8] - 9, 5, 12), spawnCy = 8;
    clearing(spawnCx, spawnCy, 4);
    const glades = [[cols - 10, 11], [12, rows - 13], [cols - 13, 15], [Math.floor(cols / 2), Math.floor(rows / 2)]];
    for (const [gx, gy] of glades) clearing(gx, gy, randInt(3, 4));

    // A dirt trail winding from the spawn glade down to the exit trailhead.
    const exCx = clamp(riverX[rows - 2] + 5, 6, cols - 6);
    this._forestTrail(spawnCx, spawnCy, exCx, rows - 2, reserve);

    // Scatter open pine woods on the floor — spaced out so it never walls you
    // in, with the odd tight cluster and plenty of room to move between trunks.
    for (let y = 2; y < rows - 2; y++) for (let x = 2; x < cols - 2; x++) {
      if (this.tileAt(x, y) !== T.FLOOR || reserved(x, y)) continue;
      if (this.floorTint[this.idx(x, y)] !== 1) continue;
      // Keep a one-tile gap from the last pine so trunks don't fuse into a maze.
      const crowded = this.tileAt(x - 1, y) === T.PROP || this.tileAt(x, y - 1) === T.PROP;
      if (chance(crowded ? 0.05 : 0.17)) this._set(x, y, T.PROP); // a pine
    }

    // Two log cabins tucked in glades, and a rocky cave in a far corner.
    this._forestCabin(glades[0][0] - 2, glades[0][1] - 2);
    this._forestCabin(glades[1][0] - 2, glades[1][1] - 1);
    this._forestCave(cols - 8, rows - 8);

    // Leafy undergrowth: bushes and shrubs (low cover you can shoot over) dotted
    // through the open forest floor.
    let bushes = 0;
    for (let i = 0; i < 160 && bushes < 46; i++) {
      const x = randInt(2, cols - 3), y = randInt(2, rows - 3);
      if (this.tileAt(x, y) !== T.FLOOR) continue;
      const tint = this.floorTint[this.idx(x, y)];
      if (tint === 3 || tint === 4) continue; // not in water or the cave
      if (this.furnitureAt((x + 0.5) * TILE, (y + 0.5) * TILE)) continue;
      this._furn((x + 0.5) * TILE, (y + 0.5) * TILE, chance(0.4) ? "shrub" : "bush", rand(7, 10), rand(6, 8), 24);
      bushes++;
    }

    // Boulders & rocks strewn about.
    let placed = 0;
    for (let i = 0; i < 80 && placed < 30; i++) {
      const x = randInt(2, cols - 3), y = randInt(2, rows - 3);
      if (this.tileAt(x, y) !== T.FLOOR || this.floorTint[this.idx(x, y)] === 3) continue;
      if (this.furnitureAt((x + 0.5) * TILE, (y + 0.5) * TILE)) continue;
      const big = chance(0.5);
      this._furn((x + 0.5) * TILE, (y + 0.5) * TILE, big ? "boulder" : "rock", big ? rand(9, 13) : rand(5, 7), big ? rand(8, 11) : rand(4, 6), big ? 500 : 120);
      placed++;
    }

    // Spawn in the glade; the trail exits off the bottom.
    this.spawnPoint = { x: (spawnCx + 0.5) * TILE, y: (spawnCy + 0.5) * TILE };
    this._set(exCx, rows - 1, T.EXIT); this._tint(exCx, rows - 1, 2);
    this._set(exCx - 1, rows - 1, T.FLOOR); this._tint(exCx - 1, rows - 1, 2);
    this._set(exCx + 1, rows - 1, T.FLOOR); this._tint(exCx + 1, rows - 1, 2);
    this.exit = { x: (exCx + 0.5) * TILE, y: (rows - 1 + 0.5) * TILE };
    this.exitFacing = "down";
    this.rooms.push({ name: "clearing", cx: spawnCx, cy: spawnCy });
  }

  // A winding dirt trail from (x0,y0) to (x1,y1): tints the path and clears the
  // trees along it (water crossings are left as fords).
  _forestTrail(x0, y0, x1, y1, reserve) {
    let x = x0, y = y0, guard = 0;
    while ((y < y1 || Math.abs(x - x1) > 1) && guard++ < 600) {
      for (let d = 0; d <= 1; d++) {
        const tx = x + d;
        for (let dy = 0; dy <= 1; dy++) {
          const ty = y + dy - 0;
          if (this.tileAt(tx, ty) === T.PROP) this._set(tx, ty, T.FLOOR);
          const id = this.inBounds(tx, ty) ? this.idx(tx, ty) : -1;
          if (id >= 0 && this.tileAt(tx, ty) === T.FLOOR && this.floorTint[id] !== 3 && this.floorTint[id] !== 5) this._tint(tx, ty, 2);
          reserve(tx, ty);
        }
      }
      if (y < y1 && chance(0.72)) y++;
      else x += Math.sign(x1 - x) || (chance(0.5) ? 1 : -1);
      x = clamp(x, 2, this.cols - 3); y = clamp(y, 2, this.rows - 2);
    }
  }

  // A small log cabin with a front door, a back window and a dirt floor.
  _forestCabin(x0, y0) {
    const w = 5, h = 4, x1 = x0 + w - 1, y1 = y0 + h - 1;
    if (x0 < 2 || y0 < 2 || x1 > this.cols - 3 || y1 > this.rows - 3) return;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || y === y0 || y === y1;
      if (edge) { this._set(x, y, T.WALL); this._tint(x, y, 10); }
      else { this._set(x, y, T.FLOOR); this._tint(x, y, 2); }
    }
    const dxg = x0 + 2;
    this._doorway(dxg, y1);            // front door
    this._set(x0 + 2, y0, T.WINDOW);   // back window
    for (let dy = 1; dy <= 2; dy++) if (this.tileAt(dxg, y1 + dy) === T.PROP) this._set(dxg, y1 + dy, T.FLOOR); // clear the porch
    this._furn((x0 + 1.5) * TILE, (y0 + 1.5) * TILE, "dresser", 12, 8, 80);
    this.rooms.push({ name: "cabin", cx: x0 + 2, cy: y0 + 2 });
  }

  // A rocky cave: a ring of stone wall around a dark stone-floored nook, with a
  // mouth opening framed by boulders.
  _forestCave(cx, cy) {
    const rr = 4;
    for (let y = cy - rr; y <= cy + rr; y++) for (let x = cx - rr; x <= cx + rr; x++) {
      if (!this.inBounds(x, y) || x === 0 || y === 0 || x === this.cols - 1 || y === this.rows - 1) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d <= rr - 1.5) { this._set(x, y, T.FLOOR); this._tint(x, y, 4); }   // stone floor
      else if (d <= rr) { this._set(x, y, T.WALL); this._tint(x, y, 13); }    // rock wall ring
    }
    // Mouth opening toward the map interior (-x), framed with boulders.
    for (let dy = -1; dy <= 1; dy++) { this._set(cx - rr, cy + dy, T.FLOOR); this._tint(cx - rr, cy + dy, 4); if (this.tileAt(cx - rr - 1, cy + dy) === T.PROP) this._set(cx - rr - 1, cy + dy, T.FLOOR); }
    this._furn((cx - rr - 0.5) * TILE, (cy - 2.5) * TILE, "boulder", 11, 10, 500);
    this._furn((cx - rr - 0.5) * TILE, (cy + 2.5) * TILE, "boulder", 11, 10, 500);
    this.rooms.push({ name: "cave", cx, cy });
  }

  // Ashford Airport: a wide open airfield — a big marked runway with grass
  // infield, a taxiway to a concrete apron lined with parked airliners, ground
  // vehicles, open hangars and a long glass-fronted terminal.
  _airport() {
    const cols = this.cols, rows = this.rows;
    this.grid.fill(T.FLOOR);
    this.floorTint.fill(1); // airfield grass
    this.furniture = [];
    this.rooms = [];
    // Chain-link perimeter fence.
    for (let x = 0; x < cols; x++) { this._set(x, 0, T.WALL); this._set(x, rows - 1, T.WALL); }
    for (let y = 0; y < rows; y++) { this._set(0, y, T.WALL); this._set(cols - 1, y, T.WALL); }
    const midR = Math.floor(rows / 2);

    // The big runway down the right-centre of the field.
    const rwX0 = 30, rwX1 = 41, rwM1 = 35, rwM2 = 36;
    for (let y = 1; y < rows - 1; y++) for (let x = rwX0; x <= rwX1; x++) {
      let tint = 2;
      if (x === rwX0 || x === rwX1) tint = 7;            // edge stripes
      else if (x === rwM1 || x === rwM2) tint = 4;       // dashed centreline
      this._tint(x, y, tint);
    }
    // Threshold "piano keys" at each end.
    for (const ty of [2, 3, rows - 4, rows - 3]) for (let x = rwX0 + 1; x <= rwX1 - 1; x += 2) this._tint(x, ty, 7);

    // Concrete apron on the left; a taxiway links it to the runway.
    for (let y = 5; y < rows - 5; y++) for (let x = 6; x <= 27; x++) this._tint(x, y, 3);
    for (let y = midR - 1; y <= midR + 1; y++) for (let x = 27; x <= rwX0; x++) this._tint(x, y, 2);
    // A yellow taxi-lead line down the middle of the taxiway.
    for (let x = 27; x <= rwX0; x++) this._tint(x, midR, 6);

    // The terminal along the far left, gates facing the apron.
    this._airportTerminal(2, 9, 8, rows - 10);
    // Two open hangars on the apron, a jet inside each.
    this._airportHangar(11, 6);
    this._airportHangar(11, rows - 13);
    // Parked airliners out on the open apron, nosed toward the terminal.
    this._furn(22 * TILE, (midR - 6) * TILE, "plane", 34, 11, 900, Math.PI);
    this._furn(24 * TILE, (midR + 7) * TILE, "plane", 34, 11, 900, Math.PI);
    // Ground vehicles: a fuel bowser and a couple of luggage tugs.
    this._furn(16 * TILE, 20 * TILE, "truck", 11, 20, 220);
    this._furn(19 * TILE, (rows - 15) * TILE, "car", 11, 13, 160);
    this._furn(26 * TILE, midR * TILE, "car", 13, 11, 160);
    // A windsock mast and an antenna out on the grass infield.
    this._set(rwX1 + 7, 6, T.PROP);
    this._set(rwX1 + 16, rows - 8, T.PROP);

    // Spawn on the open apron; the runway is the way out (off the bottom).
    this.spawnPoint = { x: 21 * TILE + 16, y: midR * TILE + 16 };
    const exCx = rwM1;
    this._set(exCx, rows - 1, T.EXIT); this._tint(exCx, rows - 1, 2);
    this._set(exCx - 1, rows - 1, T.FLOOR); this._tint(exCx - 1, rows - 1, 2);
    this._set(exCx + 1, rows - 1, T.FLOOR); this._tint(exCx + 1, rows - 1, 2);
    this.exit = { x: (exCx + 0.5) * TILE, y: (rows - 1 + 0.5) * TILE };
    this.exitFacing = "down";
    this.rooms.push({ name: "apron", cx: 20, cy: midR });
  }

  // The terminal: a long hall with a glass gate frontage and doors onto the
  // apron, rows of seating and loot inside.
  _airportTerminal(x0, y0, x1, y1) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || y === y0 || y === y1;
      if (edge) this._set(x, y, T.WALL);
      else { this._set(x, y, T.FLOOR); this._tint(x, y, 5); }
    }
    for (let y = y0 + 2; y <= y1 - 2; y += 2) this._set(x1, y, T.WINDOW);          // glass gate frontage
    for (const dy of [Math.floor((y0 + y1) / 2), y0 + 4, y1 - 4]) this._doorway(x1, dy); // doors onto the apron
    for (let y = y0 + 3; y <= y1 - 3; y += 5) { this._furn((x0 + 2.5) * TILE, (y + 0.5) * TILE, "bench", 12, 5, 40); this._furn((x0 + 4.5) * TILE, (y + 0.5) * TILE, "bench", 12, 5, 40); }
    this.rooms.push({ name: "terminal", cx: Math.floor((x0 + x1) / 2), cy: Math.floor((y0 + y1) / 2) });
  }

  // A hangar: three steel walls with an open front toward the runway, a parked
  // jet inside.
  _airportHangar(x0, y0) {
    const w = 8, h = 7, x1 = x0 + w - 1, y1 = y0 + h - 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const wallCell = x === x0 || y === y0 || y === y1; // back + sides; front (x1) open
      if (wallCell) { this._set(x, y, T.WALL); this._tint(x, y, 12); }
      else { this._set(x, y, T.FLOOR); this._tint(x, y, 3); }
    }
    for (let y = y0 + 1; y <= y1 - 1; y++) { this._set(x1, y, T.FLOOR); this._tint(x1, y, 3); } // open front
    this._furn((x0 + 4) * TILE, ((y0 + y1) / 2 + 0.5) * TILE, "plane", 26, 9, 700, 0);
    this.rooms.push({ name: "hangar", cx: x0 + 3, cy: Math.floor((y0 + y1) / 2) });
  }

  // The sewers: a maze of 2-wide tunnels carved through concrete, with ladders
  // back up to the street's manholes at spread-out corners (so you can travel
  // underground and surface somewhere else in the neighbourhood).
  _sewers() {
    const cols = this.cols, rows = this.rows;
    this.grid.fill(T.WALL);
    this.floorTint.fill(0);
    this.furniture = [];
    this.rooms = [];
    const STEP = 4;
    const mCols = Math.floor((cols - 2) / STEP), mRows = Math.floor((rows - 2) / STEP);
    const cellX = (mx) => 1 + mx * STEP, cellY = (my) => 1 + my * STEP;
    const carveCell = (mx, my) => { const x = cellX(mx), y = cellY(my); for (let yy = y; yy < y + 2; yy++) for (let xx = x; xx < x + 2; xx++) this._set(xx, yy, T.FLOOR); };
    const carveLink = (ax, ay, bx, by) => {
      const x0 = cellX(ax), y0 = cellY(ay), x1 = cellX(bx), y1 = cellY(by);
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1) + 1; x++) for (let d = 0; d < 2; d++) this._set(x, y0 + d, T.FLOOR);
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1) + 1; y++) for (let d = 0; d < 2; d++) this._set(x0 + d, y, T.FLOOR);
    };
    // Randomized DFS maze over the coarse cell grid.
    const visited = new Uint8Array(mCols * mRows);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const stack = [[0, 0]]; visited[0] = 1; carveCell(0, 0);
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const opts = dirs.filter(([dx, dy]) => { const nx = cx + dx, ny = cy + dy; return nx >= 0 && ny >= 0 && nx < mCols && ny < mRows && !visited[ny * mCols + nx]; });
      if (!opts.length) { stack.pop(); continue; }
      const [dx, dy] = opts[randInt(0, opts.length - 1)];
      const nx = cx + dx, ny = cy + dy;
      visited[ny * mCols + nx] = 1; carveCell(nx, ny); carveLink(cx, cy, nx, ny);
      stack.push([nx, ny]);
    }
    // Knock a few extra holes so it loops instead of being a perfect maze.
    for (let i = 0; i < mCols + mRows; i++) {
      const mx = randInt(0, mCols - 2), my = randInt(0, mRows - 2);
      if (chance(0.5)) carveLink(mx, my, mx + 1, my); else carveLink(mx, my, mx, my + 1);
    }

    // Flag deep-water channels (coarse patches) that partly conceal the horde.
    for (let cy = 1; cy < rows - 1; cy++) for (let cx = 1; cx < cols - 1; cx++) {
      if (this.grid[this.idx(cx, cy)] !== T.FLOOR) continue;
      if ((Math.floor(cx / 3) + Math.floor(cy / 3)) % 3 === 0) this._tint(cx, cy, 2);
    }

    // Ladders up at the four corner cells (match the street's four manholes).
    const corners = [[0, 0], [mCols - 1, 0], [0, mRows - 1], [mCols - 1, mRows - 1]];
    for (const [mx, my] of corners) { const x = cellX(mx), y = cellY(my); this._set(x, y, T.MANHOLE); this._tint(x, y, 0); this.ladders.push({ cx: x, cy: y }); }

    // Scatter some pipes/debris to smash and a little grime.
    for (let i = 0; i < 10; i++) { const p = this.randomFloor(); this._place(Math.floor(p.x / TILE), Math.floor(p.y / TILE), chance(0.5) ? "barrel" : "crate"); }

    this.landing = { x: (cellX(0) + 0.5) * TILE, y: (cellY(0) + 1.5) * TILE }; // just off ladder 0
    this.spawnPoint = { x: this.landing.x, y: this.landing.y };
    // No street exit down here — surface via a ladder. Point the beacon at one.
    this.exit = { x: (cellX(0) + 0.5) * TILE, y: (cellY(0) + 0.5) * TILE };
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
          broken: false, overturned: false, angle: rand(-0.15, 0.15), low: this._isLowFurniture(type),
          movable: MOVABLE.has(type), mass: FURN_MASS[type] || 1, vx: 0, vy: 0,
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
    if (t === T.WALL || t === T.PROP || t === T.WINDOW || t === T.FENCE) return true;
    if (t === T.DOOR) return !this.doorPassable(this.doorAt(cx, cy));
    return this.furnitureAt(x, y) != null;
  }

  // Does furniture piece f fit centred at (x,y) without overlapping solid tiles?
  furnitureFits(x, y, f) {
    const solid = (px, py) => {
      const cx = Math.floor(px / TILE), cy = Math.floor(py / TILE), t = this.tileAt(cx, cy);
      if (t === T.WALL || t === T.PROP || t === T.FENCE || t === T.WINDOW) return true;
      if (t === T.DOOR) return !this.doorPassable(this.doorAt(cx, cy));
      return false;
    };
    for (const [px, py] of [[x - f.hw, y - f.hh], [x + f.hw, y - f.hh], [x - f.hw, y + f.hh], [x + f.hw, y + f.hh], [x, y]]) if (solid(px, py)) return false;
    return true;
  }

  // Circle-vs-tile resolution. throughWindows lets zombies climb through windows.
  // pusher = the mover can shove movable furniture (the player) rather than being
  // hard-stopped by it.
  collide(x, y, r, throughWindows, pusher) {
    let nx = x, ny = y;
    this.lastPushMass = 0; // heaviest movable piece actually shoved this call
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
          if (pusher && f.movable) {
            // Slide the furniture out of the way (if it clears), only ejecting
            // the pusher by the stiff remainder — heavier pieces barely budge.
            const stiff = clamp(f.mass, 0.2, 1);
            const fx = f.x - dx * push * (1 - stiff), fy = f.y - dy * push * (1 - stiff);
            if (this.furnitureFits(fx, fy, f)) { f.x = fx; f.y = fy; f.cx = Math.floor(fx / TILE); f.cy = Math.floor(fy / TILE); this.lastPushMass = Math.max(this.lastPushMass, f.mass); }
            nx += dx * push * stiff; ny += dy * push * stiff;
          } else {
            nx += dx * push; ny += dy * push;
          }
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
    if (t === T.WALL || t === T.PROP || t === T.FENCE) return true;
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
    if (t === T.WALL || t === T.PROP || t === T.FENCE) return false;
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

  // A random floor tile within `radius` px of a point (for clustered spawns).
  randomFloorNear(pt, radius) {
    for (let t = 0; t < 40; t++) {
      const ang = rand(0, Math.PI * 2), rr = rand(0, radius);
      const cx = Math.floor((pt.x + Math.cos(ang) * rr) / TILE), cy = Math.floor((pt.y + Math.sin(ang) * rr) / TILE);
      if (this.tileAt(cx, cy) === T.FLOOR) return { x: (cx + 0.5) * TILE, y: (cy + 0.5) * TILE };
    }
    return null;
  }
}
