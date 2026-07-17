# Changelog

All notable changes to **Zombies: Escape the Horde** are documented here.
The in-game changelog (Menu → Changelog) is generated from `src/version.js`;
keep both in sync when you cut a release.

The format follows [Keep a Changelog](https://keepachangelog.com/) and the
project uses [Semantic Versioning](https://semver.org/).

## [0.33.0] — 2026-07-17
### Into the Woods
- **New environment — Blackpine Woods** (`id: "forest"`, `isForest`, `_forest()` generator), selectable from the start picker: a dense pine forest of shady groves (`T.PROP` conifers scattered at ~34% density) and reserved clearings, split by a **winding river** with muddy banks and a tributary (waded through; drawn as a flowing channel) crossed by **log foot-bridges**, with a **dirt trail** from the spawn glade to the exit, two **log cabins** (door + window + loot) and a **rocky cave** (stone-floored nook ringed by rock walls, framed with boulders). `FOREST_TERRAIN` palette + `isForest` handling across `floorPair`, `_decorate` (shady canopy), and new floor / conifer / treeline-cabin-cave-wall rendering.
- **Woodland bestiary** — six new risen-wildlife zombie types (`ZOMBIE_TYPES` + `drawZombie`/`drawBodyDecal` sprite & carcass branches + `ZOMBIE_PAL`/`ZOMBIE_LIMB` fur palettes): **squirrel** (tiny, bushy-tailed swarmer), **rabbit** (hoppy pouncer), **raccoon** (masked scrapper), **fox** (quick russet pouncer), **bear** (hulking apex maul), and **big bird** (ragged pecking fowl). They fill the forest spawn table (with the odd lost hiker); makeZombieLook now keeps animal fur/feather colours instead of scavenged clothing.
- New **boulder**, **rock** and **log** furniture (rounded-stone & timber renderers) used to litter the woods.

## [0.32.0] — 2026-07-17
### Downtown
- **Start-environment picker** — the menu now has a “Choose your start” row (`#env-pick`) letting the player begin in **The House**, **The Streets** or the new **Downtown**; `beginGame` resolves the chosen `SETTINGS` id to an index and passes it to `game.start()`, and the pick is remembered in `localStorage` (`z_startEnv`).
- **Fun Options flyout** — the row of cheat chips is now a flyout menu: a toggle button (`#funopts-toggle`) drops an opaque `#funopts-panel` of checkbox rows (`.funopt input.cheat`), which close on an outside tap. Same `game.cheats` + `localStorage` wiring, now via checkbox `change` events.
- **New environment — Downtown** (`id: "city"`, `isCity`, `_city()` generator): a dense downtown grid of asphalt **roads** with painted centre-lines, concrete **sidewalks** and zebra **crosswalks**, laid out around a block layout of:
  - **Office towers** (`_cityOffice`) — solid footprints with **glass-facade windows** and a ground-floor **lobby** (carved floor + a `_doorway` off the sidewalk, front desk & a shelf of loot) to duck into.
  - **Parking garages** (`_cityGarage`) — open concrete decks ringed by a parapet with **drive-in gaps** onto the roads, a grid of concrete **support pillars** (`T.PROP`, rendered as columns) and **parked cars** to fight among.
  - **Plazas** (`_cityPlaza`) — paved open squares with planters, benches and a central fountain; the player spawns in the central one.
- New `CITY_TERRAIN` palette + `isCity` handling in `floorPair`, `_decorate` (dusk-lit, littered), the road-line / stall / crosswalk / paver floor rendering, and the concrete-pillar `T.PROP` renderer. Stray **dog** packs, **carrion birds** and **flares** now appear downtown like on the streets.

## [0.31.0] — 2026-07-17
### Bolt & Blaze
- **Bolt-action rifle handling** — the Hunting Rifle (`kind: "rifle"`) now has a dedicated shouldered pose in `drawPlayer` (`drawHuntingRifleLocal`): the butt is pulled into the shoulder, the scoped barrel runs straight down the sightline, and it rides back on recoil. After each shot a new `boltT` timer (set in `triggerRecoil`, decays deliberately) drives a bolt-cycle animation — the trigger hand comes off the grip to lift, draw the bolt to the rear and shove it home, and the spent case is ejected mid-cycle (`_boltEject` delay) rather than instantly.
- **Hip-fired flamethrower** — the Flamethrower (`kind: "flamethrower"`) now uses a hip-fired pose like the shotguns (`drawFlamerLocal`): the fuel tank rides low at the hip and the nozzle wand angles across to the aim line, gripped in both hands.
- **Physical fire** — flame particles are now tagged `kind: "flame"` and processed by `_updateFlames`: each one bounces off walls and furniture (`world.solidAt`, reflected per-axis and shoved back out), so the stream splashes and pools against cover instead of passing through it.
- **Torching crawlers** — the living flame now ignites any zombie it actually washes over — including low `prone`/`dragger` crawlers the high, arcing stream would otherwise sail clean over (each particle can sear a few zombies via `flameHits`).

## [0.30.0] — 2026-07-17
### Crawl & Splatter
- **Dragger zombie** — a new `dragger` type (`bornProne: true`, `hp: 70`, slow `speed: 26`, high `knockResist: 0.5`, `dmg: 14`): a heavy legless torso that hauls itself deliberately across the ground on its arms, tanky and hard to shove. Distinct from the fast lunging `prone` crawler. Enters the spawn table from wave 2 onward.
- **Gore spit** — spitter projectiles (`kind: "spit"`) are no longer green goo. They now fling a tumbling bloody body part chosen from a `goreKind` (`chunk`, torn `limb`, or `bone`) that spins as it flies (`spinPhase` + travel-based rotation), sheds drips, and bursts into a dark-red splatter with a lingering blood stain on impact. Hit mechanics are unchanged.
- **Bones sticking out** — some spitters (`look.bonesOut`) now render jagged ivory bone shards jutting from their torsos.

## [0.29.0] — 2026-07-17
### Pew Pew
- **Laser Pistol** — a new energy weapon (`kind: "laserpistol"`, `beam: true`, new `cells` ammo) that fires an **instant hitscan beam** (`_fireBeam`) rather than a projectile. The beam is raycast to the first wall/solid and **pierces every zombie along the line in one shot**, boring a **cauterised, smoking hole** through each (`_laserBurn`: smoke wisps, sparks, a spot of blood, and a charred mark).
- **Burn to fire** — each beam hit stacks `laserHeat` on a zombie; once it's taken **3 hits** it **catches fire** (`_igniteZombie`) and burns like any other blaze — so sustained fire on a target sets it ablaze.
- Rendered as a magenta beam with a white-hot core and end-flare (`_drawBeams`, drawn over the fog); a sleek laser-pistol held sprite and a zappy `laser` pew SFX. Seeded in the world loot pool with **energy-cell** ammo pickups, and included in All Weapons.

## [0.28.3] — 2026-07-17
### Rattle the Bones
- **Bone variety** — bone gibs now spawn in assorted shapes via a `boneKind`: a **long** femur, a **short** bone, a **curved rib**, or a **little** bone (rendered in `drawGroundLimb`), for messier, more varied gore.
- **Size-relative bones** — bones are scaled to the body they came from (`boneScale ≈ clamp(z.r/7, …)`), so a **rat** leaves tiny little bones (~0.55×) while a **brute** scatters big ones (~1.6×). Scale + kind are carried through the flying gibs and their settled ground decals, and the bone's shadow scales too.

## [0.28.2] — 2026-07-17
### Fire in the Hole
- **Shoulder-mounted RPG** — the bazooka is no longer held like a rifle out front; it's drawn as a **shoulder-mounted launch tube** (`drawBazookaLocal`, a dedicated pose in `drawPlayer`) braced on the player's shoulder, running fore-and-aft along the aim with the exhaust vent poking out behind, kicking back on recoil.
- **Backblast** — firing the RPG (`_backblast`) now jets a burst of **fire and smoke out the rear** of the launcher, behind the shooter's shoulder.
- **Missile exhaust** — the rocket is redrawn as a **finned missile with a hot exhaust flame** out its tail, and it lays a continuous **exhaust trail of flame and smoke** as it flies (`_updateProjectiles`).

## [0.28.1] — 2026-07-17
### Quiet Placement
- **No muzzle flash on mines** — deploying a land mine (`_deployMine`) now clears `player.muzzle`, so laying one down no longer draws a gun muzzle-flash. (`_tryFire` arms the flash for every weapon; deploy weapons now suppress it, like the flamethrower does.)

## [0.28.0] — 2026-07-17
### Minefield
- **Super Stamina** — a new Fun Options toggle (`cheats.superStamina` → `player.superStamina`, applied in `_applyCheats`): stamina is pinned to max and you never exhaust, so you can sprint indefinitely.
- **Land mines** — a new deployable weapon (`kind: "mine"`, `deploy: true`, `mines` ammo). Firing it **drops a mine at your feet** (`_deployMine`); it **arms after ~0.8 s** (a red LED blinks once live) and detonates when a **zombie steps within its trigger radius** (`_updateMines`) — it won't trip on the player who laid it. Detonation (`_mineBlast`) fires a full `_explode` (hurls zombies/furniture/player, breaks windows & doors, scorches the ground) plus an extra shower of **dirt & shrapnel debris**, a heavy **blood spray with wall-spattering droplets**, and it **tears apart any zombie right on top** (flinging limbs, guts and bones). Mines render as a metal pressure-plate disc, persist per floor, and are seeded in the world loot pool + `mines` ammo pickups (and All Weapons).

## [0.27.3] — 2026-07-17
### Steady Stream
- **Coherent fire stream** — the flamethrower now fires a **tight jet** straight down the aim (spread cut 0.3 → 0.1 rad; `_flame` launches particles nearly parallel with only slight jitter and a small perpendicular width) instead of a scattered fanning cone. Measured flame-particle deviation is now ~2–4° off-aim.
- **Engine-thrust roar (not a gun)** — replaced the per-shot flame *sound* with a **sustained looping roar** (`SFX.startFlame` / `stopFlame`): looping broadband noise through a lowpass + highpass, a low sawtooth thrust rumble, and a wavering LFO flicker, with smooth spool-up/down envelopes. The game starts the loop while the trigger is held with fuel (and there's no reload), and stops it on release, pause, or death — so continuous fire sounds like a jet, not repeated gunshots.

## [0.27.2] — 2026-07-17
### Bare Bones
- **Bones** are now among the body parts a zombie can shed — a new `bone` gib (ivory shaft with knobby ends, rendered in `drawGroundLimb`). Severing a limb (`_severFX`) has a ~60% chance to also fling a splintered bone, and blowing a zombie apart (`_flingZombieGibs`) scatters 3–5 shattered bones among the guts. Bones ricochet off walls/furniture like the other explosion gibs and settle as ground decals.

## [0.27.1] — 2026-07-17
### Longer Reach
- **Flamethrower reach** — the fire stream now travels much further downrange (ignition range 122 → 200 px; flame particles fire faster, live longer and carry with less drag for a long jet).
- **Fuel in liters** — the flamethrower's fuel is now measured in liters, shown as an `L` unit on the ammo counter (`weapon.unit`, appended in `_stats`); the tank is 100 L.
- **Jet-engine roar** — reworked the `flame` SFX into a throatier jet-engine sound: a low lowpass rumble + a bandpass hiss/whine + a low sawtooth rumble tone (louder, throttled).

## [0.27.0] — 2026-07-17
### Trial by Fire
- **Flamethrower** — a new weapon (`kind: "flamethrower"`, `fuel` ammo) that belches a forward **cone of fire + smoke** (`_flame`), igniting every zombie and flammable piece of furniture it touches. Found in the world loot pool, sold with fuel-can ammo pickups, and included in All Weapons.
- **Living fire** — ignited zombies (`z.burning`) take **damage over time**, throw off flames and smoke, and **spread fire** to adjacent zombies and furniture (`_updateZombieFire`); they keep attacking while they burn, then **die into a smouldering pile of ash** instead of a corpse (`_burnToAsh`, a grey ash scorch). Furniture fires now **consume** the piece over time (`_updateBurning` burn timer) and spread — and **burning vehicles cook off and explode**.
- **Exploding zombies blow apart** — the Exploding Zombies mutator now flings **heads, limbs, guts and a spray of blood** as gibs that **ricochet off walls, furniture and other solids** (`_flingZombieGibs`, bounce support added to `_updateGibs`).
- **Bladed dismemberment** — the **axe** and **katana** (`alwaysSever`) now **lop a limb off on every hit** (legs first, to disable), reliably crippling zombies into prone crawlers even as the blow kills them.
- New synthesized **`flame`** roar (throttled) and a flamethrower sprite.

## [0.26.0] — 2026-07-17
### Fun Options
- **Fun Options menu** — a row of toggle chips on the start screen (`#cheats`, wired in `main.js`, read by the game on START as `game.cheats`) lets you mix in cheats/mutators before a run; the chosen set is remembered in localStorage.
- **All Weapons** — the starting loadout (`_buildLoadout`) owns the entire arsenal, magazines loaded and ammo stocked, starting on the assault rifle.
- **Unlimited Ammo** — `player.unlimitedAmmo` skips all clip/ammo decrements and keeps `canFire` true, so guns and throwables never run dry (no reloads needed).
- **½ Damage** — `player.damageTakenMul = 0.5`, applied in `Player.hurt`, halves all incoming damage.
- **Exploding Zombies** — every kill triggers `_zombieBurst`: a fireball + shockwave that splashes damage (85 with falloff) into nearby zombies — **chain-detonating** the horde — scorches the ground, and nudges the player if they're too close.
- **Laser Guns** — gun shots become bright green energy bolts (`proj.laser`): faster, longer-range, and **pierce through everything** (rendered as a neon beam in `_drawProjectiles`).
- **Swords** — new **Katana** melee weapon (`kind: "melee_sword"`, damage 62, wide 1.5-rad arc, high sever) with its own long-blade sprite; granted by the Swords toggle and included in All Weapons.

## [0.25.1] — 2026-07-17
### Catch Your Breath
- **Slower, more realistic breathing** — the player's idle chest-heave cadence was roughly halved (breathing `rate` from `3.0 + tired*4.6` to `1.4 + tired*2.4`), so at rest you breathe at a natural ~13 breaths/min and only quicken toward heavy heaving (~36/min) when winded, instead of panting fast all the time. Heave depth is unchanged.

## [0.25.0] — 2026-07-17
### Scorched Earth
- **The horde tracks blood** — most zombies (`z.bloody`, ~80%) now leave a trail of **bloody footprints** as they move (alternating left/right, fading over time), and **crawlers drag a bloody smear**. Prints land on floors, tile and rugs and are capped/culled so the floor stays readable.
- **Smouldering scorch marks** — every explosion now sears a **charred black scorch** into the ground at ground zero (`this.scorches` → `_drawScorch`): a dark radial burn with a sooty rim that **glows with embers and coughs smoke** (`_updateScorches`) for several seconds before settling into a permanent char. Marks persist per floor.
- Grenades were already fully implemented — you toss them, the **fuse counts down**, and detonation sends out a **shockwave that damages and hurls zombies, furniture and the player**, shattering nearby windows and doors. This release adds the lasting burn mark they leave behind.

## [0.24.0] — 2026-07-17
### Squalor
- **Random floor clutter** — every floor is now strewn with static decor generated at build time (`world.decor`, drawn in `_drawDecor`): dark **grime stains**, scattered **debris/rubble**, **trash** (crumpled paper, wrappers, cans) and heaped **garbage bags**, weighted heaviest in the sewers. Some **furniture spawns already broken** (smashed or tipped over, ~16%).
- **Torn curtains** — most house windows now hang a ragged valance and two frayed side panels of cloth over the glass.
- **Zombies drag cloth** — ~30% of the horde drags a snagged scrap of clothing/sheet trailing behind them (`look.dragCloth`, rendered as a swaying ribbon under the body).
- **Bloody footprints & trails** — walking through fresh blood coats your boots and you leave a fading trail of **boot prints** (`this.prints`), alternating left/right and fading as the blood wears off; **crawlers drag a bloody smear** behind them. Prints persist per floor and land on floors, tile and rugs alike.
- **Dim lighting** — interiors and the sewers get a **darkness veil** (`world.ambient`) lit by warm, **flickering lamps** (`world.lamps`, occasional bad-bulb dips) and a soft **torch around the player** (`_drawLighting`); streets stay near-daylight.
- **Gentler fog** — the fog of war now feathers with a wider **smoothstep** falloff plus a player-centred radial gradient, so sight fades in a gradual gradient instead of a hard blocky edge.

## [0.23.0] — 2026-07-17
### From the Hip
- **Hip-fired shotgun** — the shotgun family is now held at the **waist** instead of raised centre-line: the stock is tucked at the player's right hip and the barrel angles across to the aim line, so from the top-down view the gun visibly **swings out to the left or right** as you turn. Rendered by a dedicated `drawShotgunLocal` with per-variant bodies (pump barrel + mag tube, semi-auto, side-by-side twin barrels) and both hands posed on the grip and fore-end.
- **Recoil + pump + shell eject** — firing drives the whole gun **back on recoil** with a slight muzzle rise; the **pump-action** shotgun's fore-end **racks back and returns** after each shot (new `pumpT` timer on the player), and a **fat red shotgun hull** is flipped out of the ejection port and tumbles to the ground (shotguns now eject a red shell instead of a brass casing).

## [0.22.1] — 2026-07-16
### Sharper Shot
- **Reworked the pistol shot sound** (the shared `pop` used by the .22 and 9mm) into a punchier, crisper report — an instant high-frequency snap transient over a band-swept body plus a low triangle/sine thump for weight, replacing the old thin bandpass pop. Still short (~44 ms) so rapid fire stays tight.

## [0.22.0] — 2026-07-16
### Torn Apart
- **Corpses match the fallen zombie** — the ground body decal (`drawBodyDecal`) now mirrors the zombie that died: it keeps that individual's **skin tone, clothing colour and hairstyle** (short / long / bald), and lies **torn open with viscera and exposed ribs**. It's **type-aware** — dogs leave a four-legged carcass, rats a tiny one, brutes a bigger body with a wider blood pool, and severed limbs render as **stumps**. The "dead tint" was softened so a corpse stays recognisably the same enemy instead of washing out to grey.
- **The player is ripped apart on death** — dying now triggers `_dismemberPlayer`: your **head, both arms, both legs and torso** are torn off and flung as tumbling gibs that settle on the ground, your **organs spill out**, and a huge spray of **blood and viscera** flies everywhere into a wide gore pool before the death-blood sheet floods the screen. `drawGroundLimb` gained head / torso / gut renderings and a new wet `gib` sound plays on the tear.

## [0.21.0] — 2026-07-16
### Carrion
- **Carrion birds** — crows, blackbirds and vultures now glide into the outdoor neighborhood to feed on the dead (`this.birds`, `_updateBirds` / `_drawBirds`). They spawn gliding in from off-screen toward settled carcasses, descend, and hop/peck at the bodies. Each type has its own size, speed, flap rate and colouring (crows near-black, blackbirds with an orange beak, big brown bald-headed vultures).
- **They scatter when you approach** — coming within ~96px startles a feeding bird into flight: it takes off, climbs, and wheels away off-scene, cawing (vultures screech). They only ever flee — **they never attack the player**.
- **Shootable** — bullets can drop a bird out of the air for +5 points, throwing a puff of feathers and a little blood and leaving a small carcass mark. New `caw` / `screech` synthesized calls (throttled).

## [0.20.0] — 2026-07-16
### Home Furnishings
- **Varied flooring** — house rooms now render distinct surfacing materials over the base floor checker (`FLOOR_MAT` keyed by `floorTint`, drawn deterministically in `_drawFloorMat` so it never shimmers): **hardwood planks** (staggered board seams), **ceramic tile** (grout grid + edge highlight), **poured cement** (expansion joints, mottling and a hairline crack on some cells), a **brick foyer** (running-bond courses with mortar) just inside the front door, and soft **flecked carpet**. Rooms were re-surfaced accordingly — carpet living room & bedroom, tile kitchen & bath, hardwood dining, cement upstairs landing.
- **Area rugs** — rooms are dressed with decorative rugs (`world.rugs`, drawn in `_drawRugs` over the floor and under furniture/actors): a medallioned **Persian** in the living room and bedroom, a striped **modern** rug under the dining table, and a diamond **runner** down the upstairs hall — each with a woven border, a drop shadow, and end fringe.

## [0.19.0] — 2026-07-16
### Atmosphere & Broken Glass
- **Furniture push tires you** — shoving a piece of furniture now **drains stamina in proportion to its mass**, so heaving a **dresser** costs far more than nudging a **chair** (surfaced from `world.collide` via a new `lastPushMass` read by the player each frame).
- **Melee hits all-around** — knives and axes now reliably damage **every zombie and dog in contact**, from **any direction** (the point-blank contact rule no longer requires the target to be within the narrow facing arc), so small, fast enemies can't slip the swing.
- **Flies** — a drifting swarm of tiny flies gathers around **fresh bodies, blood pools and burning wrecks** for atmosphere, and **buzzes audibly** (throttled) when it strays near you (`_updateFlies` / `_drawFlies`, new `buzz` SFX).
- **Burning-vehicle smoke** — wrecked/burning vehicles outside now emit **thick, dark rising smoke plumes** and embers on top of the flames.
- **Redesigned windows + breakage** — windows are now **framed, reflective glass panes** (sky-tinted gradient, diagonal sheen, cross muntins). Smashing one plays a **cracking, tinkling** sound and showers **falling glass shards**, leaving **broken glass litter** on the ground.

## [0.18.1] — 2026-07-16
### Walk This Way
- **Zombie walk cycle** — the shamblers now have proper **legs with feet** that **step fore-and-aft** in a scissoring stride (like the player) instead of a flat lateral shuffle, each planted foot drawn under the body. Per-zombie gait variety carries through, **~30% drag a leg** in a limp, and the legless still **crawl** (prone). Severed legs still leave a bloody stump.

## [0.18.0] — 2026-07-16
### Turn It Up
- **Sound!** A tiny **Web Audio synth engine** (`src/audio.js`) generates every effect on the fly — no audio files to download. Wired to game events:
  - **Per-weapon fire** — the pistols' *pop*, the shotgun/`.357` *boom*, the rifle *crack*, the SMG/assault-rifle *rattle*, the bazooka *launch*, plus melee *swipe / thud / chop* and the grenade *clink*.
  - **Feedback** — explosions, reload, taking a hit, medkit/pickup blips, glass smashing, wood splintering, weapon-swap/UI clicks.
  - **The horde** — zombie **groans** on spawn and spitter **hisses**.
- **Sound toggle** — a **Sound: On/Off** button on the menu; your choice is saved (localStorage). Audio starts on your first tap/click (browser autoplay rules).

## [0.17.0] — 2026-07-16
### Home & Away
- **Front-yard start** — heading out into the neighborhood now drops you in **your house's fenced front yard** (on the path by the gate) instead of the middle of the road.
- **A park with a playground** — one neighborhood block is now a proper **park**: a sandy playground with **swings, a slide, and a seesaw**, plus benches and shade trees (open, no fence).
- **Pushable furniture** — **sofas, dressers, coffee tables and chairs** now **slide when you shove into them** (heavier pieces resist more; they won't slide into walls), and the house is more furnished (added dressers, a chair, and an upstairs coffee table). Tall pieces still stop bullets; low ones you shoot over; everything still blocks movement and can be smashed.

## [0.16.0] — 2026-07-16
### Down the Drain
- **Zombie rats** — a tiny, fast, weak new enemy that **swarms the sewers** in scurrying packs (rendered as little four-legged critters, weighted heavily in the underground spawn table).
- **Flowing water** — the sewer tunnels now render **animated, scrolling water ripples**, with **deep channels** (darker, coarse patches carved through the maze) among the shallow water.
- **Concealed horde** — zombies (and rats) standing in **deep water are hidden**, fading into view only as they **close in on you** — so the currents can hide an ambush. (Deep water is still fully walkable; it's a visual concealment, not a wall.)

## [0.15.2] — 2026-07-16
### Second Wind
- **More stamina** (max raised from 100 to 140) that **drains more slowly** while sprinting (base sprint cost cut from 34/s to 24/s) — so a sprint lasts roughly twice as long.
- **Gear and injury cost you** — wearing a **helmet** (+12%) or **body armor** (+20%) makes sprinting drain faster, and stamina drains faster the **lower your health** (up to +50% at near-death). Adrenaline still halves the drain.

## [0.15.1] — 2026-07-16
### Melee Fix
- **Knives and axes now hit small zombies and dogs.** At point-blank the target sits so close that a small lateral offset becomes a large angle, which slipped the melee's narrow swing arc — so smaller/faster foes (dogs, crawlers, runners) that stop nearer the player were being missed. Melee now connects with anything **pressed against you from the front or sides**, regardless of the strict arc (rear attacks still don't count). Also fixed an angle-difference rounding bug that could drop hits when facing near due-left/right.

## [0.15.0] — 2026-07-15
### Arsenal
- **Pistol family** — a fast, weak **.22**, the standard **9mm**, and a hard-hitting **.357 Magnum**, each with its own damage/fire-rate/magazine, **reload time**, and distinct pixel graphics (the .357 is a revolver).
- **Shotgun family** — **pump**, **semi-auto**, and a two-barrel **side-by-side** (fires both fast, only two shells); **rifle family** — a bolt-action **hunting rifle**, a semi-auto **battle rifle**, and a full-auto **assault rifle**. All drawn distinctly.
- **Weapon buttons** — a new on-screen bar shows a button for **every weapon you're carrying** (added as you pick them up) and lets you **tap to switch**; the cycle button remains. The current weapon is highlighted and **pulses while reloading**.
- **Reload cycle indicator** — an arc sweeps around the player as the weapon reloads.
- **More carnage** — a base per-hit dismemberment chance (on top of weapon/damage scaling) so **limbs come off more readily**, and every hit sprays more blood plus **chunks of flesh and torn clothing**.
- **Shoot over low furniture** — bullets now fly over **tables, chairs, couches and benches**; tall cover (shelves, crates, barrels, cars, bushes) still stops them. Movement still collides with everything.
- **Semi-transparent YOU DIED dialog** — the death card is now translucent (with a faint blood film) so the carnage shows through.

## [0.14.0] — 2026-07-15
### Into the Sewers
- **Open manholes** at four intersections of the streets — step onto one to **drop into the sewers**.
- **The sewers** are a procedurally generated **maze of 2-wide water tunnels** through concrete (randomized DFS with a few extra loops), with **ladders** back up to the surface, their own murky terrain palette, wall rendering and mini-map.
- **Surface elsewhere** — each ladder maps to a **different street manhole**, so you can travel underground and come up in another part of the neighborhood (a way to slip past the horde). The transition reuses the floor-cache system, so the streets and the sewers each keep their own layout, loot, blood and bodies.
- New `MANHOLE` tile (walkable) with distinct open-manhole (street) and lit ladder-shaft (sewer) rendering, and a step-on-to-enter trigger that won't bounce you straight back on arrival.

## [0.13.0] — 2026-07-15
### Chaos & Carnage
- **Randomized spawns & loot** — item locations are re-scattered every level, and each wave the horde streams in from a fresh set of **randomized origin fronts** (2–4 directions) instead of the same place.
- **Difficulty ramp** — wave sizes now grow with a quadratic tail (much bigger late waves), spawn faster, scale HP harder, and shift toward tougher foes sooner.
- **More individual zombies** — per-zombie **arm-swing and stride** amplitude/speed, plus per-zombie **spit accuracy** (some barely miss, others spray). Limbs are **flung off more readily** when shot.
- **Zombie dogs** — a fast, low, four-legged runner that packs the **streets** outside (from wave 2).
- **Throwables** — **grenades** (lobbed on an arc, bounce off walls, detonate on a fuse) and **flares** (toss one and the horde flocks to it, drawn away from you). Picked up as loot; thrown with FIRE while selected.
- **Blast shockwave** — bazooka rockets and grenades now emit an expanding **shockwave** that damages and **knocks back everything** — zombies, furniture (wrecks skid outward), and the player — and shatters nearby windows/doors. A visible ring FX marks the wave.
- **Streets polish** — cleaner **picket fences**, layered **trees**, new **shrubs**, and some parked **cars/trucks are wrecked** — burning with licking flames and rising smoke.

## [0.12.1] — 2026-07-13
### Blood & Bullets Fixes
- **Death screen blood width** — the blood is now one **continuous full-width sheet**: the flow below the YOU DIED card matches the flow pouring from the top, instead of a narrower band under the dialog. The card is punched out as a clean, readable window with blood pooling on its top edge and dripping off the bottom.
- **More dynamic blood** — blood now **splashes** off the rising pool and off falling drips/drops, for a livelier, more fluid effect.
- **Fixed invisible bullets** — bullet tracers were being drawn *under* the fog-of-war overlay and getting dimmed out. They now draw **over** the fog with a **brighter core and a glowing head dot**, so rounds are clearly visible against any background (and while wearing a helmet).

## [0.12.0] — 2026-07-13
### Gear Up
- **Varied zombies** — every zombie is now generated with its own **jittered skin tone**, **grubby clothing colour** (from a broad palette) and **hairstyle** (short cap, long trailing hair, or bald), all carried through to its fallen-body decal so the horde reads as a crowd of individuals.
- **More detailed player** — the head gained hair, ears, eyes and a nose tip, and the player now has a **visible idle animation**: they stand and breathe, and the breathing **heaves harder and faster the lower their stamina** (winded → panting).
- **Body armor & helmets** — new protective pickups in **light and heavy grades**. The **helmet** soaks a slice of every hit; **body armor** soaks the bulk of what's left. Both show as **bars beside your health**, deplete as they absorb damage, and **break and disappear** at zero (with an on-screen callout). They're also rendered on the player (helmet dome + chest plate).
- **Damage side-flash** — taking a hit now flashes **blood-red bars down the left and right edges** of the screen, scaled to the **severity** of the health lost (armour softens it), fading out as you steady.
- **Adrenaline rush** — adrenaline now grants a lasting buff: your **stamina drains and refills at half rate** for ~14s, so you can sprint far longer (the stamina bar glows while it's active).

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

[0.18.1]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.18.1
[0.18.0]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.18.0
[0.17.0]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.17.0
[0.16.0]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.16.0
[0.15.2]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.15.2
[0.15.1]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.15.1
[0.15.0]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.15.0
[0.14.0]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.14.0
[0.13.0]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.13.0
[0.12.1]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.12.1
[0.12.0]: https://github.com/Bobs-Dev-Attic/Zombies/releases/tag/v0.12.0
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
