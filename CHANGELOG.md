# Changelog

All notable changes to **Zombies: Escape the Horde** are documented here.
The in-game changelog (Menu → Changelog) is generated from `src/version.js`;
keep both in sync when you cut a release.

The format follows [Keep a Changelog](https://keepachangelog.com/) and the
project uses [Semantic Versioning](https://semver.org/).

## [0.3.0] — 2026-07-13
### Guts & Grabbing
- **Body collision** — zombies no longer occupy the same space as each other or the player; they push apart, jostle, and swarm (mass-weighted so brutes barge through).
- **Reaching zombie arms** — animated, clawing arms that sway as they lurch toward you.
- **Animated player arms** — arms recoil when firing a gun and sweep through an arc when swinging a melee weapon.
- **Dismemberment** — zombies lose limbs as they take damage. Lost legs cut speed and eventually drop them into a prone crawl; lost arms reduce the damage they deal. Severed limbs fling gore and leave stumps.
- **Prone crawlers** — a new zombie type that drags itself along the ground.
- Heavier weapons (rifle, shotgun, bazooka, bat) are far likelier to tear limbs off.

## [0.2.1] — 2026-07-13
### Fresh Updates
- Fixed asset caching (`vercel.json`) so new versions are picked up immediately after each deploy — returning players no longer run stale game code for up to an hour.

## [0.2.0] — 2026-07-13
### Manual Aiming
- Removed auto-aim — the player now controls the direction they shoot and swing.
- Weapons fire / swing in the direction the player is facing.
- Facing follows movement (stick / WASD) and holds when the player stops; on desktop, the mouse aims independently of movement.

## [0.1.1] — 2026-07-13
### Installable & Deployed
- Live on Vercel with automatic deploys on every merge to `main`.
- Added a PWA web-app manifest (`manifest.webmanifest`) + `icon.svg` so the game installs to the home screen and launches fullscreen.
- Cleaned up the production build (removed the console debug hook).

## [0.1.0] — 2026-07-12
### First Playable
- Top-down zombie escape: the player stays centred as the world scrolls.
- Pixel-art rendering on a low-res buffer scaled with nearest-neighbour, with smooth (float-position) entity motion.
- Portrait **and** landscape support via an adaptive virtual resolution.
- Touch controls: virtual joystick + Fire / Reload / Swap / Interact buttons, plus full keyboard & mouse support.
- Weapon roster: **knife, bat, pistol, machine gun, shotgun, rifle, bazooka** — each with its own damage, fire rate, spread, ammo, knockback and reload.
- Stamina + wound model: sprinting drains stamina; exhaustion and heavy injuries slow the player.
- Zombie variety: **walkers, runners, crawlers, brutes, spitters** with distinct stats and chase patterns (direct, wander-then-chase, ranged kiting).
- BFS flow-field pathfinding so zombies navigate corridors and doors to reach the player.
- Blood spray, settling gore, ground stains, muzzle flashes and screen-shake.
- Pickups: weapon crates, ammo, medkits and adrenaline. Doors you can open/close to make chokepoints.
- Wave survival with escalating hordes; reach the **EXIT** to move to the next setting (Streets → Mall → Hospital → Woods).
- Score, wave and kill tracking; in-game version tag and changelog.

[0.3.0]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.3.0
[0.2.1]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.2.1
[0.2.0]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.2.0
[0.1.1]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.1.1
[0.1.0]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.1.0
