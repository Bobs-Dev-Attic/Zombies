# 🧟 Zombies: Escape the Horde

A mobile-first, top-down **pixel-art zombie escape shooter**. Fight through the
Streets, a ruined Mall, a haunted Hospital and the Blackpine Woods — gather
weapons, gun down the horde, and reach the exit before you're overrun.

Built as a zero-build static web app (vanilla JS + HTML5 Canvas), so it runs
anywhere and deploys straight to Vercel.

**▶️ Current version: `0.1.0`** — see [`CHANGELOG.md`](./CHANGELOG.md) or the
in-game **Menu → Changelog**.

## Features

- 📱 **Mobile-first** — virtual joystick + Fire / Reload / Swap / Interact buttons. Works in **portrait or landscape**. Full keyboard & mouse support too.
- 🎯 **Player-centred camera** — you stay in the middle of the screen while the world scrolls around you.
- 🔫 **Modern arsenal** — knife, bat, pistol, machine gun, shotgun, rifle and bazooka, each with distinct handling, ammo and knockback.
- 🧟 **Zombie variety** — walkers, runners, crawlers, brutes and ranged spitters, each with their own size, speed and chase behaviour, navigating the map via a flow-field.
- 🩸 **Blood & gore** — spray, gore chunks, ground stains, muzzle flash and screen-shake.
- 🏃 **Stamina & wounds** — sprinting burns stamina; exhaustion and heavy injuries slow you down.
- 🚪 **Interactive world** — open/close doors for chokepoints, grab pickups, survive escalating waves, and escape through the exit.
- 🗒️ **Version tracking** — every release is recorded in the changelog and shown in-game.

## Controls

| Action | Touch | Keyboard / Mouse |
| --- | --- | --- |
| Move / Sprint | Left stick (push fully to sprint) | WASD / Arrows |
| Fire (auto-aims nearest) | **FIRE** button | Space / Left-click (hold) |
| Reload | ⟳ | R |
| Swap weapon | ↔ | Q / Mouse wheel |
| Interact (doors, pickups) | ✋ | E |

## Run locally

It's a static site — serve the folder with anything:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open the served URL on your phone or desktop browser. On iOS/Android use
**Add to Home Screen** for a fullscreen, app-like experience.

## Deploy to Vercel

No build step is required — [`vercel.json`](./vercel.json) configures it as a
static deployment.

```bash
npm i -g vercel
vercel        # preview
vercel --prod # production
```

Or import the GitHub repo at [vercel.com/new](https://vercel.com/new) and deploy
with the defaults (Framework Preset: **Other**, no build command, output = repo
root).

## Project structure

```
index.html        # shell: canvas, HUD, touch UI, menus
styles.css        # UI / HUD styling
vercel.json       # static-deploy config
src/
  main.js         # entry point — wires DOM/UI to the game
  game.js         # core loop, camera, rendering, waves, combat, flow-field nav
  world.js        # tile-map generation, collision, doors, line-of-sight
  entities.js     # Player, Zombie, Projectile, Particle, Pickup
  weapons.js      # weapon catalogue & loadout
  input.js        # touch joystick + buttons, keyboard, mouse
  sprites.js      # procedural pixel-art drawing
  util.js         # math helpers
  version.js      # single source of truth for version + changelog
```

## Versioning & releases

- Bump the version in **`src/version.js`** (in-game) and **`package.json`**, and add an entry to **`CHANGELOG.md`**.
- Each update lands via its own pull request and is merged after review, so the history reads as a clean release log.

## License

MIT.
