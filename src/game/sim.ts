/**
 * HEIST — authoritative simulation.
 *
 * One pure-ish, fixed-step state machine. The browser, the Node game server and
 * the AI all run *this* code; there is no second implementation of the rules,
 * and the client can never move the goalposts because it only ever produces an
 * `Input`. `step()` mutates in place (a match tick allocates nothing) and is
 * deterministic for a given (state, inputs) pair on one machine.
 */

import {
  CAMERA_ALERT_TICKS, CAMERA_FOV, CAMERA_RANGE, CAMERA_SWEEP, CAMERA_SWEEP_PERIOD,
  CORE_DROP_LOCK, CORE_PICKUP_TICKS, COUNTDOWN_TICKS, DASH_COOLDOWN, DASH_SPEED,
  DASH_STAMINA, DASH_TICKS, EMP_COOLDOWN, EMP_DISABLE_TICKS, EMP_RADIUS,
  EXTRACT_A_TICKS, EXTRACT_B_TICKS, HACK_CAMERAS_TICKS, HACK_RANGE, HACK_VAULT_TICKS,
  HP_MAX, LIVES_MAX, LOCKDOWN_REMAINING, MATCH_TICKS, MELEE_COOLDOWN, MELEE_DAMAGE,
 MELEE_RANGE, NOISE, PLAYER_RADIUS, PROTECT_TICKS, RESPAWN_TICKS, SCAN_COOLDOWN,
  REGEN_DELAY, REGEN_PER_TICK,
  SCAN_TICKS, SPEED_SNEAK, SPEED_SPRINT, SPEED_WALK, STAMINA_MAX,
  STAMINA_REGEN_DELAY, STAMINA_REGEN_PER_TICK, STAMINA_SPRINT_FLOOR,
  SPRINT_STAMINA_PER_TICK, WEAPON_DAMAGE, WEAPON_FIRE_COOLDOWN, WEAPON_RANGE,
  WEAPON_SPREAD, BULLET_SPEED, TILE, type NoiseKind,
} from "./constants";
import { inCone } from "./los";
import {
  CAMERAS, CORE_SPAWN, DOOR_LAYOUT, EXTRACTION, EXTRAS, GRID, GRID_H, GRID_W, RESPAWN,
  SPAWNS, TERMINALS, TILE_SOLID,
} from "./map";
import type {
  Bullet, Camera, EndReason, GameState, Input, MatchPhase, PlayerId, PlayerState, Vec,
} from "./types";
import { other } from "./types";

/* ------------------------------------------------------------------ doors --- */

export const DOOR_FORCE_TICKS = 60; // 2s of held interact
export const CAMERA_OFF = 1_000_000;

/** Collision grid for this tick: static walls + any door that is not passable. */
export function buildGrid(state: GameState, out: Uint8Array): Uint8Array {
  out.set(GRID);
  for (const door of state.doors) {
    if (door.open || door.disabled > 0) continue;
    for (let y = door.rect.y; y < door.rect.y + door.rect.h; y++) {
      for (let x = door.rect.x; x < door.rect.x + door.rect.w; x++) {
        out[y * GRID_W + x] = TILE_SOLID;
      }
    }
  }
  return out;
}

/* -------------------------------------------------------------- collision --- */

function circleHits(grid: Uint8Array, cx: number, cy: number, r: number): boolean {
  const minX = Math.floor((cx - r) / TILE);
  const maxX = Math.floor((cx + r) / TILE);
  const minY = Math.floor((cy - r) / TILE);
  const maxY = Math.floor((cy + r) / TILE);
  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return true;
      if (grid[ty * GRID_W + tx] !== TILE_SOLID) continue;
      const nx = Math.max(tx * TILE, Math.min(cx, (tx + 1) * TILE));
      const ny = Math.max(ty * TILE, Math.min(cy, (ty + 1) * TILE));
      const dx = cx - nx;
      const dy = cy - ny;
      if (dx * dx + dy * dy < r * r) return true;
    }
  }
  return false;
}

function moveWithCollision(grid: Uint8Array, pos: Vec, dx: number, dy: number, r: number): number {
  let travelled = 0;
  if (dx !== 0) {
    const nx = pos.x + dx;
    if (!circleHits(grid, nx, pos.y, r)) { pos.x = nx; travelled += Math.abs(dx); }
  }
  if (dy !== 0) {
    const ny = pos.y + dy;
    if (!circleHits(grid, pos.x, ny, r)) { pos.y = ny; travelled += Math.abs(dy); }
  }
  return travelled;
}

