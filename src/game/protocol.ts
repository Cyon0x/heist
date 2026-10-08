/**
 * HEIST — wire protocol.
 *
 * A hand-rolled binary snapshot. Two players at 15 Hz means the whole payload is
 * a few hundred bytes; the point is not the bytes, it is that the client can
 * only ever receive what the server chose to send. `Snapshot` is deliberately a
 * *projection* of `GameState`, not the state itself, so nothing authoritative
 * can leak through the wire by accident.
 */

import { TICK_HZ } from "./constants";
import { CAMERAS, DOOR_LAYOUT, EXTRAS, TERMINALS } from "./map";
import type { EndReason, GameState, Input, MatchPhase, PlayerId } from "./types";

export interface SnapshotPlayer {
  pos: { x: number; y: number };
  aim: number;
  hp: number;
  lives: number;
  stamina: number;
  alive: boolean;
  carrying: boolean;
  protect: boolean;
  respawning: boolean;
  mode: number;
  cooldowns: [number, number, number, number, number];
  hacking: number;
  hackKind: number; // 0 none, 1 cameras, 2 vault, 3 door
  hackNeed: number;
  grabbing: number;
  extracting: number;
  extractZone: number; // 0 none, 1 A, 2 B
  extractingNeed: number;
}

export interface SnapshotCamera {
  facing: number;
  disabled: boolean;
  alert: boolean;
  sees: number; // -1 none
}

export interface SnapshotBullet {
  id: number;
  x: number;
  y: number;
  owner: number;
}

export interface Snapshot {
  tick: number;
  phase: MatchPhase;
  clock: number;
  countdown: number;
  lockdown: boolean;
  securityDisabled: boolean;
  winner: number;
  endReason: EndReason | "none";
  players: [SnapshotPlayer, SnapshotPlayer];
  core: { x: number; y: number; holder: number; lock: number };
  doors: number[]; // open flags, indexed by door order
  terminals: number; // bit 0 cameras, bit 1 vault
  cameras: SnapshotCamera[];
  bullets: SnapshotBullet[];
  extras: number[]; // 0 available, 1 taken
  feed: { tick: number; kind: number; text: string; player: number }[];
}

export const MODE_INDEX: Record<string, number> = { idle: 0, walk: 1, sprint: 2, sneak: 3, dash: 4 };
export const MODE_NAME = ["idle", "walk", "sprint", "sneak", "dash"] as const;

const CAMERA_POSITIONS = CAMERAS.map((c) => c.pos);
const TERMINAL_LAYOUT = TERMINALS.map((t) => ({ id: t.id, pos: t.pos }));
const EXTRA_LAYOUT = EXTRAS.map((e) => ({ pos: e.pos, kind: e.kind }));
void DOOR_LAYOUT;

const PHASES: MatchPhase[] = ["COUNTDOWN", "ACTIVE", "CORE_STOLEN", "EXTRACTION", "LOCKDOWN", "COMPLETE"];
const REASONS: (EndReason | "none")[] = [
  "none", "core_extracted", "opponent_eliminated", "eliminated",
  "time_expired_core", "draw_time", "abandoned",
];

const FEED_KINDS = [
  "go", "lockdown", "emp", "scan", "hack", "breach", "door", "kill", "eliminated",
  "core-drop", "core-taken", "pickup", "extract", "end", "connection", "alert",
];

export const HACK_NEED: Record<number, number> = { 0: 1, 1: Math.round(3.5 * TICK_HZ), 2: Math.round(5 * TICK_HZ), 3: 60 };

