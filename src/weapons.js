// Weapon catalogue. Ammo is shared by type across weapons that use it.
// spread is in radians, fireRate in shots/sec, range in world px.

export const AMMO_TYPES = ["shells", "rounds", "rockets", "fuel"]; // knives/bats need no ammo

export const WEAPONS = {
  knife: {
    name: "Knife", tag: "KNF", kind: "melee_knife", melee: true, damage: 34,
    fireRate: 3.2, range: 26, arc: 1.1, knockback: 40, ammoType: null,
    sever: 0.16, hs: 0.12, sound: "swipe",
  },
  bat: {
    name: "Bat", tag: "BAT", kind: "melee_bat", melee: true, damage: 52,
    fireRate: 1.9, range: 30, arc: 1.35, knockback: 120, ammoType: null,
    sever: 0.28, hs: 0.14, doorMul: 1.6, sound: "thud",
  },
  axe: {
    name: "Axe", tag: "AXE", kind: "melee_axe", melee: true, damage: 46,
    fireRate: 1.7, range: 30, arc: 1.15, knockback: 130, ammoType: null,
    sever: 0.34, hs: 0.16, doorMul: 3.2, sound: "chop", alwaysSever: true,
  },
  sword: {
    name: "Katana", tag: "SWD", kind: "melee_sword", melee: true, damage: 62,
    fireRate: 2.8, range: 34, arc: 1.5, knockback: 70, ammoType: null,
    sever: 0.6, hs: 0.2, doorMul: 2.0, sound: "chop", alwaysSever: true,
  },

  // --- Pistols: rising stopping power, falling speed & magazine, own reloads.
  pistol22: {
    name: ".22 Pistol", tag: ".22", kind: "pistol22", damage: 15, fireRate: 6.5, pellets: 1,
    spread: 0.04, range: 240, speed: 500, clip: 14, ammoType: "rounds",
    reload: 0.85, knockback: 26, sever: 0.03, hs: 0.06, sound: "pop",
  },
  pistol: {
    name: "9mm Pistol", tag: "9mm", kind: "pistol", damage: 26, fireRate: 4.5, pellets: 1,
    spread: 0.03, range: 260, speed: 520, clip: 12, ammoType: "rounds",
    reload: 1.1, knockback: 60, sever: 0.06, hs: 0.09, sound: "pop",
  },
  pistol357: {
    name: ".357 Magnum", tag: "357", kind: "pistol357", damage: 54, fireRate: 2.2, pellets: 1,
    spread: 0.02, range: 300, speed: 620, clip: 6, ammoType: "rounds",
    reload: 1.6, knockback: 140, sever: 0.22, hs: 0.2, sound: "boom",
  },

  smg: {
    name: "Machine Gun", tag: "SMG", kind: "smg", damage: 17, fireRate: 12, pellets: 1,
    spread: 0.11, range: 240, speed: 560, clip: 34, ammoType: "rounds",
    reload: 1.6, knockback: 30, auto: true, sever: 0.05, hs: 0.05, sound: "rattle",
  },

  // --- Shotguns: pump, semi-auto, and a hard-hitting side-by-side.
  shotgun: {
    name: "Pump Shotgun", tag: "PMP", kind: "shotgun", damage: 15, fireRate: 1.3, pellets: 8,
    spread: 0.34, range: 150, speed: 480, clip: 6, ammoType: "shells",
    reload: 2.2, knockback: 90, sever: 0.11, hs: 0.04, sound: "boom",
  },
  shotgun_semi: {
    name: "Semi-Auto Shotgun", tag: "S-A", kind: "shotgun_semi", damage: 13, fireRate: 2.6, pellets: 6,
    spread: 0.3, range: 150, speed: 480, clip: 8, ammoType: "shells",
    reload: 2.7, knockback: 70, sever: 0.09, hs: 0.04, sound: "boom",
  },
  shotgun_sxs: {
    name: "Side-by-Side", tag: "SxS", kind: "shotgun_sxs", damage: 17, fireRate: 3.0, pellets: 10,
    spread: 0.4, range: 140, speed: 470, clip: 2, ammoType: "shells",
    reload: 2.0, knockback: 130, sever: 0.14, hs: 0.05, sound: "boom",
  },

  // --- Rifles: bolt-action power, a semi-auto battle rifle, a full-auto AR.
  rifle: {
    name: "Hunting Rifle", tag: "BLT", kind: "rifle", damage: 62, fireRate: 1.7, pellets: 1,
    spread: 0.006, range: 480, speed: 860, clip: 5, ammoType: "rounds",
    reload: 2.0, knockback: 150, pierce: 2, sever: 0.42, hs: 0.24, sound: "crack",
  },
  rifle_semi: {
    name: "Battle Rifle", tag: "BR", kind: "rifle_semi", damage: 40, fireRate: 5, pellets: 1,
    spread: 0.02, range: 420, speed: 780, clip: 20, ammoType: "rounds",
    reload: 1.8, knockback: 110, pierce: 1, sever: 0.28, hs: 0.16, sound: "crack",
  },
  rifle_auto: {
    name: "Assault Rifle", tag: "AR", kind: "rifle_auto", damage: 24, fireRate: 10, pellets: 1,
    spread: 0.06, range: 360, speed: 720, clip: 30, ammoType: "rounds",
    reload: 2.0, knockback: 55, auto: true, sever: 0.12, hs: 0.1, sound: "rattle",
  },

  bazooka: {
    name: "Bazooka", tag: "RPG", kind: "bazooka", damage: 120, fireRate: 0.7, pellets: 1,
    spread: 0.01, range: 420, speed: 300, clip: 1, ammoType: "rockets",
    reload: 2.6, knockback: 200, explosive: 42, sever: 0.7, hs: 0, sound: "launch",
  },
  flamethrower: {
    name: "Flamethrower", tag: "FLM", kind: "flamethrower", damage: 5, fireRate: 20, pellets: 1,
    spread: 0.1, range: 200, speed: 0, clip: 100, ammoType: "fuel", unit: "L",
    reload: 2.6, knockback: 0, sever: 0, hs: 0, sound: "flame", flame: true,
  },
  grenade: {
    name: "Grenade", tag: "GRN", kind: "grenade", throwable: true, damage: 95, fireRate: 1.1,
    ammoType: "grenades", explosive: 44, fuse: 1.3, throwSpeed: 235, knockback: 220,
    sever: 0.5, sound: "clink",
  },
  flare: {
    name: "Flare", tag: "FLR", kind: "flare", throwable: true, damage: 0, fireRate: 1.2,
    ammoType: "flares", fuse: 9, throwSpeed: 210, sound: "hiss",
  },
};

// Order used when swapping weapons.
export const WEAPON_ORDER = [
  "knife", "bat", "axe", "sword",
  "pistol22", "pistol", "pistol357", "smg",
  "shotgun", "shotgun_semi", "shotgun_sxs",
  "rifle", "rifle_semi", "rifle_auto",
  "bazooka", "flamethrower", "grenade", "flare",
];

export function newLoadout() {
  return {
    owned: { knife: true, pistol: true },
    clip: { pistol: WEAPONS.pistol.clip },
    ammo: { shells: 0, rounds: 48, rockets: 0, fuel: 0, grenades: 0, flares: 0 },
    keys: 0,
    armor: 0, armorMax: 0,   // body-armour points (absorbs damage, then breaks)
    helmet: 0, helmetMax: 0, // helmet points
    current: "pistol",
  };
}