/* --------------------------------------------------------------- factories -- */

function makePlayer(id: PlayerId): PlayerState {
  return {
    id,
    pos: { ...SPAWNS[id] },
    vel: { x: 0, y: 0 },
    aim: id === 0 ? 0 : Math.PI,
    hp: HP_MAX,
    lives: LIVES_MAX,
    stamina: STAMINA_MAX,
    alive: true,
    respawn: 0,
    protect: PROTECT_TICKS,
    hurt: REGEN_DELAY,
    cooldowns: { dash: 0, emp: 0, scanner: 0, melee: 0, fire: 0 },
    dashTicks: 0,
    dashDir: { x: 1, y: 0 },
    staminaIdle: 0,
    hacking: 0,
    hackTarget: null,
    hackDoor: -1,
    grabbing: 0,
    carrying: false,
    extracting: 0,
    extractZone: null,
    scanTicks: 0,
    kills: 0,
    hacks: 0,
    damageDealt: 0,
    distance: 0,
    coreHeldTicks: 0,
    mode: "idle",
  };
}

export interface CreateMatchOptions {
  /** Fix the RNG stream for reproducible AI tests. */
  seed?: number;
}

export function createMatch(_opts: CreateMatchOptions = {}): GameState {
  return {
    tick: 0,
    phase: "COUNTDOWN",
    clock: MATCH_TICKS,
    countdown: COUNTDOWN_TICKS,
    players: [makePlayer(0), makePlayer(1)],
    bullets: [],
    cameras: CAMERAS.map((c, i): Camera => ({
      id: i,
      pos: { ...c.pos },
      facing: c.facing,
      base: c.facing,
      disabled: 0,
      sees: -1,
      alert: 0,
    })),
    terminals: TERMINALS.map((t) => ({ id: t.id, pos: { ...t.pos }, done: false })),
    core: { pos: { ...CORE_SPAWN }, holder: null, lock: 0, lastDrop: null },
    extras: EXTRAS.map((e, i) => ({ id: i, pos: { ...e.pos }, kind: e.kind, taken: false })),
    doors: DOOR_LAYOUT.map((d) => ({
      id: d.id,
      rect: d.rect,
      open: !d.id.startsWith("vault-"),
      disabled: 0,
    })),
    securityDisabled: false,
    lockdown: false,
    winner: null,
    endReason: null,
    feed: [],
    nextId: 1,
  };
}

/* ------------------------------------------------------------------ events -- */

function say(state: GameState, kind: string, text: string, player: PlayerId | -1) {
  state.feed.push({ tick: state.tick, kind, text, player });
  if (state.feed.length > 60) state.feed.splice(0, state.feed.length - 60);
}

export type NoiseSink = (n: { at: Vec; kind: NoiseKind; radius: number; by: PlayerId }) => void;

/* -------------------------------------------------------------------- step -- */

export interface StepContext {
  grid: Uint8Array;
  /** Optional callback so the caller can broadcast noise to the other player. */
  onNoise?: NoiseSink;
}

export function newGridBuffer(): Uint8Array {
  const g = new Uint8Array(GRID_W * GRID_H);
  g.set(GRID);
  return g;
}

function noise(ctx: StepContext, p: PlayerState, kind: NoiseKind, radius: number) {
  ctx.onNoise?.({ at: { ...p.pos }, kind, radius, by: p.id });
}

function vaultOpen(state: GameState): boolean {
  return state.doors.some((d) => d.id.startsWith("vault-") && (d.open || d.disabled > 0));
}

export function step(state: GameState, inputs: [Input, Input], ctx: StepContext): void {
  state.tick += 1;
  buildGrid(state, ctx.grid);

  if (state.phase === "COMPLETE") return;

  if (state.phase === "COUNTDOWN") {
    state.countdown -= 1;
    if (state.countdown <= 0) {
      state.phase = "ACTIVE";
      say(state, "go", "INFILTRATION AUTHORISED", -1);
    }
    // Still run movement so the countdown does not feel frozen.
  } else {
    state.clock -= 1;
    if (!state.lockdown && state.clock <= LOCKDOWN_REMAINING) {
      state.lockdown = true;
      state.doors = state.doors.map((d) =>
        d.id.startsWith("ring-") ? { ...d, open: false } : d,
      );
      state.cameras = state.cameras.map((c) => ({ ...c, disabled: 0 }));
      say(state, "lockdown", "LOCKDOWN — BLAST DOORS SEALED, CAMERAS LIVE", -1);
    }
  }

  for (const door of state.doors) {
    if (door.disabled > 0) door.disabled -= 1;
  }

  for (const p of state.players) stepPlayer(state, p, inputs[p.id], ctx);
  stepBullets(state, ctx);
  stepCameras(state, ctx);
  stepCore(state, ctx);
  stepExtras(state, ctx);
  checkEnd(state);
}

