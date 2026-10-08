/**
 * HEIST — the computer opponent.
 *
 * The AI has no privileges. It emits the same `Input` struct a keyboard emits,
 * it is collided by the same grid, damaged by the same numbers, and it can only
 * learn about the other player through the sensors the rules expose: line of
 * sight, camera alerts, noise events and Core alerts. Everything else is
 * *inference* — a decaying belief with a spread, which is why the AI sometimes
 * walks into an empty room.
 *
 * Difficulty is expressed as four honest dials (reaction, aim error, belief
 * decay, mistake rate) rather than by buffing its stats.
 */

import {
  DASH_STAMINA, EMP_COOLDOWN, HACK_RANGE, HP_MAX, PLAYER_RADIUS, SCAN_COOLDOWN,
  TILE, WEAPON_RANGE, type NoiseKind,
} from "./constants";
import { hasLineOfSight } from "./los";
import { EXTRACTION, GRID_H, GRID_W, TILE_DOOR, TILE_SOLID } from "./map";
import { buildGrid } from "./sim";
import { EMPTY_INPUT, other, type GameState, type Input, type PlayerId, type Vec } from "./types";

export type Difficulty = "recruit" | "professional" | "veteran" | "mastermind";

export interface Skill {
  /** Ticks of delay before the AI acts on new information (0-30). */
  reaction: number;
  /** Radians of aim wobble at the moment of firing. */
  aimError: number;
  /** Belief confidence lost per tick with no observation (0-1). */
  beliefDecay: number;
  /** Chance per decision window of choosing a knowingly worse goal. */
  mistake: number;
  /** How readily it commits to a fight rather than the objective. */
  aggression: number;
  /** Fraction of an enemy's speed it will predictively lead. */
  lead: number;
}

export const SKILLS: Record<Difficulty, Skill> = {
  recruit: { reaction: 14, aimError: 0.30, beliefDecay: 0.028, mistake: 0.22, aggression: 0.35, lead: 0.2 },
  professional: { reaction: 8, aimError: 0.17, beliefDecay: 0.018, mistake: 0.12, aggression: 0.5, lead: 0.45 },
  veteran: { reaction: 4, aimError: 0.09, beliefDecay: 0.012, mistake: 0.06, aggression: 0.45, lead: 0.6 },
  mastermind: { reaction: 2, aimError: 0.05, beliefDecay: 0.008, mistake: 0.025, aggression: 0.5, lead: 0.75 },
};

export interface Belief {
  pos: Vec;
  confidence: number;
  tick: number;
  /** World-unit radius of uncertainty. */
  spread: number;
  carrying: boolean;
}

export interface AiMemory {
  belief: Belief;
  /** Goal the AI is currently committed to. */
  goal: Goal;
  goalTile: number;
  goalChosenTick: number;
  flow: Int32Array | null;
  flowTile: number;
  /** Ticks until the AI is allowed to re-decide. */
  commitUntil: number;
  /**
   * Information that has arrived but that the AI has not reacted to yet. This
   * is the honest version of "reaction time": the AI sees instantly, but it
   * acts on what it saw `skill.reaction` ticks later.
   */
  pending: { pos: Vec; confidence: number; spread: number; observedAt: number } | null;
  /** Last tick a shot was fired, for burst discipline. */
  lastShot: number;
  /** Whether it currently thinks it should hide. */
  hiding: boolean;
}

export type Goal =
  | "hack-cameras"
  | "hack-vault"
  | "take-core"
  | "escape-a"
  | "escape-b"
  | "hunt"
  | "guard"
  | "retreat";

export function createMemory(start: Vec): AiMemory {
  return {
    belief: { pos: { ...start }, confidence: 0, tick: 0, spread: 500, carrying: false },
    goal: "hack-cameras",
    goalTile: -1,
    goalChosenTick: -999,
    flow: null,
    flowTile: -1,
    commitUntil: 0,
    pending: null,
    lastShot: -999,
    hiding: false,
  };
}