export function snapshotOf(state: GameState): Snapshot {
  const players = state.players.map((p) => {
    const hackKind = p.hackTarget === "cameras" ? 1 : p.hackTarget === "vault" ? 2 : p.hackTarget === "door" ? 3 : 0;
    return {
      pos: { x: p.pos.x, y: p.pos.y },
      aim: p.aim,
      hp: p.hp,
      lives: p.lives,
      stamina: p.stamina,
      alive: p.alive,
      carrying: p.carrying,
      protect: p.protect > 0,
      respawning: !p.alive && p.respawn > 0,
      mode: MODE_INDEX[p.mode] ?? 0,
      cooldowns: [
        p.cooldowns.dash, p.cooldowns.emp, p.cooldowns.scanner, p.cooldowns.melee, p.cooldowns.fire,
      ] as [number, number, number, number, number],
      hacking: p.hacking,
      hackKind,
      hackNeed: HACK_NEED[hackKind] ?? 1,
      grabbing: p.grabbing,
      extracting: p.extracting,
      extractZone: p.extractZone === "A" ? 1 : p.extractZone === "B" ? 2 : 0,
      extractingNeed: 0,
    } satisfies SnapshotPlayer;
  }) as [SnapshotPlayer, SnapshotPlayer];

  return {
    tick: state.tick,
    phase: state.phase,
    clock: state.clock,
    countdown: state.countdown,
    lockdown: state.lockdown,
    securityDisabled: state.securityDisabled,
    winner: state.winner === null ? -1 : state.winner,
    endReason: state.endReason ?? "none",
    players,
    core: {
      x: state.core.pos.x, y: state.core.pos.y,
      holder: state.core.holder === null ? -1 : state.core.holder,
      lock: state.core.lock,
    },
    doors: state.doors.map((d) => (d.open || d.disabled > 0 ? 1 : 0)),
    terminals: (state.terminals[0]?.done ? 1 : 0) | (state.terminals[1]?.done ? 2 : 0),
    cameras: state.cameras.map((c) => ({
      facing: c.facing,
      disabled: c.disabled > 0,
      alert: c.alert > 0,
      // A camera's sighting is only meaningful to the player it is *not* seeing.
      sees: c.sees,
    })),
    bullets: state.bullets.map((b) => ({ id: b.id, x: b.pos.x, y: b.pos.y, owner: b.owner })),
    extras: state.extras.map((e) => (e.taken ? 1 : 0)),
    feed: state.feed.slice(-14).map((f) => ({
      tick: f.tick,
      kind: Math.max(0, FEED_KINDS.indexOf(f.kind)),
      text: f.text,
      player: f.player,
    })),
  };
}

/* --------------------------------------------------------------- encoding --- */

const TEXT_MAX = 54;

export function encodeSnapshot(s: Snapshot): Uint8Array {
  const buf = new ArrayBuffer(512 + s.feed.length * (TEXT_MAX + 6) + s.bullets.length * 16);
  const view = new DataView(buf);
  let o = 0;
  const u8 = (v: number) => { view.setUint8(o, v & 0xff); o += 1; };
  const u16 = (v: number) => { view.setUint16(o, v & 0xffff); o += 2; };
  const u32 = (v: number) => { view.setUint32(o, v >>> 0); o += 4; };
  const f32 = (v: number) => { view.setFloat32(o, v); o += 4; };
  const i8 = (v: number) => { view.setInt8(o, v); o += 1; };

  u8(1); // protocol version
  u32(s.tick);
  u8(PHASES.indexOf(s.phase));
  u16(Math.max(0, s.clock));
  u8(Math.max(0, s.countdown));
  u8((s.lockdown ? 1 : 0) | (s.securityDisabled ? 2 : 0));
  i8(s.winner);
  u8(REASONS.indexOf(s.endReason));

  for (const p of s.players) {
    f32(p.pos.x); f32(p.pos.y); f32(p.aim);
    u8(Math.round(p.hp)); u8(p.lives); u8(Math.round(p.stamina));
    u8((p.alive ? 1 : 0) | (p.carrying ? 2 : 0) | (p.protect ? 4 : 0) | (p.respawning ? 8 : 0));
    u8(p.mode);
    for (const c of p.cooldowns) u16(Math.max(0, Math.min(65535, c)));
    u8(Math.min(255, p.hacking)); u8(p.hackKind);
    u8(Math.min(255, p.grabbing)); u8(Math.min(255, p.extracting)); u8(p.extractZone);
  }

  f32(s.core.x); f32(s.core.y); i8(s.core.holder); u16(Math.max(0, s.core.lock));

  let doorBits = 0;
  s.doors.forEach((d, i) => { if (d) doorBits |= 1 << i; });
  u32(doorBits);
  u8(s.terminals);

  u8(s.cameras.length);
  for (const c of s.cameras) {
    f32(c.facing);
    u8((c.disabled ? 1 : 0) | (c.alert ? 2 : 0));
    i8(c.sees);
  }

  u8(Math.min(255, s.bullets.length));
  for (const b of s.bullets.slice(0, 255)) { u16(b.id); f32(b.x); f32(b.y); u8(b.owner); }

  let extraBits = 0;
  s.extras.forEach((e, i) => { if (e) extraBits |= 1 << i; });
  u32(extraBits);

  u8(Math.min(255, s.feed.length));
  const enc = new TextEncoder();
  for (const f of s.feed.slice(0, 255)) {
    u32(f.tick);
    u8(f.kind);
    i8(f.player);
    const bytes = enc.encode(f.text.slice(0, TEXT_MAX));
    u8(bytes.length);
    new Uint8Array(buf, o, bytes.length).set(bytes);
    o += bytes.length;
  }

  return new Uint8Array(buf, 0, o);
}

