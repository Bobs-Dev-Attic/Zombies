// Entry point: wires the DOM/UI to the Game instance.
import { Game } from "./game.js";
import { WEAPONS } from "./weapons.js";
import { sfx } from "./audio.js";
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
    // Body armour / helmet bars appear only while you're wearing them.
    const ar = $("armor-row"), hr = $("helmet-row");
    ar.classList.toggle("hidden", !s.hasArmor);
    if (s.hasArmor) $("armor-fill").style.width = (s.armor * 100).toFixed(1) + "%";
    hr.classList.toggle("hidden", !s.hasHelmet);
    if (s.hasHelmet) $("helmet-fill").style.width = (s.helmet * 100).toFixed(1) + "%";
    // Adrenaline highlight on the stamina bar.
    st.parentElement.parentElement.classList.toggle("adrenaline", !!s.adrenaline);
    $("wave-label").textContent = "WAVE " + s.wave;
    $("score-label").textContent = s.score;
    $("weapon-name").textContent = s.weapon;
    $("ammo-count").textContent = s.ammo;
    updateWeaponBar(s);
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

// ---------------- Weapon bar ----------------
// One tappable button per owned weapon (rebuilt only when the set changes),
// highlighting the current weapon and pulsing while it reloads.
let weaponBarKey = "";
function updateWeaponBar(s) {
  const bar = $("weapon-bar");
  if (!bar || !s.owned) return;
  const key = s.owned.join(",");
  if (key !== weaponBarKey) {
    weaponBarKey = key;
    bar.innerHTML = "";
    for (const id of s.owned) {
      const btn = document.createElement("button");
      btn.className = "wbtn";
      btn.dataset.id = id;
      btn.textContent = (WEAPONS[id] && WEAPONS[id].tag) || id;
      btn.title = (WEAPONS[id] && WEAPONS[id].name) || id;
      btn.addEventListener("click", () => game.selectWeapon(id));
      bar.appendChild(btn);
    }
  }
  for (const btn of bar.children) {
    const isCur = btn.dataset.id === s.current;
    btn.classList.toggle("active", isCur);
    btn.classList.toggle("reloading", isCur && !!s.reloading);
  }
}

// ---------------- Screen management ----------------
const overlays = ["menu", "how", "changelog", "gameover"];
function show(id) {
  for (const o of overlays) $(o).classList.toggle("hidden", o !== id);
}
function hideOverlays() { for (const o of overlays) $(o).classList.add("hidden"); }
function showGameUI() { $("hud").classList.remove("hidden"); $("touch-ui").classList.remove("hidden"); }
function hideGameUI() { $("touch-ui").classList.add("hidden"); }

function beginGame() {
  sfx.resume();
  hideOverlays();
  showGameUI();
  game.start(0);
}

// ---------------- Sound ----------------
sfx.enabled = localStorage.getItem("z_sound") !== "off";
function updateMuteBtn() { const b = $("mute-btn"); if (b) b.textContent = sfx.enabled ? "🔊 Sound: On" : "🔇 Sound: Off"; }
$("mute-btn")?.addEventListener("click", () => {
  sfx.setEnabled(!sfx.enabled);
  localStorage.setItem("z_sound", sfx.enabled ? "on" : "off");
  updateMuteBtn();
  if (sfx.enabled) { sfx.resume(); sfx.play("ui"); }
});
updateMuteBtn();
// The AudioContext can only start from a user gesture — wake it on first input.
const wake = () => sfx.resume();
window.addEventListener("pointerdown", wake, { once: true });
window.addEventListener("keydown", wake, { once: true });

// ---------------- Buttons ----------------
$("start-btn").addEventListener("click", beginGame);
$("retry-btn").addEventListener("click", beginGame);
$("how-btn").addEventListener("click", () => { sfx.play("ui"); show("how"); });
$("changelog-btn").addEventListener("click", () => { sfx.play("ui"); renderChangelog(); show("changelog"); });
for (const btn of document.querySelectorAll(".close-overlay")) {
  btn.addEventListener("click", () => { sfx.play("ui"); hideOverlays(); if (btn.dataset.target !== undefined) $("menu").classList.remove("hidden"); });
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

// Show the menu at boot.
show("menu");
