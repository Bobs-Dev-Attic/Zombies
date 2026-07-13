// Unified input: touch (virtual joystick + buttons), keyboard, and mouse.
import { clamp } from "./util.js";

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    // Movement vector (-1..1) and magnitude.
    this.moveX = 0;
    this.moveY = 0;
    this.moveMag = 0;
    // Action flags.
    this.firing = false;
    this.interactQueued = false;
    this.reloadQueued = false;
    this.swapQueued = false;
    this.usingTouch = false;
    // Mouse aim (desktop). hasMouse becomes true once the pointer moves.
    this.mouseX = 0;
    this.mouseY = 0;
    this.hasMouse = false;

    this.keys = new Set();
    this._joyId = null;
    this._joyOrigin = { x: 0, y: 0 };

    this._bindKeyboard();
    this._bindMouse();
    this._bindJoystick();
    this._bindButtons();
  }

  _bindKeyboard() {
    const map = { KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right" };
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const k = e.code;
      if (map[k]) this.keys.add(map[k]);
      if (k === "Space") this.firing = true;
      if (k === "KeyR") this.reloadQueued = true;
      if (k === "KeyQ") this.swapQueued = true;
      if (k === "KeyE") this.interactQueued = true;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(k)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => {
      const k = e.code;
      if (map[k]) this.keys.delete(map[k]);
      if (k === "Space") this.firing = false;
    });
  }

  _bindMouse() {
    this.canvas.addEventListener("mousedown", (e) => { if (e.button === 0) this.firing = true; });
    window.addEventListener("mouseup", (e) => { if (e.button === 0 && !this.usingTouch) this.firing = false; });
    window.addEventListener("mousemove", (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      this.hasMouse = true;
      this.usingTouch = false; // switching to mouse control
    });
    this.canvas.addEventListener("wheel", () => { this.swapQueued = true; }, { passive: true });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  _bindJoystick() {
    const joy = document.getElementById("joystick");
    const knob = joy.querySelector(".joystick-knob");
    const radius = 44;

    const start = (t) => {
      this.usingTouch = true;
      this._joyId = t.identifier;
      const r = joy.getBoundingClientRect();
      this._joyOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      move(t);
    };
    const move = (t) => {
      let dx = t.clientX - this._joyOrigin.x;
      let dy = t.clientY - this._joyOrigin.y;
      const mag = Math.hypot(dx, dy);
      const clamped = Math.min(mag, radius);
      const nx = mag > 0.001 ? dx / mag : 0;
      const ny = mag > 0.001 ? dy / mag : 0;
      knob.style.transform = `translate(${nx * clamped}px, ${ny * clamped}px)`;
      this.moveMag = clamp(mag / radius, 0, 1);
      this.moveX = nx;
      this.moveY = ny;
    };
    const end = () => {
      this._joyId = null;
      this.moveX = this.moveY = this.moveMag = 0;
      knob.style.transform = "translate(0,0)";
    };

    joy.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (this._joyId === null) start(e.changedTouches[0]);
    }, { passive: false });
    joy.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === this._joyId) move(t);
    }, { passive: false });
    const drop = (e) => {
      for (const t of e.changedTouches) if (t.identifier === this._joyId) end();
    };
    joy.addEventListener("touchend", drop);
    joy.addEventListener("touchcancel", drop);
  }

  _bindButtons() {
    const fire = document.getElementById("btn-fire");
    const press = (el, on, off) => {
      el.addEventListener("touchstart", (e) => { e.preventDefault(); this.usingTouch = true; on(); }, { passive: false });
      el.addEventListener("touchend", (e) => { e.preventDefault(); off && off(); }, { passive: false });
      el.addEventListener("touchcancel", () => off && off());
    };
    press(fire, () => (this.firing = true), () => (this.firing = false));

    const tap = (id, fn) => {
      const el = document.getElementById(id);
      el.addEventListener("touchstart", (e) => { e.preventDefault(); this.usingTouch = true; fn(); }, { passive: false });
      el.addEventListener("click", (e) => { e.preventDefault(); fn(); });
    };
    tap("btn-reload", () => (this.reloadQueued = true));
    tap("btn-swap", () => (this.swapQueued = true));
    tap("btn-interact", () => (this.interactQueued = true));
  }

  // Merge keyboard direction into the movement vector each frame.
  sampleKeyboard() {
    if (this._joyId !== null) return; // touch stick wins
    let kx = 0, ky = 0;
    if (this.keys.has("left")) kx -= 1;
    if (this.keys.has("right")) kx += 1;
    if (this.keys.has("up")) ky -= 1;
    if (this.keys.has("down")) ky += 1;
    if (kx || ky) {
      const m = Math.hypot(kx, ky);
      this.moveX = kx / m;
      this.moveY = ky / m;
      this.moveMag = 1;
    } else if (!this.usingTouch) {
      this.moveX = this.moveY = this.moveMag = 0;
    }
  }

  // Consume one-shot flags after the frame reads them.
  consume() {
    const r = { reload: this.reloadQueued, swap: this.swapQueued, interact: this.interactQueued };
    this.reloadQueued = this.swapQueued = this.interactQueued = false;
    return r;
  }
}