function stepPlayer(state: GameState, p: PlayerState, input: Input, ctx: StepContext) {
  const active = state.phase !== "COMPLETE" && state.countdown <= 0;

  // ---- respawn / death bookkeeping
  if (!p.alive) {
    if (p.respawn > 0) p.respawn -= 1;
    if (p.respawn <= 0) {
      if (p.lives > 0) {
        p.alive = true;
        p.hp = HP_MAX;
        p.stamina = STAMINA_MAX;
        p.protect = PROTECT_TICKS;
        p.pos = { ...RESPAWN[p.id] };
        p.vel = { x: 0, y: 0 };
        p.carrying = false;
        p.hurt = 0;
        p.hacking = 0;
        p.hackTarget = null;
        p.grabbing = 0;
        p.extracting = 0;
      }
    }
    return;
  }
  if (p.protect > 0) p.protect -= 1;

  // Passive recovery once the heat has been off for a while.
  p.hurt += 1;
  if (p.hurt > REGEN_DELAY && p.hp < HP_MAX && p.hp > 0) {
    p.hp = Math.min(HP_MAX, p.hp + REGEN_PER_TICK);
  }

  for (const key of Object.keys(p.cooldowns) as (keyof typeof p.cooldowns)[]) {
    if (p.cooldowns[key] > 0) p.cooldowns[key] -= 1;
  }
  if (p.scanTicks > 0) p.scanTicks -= 1;

  if (!active) {
    p.mode = "idle";
    return;
  }

  // ---- aim
  const aimLen = Math.hypot(input.aimX, input.aimY);
  if (aimLen > 0.001) p.aim = Math.atan2(input.aimY, input.aimX);

  // ---- movement intent
  let mx = input.moveX;
  let my = input.moveY;
  const mLen = Math.hypot(mx, my);
  if (mLen > 1) { mx /= mLen; my /= mLen; }

  const moving = mLen > 0.05;
  const sneaking = moving && !input.sprint && mLen < 0.86;
  const wantsSprint = input.sprint && moving && p.stamina > STAMINA_SPRINT_FLOOR && p.dashTicks <= 0;
  let speed = sneaking ? SPEED_SNEAK : wantsSprint ? SPEED_SPRINT : SPEED_WALK;

  if (wantsSprint) {
    p.stamina = Math.max(0, p.stamina - SPRINT_STAMINA_PER_TICK);
    p.staminaIdle = STAMINA_REGEN_DELAY;
  } else {
    if (p.staminaIdle > 0) p.staminaIdle -= 1;
    else p.stamina = Math.min(STAMINA_MAX, p.stamina + STAMINA_REGEN_PER_TICK);
  }

  // ---- dash
  if (p.dashTicks > 0) {
    p.dashTicks -= 1;
    speed = DASH_SPEED;
    const travelled = moveWithCollision(ctx.grid, p.pos, p.dashDir.x * speed, p.dashDir.y * speed, PLAYER_RADIUS);
    p.distance += travelled;
    p.mode = "dash";
    if (p.dashTicks === 0) p.mode = "walk";
    p.vel = { x: p.dashDir.x * speed, y: p.dashDir.y * speed };
  } else {
    if (input.dash && p.cooldowns.dash <= 0 && p.stamina >= DASH_STAMINA && moving) {
      p.cooldowns.dash = DASH_COOLDOWN;
      p.dashTicks = DASH_TICKS;
      p.stamina -= DASH_STAMINA;
      p.dashDir = { x: mx, y: my };
      noise(ctx, p, "dash", NOISE.dash);
    }
    const dx = mx * speed;
    const dy = my * speed;
    const travelled = moveWithCollision(ctx.grid, p.pos, dx, dy, PLAYER_RADIUS);
    p.distance += travelled;
    p.vel = { x: dx, y: dy };
    p.mode = travelled < 0.01 ? "idle" : sneaking ? "sneak" : wantsSprint ? "sprint" : "walk";
  }

  // ---- continuous noise (only when actually moving)
  if (p.mode === "idle") { /* silent */ }
  else if (p.mode === "sneak") noise(ctx, p, "sneak", NOISE.sneak);
  else if (p.mode === "sprint") noise(ctx, p, "sprint", NOISE.sprint);
  else if (p.mode === "walk") noise(ctx, p, "walk", NOISE.walk);

  // ---- weapon / melee
  applyCombat(state, p, input, ctx);

  // ---- EMP
  if (input.emp && p.cooldowns.emp <= 0) {
    p.cooldowns.emp = EMP_COOLDOWN;
    noise(ctx, p, "emp", NOISE.emp);
    for (const cam of state.cameras) {
      if (dist(cam.pos, p.pos) <= EMP_RADIUS) { cam.disabled = EMP_DISABLE_TICKS; cam.sees = -1; }
    }
    let opened = 0;
    state.doors.forEach((d) => {
      const c = { x: (d.rect.x + d.rect.w / 2) * TILE, y: (d.rect.y + d.rect.h / 2) * TILE };
      if (dist(c, p.pos) <= EMP_RADIUS) { d.disabled = Math.max(d.disabled, EMP_DISABLE_TICKS); opened += 1; }
    });
    say(state, "emp", opened > 0 ? `EMP — ${opened} MAGLOCK${opened > 1 ? "S" : ""} RELEASED` : "EMP DETONATED", p.id);
  }

  // ---- scanner
  if (input.scanner && p.cooldowns.scanner <= 0) {
    p.cooldowns.scanner = SCAN_COOLDOWN;
    p.scanTicks = SCAN_TICKS;
    say(state, "scan", "MOTION SWEEP ACTIVE", p.id);
  }

  // ---- interactions
  applyInteractions(state, p, input, ctx);
}