export function decodeSnapshot(data: Uint8Array): Snapshot {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 0;
  const u8 = () => { const v = view.getUint8(o); o += 1; return v; };
  const u16 = () => { const v = view.getUint16(o); o += 2; return v; };
  const u32 = () => { const v = view.getUint32(o); o += 4; return v; };
  const f32 = () => { const v = view.getFloat32(o); o += 4; return v; };
  const i8 = () => { const v = view.getInt8(o); o += 1; return v; };

  const version = u8();
  if (version !== 1) throw new Error(`unsupported snapshot version ${version}`);

  const tick = u32();
  const phase = PHASES[u8()] ?? "ACTIVE";
  const clock = u16();
  const countdown = u8();
  const flags = u8();
  const winner = i8();
  const endReason = REASONS[u8()] ?? "none";

  const players: SnapshotPlayer[] = [];
  for (let i = 0; i < 2; i++) {
    const pos = { x: f32(), y: f32() };
    const aim = f32();
    const hp = u8();
    const lives = u8();
    const stamina = u8();
    const bits = u8();
    const mode = u8();
    const cooldowns: [number, number, number, number, number] = [u16(), u16(), u16(), u16(), u16()];
    const hacking = u8();
    const hackKind = u8();
    const grabbing = u8();
    const extracting = u8();
    const extractZone = u8();
    players.push({
      pos, aim, hp, lives, stamina, mode, cooldowns, hacking, hackKind, grabbing, extracting,
      extractZone: extractZone as 0 | 1 | 2,
      extractingNeed: 0,
      hackNeed: HACK_NEED[hackKind] ?? 1,
      alive: (bits & 1) !== 0,
      carrying: (bits & 2) !== 0,
      protect: (bits & 4) !== 0,
      respawning: (bits & 8) !== 0,
    });
  }

  const core = { x: f32(), y: f32(), holder: i8(), lock: u16() };
  const doorBits = u32();
  const terminals = u8();

  const camCount = u8();
  const cameras: SnapshotCamera[] = [];
  for (let i = 0; i < camCount; i++) {
    const facing = f32();
    const bits = u8();
    const sees = i8();
    cameras.push({ facing, sees, disabled: (bits & 1) !== 0, alert: (bits & 2) !== 0 });
  }

  const bulletCount = u8();
  const bullets: SnapshotBullet[] = [];
  for (let i = 0; i < bulletCount; i++) {
    bullets.push({ id: u16(), x: f32(), y: f32(), owner: u8() });
  }

  const extraBits = u32();
  const extras: number[] = [];
  for (let i = 0; i < 8; i++) extras.push((extraBits >> i) & 1);

  const feedCount = u8();
  const dec = new TextDecoder();
  const feed: Snapshot["feed"] = [];
  for (let i = 0; i < feedCount; i++) {
    const t = u32();
    const kind = u8();
    const player = i8();
    const len = u8();
    const text = dec.decode(data.subarray(o, o + len));
    o += len;
    feed.push({ tick: t, kind, text, player });
  }

  return {
    tick, phase, clock, countdown,
    lockdown: (flags & 1) !== 0,
    securityDisabled: (flags & 2) !== 0,
    winner, endReason,
    players: players as [SnapshotPlayer, SnapshotPlayer],
    core,
    doors: Array.from({ length: 8 }, (_, i) => (doorBits >> i) & 1),
    terminals,
    cameras, bullets, extras, feed,
  };
}

export const FEED_KIND_NAMES = FEED_KINDS;
/**
 * Parse one wire `input` message into an `Input`. Shape validation only —
 * `AuthoritativeRoom.setInput` clamps the ranges, because a client that sends
 * `moveX: 400` must be corrected, not rejected.
 */
export function decodeInput(raw: unknown): Input | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const bool = (v: unknown) => v === true;
  return {
    seq: num(o.seq) | 0,
    moveX: num(o.moveX),
    moveY: num(o.moveY),
    aimX: num(o.aimX, 1),
    aimY: num(o.aimY, 0),
    sprint: bool(o.sprint),
    dash: bool(o.dash),
    fire: bool(o.fire),
    melee: bool(o.melee),
    emp: bool(o.emp),
    scanner: bool(o.scanner),
    interact: bool(o.interact),
  };
}

