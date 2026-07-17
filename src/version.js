// Central version + changelog source. Update this on every release.
export const VERSION = "0.25.0";

export const CHANGELOG = [
  {
    version: "0.25.0",
    date: "2026-07-17",
    title: "Scorched Earth",
    changes: [
      "Most of the horde now tracks gore as they shamble — bloody footprints trailing behind the walkers and a dragging smear behind the crawlers.",
      "Grenade blasts now sear a smouldering black scorch mark into the ground where they went off — it glows with embers and coughs smoke for a while before settling into a permanent char. (Grenades already blow up on a fuse with a shockwave that damages and hurls zombies, furniture and even you.)",
    ],
  },
  {
    version: "0.24.0",
    date: "2026-07-17",
    title: "Squalor",
    changes: [
      "The whole world is grimier now — floors are littered with random debris, trash, crumpled paper, dark grime stains and heaped bags of garbage, and some furniture is already smashed or tipped over when you arrive.",
      "Torn curtains hang over the house windows, and some zombies drag a snagged scrap of cloth behind them.",
      "You now track bloody footprints when you walk through blood, and crawlers leave a dragging smear — trails that fade over time across floors, tile and rugs.",
      "Dim, moody lighting indoors and in the sewers: a darkness veil lit by warm, flickering lamps and a soft torch around you.",
      "The fog of war fades in a smoother, more gradual gradient instead of a hard edge.",
    ],
  },
  {
    version: "0.23.0",
    date: "2026-07-17",
    title: "From the Hip",
    changes: [
      "The shotgun is now fired from the hip — the stock is tucked at your waist and the barrel angles across to your aim, so from the top-down view the gun swings out to your left or right as you turn.",
      "Firing it kicks the gun back, and the pump-action shotgun visibly racks its fore-end after each shot, spitting a spent red shell out the side.",
    ],
  },
  {
    version: "0.22.1",
    date: "2026-07-16",
    title: "Sharper Shot",
    changes: [
      "Reworked the pistol shot sound (the .22 and 9mm) into a punchier, crisper crack — a sharp snap with a low thump behind it, instead of the old thin pop.",
    ],
  },
  {
    version: "0.22.0",
    date: "2026-07-16",
    title: "Torn Apart",
    changes: [
      "Dead zombies on the ground now actually look like the zombie that fell — the corpse keeps its skin tone, the clothes it wore and its hairstyle, and lies torn open with its guts spilling out. Dogs and rats leave proper four-legged and tiny carcasses instead of a generic body, brutes leave a bigger one, and severed limbs show as stumps.",
      "When you die, the horde rips you limb from limb: your head, arms, legs and torso are torn off and flung tumbling across the ground, your organs spill out, and blood sprays everywhere before the screen floods red.",
    ],
  },
  {
    version: "0.21.0",
    date: "2026-07-16",
    title: "Carrion",
    changes: [
      "Carrion birds now haunt the neighborhood — crows, blackbirds and vultures glide down to pick at the dead, hopping and pecking at the corpses.",
      "Come too close and the whole flock scatters into the air, cawing (the vultures screech), then wheels away.",
      "You can shoot them out of the sky for points — a puff of feathers and they drop — but they never attack you; they're just scavengers.",
    ],
  },
  {
    version: "0.20.0",
    date: "2026-07-16",
    title: "Home Furnishings",
    changes: [
      "Varied flooring in the house — each room now has its own surface: hardwood planks with visible seams, ceramic tile with grout, poured cement with hairline cracks, a brick foyer inside the front door, and soft flecked carpet.",
      "Area rugs! Rooms are dressed with rugs — a medallioned Persian in the living room and bedroom, a striped modern rug under the dining table, and a diamond-patterned runner down the upstairs hall, each with a woven border and fringe.",
    ],
  },
  {
    version: "0.19.0",
    date: "2026-07-16",
    title: "Atmosphere & Broken Glass",
    changes: [
      "Shoving furniture now tires you out — the bigger and heavier the piece, the more it drains your stamina to push it.",
      "Knives and axes now reliably damage every zombie and dog pressed against you, from any direction — no more small enemies slipping the swing.",
      "Flies! Swarms of tiny flies drift around bodies, blood and burning wrecks for atmosphere, and buzz audibly when they get near you.",
      "Burning vehicles outside now belch thick rising smoke plumes and embers.",
      "Redesigned windows as framed, reflective glass panes — and they smash with a cracking, tinkling sound, showering falling shards and leaving broken glass on the ground.",
    ],
  },
  {
    version: "0.18.1",
    date: "2026-07-16",
    title: "Walk This Way",
    changes: [
      "Zombies now walk on proper legs with feet, stepping fore-and-aft in a shambling stride like the player instead of just shuffling. About a third of them drag a leg in a limp, and the legless still crawl.",
    ],
  },
  {
    version: "0.18.0",
    date: "2026-07-16",
    title: "Turn It Up",
    changes: [
      "Sound! Every weapon has its own gunshot or swing, plus explosions, reloads, glass smashing, wood splintering, pickups, taking a hit, zombie groans and spitter hisses — all generated live (no downloads).",
      "A Sound: On/Off toggle on the menu (your choice is remembered).",
    ],
  },
  {
    version: "0.17.0",
    date: "2026-07-16",
    title: "Home & Away",
    changes: [
      "You now start out in your house's front yard when you head out into the neighborhood.",
      "A neighborhood park with a playground — swings, a slide, a seesaw, benches and a sandpit.",
      "Push the furniture around! Sofas, dressers, coffee tables and chairs slide when you shove them (heavier pieces budge less), and there are more of them in the house.",
    ],
  },
  {
    version: "0.16.0",
    date: "2026-07-16",
    title: "Down the Drain",
    changes: [
      "Zombie rats now swarm the sewers — tiny, fast, and weak, but they come in packs.",
      "The sewer water flows, with darker deep channels running through the tunnels.",
      "The horde can lurk hidden in the deep water, only becoming visible as it closes in on you — watch the currents.",
    ],
  },
  {
    version: "0.15.2",
    date: "2026-07-16",
    title: "Second Wind",
    changes: [
      "More stamina and it drains more slowly, so you can sprint about twice as long.",
      "Carrying a helmet or body armor tires you a little faster, and sprinting drains faster the more hurt you are.",
    ],
  },
  {
    version: "0.15.1",
    date: "2026-07-16",
    title: "Melee Fix",
    changes: [
      "Fixed knives and axes missing small zombies and dogs — up close, a small side offset became a big angle that slipped the narrow swing arc. Melee now reliably connects with anything pressed against you from the front or sides (and a facing-angle rounding bug was fixed too).",
    ],
  },
  {
    version: "0.15.0",
    date: "2026-07-15",
    title: "Arsenal",
    changes: [
      "Three pistols — a fast, weak .22, the standard 9mm, and a hard-hitting .357 Magnum — each with its own stopping power, reload time and look.",
      "Three shotguns — pump, semi-auto, and a two-barrel side-by-side — and three rifles — a bolt-action hunting rifle, a semi-auto battle rifle, and a full-auto assault rifle. Each has distinct graphics.",
      "New on-screen weapon buttons show every gun you're carrying and let you tap to switch — the cycle button is still there too. The active weapon is highlighted and pulses while reloading.",
      "A reload cycle indicator now sweeps around the player as you reload.",
      "Body parts come off more readily, and shots throw off more blood and chunks of flesh and clothing.",
      "Bullets now fly over low furniture like tables and chairs (tall cover — shelves, crates, cars — still stops them).",
      "The YOU DIED dialog is now semi-transparent so the carnage shows through it.",
    ],
  },
  {
    version: "0.14.0",
    date: "2026-07-15",
    title: "Into the Sewers",
    changes: [
      "Open manholes are scattered across the streets — step onto one to drop down into the sewers.",
      "The sewers are a dark maze of water tunnels and concrete, with ladders back up to the surface.",
      "The ladders come up at different manholes, so you can travel underground and surface in another part of the neighborhood — handy for slipping past the horde.",
      "The sewers keep their own layout, loot and mess, and have their own murky look and mini-map.",
    ],
  },
  {
    version: "0.13.0",
    date: "2026-07-15",
    title: "Chaos & Carnage",
    changes: [
      "Item locations and the horde's spawn fronts are now randomized every wave, and the difficulty ramps harder as waves climb — bigger, faster, tougher hordes.",
      "Zombies move with more individuality: each swings its arms and strides differently, spitters vary in accuracy, and limbs fly off more readily when you shoot them.",
      "Zombie dogs! Fast four-legged packs prowl the streets outside.",
      "New throwables — grenades that blow up on a fuse, and flares that you toss to lure the horde away from you.",
      "Bazooka and grenade blasts now send out a shockwave that damages and hurls everything: zombies, furniture, and even you get blown back, and nearby windows/doors shatter.",
      "Fixed the look of fences and trees, added shrubs, and some parked cars and trucks are now wrecked — burning, smoking and smouldering.",
    ],
  },
  {
    version: "0.12.1",
    date: "2026-07-13",
    title: "Blood & Bullets Fixes",
    changes: [
      "Death screen: the blood is now one continuous full-width sheet — the blood dripping below the YOU DIED card matches the blood pouring from the top (no more narrow band under the dialog).",
      "Death screen: blood now splashes off impacts and the rising pool for a more dynamic, fluid look.",
      "Fixed invisible bullets — tracers now draw over the fog with a brighter core and a glowing head, so rounds stay clearly visible (including while wearing a helmet).",
    ],
  },
  {
    version: "0.12.0",
    date: "2026-07-13",
    title: "Gear Up",
    changes: [
      "The horde is no longer identical — every zombie now has its own skin tone, grubby clothing colour and hairstyle (short, long, or bald), carried through to its corpse.",
      "The player's head got more detail (hair, ears, eyes, a nose) and now has a visible idle: they stand and breathe, heaving harder and faster the more winded they are.",
      "Body armor and helmets! Pick them up to soak incoming damage — the helmet takes a slice of every hit, body armor soaks the bulk — shown as bars by your health. When a piece is used up it breaks and falls away. Light and heavy grades exist.",
      "Taking damage now flashes blood-red bars down the sides of the screen, scaled to how hard you were hit, fading as you recover.",
      "Adrenaline now gives a lasting rush — your stamina drains (and refills) far more slowly for a while, so you can sprint much longer.",
    ],
  },
  {
    version: "0.11.0",
    date: "2026-07-13",
    title: "The Neighborhood",
    changes: [
      "The Streets is now a real outdoor neighborhood instead of an indoor maze — a grid of asphalt roads with painted centre-lines and concrete sidewalks.",
      "Fenced front yards with houses (varied rooftops), backyard sheds, and dirt driveways line every block.",
      "Parked cars and trucks in assorted colours sit along the kerbs and in driveways — solid cover you can also shoot up and smash.",
      "Trees dot the yards, small parks fill the empty lots, and a road runs off the bottom of the map to the exit.",
    ],
  },
  {
    version: "0.10.0",
    date: "2026-07-13",
    title: "Bleed Out",
    changes: [
      "Death is no longer an instant cut — when you fall, the scene lingers for about a minute as the zombies close in over your body.",
      "A sheet of blood bleeds down from the top of the screen like a live fluid: a ragged, dripping front with surface tension, fast rivulets and detached droplets.",
      "Blood also pools up from the bottom with a wavy surface, until the whole screen is drowned in red.",
      "The YOU DIED card fades in through the flood — blood pools on its top edge and drips off its bottom while the card stays readable.",
    ],
  },
  {
    version: "0.9.0",
    date: "2026-07-13",
    title: "Keys, Axes & Upstairs",
    changes: [
      "Locked doors — some doors are shut tight. Open them with a key you find, chop through with the new axe, or shoot them off their hinges with enough bullets.",
      "New axe — a heavy melee tool that excels at battering down doors (and takes zombies apart nicely too). Find it in the kitchen.",
      "Doors now show a brass lock, crack apart as you beat on them, and leave a splintered gap when they break.",
      "Working staircase — climb the stairs to load the upper floor (two bedrooms, a bathroom and a landing) and head back down again.",
      "Each floor keeps its own layout, loot, blood and bodies, so it looks just as you left it when you return.",
    ],
  },
  {
    version: "0.8.0",
    date: "2026-07-13",
    title: "Welcome Home",
    changes: [
      "New House setting — a real home you start inside: a living room attached to a kitchen and dining room, each with its own floor and furniture.",
      "Windows and doors line the house; zombies break in through the windows (you can't climb through, but you can shoot the glass out) and pour in through doors.",
      "Zombies now emerge from the other rooms and the yard outside, not just off-screen.",
      "A staircase in the living room (leads upstairs — coming soon) and a front door out to the yard and the way out.",
    ],
  },
  {
    version: "0.7.0",
    date: "2026-07-13",
    title: "Fog & Map",
    changes: [
      "Fog of war — you only see what's in line of sight; explored areas stay dimly remembered and the unknown is dark.",
      "Mini-map in the corner showing the layout you've explored, the exit, nearby zombies and you.",
      "Nicer corpses — the dead now lie in blood pools as proper bodies instead of the old blobs.",
    ],
  },
  {
    version: "0.6.1",
    date: "2026-07-13",
    title: "Back to the Original",
    changes: [
      "Reverted the player to the original hand-drawn procedural character (per preference) — the sprite-sheet rendering was removed.",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-07-13",
    title: "Sprite Sheets",
    changes: [
      "The player is now drawn from a hand-illustrated sprite sheet instead of procedural pixels.",
      "Facing snaps to up/down/left/right with idle, walk, run and reaching poses.",
      "Dying plays a 3-frame collapse before the game-over screen.",
      "The weapon is still drawn on top so it aims freely; procedural art remains as an automatic fallback.",
    ],
  },
  {
    version: "0.5.0",
    date: "2026-07-13",
    title: "The Aftermath",
    changes: [
      "Bodies now stay where they fall — the dead pile up on the ground like the blood.",
      "Severed limbs fly off and come to rest on the floor.",
      "Furniture everywhere — crates, tables, chairs, barrels, shelves and couches you can shoot, smash, blow up or knock over (brutes barge right through).",
      "The exit is now a lit doorway to the outside with an EXIT sign.",
      "Damage now continuously slows a zombie and weakens its attacks as its health drops (on top of dismemberment).",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-07-13",
    title: "Pounce & Splatter",
    changes: [
      "Headshots! Every hit has a chance to instantly drop a zombie — a HEADSHOT banner pops, brains fly, and the body falls.",
      "Zombies now fall down with a collapse animation when killed.",
      "New leaper zombies (and runners) pounce at you with airborne jumps.",
      "Dynamic shadows that shift and stretch as the player and zombies move, and separate under a leap.",
      "Knife has three attacks now: a one-handed swing, a one-handed stab, and a two-handed lunge.",
      "Guns eject tumbling brass shells and throw a bigger animated muzzle flash with smoke.",
    ],
  },
  {
    version: "0.3.3",
    date: "2026-07-13",
    title: "No More Floating",
    changes: [
      "Reworked the walk/run so the player no longer glides like a ghost.",
      "Feet now plant on the ground and scissor fore/aft while the body bounces against a fixed shadow.",
      "Added a side-to-side walking sway and chunkier boots; strides get bigger and bouncier when sprinting.",
    ],
  },
  {
    version: "0.3.2",
    date: "2026-07-13",
    title: "Boots on the Ground",
    changes: [
      "Fixed weapon rotation — held weapons now truly point where the player faces (they were drawn flat, so they looked stuck at 90°).",
      "Rebuilt the player as a fully rotating figure, so the body and weapon align to any direction.",
      "New walk/run cycle: legs and feet actually step, with bigger, faster strides when sprinting.",
    ],
  },
  {
    version: "0.3.1",
    date: "2026-07-13",
    title: "The Shamble",
    changes: [
      "Held weapons now point exactly where the player is facing.",
      "Zombies are slower and shamble — weaving, curving and lurching in their own stride instead of marching in straight lines.",
      "Each zombie has its own gait: differing stride speed, sway and body lean.",
      "More crawlers dragging themselves along the ground, from the very first wave.",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-07-13",
    title: "Guts & Grabbing",
    changes: [
      "Bodies now collide — zombies can't stack on each other or stand on you; they jostle and swarm.",
      "Zombies reach out with animated, clawing arms.",
      "The player has animated arms that recoil when firing and swing when meleeing.",
      "Dismemberment: shoot or smash off limbs. Lost legs cripple speed (and drop them prone); lost arms weaken their hits.",
      "New prone crawlers that drag themselves along the ground.",
      "Heavier weapons (rifle, shotgun, bazooka, bat) tear limbs off more readily.",
    ],
  },
  {
    version: "0.2.1",
    date: "2026-07-13",
    title: "Fresh Updates",
    changes: [
      "Fixed caching so new versions show up immediately after each deploy (no more stale game code for returning players).",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-07-13",
    title: "Manual Aiming",
    changes: [
      "Removed auto-aim — you now control the direction you shoot and swing.",
      "Your weapon fires or swings in the direction you're facing.",
      "You face the way you move (stick / WASD); your aim holds when you stop.",
      "Desktop: point with the mouse to aim independently of movement.",
    ],
  },
  {
    version: "0.1.1",
    date: "2026-07-13",
    title: "Installable & Deployed",
    changes: [
      "Live on Vercel with automatic deploys on every merge to main.",
      "Added a PWA web-app manifest + icon so the game installs to the home screen and launches fullscreen.",
      "Cleaned up the production build (removed the console debug hook).",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-07-12",
    title: "First Playable",
    changes: [
      "Top-down zombie escape: player stays centred as the world scrolls.",
      "Pixel-art rendering on a low-res buffer with smooth entity motion.",
      "Portrait & landscape support with adaptive virtual resolution.",
      "Touch controls: virtual joystick, fire, reload, swap, interact — plus full keyboard/mouse.",
      "Weapons: knife, bat, pistol, shotgun, rifle, machine gun, bazooka.",
      "Stamina & wound system that slows the player when exhausted or badly hurt.",
      "Zombie variety: walkers, runners, crawlers, brutes & spitters with distinct chase patterns.",
      "Blood, gore chunks and screen-shake feedback.",
      "Pickups: weapons, ammo, medkits & adrenaline. Openable doors.",
      "Wave survival with escalating hordes; reach the EXIT to change setting.",
      "In-game changelog + version tracking.",
    ],
  },
];