export interface AiSensors {
  /** Noise events heard since the last tick, from the opponent. */
  noises: { at: Vec; kind: NoiseKind; radius: number; by: PlayerId }[];
  /** Camera alerts naming the opponent. */
  cameraSpot: PlayerId | -1;
}

export function observeFor(me: PlayerId, sensors: AiSensors, state: GameState, mem: AiMemory, skill: Skill) {
  const foe = state.players[other(me)];
  const now = state.tick;

  // ---- gather this tick's evidence (a fresh observation, or nothing)
  let fresh: { pos: Vec; confidence: number; spread: number } | null = null;

  if (foe.alive && hasLineOfSight(buildGrid(state, scratchGrid), state.players[me].pos, foe.pos, 700)) {
    fresh = { pos: { ...foe.pos }, confidence: 1, spread: 18 };
  } else if (sensors.cameraSpot === other(me)) {
    fresh = { pos: { ...foe.pos }, confidence: 0.92, spread: 70 };
  } else {
    for (const n of sensors.noises) {
      if (n.by === me) continue;
      if (n.kind === "vault" || n.kind === "core") {
        fresh = { pos: { ...n.at }, confidence: 0.85, spread: 60 };
        break;
      }
      const hear = Math.min(1, n.radius / Math.max(1, Math.hypot(n.at.x - state.players[me].pos.x, n.at.y - state.players[me].pos.y)));
      const conf = Math.max(0.2, Math.min(0.72, hear));
      const spread = Math.max(60, n.radius * 0.55);
      if (!fresh || conf > fresh.confidence) fresh = { pos: { ...n.at }, confidence: conf, spread };
    }
  }

  if (state.core.holder === other(me)) {
    const conf = Math.max(0.6, fresh?.confidence ?? 0);
    if (!fresh || conf > fresh.confidence) {
      fresh = { pos: { ...state.core.pos }, confidence: conf, spread: 90 };
    }
    mem.belief.carrying = true;
  } else if (foe.alive || state.core.holder === null) {
    mem.belief.carrying = false;
  }

  // ---- react: commit pending evidence only after the reaction delay
  if (fresh && (!mem.pending || fresh.confidence >= mem.pending.confidence)) {
    mem.pending = { ...fresh, observedAt: now };
  }
  if (mem.pending && now - mem.pending.observedAt >= skill.reaction) {
    mem.belief = {
      pos: { ...mem.pending.pos },
      confidence: mem.pending.confidence,
      spread: mem.pending.spread,
      tick: now,
      carrying: mem.belief.carrying,
    };
    mem.pending = null;
  }
}

const scratchGrid = new Uint8Array(GRID_W * GRID_H);

/* ------------------------------------------------------------ navigation --- */

/** Walkable map for the navigator: doors are doors, and the AI chops through them. */
function walkable(state: GameState): Uint8Array {
  const g = new Uint8Array(GRID_W * GRID_H);
  buildGrid(state, g);
  // Open doors are passable.
  for (const d of state.doors) {
    if (!d.open && d.disabled <= 0) continue;
    for (let y = d.rect.y; y < d.rect.y + d.rect.h; y++) {
      for (let x = d.rect.x; x < d.rect.x + d.rect.w; x++) g[y * GRID_W + x] = 1;
    }
  }
  return g;
}

const tileOf = (p: Vec) => Math.floor(p.y / TILE) * GRID_W + Math.floor(p.x / TILE);

