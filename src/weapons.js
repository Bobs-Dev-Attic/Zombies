// Weapon catalogue. Ammo is shared by type across weapons that use it.
// spread is in radians, fireRate in shots/sec, range in world px.

export const AMMO_TYPES = ["shells", "rounds", "rockets"]; // knives/bats need no ammo

export const WEAPONS = {
  knife: {
    name: "Knife", kind: "melee_knife", melee: true, damage: 34,
    fireRate: 3.2, range: 26, arc: 1.1, knockback: 40, ammoType: null,
    sever: 0.16, sound: "swipe",
  },
  bat: {
    name: "Bat", kind: "melee_bat", melee: true, damage: 52,
    fireRate: 1.9, range: 30, arc: 1.35, knockback: 120, ammoType: null,
    sever: 0.28, sound: "thud",
  },
  pistol: {
    name: "Pistol", kind: "pistol", damage: 26, fireRate: 4.5, pellets: 1,
    spread: 0.03, range: 260, speed: 520, clip: 12, ammoType: "rounds",
    reload: 1.1, knockback: 60, sever: 0.06, sound: "pop",
  },
  smg: {
    name: "Machine Gun", kind: "smg", damage: 17, fireRate: 12, pellets: 1,
    spread: 0.11, range: 240, speed: 560, clip: 34, ammoType: "rounds",
    reload: 1.6, knockback: 30, auto: true, sever: 0.05, sound: "rattle",
  },
  rifle: {
    name: "Rifle", kind: "rifle", damage: 58, fireRate: 3, pellets: 1,
    spread: 0.008, range: 460, speed: 820, clip: 8, ammoType: "rounds",
    reload: 1.7, knockback: 140, pierce: 2, sever: 0.4, sound: "crack",
  },
  shotgun: {
    name: "Shotgun", kind: "shotgun", damage: 15, fireRate: 1.3, pellets: 8,
    spread: 0.34, range: 150, speed: 480, clip: 6, ammoType: "shells",
    reload: 2.2, knockback: 90, sever: 0.11, sound: "boom",
  },
  bazooka: {
    name: "Bazooka", kind: "bazooka", damage: 120, fireRate: 0.7, pellets: 1,
    spread: 0.01, range: 420, speed: 300, clip: 1, ammoType: "rockets",
    reload: 2.6, knockback: 200, explosive: 42, sever: 0.7, sound: "launch",
  },
};

// Order used when swapping weapons.
export const WEAPON_ORDER = ["knife", "bat", "pistol", "smg", "shotgun", "rifle", "bazooka"];

export function newLoadout() {
  return {
    owned: { knife: true, pistol: true },
    clip: { pistol: WEAPONS.pistol.clip },
    ammo: { shells: 0, rounds: 48, rockets: 0 },
    current: "pistol",
  };
}