function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function applyCombat(state: GameState, p: PlayerState, input: Input, ctx: StepContext) {
  if (input.fire && p.cooldowns.fire <= 0) {
    p.cooldowns.fire = WEAPON_FIRE_COOLDOWN;
    const spread = (Math.random() - 0.5) * WEAPON_SPREAD * 2;
    const a = p.aim + spread;
    state.bullets.push({
      id: state.nextId++,
      owner: p.id,
      pos: { x: p.pos.x + Math.cos(a) * 18, y: p.pos.y + Math.sin(a) * 18 },
      vel: { x: Math.cos(a) * BULLET_SPEED, y: Math.sin(a) * BULLET_SPEED },
      life: Math.round(WEAPON_RANGE / BULLET_SPEED),
    });
    noise(ctx, p, "fire", NOISE.fire);
    p.mode = "walk";
  }

  if (input.melee && p.cooldowns.melee <= 0) {
    p.cooldowns.melee = MELEE_COOLDOWN;
    noise(ctx, p, "melee", NOISE.melee);
    const foe = state.players[other(p.id)];
    if (foe.alive && foe.protect <= 0 && dist(foe.pos, p.pos) <= MELEE_RANGE + PLAYER_RADIUS) {
      let delta = Math.atan2(foe.pos.y - p.pos.y, foe.pos.x - p.pos.x) - p.aim;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      if (Math.abs(delta) < 1.1) damage(state, p, foe, MELEE_DAMAGE, "melee");
    }
  }
}

function damage(state: GameState, from: PlayerState, to: PlayerState, amount: number, cause: string) {
  to.hp -= amount;
  to.hurt = 0;
  from.damageDealt += amount;
  if (to.hp > 0) return;

  to.hp = 0;
  to.alive = false;
  to.lives -= 1;
  from.kills += 1;
  to.respawn = RESPAWN_TICKS;
  if (to.carrying) dropCore(state, to);
  say(state, "kill", `${cause === "melee" ? "CLOSE QUARTERS" : "TARGET DOWN"} — P${from.id + 1}`, from.id);
  if (to.lives <= 0) say(state, "eliminated", `P${to.id + 1} ELIMINATED`, to.id);
}

function dropCore(state: GameState, p: PlayerState) {
  p.carrying = false;
  state.core.holder = null;
  state.core.pos = { ...p.pos };
  state.core.lock = CORE_DROP_LOCK;
  state.core.lastDrop = { ...p.pos };
  say(state, "core-drop", "CORE DROPPED", p.id);
}