export const PHASE_NAMES = PHASES;
export { MODE_NAME as MODES };

export function secondsLeft(s: Snapshot): number {
  return Math.max(0, Math.ceil(s.clock / TICK_HZ));
}

/* ------------------------------------------------------------ view rebuild -- */

/**
 * Rebuild a render-ready `GameState` from a snapshot plus the facility's static
 * geometry. The client never *simulates* from this — it only draws it — but it
 * lets the renderer have exactly one code path for solo and networked play.
 */
export function stateFromSnapshot(
  snap: Snapshot,
  local: { scanTicks: number; previousBullets?: Map<number, { x: number; y: number }> },
): GameState {
  const bullets: GameState["bullets"] = snap.bullets.map((b) => {
    const prev = local.previousBullets?.get(b.id);
    const dx = prev ? b.x - prev.x : 0.0001;
    const dy = prev ? b.y - prev.y : 0;
    const len = Math.hypot(dx, dy) || 1;
    return { id: b.id, owner: b.owner as PlayerId, pos: { x: b.x, y: b.y }, vel: { x: (dx / len) * 100, y: (dy / len) * 100 }, life: 1 };
  });
  const players = snap.players.map((p, i) => ({
    id: i as PlayerId,
    pos: { x: p.pos.x, y: p.pos.y },
    vel: { x: 0, y: 0 },
    aim: p.aim,
    hp: p.hp,
    lives: p.lives,
    stamina: p.stamina,
    alive: p.alive,
    respawn: 0,
    protect: p.protect ? 1 : 0,
    cooldowns: {
      dash: p.cooldowns[0], emp: p.cooldowns[1], scanner: p.cooldowns[2],
      melee: p.cooldowns[3], fire: p.cooldowns[4],
    },
    dashTicks: 0,
    dashDir: { x: 1, y: 0 },
    staminaIdle: 0,
    hacking: p.hacking,
    hackTarget: p.hackKind === 1 ? "cameras" : p.hackKind === 2 ? "vault" : p.hackKind === 3 ? "door" : null,
    hackDoor: -1,
    grabbing: p.grabbing,
    carrying: p.carrying,
    extracting: p.extracting,
    extractZone: p.extractZone === 1 ? "A" : p.extractZone === 2 ? "B" : null,
    scanTicks: i === 0 ? local.scanTicks : 0,
    kills: 0, hacks: 0, damageDealt: 0, distance: 0, coreHeldTicks: 0,
    mode: MODE_NAME[p.mode] ?? "idle",
  })) as [GameState["players"][0], GameState["players"][1]];

  return {
    tick: snap.tick,
    phase: snap.phase,
    clock: snap.clock,
    countdown: snap.countdown,
    players,
    bullets,
    cameras: snap.cameras.map((c, i) => ({
      id: i,
      pos: CAMERA_POSITIONS[i] ?? { x: 0, y: 0 },
      facing: c.facing,
      base: c.facing,
      disabled: c.disabled ? 1 : 0,
      sees: c.sees as PlayerId | -1,
      alert: c.alert ? 1 : 0,
    })),
    terminals: TERMINAL_LAYOUT.map((t, i) => ({
      id: t.id,
      pos: t.pos,
      done: (snap.terminals & (1 << i)) !== 0,
    })),
    core: { pos: { x: snap.core.x, y: snap.core.y }, holder: snap.core.holder < 0 ? null : (snap.core.holder as PlayerId), lock: snap.core.lock, lastDrop: null },
    extras: EXTRA_LAYOUT.map((e, i) => ({ id: i, pos: e.pos, kind: e.kind, taken: !!snap.extras[i] })),
    doors: DOOR_LAYOUT.map((d, i) => ({ id: d.id, rect: d.rect, open: !!snap.doors[i], disabled: 0 })),
    securityDisabled: snap.securityDisabled,
    lockdown: snap.lockdown,
    winner: snap.winner < 0 ? null : (snap.winner as PlayerId),
    endReason: snap.endReason === "none" ? null : snap.endReason,
    feed: snap.feed.map((f) => ({
      tick: f.tick,
      kind: FEED_KIND_NAMES[f.kind] ?? "alert",
      text: f.text,
      player: f.player as PlayerId | -1,
    })),
    nextId: 1,
  };
}
