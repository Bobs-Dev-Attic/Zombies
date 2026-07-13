// Central version + changelog source. Update this on every release.
export const VERSION = "0.9.0";

export const CHANGELOG = [
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
