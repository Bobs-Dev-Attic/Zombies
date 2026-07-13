# Changelog

All notable changes to **Zombies: Escape the Horde** are documented here.
The in-game changelog (Menu → Changelog) is generated from `src/version.js`;
keep both in sync when you cut a release.

The format follows [Keep a Changelog](https://keepachangelog.com/) and the
project uses [Semantic Versioning](https://semver.org/).

## [0.11.0] — 2026-07-13
### The Neighborhood
- **The Streets is now an outdoor neighborhood** rather than the old indoor room-and-corridor maze. A dedicated generator lays out a **grid of asphalt roads** with dashed **centre-line markings** and flanking **concrete sidewalks**.
- **Fenced yards & houses** — each block is a fenced front yard (wooden picket fences with a gate gap) around a **house** with a shingled roof (red or grey), a **dirt driveway**, and often a **backyard shed**. Some lots are small **parks / empty lots** with trees and a bench.
- **Parked cars & trucks** — assorted-colour vehicles sit along the kerbs and in driveways as **solid cover**; they block movement and shots and can be shot up / smashed like other furniture.
- **Trees** dot the yards, a **hedge/tree-line** rings the map edge, and a road runs off the **bottom of the map to the exit**.
- New `FENCE` tile (solid, blocks pathing) and reusable **terrain tinting** (grass / asphalt / sidewalk / driveway) plus mini-map colours for the new tiles.

## [0.10.0] — 2026-07-13
### Bleed Out
- **Drawn-out death** — dying no longer cuts straight to the game-over screen. The world keeps running for about **60 seconds** as you bleed out (zombies keep shambling over your fallen body).
- **Fluid blood overlay** — a sheet of blood **bleeds down from the top of the screen** as a live fluid: a ragged, dripping front with **surface tension** between columns, random **rivulet surges**, a wet specular sheen, and **detached droplets** that fall ahead of the front and splash.
- **Rising pool** — blood also **fills up from the bottom** with an animated wavy surface, until the top curtain and the rising pool converge and the whole screen is drowned in red.
- **YOU DIED card interaction** — the card fades in a beat after death; the flood keeps it a **clear, readable window** (Try Again still works), with blood **pooling on its top edge** and **dripping off its bottom edge**.
- New always-present click-through `#blood` overlay canvas (`z-index` above the menus) drives the effect; it's cleared and torn down on retry.

## [0.9.0] — 2026-07-13
### Keys, Axes & Upstairs (Phases 2b + 2c of the house overhaul)
- **Locked doors** — some interior doors start locked. Open a locked door three ways: **use a key** (found in the living room), **chop it down with the new axe**, or **shoot it open** with enough rounds. Locked doors block both you and the horde's pathing until breached (though zombies still climb in the windows).
- **New axe weapon** — a heavy two-hit melee tool with a big **door-breaking bonus** (`doorMul`), plus solid limb-severing against zombies. It's waiting on the kitchen counter; the bat also gained a smaller door bonus.
- **Door feedback** — doors now render a **brass lock plate** when locked, grow **cracks** as their HP drops under fire/chops, and leave a **splintered gap** with wood-chip debris FX when they break.
- **Functional staircase** — step onto the stairs to **load the upper floor** (two bedrooms, a bathroom and a landing) and step onto the down-stairs to return. A short cooldown stops you bouncing straight back.
- **Per-floor persistence** — each floor caches its own world, loot, blood stains, bodies and severed limbs, so a floor looks exactly as you left it when you come back. The upper floor has its own loot (medkit, rifle, ammo, adrenaline); the ground floor's front door still leads out to the next setting.

_Next: 2d the outdoor neighborhood (other houses, backyards, parks, stores)._

## [0.8.0] — 2026-07-13
### Welcome Home (Phase 2a of the house overhaul)
- **New "The House" setting** you start inside: a hand-shaped ground floor with a **living room → kitchen → dining room**, each with its own floor colour and themed furniture (couch/coffee table, kitchen counters, dining table + chairs), plus a **staircase** and a **front door** to the yard.
- **Windows & doors** line the exterior. **Zombies climb in through the windows** and pour through doors; the player can't climb through a window but can **shoot the glass out**. Windows shatter (with glass FX) when a zombie enters or a bullet hits.
- Zombies now **emerge from the other rooms and the yard** rather than just spawning off-screen — the layout funnels the horde in through the breach points.
- New tile types (window, stairs) with entity-aware collision (windows are solid for the player/bullets, passable for climbing zombies), room-tinted floors, and mini-map colours for them.

_Next: 2b locked doors + key/axe, 2c functional stairs to upper floors, 2d the outdoor neighborhood._

## [0.7.0] — 2026-07-13
### Fog & Map
- **Fog of war** — the map is now hidden except within the player's line of sight. Explored areas stay dimly "remembered", and unseen areas are dark. Uses per-tile raycast visibility that lights the walls you're facing but not what's behind them.
- **Mini-map** — a corner overlay showing the layout you've explored, the exit (once found), zombies currently in sight, and your position.
- **Improved corpses** — the dead now settle into proper face-down bodies in layered, irregular blood pools (desaturated "dead" tint), cross-fading from the fall so they no longer look like blobs.

## [0.6.1] — 2026-07-13
### Back to the Original
- Reverted the player to the original procedural hand-drawn character (by preference). The sprite-sheet rendering path and loader were removed; the committed `src/assets/player.png` is left in the repo unused in case it's wanted again.

## [0.6.0] — 2026-07-13
### Sprite Sheets
- The player is now rendered from a hand-illustrated **sprite sheet** (`src/assets/player.png`) instead of procedural pixel shapes.
- A small sprite-sheet loader slices the sheet's measured frames; the player's facing snaps to **up/down/left/right** and the row is chosen by state — **IDLE / WALK / RUN / REACH** (reaching while firing or meleeing).
- Death plays the **3-frame DYING** sequence before the game-over screen.
- The weapon is still drawn on top so it aims freely, and the previous procedural character remains as an **automatic fallback** if the image fails to load.

## [0.5.0] — 2026-07-13
### The Aftermath
- **Bodies persist** — killed zombies settle into permanent decals on the ground (capped) instead of fading, so the dead pile up like the blood.
- **Severed limbs land and stay** — a sliced-off arm or leg flies off with a tumble and comes to rest on the floor as a lasting decal.
- **Destructible furniture** — crates, tables, chairs, barrels, shelves and couches populate rooms; they block movement and shots, take damage from bullets/melee/explosions, and break into planks or tip over. Brutes and leapers smash through them.
- **Outside doorway** — the level exit is now rendered as a lit doorway to the outside with daylight and an EXIT sign.
- **Continuous wound scaling** — beyond dismemberment, a zombie's remaining health now scales its move speed and the damage it deals, so a badly hurt zombie is visibly slower and weaker.

## [0.4.0] — 2026-07-13
### Pounce & Splatter
- **Headshots** — every hit has a weapon-scaled chance to instantly kill; a floating **HEADSHOT** banner pops above the zombie, brain matter sprays, and the body drops.
- **Death animation** — killed zombies now collapse/fall with a squash-and-fade instead of vanishing.
- **Leaping zombies** — a new leaper type (and runners) pounce at the player in airborne jumps that arc over the ground.
- **Dynamic shadows** — shadows now shift and stretch in the direction of movement for the player and zombies, and separate from the body during a leap or walk bounce.
- **Knife attacks** — three variants: a one-handed swing, a one-handed stab, and a two-handed lunge (with a forward dash).
- **Gun feedback** — animated muzzle flash with smoke, plus tumbling brass shell casings ejected on each shot.

## [0.3.3] — 2026-07-13
### No More Floating
- Reworked the walk/run animation so the player no longer glides like a ghost. The feet now plant on the ground and scissor fore/aft while the upper body bounces against a **fixed** shadow (the changing gap sells the step), with a side-to-side sway and chunkier boots. Strides get bigger and bouncier when sprinting.

## [0.3.2] — 2026-07-13
### Boots on the Ground
- Fixed weapon rotation: held weapons were drawn as flat, axis-aligned sprites whose position rotated but whose shape didn't — so they always looked stuck at ~90°. The player is now rendered as a fully rotating figure, so the body **and** weapon point wherever the player faces (verified across all 8 directions).
- New walk/run animation: the legs and feet step forward and back in an alternating cycle, with bigger, faster strides when sprinting.

## [0.3.1] — 2026-07-13
### The Shamble
- Held weapons now rotate to point exactly where the player faces (fixed the melee weapon resting off to the side).
- Zombies are slower and **shamble** — a per-zombie perpendicular sway, a constant curve bias, and a stop/start lurch pulse make them weave and stagger toward you instead of marching in straight lines.
- Each zombie has its own gait: differing stride speed, arm sway and a side-to-side body lean.
- More prone crawlers dragging themselves along the ground, now appearing from the first wave.

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

[0.11.0]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.11.0
[0.10.0]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.10.0
[0.9.0]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.9.0
[0.8.0]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.8.0
[0.7.0]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.7.0
[0.6.1]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.6.1
[0.6.0]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.6.0
[0.5.0]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.5.0
[0.4.0]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.4.0
[0.3.3]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.3.3
[0.3.2]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.3.2
[0.3.1]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.3.1
[0.3.0]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.3.0
[0.2.1]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.2.1
[0.2.0]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.2.0
[0.1.1]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.1.1
[0.1.0]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.1.0