function stepBullets(state: GameState, ctx: StepContext) {
  const survivors: Bullet[] = [];
  for (const b of state.bullets) {
    let alive = true;
    b.life -= 1;
    if (b.life <= 0) continue;
    const steps = 3;
    for (let s = 0; s < steps && alive; s++) {
      b.pos.x += b.vel.x / steps;
      b.pos.y += b.vel.y / steps;
      if (ctx.grid[Math.floor(b.pos.y / TILE) * GRID_W + Math.floor(b.pos.x / TILE)] === TILE_SOLID) {
        alive = false;
        break;
      }
      const foe = state.players[other(b.owner)];
      if (foe.alive && foe.protect <= 0 && dist(foe.pos, b.pos) <= PLAYER_RADIUS) {
        const shooter = state.players[b.owner];
        damage(state, shooter, foe, WEAPON_DAMAGE, "shot");
        alive = false;
      }
    }
    if (alive) survivors.push(b);
  }
  state.bullets = survivors;
}

function stepCameras(state: GameState, ctx: StepContext) {
  if (state.phase === "COMPLETE") return;
  const t = state.tick / CAMERA_SWEEP_PERIOD;
  for (const cam of state.cameras) {
    cam.sees = -1;
    if (cam.alert > 0) cam.alert -= 1;
    if (cam.disabled > 0) continue;
    cam.facing = cam.base + Math.sin(t * Math.PI * 2 + cam.id * 1.7) * CAMERA_SWEEP;
    for (const p of state.players) {
      if (!p.alive || p.protect > 0) continue;
      if (inCone(ctx.grid, cam.pos, cam.facing, CAMERA_FOV, CAMERA_RANGE, p.pos)) {
        cam.sees = p.id;
        cam.alert = CAMERA_ALERT_TICKS;
        // A camera does not reveal you to itself — it reveals you to the other player.
        break;
      }
    }
  }
}

function stepCore(state: GameState, ctx: StepContext) {
  if (state.core.lock > 0) state.core.lock -= 1;
  const holder = state.core.holder;
  if (holder !== null) {
    const p = state.players[holder];
    state.core.pos = { x: p.pos.x, y: p.pos.y };
    p.coreHeldTicks += 1;
  }
  void ctx;
}

function stepExtras(state: GameState, _ctx: StepContext) {
  for (const e of state.extras) {
    if (e.taken) continue;
    for (const p of state.players) {
      if (!p.alive) continue;
      if (dist(p.pos, e.pos) <= PLAYER_RADIUS + 14) {
        e.taken = true;
        if (e.kind === "health") p.hp = Math.min(HP_MAX, p.hp + 35);
        else p.stamina = Math.min(STAMINA_MAX, p.stamina + 55);
        say(state, "pickup", e.kind === "health" ? "TRAUMA KIT" : "STIM INJECTOR", p.id);
      }
    }
  }
}

