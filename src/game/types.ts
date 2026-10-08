import type { NoiseKind } from "./constants";

export type Vec = { x: number; y: number };
export type PlayerId = 0 | 1;

export const other = (id: PlayerId): PlayerId => (id === 0 ? 1 : 0);

export type MatchPhase =
  | "COUNTDOWN"
  | "ACTIVE"
  | "CORE_STOLEN"
  | "EXTRACTION"
  | "LOCKDOWN"
  | "COMPLETE";

export type EndReason =
  | "core_extracted"
  | "opponent_eliminated"
  | "eliminated"
  | "time_expired_core"
  | "draw_time"
  | "abandoned";

/** A raw player intent for one tick. The only way a player can affect the world. */
export interface Input {
  seq: number;
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  sprint: boolean;
  dash: boolean;
  fire: boolean;
  melee: boolean;
  emp: boolean;
  scanner: boolean;
  interact: boolean;
}

export const EMPTY_INPUT: Input = {
  seq: 0, moveX: 0, moveY: 0, aimX: 1, aimY: 0,
  sprint: false, dash: false, fire: false, melee: false,
  emp: false, scanner: false, interact: false,
};

export interface Cooldowns {
  dash: number;
  emp: number;
  scanner: number;
  melee: number;
  fire: number;
}

export interface PlayerState {
  id: PlayerId;
  pos: Vec;
  vel: Vec;
  aim: number;
  hp: number;
  lives: number;
  stamina: number;
  alive: boolean;
  /** Ticks until respawn; 0 when alive. */
  respawn: number;
  /** Ticks of spawn protection remaining. */
  protect: number;
  /** Ticks since this player last took damage — gates passive recovery. */
  hurt: number;
  cooldowns: Cooldowns;
  dashTicks: number;
  dashDir: Vec;
  staminaIdle: number;
  /** Objective channel progress, in ticks. */
  hacking: number;
  hackTarget: "cameras" | "vault" | "door" | null;
  /** Index into `GameState.doors` when forcing a blast door open. */
  hackDoor: number;
  grabbing: number;
  carrying: boolean;
  /** Extraction channel progress, in ticks. */
  extracting: number;
  extractZone: "A" | "B" | null;
  /** Ticks remaining on an active scanner pulse (own view). */
  scanTicks: number;
  kills: number;
  hacks: number;
  damageDealt: number;
  distance: number;
  coreHeldTicks: number;
  /** Movement mode last tick, for noise + animation. */
  mode: "idle" | "walk" | "sprint" | "sneak" | "dash";
}

export interface Bullet {
  id: number;
  owner: PlayerId;
  pos: Vec;
  vel: Vec;
  life: number;
}

export interface Camera {
  id: number;
  pos: Vec;
  facing: number;
  base: number;
  /** Ticks of EMP disable remaining. */
  disabled: number;
  /** Player spotted this tick (0/1) — drives the security alert. */
  sees: PlayerId | -1;
  alert: number;
}

export interface Terminal {
  id: "cameras" | "vault";
  pos: Vec;
  done: boolean;
}

export interface NoiseEvent {
  tick: number;
  at: Vec;
  kind: NoiseKind;
  radius: number;
  by: PlayerId;
}

export interface Pickup {
  id: number;
  pos: Vec;
  kind: "health" | "stamina";
  taken: boolean;
}

export interface GameState {
  tick: number;
  phase: MatchPhase;
  /** Ticks remaining in the match. */
  clock: number;
  countdown: number;
  players: [PlayerState, PlayerState];
  bullets: Bullet[];
  cameras: Camera[];
  terminals: Terminal[];
  core: {
    pos: Vec;
    holder: PlayerId | null;
    /** Ticks the Core must stay untouched before it can be picked up again. */
    lock: number;
    /** Where it was dropped (for the "CORE DROPPED" ping). */
    lastDrop: Vec | null;
  };
  extras: Pickup[];
  doors: { id: string; rect: { x: number; y: number; w: number; h: number }; open: boolean; disabled: number }[];
  securityDisabled: boolean;
  lockdown: boolean;
  winner: PlayerId | null;
  endReason: EndReason | null;
  /** Rolling log of game events, used for the HUD feed and the post-match card. */
  feed: { tick: number; kind: string; text: string; player: PlayerId | -1 }[];
  nextId: number;
}

/** What a client is allowed to see — produced by `observe()`, never by the client. */
export interface Observation {
  state: GameState;
  /** Per-player visibility: rooms/entities currently in line of sight. */
  visible: { players: boolean; core: boolean };
}
