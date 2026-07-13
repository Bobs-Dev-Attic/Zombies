// Central version + changelog source. Update this on every release.
export const VERSION = "0.3.1";

export const CHANGELOG = [
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