/** BFS flow field toward a target tile. Cached per goal tile. */
export function buildFlow(grid: Uint8Array, targetTile: number): Int32Array {
  const dist = new Int32Array(GRID_W * GRID_H).fill(-1);
  if (targetTile < 0 || targetTile >= dist.length) return dist;
  if (grid[targetTile] === TILE_SOLID) return dist;
  const queue = new Int32Array(GRID_W * GRID_H);
  let head = 0;
  let tail = 0;
  queue[tail++] = targetTile;
  dist[targetTile] = 0;
  while (head < tail) {
    const cur = queue[head++]!;
    const d = dist[cur]!;
    const cx = cur % GRID_W;
    const cy = (cur - cx) / GRID_W;
    const nbs = [cur - 1, cur + 1, cur - GRID_W, cur + GRID_W];
    for (let i = 0; i < 4; i++) {
      const n = nbs[i]!;
      const nx = n % GRID_W;
      const ny = (n - nx) / GRID_W;
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
      if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue;
      if (dist[n] !== -1) continue;
      if (grid[n] === TILE_SOLID) continue;
      dist[n] = d + 1;
      queue[tail++] = n;
    }
  }
  return dist;
}

function nearestOpenTile(grid: Uint8Array, from: Vec, target: Vec): number {
  const want = tileOf(target);
  if (grid[want] !== TILE_SOLID) return want;
  // Spiral outward for the closest walkable tile.
  const tx = want % GRID_W;
  const ty = (want - tx) / GRID_W;
  for (let r = 1; r < 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = tx + dx;
        const y = ty + dy;
        if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
        const t = y * GRID_W + x;
        if (grid[t] !== TILE_SOLID) return t;
      }
    }
  }
  return tileOf(from);
}

function dirFromFlow(flow: Int32Array, pos: Vec): Vec {
  const cur = tileOf(pos);
  const cx = cur % GRID_W;
  const cy = (cur - cx) / GRID_W;
  let best = flow[cur] ?? -1;
  let bx = 0;
  let by = 0;
  if (best < 0) return { x: 0, y: 0 };
  const options: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of options) {
    const x = cx + dx;
    const y = cy + dy;
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
    const v = flow[y * GRID_W + x]!;
    if (v < 0) continue;
    if (v < best) { best = v; bx = dx; by = dy; }
  }
  if (bx === 0 && by === 0) return { x: 0, y: 0 };
  // Aim at the centre of the next tile rather than due-compass, so paths look human.
  const tx = (cx + bx + 0.5) * TILE;
  const ty = (cy + by + 0.5) * TILE;
  const dx = tx - pos.x;
  const dy = ty - pos.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/* --------------------------------------------------------------- decision --- */

function chooseGoal(state: GameState, me: PlayerId, mem: AiMemory, skill: Skill): { goal: Goal; target: Vec } {
  const self = state.players[me];
  const foe = state.players[other(me)];
  const core = state.core;
  const camerasHacked = state.securityDisabled;
  const vaultOpen = state.doors.some((d) => d.id.startsWith("vault-") && (d.open || d.disabled > 0));
  const knownFoe = mem.belief.confidence > 0.35 && state.tick - mem.belief.tick < 240;

  // A mistake is a deliberate detour — never an impossible one, or the AI
  // would just pace back and forth in front of a terminal it already used.
  if (Math.random() < skill.mistake) {
    const detours: { goal: Goal; target: Vec }[] = [];
    if (!camerasHacked) detours.push({ goal: "hack-cameras", target: state.terminals[0]!.pos });
    if (camerasHacked && !vaultOpen) detours.push({ goal: "hack-vault", target: state.terminals[1]!.pos });
    if (vaultOpen) detours.push({ goal: "take-core", target: core.pos });
    if (knownFoe) detours.push({ goal: "hunt", target: mem.belief.pos });
    if (detours.length > 0) return detours[Math.floor(Math.random() * detours.length)]!;
  }

  // 1. Fatal danger: back off and heal.
  if (self.hp < HP_MAX * 0.45 && knownFoe && mem.belief.confidence > 0.55) {
    return { goal: "retreat", target: awayFrom(self.pos, mem.belief.pos, 420) };
  }

  // 2. Holding the Core: leave, immediately, by the safest open route.
  if (self.carrying) {
    const pick = self.hp > 55 ? "A" : "B";
    const r = EXTRACTION[pick].rect;
    if (pick === "A" && self.hp < 40) {
      const rb = EXTRACTION.B.rect;
      return { goal: "escape-b", target: { x: (rb.x + rb.w / 2) * TILE, y: (rb.y + rb.h / 2) * TILE } };
    }
    return {
      goal: pick === "A" ? "escape-a" : "escape-b",
      target: { x: (r.x + r.w / 2) * TILE, y: (r.y + r.h / 2) * TILE },
    };
  }

  // 3. The opponent is carrying: intercept, hard.
  if (core.holder !== null && core.holder !== me) {
    return { goal: "hunt", target: mem.belief.pos };
  }

  // 4. A wounded opponent within reach is worth the detour — but only if the
  //    AI is healthy enough that the detour is not just a trade.
  if (knownFoe && foe.hp < 40 && mem.belief.confidence > 0.7 && self.hp > 60 && skill.aggression > 0.45) {
    return { goal: "hunt", target: mem.belief.pos };
  }

  // 5. The Core is loose on the floor — it will not be there long.
  if (core.holder === null && core.lastDrop && state.tick - (mem.belief.tick ?? 0) < 600 && core.lock <= 0 && vaultOpen) {
    return { goal: "take-core", target: core.pos };
  }

  // 6. Objectives, in order: kill the cameras, open the vault.
  if (!camerasHacked) return { goal: "hack-cameras", target: state.terminals[0]!.pos };
  if (!vaultOpen) return { goal: "hack-vault", target: state.terminals[1]!.pos };
  return { goal: "take-core", target: core.pos };
}

