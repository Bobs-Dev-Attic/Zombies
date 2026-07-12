// World / level generation. Tile-based maps with walls, doors, floors and an exit.
import { randInt, rand, chance, pick, clamp } from "./util.js";

export const TILE = 32;
export const T = { FLOOR: 0, WALL: 1, DOOR: 2, EXIT: 3, PROP: 4 };

export const SETTINGS = [
  { id: "streets", name: "The Streets", floor: "#2a2d24", floor2: "#31352b", wall: "#4a4034", wallTop: "#5c5142", accent: "#3a3d30" },
  { id: "mall", name: "Abandoned Mall", floor: "#3a3540", floor2: "#423c48", wall: "#5a4a60", wallTop: "#6e5a76", accent: "#4a4252" },
  { id: "hospital", name: "St. Mercy Hospital", floor: "#28343a", floor2: "#2e3c43", wall: "#3a5058", wallTop: "#48626c", accent: "#324248" },
  { id: "forest", name: "Blackpine Woods", floor: "#1f2a1c", floor2: "#243021", wall: "#2c3a22", wallTop: "#38492c", accent: "#26331e" },
];

export class World {
  constructor(settingIndex = 0) {
    this.setting = SETTINGS[settingIndex % SETTINGS.length];
    this.settingIndex = settingIndex;
    this.cols = randInt(40, 52);
    this.rows = randInt(40, 52);
    this.grid = new Uint8Array(this.cols * this.rows);
    this.doors = []; // {cx, cy, open, openT}
    this.props = []; // decorative, non-blocking-ish
    this.exit = { x: 0, y: 0 };
    this.spawnPoint = { x: 0, y: 0 };
    this._generate();
  }

  idx(cx, cy) { return cy * this.cols + cx; }
  inBounds(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows; }
  tileAt(cx, cy) { return this.inBounds(cx, cy) ? this.grid[this.idx(cx, cy)] : T.WALL; }

  _set(cx, cy, v) { if (this.inBounds(cx, cy)) this.grid[this.idx(cx, cy)] = v; }

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
      const blobs = randInt(0, 3);
      for (let b = 0; b < blobs; b++) {
        const px = randInt(r.x0 + 1, r.x0 + r.rw - 2);
        const py = randInt(r.y0 + 1, r.y0 + r.rh - 2);
        if (this.tileAt(px, py) === T.FLOOR && chance(0.7)) this._set(px, py, T.PROP);
      }
    }

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
    this.rooms = rooms;
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
    if (t === T.WALL || t === T.PROP) return true;
    if (t === T.DOOR) {
      const d = this.doorAt(cx, cy);
      return !(d && d.open);
    }
    return false;
  }

  // Circle-vs-tile resolution: returns adjusted {x, y}.
  collide(x, y, r) {
    let nx = x, ny = y;
    for (let i = 0; i < 3; i++) {
      const cx = Math.floor(nx / TILE), cy = Math.floor(ny / TILE);
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          if (!this._tileSolid(gx, gy)) continue;
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
    }
    return { x: nx, y: ny };
  }

  _tileSolid(cx, cy) {
    const t = this.tileAt(cx, cy);
    if (t === T.WALL || t === T.PROP) return true;
    if (t === T.DOOR) { const d = this.doorAt(cx, cy); return !(d && d.open); }
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
    if (t === T.DOOR) { const d = this.doorAt(cx, cy); return !(d && !d.open); }
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
