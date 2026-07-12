// Entry point: wires the DOM/UI to the Game instance.
import { Game } from "./game.js";
import { VERSION, CHANGELOG } from "./version.js";

const $ = (id) => document.getElementById(id);
const canvas = $("game");

// Version tags.
$("menu-version").textContent = VERSION;
$("hud-version").textContent = VERSION;
document.title = `Zombies: Escape the Horde — v${VERSION}`;

let toastTimer = null;
function toast(a, b) {
  const el = $("toast");
  el.innerHTML = b ? `${a}<br><span style="font-size:11px;color:var(--muted)">${b}</span>` : a;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1400);
}

function vibrate(ms) {
  if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (_) {} }
}

const game = new Game(canvas, {
  onToast: toast,
  vibrate,
  onSetting: (name) => { $("setting-label").textContent = name; },
  onWave: (w) => { $("wave-label").textContent = "WAVE " + w; },
  onStats: (s) => {
    $("hp-fill").style.width = (s.hp * 100).toFixed(1) + "%";
    const st = $("stamina-fill");
    st.style.width = (s.stamina * 100).toFixed(1) + "%";
    st.style.opacity = s.exhausted ? "0.5" : "1";
    $("wave-label").textContent = "WAVE " + s.wave;
    $("score-label").textContent = s.score;
    $("weapon-name").textContent = s.weapon;
    $("ammo-count").textContent = s.ammo;
  },
  onGameOver: ({ score, wave, kills }) => {
    $("final-score").textContent = score;
    $("final-wave").textContent = wave;
    $("final-kills").textContent = kills;
    show("gameover");
    hideGameUI();
    vibrate([60, 40, 120]);
  },
});

// ---------------- Screen management ----------------
const overlays = ["menu", "how", "changelog", "gameover"];
function show(id) {
  for (const o of overlays) $(o).classList.toggle("hidden", o !== id);
}
function hideOverlays() { for (const o of overlays) $(o).classList.add("hidden"); }
function showGameUI() { $("hud").classList.remove("hidden"); $("touch-ui").classList.remove("hidden"); }
function hideGameUI() { $("touch-ui").classList.add("hidden"); }

function beginGame() {
  hideOverlays();
  showGameUI();
  game.start(0);
}

// ---------------- Buttons ----------------
$("start-btn").addEventListener("click", beginGame);
$("retry-btn").addEventListener("click", beginGame);
$("how-btn").addEventListener("click", () => show("how"));
$("changelog-btn").addEventListener("click", () => { renderChangelog(); show("changelog"); });
for (const btn of document.querySelectorAll(".close-overlay")) {
  btn.addEventListener("click", () => { hideOverlays(); if (btn.dataset.target !== undefined) $("menu").classList.remove("hidden"); });
}

// ---------------- Changelog rendering ----------------
function renderChangelog() {
  const body = $("changelog-body");
  body.innerHTML = CHANGELOG.map((rel) => `
    <h3>v${rel.version} — ${rel.title}</h3>
    <div class="cl-date">${rel.date}</div>
    <ul>${rel.changes.map((c) => `<li>• ${c}</li>`).join("")}</ul>
  `).join("");
}

// Pause the loop when the tab is hidden.
document.addEventListener("visibilitychange", () => {
  if (game.running) game.pause(document.hidden);
});

// Prevent iOS double-tap zoom / scroll bounce on the play surface.
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("touchmove", (e) => { if (e.target === canvas) e.preventDefault(); }, { passive: false });

// Expose for debugging in the console.
window.__game = game;

// Show the menu at boot.
show("menu");