function zoneCentre(key: "A" | "B"): Vec {
  const r = EXTRACTION[key].rect;
  return { x: (r.x + r.w / 2) * TILE, y: (r.y + r.h / 2) * TILE };
}

function awayFrom(self: Vec, threat: Vec, distance: number): Vec {
  const dx = self.x - threat.x;
  const dy = self.y - threat.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: self.x + (dx / len) * distance, y: self.y + (dy / len) * distance };
}

/* ------------------------------------------------------------------- input -- */

export interface AiTick {
  noises: { at: Vec; kind: NoiseKind; radius: number; by: PlayerId }[];
  cameraSpot: PlayerId | -1;
}

export function aiInput(state: GameState, me: PlayerId, mem: AiMemory, skill: Skill, sensors: AiTick): Input {
  observeFor(me, { noises: sensors.noises, cameraSpot: sensors.cameraSpot }, state, mem, skill);

  const self = state.players[me];
  const input: Input = { ...EMPTY_INPUT, seq: state.tick };

  if (!self.alive) return input;

  const grid = walkable(state);

  // Belief decay — nothing is remembered forever.
  if (state.tick - mem.belief.tick > 0) {
    mem.belief.confidence = Math.max(0, mem.belief.confidence - skill.beliefDecay);
    mem.belief.spread = Math.min(900, mem.belief.spread + skill.beliefDecay * 2600);
  }

  // Re-decide on a cadence, or immediately when the situation changes.
  const here = tileOf(self.pos);
  const stranded = mem.flow !== null && mem.flow[here] === -1;
  const stale = state.tick >= mem.commitUntil || stranded;
  if (stale) {
    let choice = chooseGoal(state, me, mem, skill);
    let tile = nearestOpenTile(grid, self.pos, choice.target);
    let flow = buildFlow(grid, tile);
    // The goal is unreachable from here (a sealed blast door, a wrong guess).
    // Take the next sensible goal instead of standing still.
    if (flow[here] === -1) {
      const fallbacks: { goal: Goal; target: Vec }[] = [
        { goal: "hack-cameras", target: state.terminals[0]!.pos },
        { goal: "hack-vault", target: state.terminals[1]!.pos },
        { goal: "take-core", target: state.core.pos },
        { goal: "escape-b", target: zoneCentre("B") },
        { goal: "escape-a", target: zoneCentre("A") },
      ];
      for (const f of fallbacks) {
        const t = nearestOpenTile(grid, self.pos, f.target);
        const g = buildFlow(grid, t);
        if (g[here] !== -1) { choice = f; tile = t; flow = g; break; }
      }
    }
    if (choice.goal !== mem.goal || mem.flowTile !== tile || stranded) {
      mem.goal = choice.goal;
      mem.flowTile = tile;
      mem.flow = flow;
      mem.goalChosenTick = state.tick;
    }
    mem.commitUntil = state.tick + 12;
  }

  // Follow the flow field.
  let dir = mem.flow ? dirFromFlow(mem.flow, self.pos) : { x: 0, y: 0 };

  // Avoid re-walking a stale path when the goal is achieved.
  if (mem.goal === "take-core" && state.core.holder === me) dir = { x: 0, y: 0 };

  // Nearby enemy: close the gap or back off, and shoot.
  const foe = state.players[other(me)];
  const canSeeFoe = foe.alive && foe.protect <= 0 && hasLineOfSight(grid, self.pos, foe.pos, WEAPON_RANGE);
  const distanceToFoe = Math.hypot(foe.pos.x - self.pos.x, foe.pos.y - self.pos.y);

  if (canSeeFoe) {
    // Shooting is free; only *manoeuvring* for the fight costs the objective.
    if (mem.goal === "hunt") {
      const desired = 190;
      const toward = distanceToFoe > desired + 50 ? 1 : distanceToFoe < desired - 60 ? -1 : 0;
      const strafe = state.tick % 90 < 45 ? 1 : -1;
      const ax = (foe.pos.x - self.pos.x) / (distanceToFoe || 1);
      const ay = (foe.pos.y - self.pos.y) / (distanceToFoe || 1);
      dir = { x: ax * toward + -ay * 0.9 * strafe, y: ay * toward + ax * 0.9 * strafe };
      const len = Math.hypot(dir.x, dir.y) || 1;
      dir = { x: dir.x / len, y: dir.y / len };
    } else if (mem.goal === "retreat") {
      const ax = (self.pos.x - foe.pos.x) / (distanceToFoe || 1);
      const ay = (self.pos.y - foe.pos.y) / (distanceToFoe || 1);
      dir = { x: ax, y: ay };
    } else if (Math.hypot(dir.x, dir.y) < 0.15) {
      // Standing still in the open while shooting is how you die: sidestep.
      const ax = (foe.pos.x - self.pos.x) / (distanceToFoe || 1);
      const ay = (foe.pos.y - self.pos.y) / (distanceToFoe || 1);
      const strafe = state.tick % 80 < 40 ? 1 : -1;
      dir = { x: -ay * strafe, y: ax * strafe };
    }

    const lead = skill.lead * (distanceToFoe / 900);
    const px = foe.pos.x + foe.vel.x * lead * 30;
    const py = foe.pos.y + foe.vel.y * lead * 30;
    input.aimX = px - self.pos.x + (Math.random() - 0.5) * skill.aimError * 260;
    input.aimY = py - self.pos.y + (Math.random() - 0.5) * skill.aimError * 260;
    input.fire = true;
    if (distanceToFoe < 44) input.melee = true;

    if (self.hp < HP_MAX * 0.4 && mem.goal !== "hunt") input.sprint = true;
  } else if (mem.belief.confidence > 0.45) {
    // Aim where it believes the enemy is, and ready the trigger.
    input.aimX = mem.belief.pos.x - self.pos.x;
    input.aimY = mem.belief.pos.y - self.pos.y;
    input.fire = false;
  } else {
    input.aimX = dir.x;
    input.aimY = dir.y;
  }

  input.moveX = dir.x;
  input.moveY = dir.y;

  // Sprint when it needs distance and has the legs for it.
  const wantsDistance =
    mem.goal === "escape-a" || mem.goal === "escape-b" || mem.goal === "hunt" || mem.goal === "retreat";
  if (wantsDistance && self.stamina > DASH_STAMINA + 12) input.sprint = true;

  // Dash: to close, to flee, or to escape a shot.
  if (self.cooldowns.dash <= 0 && self.stamina > DASH_STAMINA + 20) {
    if (canSeeFoe && distanceToFoe > 220 && mem.goal === "hunt") input.dash = true;
    else if (canSeeFoe && self.hp < HP_MAX * 0.4) input.dash = true;
    else if (self.carrying && mem.belief.confidence > 0.6 && distanceToFoe < 260) input.dash = true;
  }

  // Scanner whenever belief has gone cold and it has the cooldown.
  if (mem.belief.confidence < 0.25 && self.cooldowns.scanner <= 0) input.scanner = true;

  // EMP: to blind a camera cluster, to open a sealed door, or when cornered.
  if (self.cooldowns.emp <= 0) {
    const doorSealed = state.doors.some((d) => !d.open && d.disabled <= 0 && state.lockdown);
    const nearCamera = state.cameras.some((c) => c.disabled <= 0 && Math.hypot(c.pos.x - self.pos.x, c.pos.y - self.pos.y) < 240);
    if (nearCamera && !state.securityDisabled && self.cooldowns.emp < EMP_COOLDOWN - 60) input.emp = true;
    else if (doorSealed && mem.flow && flowBlockedBySealedDoor(state, mem.flow, self.pos)) input.emp = true;
    else if (canSeeFoe && distanceToFoe < 150 && self.hp < 40) input.emp = true;
  }

  // Interactions: hold the button for the thing the goal is about.
  const interactRange = () => {
    if (mem.goal === "hack-cameras") return Math.hypot(state.terminals[0]!.pos.x - self.pos.x, state.terminals[0]!.pos.y - self.pos.y) < HACK_RANGE;
    if (mem.goal === "hack-vault") return Math.hypot(state.terminals[1]!.pos.x - self.pos.x, state.terminals[1]!.pos.y - self.pos.y) < HACK_RANGE;
    if (mem.goal === "take-core") return Math.hypot(state.core.pos.x - self.pos.x, state.core.pos.y - self.pos.y) < PLAYER_RADIUS + 26;
    return false;
  };
  const inZone = (key: "A" | "B") => {
    const r = EXTRACTION[key].rect;
    return self.pos.x >= r.x * TILE && self.pos.x < (r.x + r.w) * TILE &&
      self.pos.y >= r.y * TILE && self.pos.y < (r.y + r.h) * TILE;
  };
  if (mem.goal === "escape-a" && inZone("A")) input.interact = true;
  else if (mem.goal === "escape-b" && inZone("B")) input.interact = true;
  else if (interactRange()) input.interact = true;

  // Arrived: stop shoving into the thing we are interacting with.
  if (input.interact) { input.moveX = 0; input.moveY = 0; }

  return input;
}

function flowBlockedBySealedDoor(state: GameState, flow: Int32Array, pos: Vec): boolean {
  const cur = tileOf(pos);
  const cx = cur % GRID_W;
  const cy = (cur - cx) / GRID_W;
  for (const door of state.doors) {
    if (door.open || door.disabled > 0) continue;
    const d = flow[(door.rect.y + door.rect.h - 1) * GRID_W + door.rect.x] ?? -1;
    const e = flow[door.rect.y * GRID_W + (door.rect.x + door.rect.w - 1)] ?? -1;
    if (d < 0 && e < 0) continue;
    for (let y = door.rect.y; y < door.rect.y + door.rect.h; y++) {
      for (let x = door.rect.x; x < door.rect.x + door.rect.w; x++) {
        if (Math.abs(x - cx) + Math.abs(y - cy) <= 2) return true;
      }
    }
  }
  return false;
}

export const AI_HP_FULL = HP_MAX;
export const AI_CLOSE = PLAYER_RADIUS;
export const AI_DOOR = TILE_DOOR;
export const AI_SOLID = TILE_SOLID;
export const AI_SCAN_COOLDOWN = SCAN_COOLDOWN;
