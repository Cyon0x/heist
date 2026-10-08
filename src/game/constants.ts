/**
 * HEIST — simulation constants.
 *
 * Everything is expressed in *ticks* (1 tick = 1/30 s) so the simulation is a
 * discrete, reproducible state machine rather than a float race. Speeds are
 * given per second and converted once, at module load.
 */

export const TICK_HZ = 30;
export const TICK_MS = 1000 / TICK_HZ;
export const TICK_DT = 1 / TICK_HZ;
export const SNAPSHOT_HZ = 15;
export const SNAPSHOT_EVERY = TICK_HZ / SNAPSHOT_HZ; // 2 ticks
export const INPUT_HZ = 20;

/** World units. One tile is 40 units, so a player (r=13) is a third of a corridor. */
export const TILE = 40;
export const PLAYER_RADIUS = 13;

const secs = (s: number) => Math.round(s * TICK_HZ);

/** Match clock. */
export const MATCH_SECONDS = 240;
export const MATCH_TICKS = secs(MATCH_SECONDS);
export const LOCKDOWN_REMAINING = secs(60);
export const COUNTDOWN_TICKS = secs(3);

/** Movement. */
export const SPEED_WALK = 168 / TICK_HZ;
export const SPEED_SPRINT = 258 / TICK_HZ;
export const SPEED_SNEAK = 92 / TICK_HZ;
export const SPRINT_STAMINA_PER_TICK = 23 / TICK_HZ;
export const STAMINA_REGEN_PER_TICK = 17 / TICK_HZ;
export const STAMINA_REGEN_DELAY = secs(0.9);
export const STAMINA_MAX = 100;
export const STAMINA_SPRINT_FLOOR = 8;

/** Dash. */
export const DASH_SPEED = 640 / TICK_HZ;
export const DASH_TICKS = 6;
export const DASH_COOLDOWN = secs(3.6);
export const DASH_STAMINA = 26;

/** Combat. */
export const HP_MAX = 130;
export const WEAPON_DAMAGE = 10;
export const WEAPON_FIRE_COOLDOWN = secs(0.19);
export const WEAPON_RANGE = 760;
export const WEAPON_SPREAD = 0.055;
export const BULLET_SPEED = 1180 / TICK_HZ;
export const MELEE_DAMAGE = 28;
export const MELEE_RANGE = 40;
export const MELEE_COOLDOWN = secs(0.6);

/** Abilities. */
export const EMP_RADIUS = 250;
export const EMP_COOLDOWN = secs(22);
export const EMP_DISABLE_TICKS = secs(6);
export const SCAN_RADIUS = 520;
export const SCAN_COOLDOWN = secs(18);
export const SCAN_TICKS = secs(2.6);

/** Lives. */
export const LIVES_MAX = 2;
export const RESPAWN_TICKS = secs(4);
export const PROTECT_TICKS = secs(2.5);
/** Recovery. Without this, every wound is permanent and every fight ends in a
 *  kill, which collapses a 4-minute match into a 40-second one. */
export const REGEN_DELAY = secs(5);
export const REGEN_PER_TICK = 2.1 / TICK_HZ;

/** Objectives. */
export const HACK_CAMERAS_TICKS = secs(3.5);
export const HACK_VAULT_TICKS = secs(5);
export const HACK_RANGE = 62;
export const CORE_PICKUP_TICKS = secs(2.5);
export const CORE_DROP_LOCK = secs(1.2);
export const EXTRACT_A_TICKS = secs(4);
export const EXTRACT_B_TICKS = secs(7);

/** Cameras. */
export const CAMERA_FOV = (78 * Math.PI) / 180;
export const CAMERA_RANGE = 430;
export const CAMERA_SWEEP = (58 * Math.PI) / 180;
export const CAMERA_SWEEP_PERIOD = secs(9);
export const CAMERA_ALERT_TICKS = secs(1.4);

/** Information: how loud each action is, in world units of "heard radius". */
export const NOISE = {
  none: 0,
  sneak: 60,
  walk: 150,
  sprint: 300,
  fire: 780,
  melee: 260,
  hack: 380,
  emp: 620,
  dash: 240,
  vault: 100000,
  core: 100000,
} as const;

export type NoiseKind = keyof typeof NOISE;

/** Player identity colours, used in HUD and on the map. */
export const PLAYER_TINT = ["#ffa227", "#6fd8e8"] as const;