function applyInteractions(state: GameState, p: PlayerState, input: Input, ctx: StepContext) {
  // Extraction has priority over everything else.
  let zone: "A" | "B" | null = null;
  for (const key of ["A", "B"] as const) {
    const r = EXTRACTION[key].rect;
    if (
      p.pos.x >= r.x * TILE && p.pos.x < (r.x + r.w) * TILE &&
      p.pos.y >= r.y * TILE && p.pos.y < (r.y + r.h) * TILE
    ) zone = key;
  }

  if (p.carrying && zone) {
    p.extractZone = zone;
    p.extracting += 1;
    state.phase = "EXTRACTION";
    const needed = zone === "A" ? EXTRACT_A_TICKS : EXTRACT_B_TICKS;
    if (p.extracting >= needed) {
      state.phase = "COMPLETE";
      state.winner = p.id;
      state.endReason = "core_extracted";
      say(state, "extract", `P${p.id + 1} EXTRACTED THE CORE`, p.id);
    }
    return;
  }
  p.extracting = 0;
  p.extractZone = null;

  // Hack terminals.
  let target: "cameras" | "vault" | "door" | null = null;
  let doorIndex = -1;
  for (const t of state.terminals) {
    if (t.done) continue;
    if (dist(t.pos, p.pos) <= HACK_RANGE) target = t.id;
  }
  if (!target) {
    // Force a closed blast door.
    for (let i = 0; i < state.doors.length; i++) {
      const d = state.doors[i]!;
      if (d.open || d.disabled > 0) continue;
      const cx = (d.rect.x + d.rect.w / 2) * TILE;
      const cy = (d.rect.y + d.rect.h / 2) * TILE;
      if (Math.abs(cx - p.pos.x) < 70 && Math.abs(cy - p.pos.y) < 96) { target = "door"; doorIndex = i; break; }
    }
  }

  const needsChannel = target === "door" || (target === "cameras" && !state.securityDisabled) ||
    (target === "vault" && !vaultOpen(state));

  if (target && needsChannel && input.interact && p.mode !== "sprint" && p.mode !== "dash") {
    if (p.hackTarget !== target || p.hackDoor !== doorIndex) {
      p.hacking = 0;
      p.hackTarget = target;
      p.hackDoor = doorIndex;
    }
    p.hacking += 1;
    noise(ctx, p, "hack", NOISE.hack);
    const need = target === "cameras" ? HACK_CAMERAS_TICKS : target === "vault" ? HACK_VAULT_TICKS : DOOR_FORCE_TICKS;
    if (p.hacking >= need) {
      if (target === "cameras") {
        state.securityDisabled = true;
        for (const cam of state.cameras) cam.disabled = CAMERA_OFF;
        state.terminals = state.terminals.map((t) => (t.id === "cameras" ? { ...t, done: true } : t));
        p.hacks += 1;
        say(state, "hack", "CAMERA NETWORK DISABLED", p.id);
      } else if (target === "vault") {
        state.terminals = state.terminals.map((t) => (t.id === "vault" ? { ...t, done: true } : t));
        state.doors = state.doors.map((d) => (d.id.startsWith("vault-") ? { ...d, open: true } : d));
        p.hacks += 1;
        noise(ctx, p, "vault", NOISE.vault);
        say(state, "breach", "VAULT ACCESS DETECTED", p.id);
      } else if (doorIndex >= 0) {
        state.doors = state.doors.map((d, i) => (i === doorIndex ? { ...d, open: true } : d));
        p.hacks += 1;
        say(state, "door", "BLAST DOOR OVERRIDDEN", p.id);
      }
      p.hacking = 0;
      p.hackTarget = null;
      p.hackDoor = -1;
    }
  } else {
    p.hacking = 0;
    p.hackTarget = null;
    p.hackDoor = -1;
  }

  // Take the Core.
  const canGrab = !p.carrying && state.core.holder === null && state.core.lock <= 0 &&
    vaultOpen(state) && dist(state.core.pos, p.pos) <= PLAYER_RADIUS + 26;
  if (canGrab && input.interact) {
    p.grabbing += 1;
    if (p.grabbing >= CORE_PICKUP_TICKS) {
      p.carrying = true;
      state.core.holder = p.id;
      state.core.lastDrop = null;
      p.grabbing = 0;
      state.phase = state.lockdown ? "LOCKDOWN" : "CORE_STOLEN";
      noise(ctx, p, "core", NOISE.core);
      say(state, "core-taken", "CORE STOLEN", p.id);
    }
  } else if (p.grabbing > 0) {
    p.grabbing = 0;
  }
}

/* ------------------------------------------------------------- end states --- */

function checkEnd(state: GameState) {
  if (state.phase === "COMPLETE") return;

  const [a, b] = state.players;
  if (a.lives <= 0 && !a.alive && a.respawn <= 0) {
    finish(state, b.id, "opponent_eliminated");
    return;
  }
  if (b.lives <= 0 && !b.alive && b.respawn <= 0) {
    finish(state, a.id, "opponent_eliminated");
    return;
  }

  if (state.clock <= 0) {
    if (state.core.holder !== null) finish(state, state.core.holder, "time_expired_core");
    else finish(state, null, "draw_time");
  }
}

function finish(state: GameState, winner: PlayerId | null, reason: EndReason) {
  state.phase = "COMPLETE";
  state.winner = winner;
  state.endReason = reason;
  const text =
    reason === "draw_time" ? "CLOCK EXPIRED — CORE SECURE, NO EXTRACTION"
      : reason === "time_expired_core" ? "CLOCK EXPIRED — CORE IN HAND"
      : "TARGET ELIMINATED";
  say(state, "end", text, winner ?? -1);
}

/** Convenience for a fresh match already in the ACTIVE phase (tests, replays). */
export function startImmediately(state: GameState): GameState {
  state.countdown = 0;
  state.phase = "ACTIVE";
  return state;
}

export function currentPhase(state: GameState): MatchPhase {
  return state.phase;
}
