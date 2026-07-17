// Tiny synthesized sound engine — all SFX are generated on the fly with the
// Web Audio API, so there are no audio asset files to ship. The AudioContext
// must be resumed from a user gesture (handled in main.js on START / first tap).

export class SFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this._last = {}; // per-name throttle for ambient sounds
  }

  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.35 : 0;
    this.master.connect(this.ctx.destination);
  }

  resume() { this._ensure(); if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); }
  setEnabled(on) { this.enabled = on; this._ensure(); if (this.master) this.master.gain.value = on ? 0.35 : 0; if (!on) this.stopFlame(); }

  // Continuous flamethrower roar — an engine-thrust loop that spools up while
  // the trigger is held and spools down when released (not a repeated gunshot).
  startFlame() {
    if (!this.enabled) return;
    this._ensure(); if (!this.ctx || this._flame) return;
    const ctx = this.ctx, t = ctx.currentTime;
    // Looping broadband noise = the roar body.
    const n = Math.floor(ctx.sampleRate * 1.0);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900; lp.Q.value = 0.8;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 160;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.09); // spool up
    // Low sawtooth thrust rumble under the noise.
    const osc = ctx.createOscillator(); osc.type = "sawtooth"; osc.frequency.value = 68;
    const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.13, t + 0.09);
    // A wavering LFO on the roar so it flickers like real flame.
    const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 13;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.14;
    src.connect(lp).connect(hp).connect(g).connect(this.master);
    osc.connect(og).connect(this.master);
    lfo.connect(lfoG).connect(g.gain);
    src.start(); osc.start(); lfo.start();
    this._flame = { src, osc, lfo, g, og };
  }

  stopFlame() {
    const f = this._flame; if (!f || !this.ctx) return;
    this._flame = null;
    const t = this.ctx.currentTime;
    try {
      f.g.gain.cancelScheduledValues(t); f.g.gain.setValueAtTime(Math.max(0.0001, f.g.gain.value), t); f.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      f.og.gain.cancelScheduledValues(t); f.og.gain.setValueAtTime(Math.max(0.0001, f.og.gain.value), t); f.og.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      f.src.stop(t + 0.18); f.osc.stop(t + 0.18); f.lfo.stop(t + 0.18);
    } catch (_) {}
  }

  // A pitched blip: an oscillator with an optional frequency glide and a quick
  // attack / exponential decay.
  _tone(type, f0, f1, dur, vol, t0) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  // A filtered noise burst (for shots, explosions, swishes, hisses).
  _noise(dur, vol, t0, filtType, freq, q, sweep) {
    const ctx = this.ctx;
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = filtType || "lowpass";
    filt.frequency.setValueAtTime(freq, t0);
    if (sweep != null) filt.frequency.exponentialRampToValueAtTime(Math.max(20, sweep), t0 + dur);
    filt.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  play(name) {
    if (!this.enabled) return;
    this._ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Throttle ambient/voice sounds so overlapping enemies don't blare.
    if ((name === "groan" || name === "hiss" || name === "caw" || name === "screech") && this._last[name] && t - this._last[name] < 0.2) return;
    this._last[name] = t;
    switch (name) {
      // --- gunshots (weapon.sound strings) ---
      case "pop":    this._noise(0.03, 0.6, t, "highpass", 3200, 0.6, null); this._noise(0.12, 0.5, t, "bandpass", 1700, 0.9, 350); this._tone("triangle", 300, 70, 0.08, 0.3, t); this._tone("sine", 130, 46, 0.13, 0.2, t); break; // sharp crack + punchy body + low thump
      case "boom":   this._noise(0.26, 0.6, t, "lowpass", 1300, 1, 130);   this._tone("sine", 120, 40, 0.22, 0.3, t); break;
      case "crack":  this._noise(0.12, 0.5, t, "highpass", 2400, 1, null); this._tone("square", 400, 120, 0.08, 0.16, t); break;
      case "laser":  this._tone("sawtooth", 1700, 320, 0.12, 0.18, t); this._tone("square", 900, 200, 0.1, 0.09, t); this._noise(0.06, 0.14, t, "highpass", 3200, 1, null); break; // pew: zappy downward chirp
      case "rattle": this._noise(0.05, 0.32, t, "bandpass", 1800, 1.2, 900); break; // per-round
      case "launch": this._noise(0.4, 0.5, t, "lowpass", 900, 1, 200);     this._tone("sawtooth", 180, 60, 0.35, 0.22, t); break;
      // --- melee ---
      case "swipe":  this._noise(0.12, 0.24, t, "bandpass", 1200, 0.8, 2600); break;
      case "thud":   this._tone("sine", 150, 60, 0.12, 0.32, t); this._noise(0.08, 0.18, t, "lowpass", 600, 1, null); break;
      case "chop":   this._noise(0.1, 0.32, t, "bandpass", 900, 1, 300); this._tone("square", 180, 70, 0.07, 0.14, t); break;
      case "clink":  this._tone("square", 900, 1300, 0.05, 0.16, t); break; // grenade toss
      // --- world / feedback ---
      case "explode": this._noise(0.6, 0.8, t, "lowpass", 1600, 1, 60); this._tone("sine", 90, 30, 0.5, 0.4, t); break;
      case "gib":    this._noise(0.32, 0.7, t, "lowpass", 900, 1, 120); this._tone("sine", 70, 26, 0.4, 0.34, t); this._noise(0.14, 0.4, t + 0.02, "bandpass", 500, 0.7, 180); break; // wet tearing burst
      case "hurt":   this._tone("sawtooth", 300, 110, 0.18, 0.28, t); this._noise(0.1, 0.14, t, "lowpass", 800, 1, null); break;
      case "pickup": this._tone("square", 600, 1000, 0.12, 0.22, t); break;
      case "heal":   this._tone("sine", 520, 900, 0.2, 0.22, t); break;
      case "reload": this._tone("square", 200, null, 0.03, 0.18, t); this._noise(0.05, 0.14, t + 0.07, "bandpass", 2000, 2, null); break;
      case "click":  this._noise(0.03, 0.14, t, "highpass", 3000, 1, null); break;
      case "glass":  this._noise(0.05, 0.28, t, "highpass", 3000, 1, null); for (let i = 0; i < 6; i++) this._tone("triangle", 1400 + Math.random() * 2000, 500, 0.14, 0.09, t + i * 0.015); break; // crack + tinkle
      case "buzz":   this._tone("sawtooth", 150, 128, 0.26, 0.06, t); this._noise(0.22, 0.02, t, "bandpass", 420, 5, null); break; // flies
      case "caw":    this._tone("sawtooth", 720, 380, 0.12, 0.13, t); this._tone("square", 900, 500, 0.1, 0.07, t + 0.11); this._noise(0.09, 0.08, t, "bandpass", 1600, 2, 900); break; // crow
      case "screech":this._tone("sawtooth", 520, 240, 0.3, 0.12, t); this._noise(0.3, 0.09, t, "highpass", 1200, 1.5, 700); break; // vulture
      case "splinter": this._noise(0.12, 0.24, t, "bandpass", 700, 0.7, 250); break;
      case "ui":     this._tone("square", 440, 660, 0.08, 0.2, t); break;
      // --- zombie voices ---
      case "groan":  this._tone("sawtooth", 105 + Math.random() * 40, 70, 0.5, 0.16, t); this._noise(0.4, 0.07, t, "lowpass", 500, 1, null); break;
      case "hiss":   this._noise(0.35, 0.18, t, "highpass", 1500, 1, null); break; // spit
    }
  }
}

export const sfx = new SFX();
