/**
 * HEIST — realtime rooms.
 *
 * One authoritative simulation, three ways to reach it:
 *
 *   SOLO      the browser owns the match (practice only, no money)
 *   LOCAL     the first client in the room is elected host over BroadcastChannel;
 *             two real browsers, real input, real authority — no staking
 *   SERVER    a Node `ws` process owns the match; this is the only mode that can
 *             settle money
 *
 * Clients never write authoritative state. They send `Input` and receive
 * `Snapshot`s; `RoomClient` interpolates between the last two snapshots purely
 * for smooth rendering.
 */

import { SNAPSHOT_EVERY, TICK_HZ } from "./constants";
import { EMPTY_INPUT, other, type GameState, type Input, type PlayerId } from "./types";
import { createMatch, newGridBuffer, step } from "./sim";
import { decodeSnapshot, encodeSnapshot, snapshotOf, type Snapshot } from "./protocol";
import { aiInput, createMemory, SKILLS, type Difficulty } from "./ai";
import type { NoiseKind } from "./constants";

export type Authority = "SOLO" | "LOCAL" | "SERVER";

export interface Transport {
  send(data: ArrayBuffer | string): void;
  onMessage(cb: (data: ArrayBuffer | string) => void): void;
  onClose(cb: () => void): void;
  close(): void;
  readonly authority: Authority;
}

/* --------------------------------------------------------- authority host --- */

interface Peer { id: string; player: PlayerId; input: Input }

export class AuthoritativeRoom {
  readonly state: GameState;
  private grid = newGridBuffer();
  private peers: Peer[] = [];
  private accumulator = 0;
  private onSnapshot: (buf: ArrayBuffer) => void;
  private noisesFor: [NoiseKind[], NoiseKind[]] = [[], []];

  constructor(onSnapshot: (buf: ArrayBuffer) => void) {
    this.state = createMatch();
    this.onSnapshot = onSnapshot;
  }

  join(id: string): PlayerId | null {
    if (this.peers.length >= 2) return null;
    const used = new Set(this.peers.map((p) => p.player));
    const player: PlayerId = used.has(0) ? 1 : 0;
    this.peers.push({ id, player, input: { ...EMPTY_INPUT } });
    return player;
  }

  leave(id: string) {
    this.peers = this.peers.filter((p) => p.id !== id);
  }

  setInput(id: string, input: Input) {
    const peer = this.peers.find((p) => p.id === id);
    if (!peer) return;
    // Sanitise: inputs are untrusted. Clamp everything to the legal range.
    peer.input = {
      seq: input.seq | 0,
      moveX: clamp(input.moveX, -1, 1),
      moveY: clamp(input.moveY, -1, 1),
      aimX: clamp(input.aimX, -1e5, 1e5),
      aimY: clamp(input.aimY, -1e5, 1e5),
      sprint: !!input.sprint,
      dash: !!input.dash,
      fire: !!input.fire,
      melee: !!input.melee,
      emp: !!input.emp,
      scanner: !!input.scanner,
      interact: !!input.interact,
    };
  }

  /** Advance by wall-clock milliseconds. Fixed 30 Hz, no catch-up spiral. */
  advance(dtMs: number) {
    this.accumulator += Math.min(dtMs, 250);
    const stepMs = 1000 / TICK_HZ;
    let steps = 0;
    while (this.accumulator >= stepMs && steps < 6) {
      this.accumulator -= stepMs;
      steps += 1;
      const inputs: [Input, Input] = [{ ...EMPTY_INPUT }, { ...EMPTY_INPUT }];
      for (const peer of this.peers) inputs[peer.player] = peer.input;
      this.noisesFor = [[], []];
      step(this.state, inputs, {
        grid: this.grid,
        onNoise: (n) => { this.noisesFor[n.by].push(n.kind); },
      });
      if (this.state.tick % SNAPSHOT_EVERY === 0) {
        this.emit();
      }
    }
    if (steps > 0) this.emit();
  }

  private emit() {
    this.latest = new Uint8Array(encodeSnapshot(snapshotOf(this.state)));
    this.onSnapshot(this.latest.buffer as ArrayBuffer);
  }

  /** The most recently encoded snapshot, for server-side fan-out. */
  private latest: Uint8Array = new Uint8Array(0);
  snapshot(): Uint8Array { return this.latest; }

  noiseFor(player: PlayerId) {
    return this.noisesFor[other(player)];
  }
}

const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0);

/* ---------------------------------------------------------------- transports */

export class BroadcastTransport implements Transport {
  readonly authority = "LOCAL" as const;
  private channel: BroadcastChannel;
  private handler: ((data: ArrayBuffer | string) => void) | null = null;
  private closeHandler: (() => void) | null = null;

  constructor(roomId: string) {
    this.channel = new BroadcastChannel(`heist:${roomId}`);
    this.channel.onmessage = (e) => this.handler?.(e.data);
  }
  send(data: ArrayBuffer | string) { this.channel.postMessage(data); }
  onMessage(cb: (data: ArrayBuffer | string) => void) { this.handler = cb; }
  onClose(cb: () => void) { this.closeHandler = cb; }
  close() { this.channel.close(); this.closeHandler?.(); }
}

export class WebSocketTransport implements Transport {
  readonly authority = "SERVER" as const;
  private ws: WebSocket;
  private handler: ((data: ArrayBuffer | string) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private queue: (ArrayBuffer | string)[] = [];

  constructor(url: string, roomId: string, ticket?: string) {
    // The ticket proves to the game server that this socket belongs to a
    // participant in this room. The browser never sees the shared secret.
    const query = ticket ? `?ticket=${encodeURIComponent(ticket)}` : "";
    this.ws = new WebSocket(`${url.replace(/\/$/, "")}/room/${encodeURIComponent(roomId)}${query}`);
    this.ws.binaryType = "arraybuffer";
    this.ws.onopen = () => { for (const q of this.queue) this.ws.send(q); this.queue = []; };
    this.ws.onmessage = (e) => this.handler?.(e.data);
    this.ws.onclose = () => this.closeHandler?.();
    this.ws.onerror = () => this.closeHandler?.();
  }
  send(data: ArrayBuffer | string) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(data);
    else this.queue.push(data);
  }
  onMessage(cb: (data: ArrayBuffer | string) => void) { this.handler = cb; }
  onClose(cb: () => void) { this.closeHandler = cb; }
  close() { this.ws.close(); }
}

/* ------------------------------------------------------------- room client --- */

type Wire =
  | { t: "hello"; peerId: string; name: string }
  | { t: "welcome"; peerId: string; player: PlayerId; opponent: string | null }
  | { t: "input"; peerId: string; input: Input }
  | { t: "leave"; peerId: string }
  | { t: "snap"; buf: ArrayBuffer };

export interface RoomEvents {
  onReady?: (player: PlayerId, opponent: string | null) => void;
  onOpponentLeft?: () => void;
  onSnapshot?: () => void;
}

export class RoomClient {
  private transport: Transport;
  private isHost = false;
  private authority: AuthoritativeRoom | null = null;
  private hostId: string | null = null;
  private peerIds: string[] = [];
  private last: Snapshot | null = null;
  private prev: Snapshot | null = null;
  private lastAt = 0;
  private prevAt = 0;
  private inputSeq = 0;
  private input: Input = { ...EMPTY_INPUT };
  private timer: number | null = null;
  private hostTimer: number | null = null;
  private lastHostTick = 0;

  readonly peerId: string;
  player: PlayerId = 0;
  opponentName: string | null = null;
  events: RoomEvents = {};
  /** Set when this peer owns the simulation (solo/local-host). */
  get hosting() { return this.isHost; }

  constructor(private roomId: string, private name: string, transport?: Transport) {
    this.peerId = Math.random().toString(36).slice(2, 10);
    this.transport = transport ?? new BroadcastTransport(roomId);
    this.transport.onMessage((data) => this.receive(data));
    this.transport.onClose(() => this.events.onOpponentLeft?.());
    this.transport.send(JSON.stringify({ t: "hello", peerId: this.peerId, name } satisfies Wire));

    // Anyone already here answers with a welcome; first to answer wins the host role.
    this.hostElection = window.setTimeout(() => {
      if (this.hostId === null) {
        this.hostId = this.peerId;
        this.becomeHost();
      }
    }, 420);

    this.timer = window.setInterval(() => this.tick(), 50);
  }

  private hostElection: number | null = null;

  setInput(input: Input) {
    this.input = input;
  }

  private tick() {
    if (this.isHost && this.authority) {
      const now = performance.now();
      const dt = this.lastHostTick === 0 ? 33 : now - this.lastHostTick;
      this.lastHostTick = now;
      this.authority.advance(dt);
      // Host renders its own authoritative state.
      this.ingest(snapshotOf(this.authority.state));
      const foe = other(this.player);
      for (const kind of this.authority.noiseFor(this.player)) {
        this.pendingPings.push({ kind, to: foe });
      }
    } else {
      this.inputSeq += 1;
      this.transport.send(JSON.stringify({
        t: "input", peerId: this.peerId, input: { ...this.input, seq: this.inputSeq },
      } satisfies Wire));
    }
    this.lastLocalNoise = this.pendingPings;
    this.pendingPings = [];
  }

  private pendingPings: { kind: NoiseKind; to: PlayerId }[] = [];
  lastLocalNoise: { kind: NoiseKind; to: PlayerId }[] = [];

  private becomeHost() {
    this.isHost = true;
    this.authority = new AuthoritativeRoom((buf) => this.broadcastSnapshot(buf));
    // The authority assigns slots; the host takes whatever it is given rather
    // than assuming zero, so it can never collide with a peer's slot.
    this.player = this.authority.join(this.peerId) ?? 0;
    // A peer may have said hello before the election finished — admit it now.
    for (const id of this.peersSeen) this.admit(id);
    const first = [...this.peersSeen][0];
    this.events.onReady?.(this.player, first ? this.helloNames.get(first) ?? null : null);
  }

  private peersSeen = new Set<string>();
  private helloNames = new Map<string, string>();

  /** Host-side: give a waiting peer the slot the authority actually assigned. */
  private admit(peerId: string) {
    if (!this.authority) return;
    const slot = this.authority.join(peerId);
    if (slot === null) {
      this.transport.send(JSON.stringify({ t: "leave", peerId } satisfies Wire));
      return;
    }
    this.transport.send(JSON.stringify({
      t: "welcome",
      peerId,
      player: slot,
      opponent: this.name,
    } satisfies Wire));
  }

  private broadcastSnapshot(buf: ArrayBuffer) {
    this.transport.send(buf);
  }

  private receive(data: ArrayBuffer | string) {
    if (typeof data !== "string") {
      this.ingest(decodeSnapshot(new Uint8Array(data)));
      return;
    }
    let msg: Wire;
    try { msg = JSON.parse(data) as Wire; } catch { return; }
    switch (msg.t) {
      case "hello": {
        this.peersSeen.add(msg.peerId);
        this.helloNames.set(msg.peerId, msg.name || "OPERATIVE");
        if (this.isHost) this.admit(msg.peerId);
        break;
      }
      case "welcome": {
        if (msg.peerId !== this.peerId) return;
        if (this.hostElection !== null) { window.clearTimeout(this.hostElection); this.hostElection = null; }
        // `player` is the recipient's own slot, as assigned by the
        // authority. It must never be flipped here, or a guest and the
        // host can both end up believing they are player 1.
        this.player = msg.player;
        this.opponentName = msg.opponent;
        this.events.onReady?.(this.player, msg.opponent);
        break;
      }
      case "input": {
        if (!this.isHost || !this.authority) return;
        this.peersSeen.add(msg.peerId);
        this.authority.setInput(msg.peerId, msg.input);
        break;
      }
      case "leave": {
        if (!this.isHost || !this.authority) return;
        this.authority.leave(msg.peerId);
        this.events.onOpponentLeft?.();
        break;
      }
      default: break;
    }
  }

  private ingest(snap: Snapshot) {
    this.prev = this.last;
    this.prevAt = this.lastAt;
    this.last = snap;
    this.lastAt = performance.now();
    this.events.onSnapshot?.();
  }

  /** Interpolated view for rendering, ~100 ms behind the newest snapshot. */
  view(): Snapshot | null {
    if (!this.last) return null;
    if (!this.prev || this.lastAt === this.prevAt) return this.last;
    const span = Math.max(1, this.lastAt - this.prevAt);
    const target = this.lastAt - 100;
    const alpha = Math.max(0, Math.min(1, (target - this.prevAt) / span));
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    return {
      ...this.last,
      players: [0, 1].map((i) => {
        const a = this.prev!.players[i]!;
        const b = this.last!.players[i]!;
        return { ...b, pos: { x: lerp(a.pos.x, b.pos.x), y: lerp(a.pos.y, b.pos.y) }, aim: b.aim };
      }) as [Snapshot["players"][0], Snapshot["players"][1]],
      core: {
        ...this.last.core,
        x: lerp(this.prev.core.x, this.last.core.x),
        y: lerp(this.prev.core.y, this.last.core.y),
      },
      bullets: this.last.bullets,
    };
  }

  get hasOpponent() { return this.peersSeen.size > 0 && !this.isHost ? true : this.opponentName !== null; }

  dispose() {
    if (this.hostElection !== null) window.clearTimeout(this.hostElection);
    if (this.timer !== null) window.clearInterval(this.timer);
    if (this.hostTimer !== null) window.clearInterval(this.hostTimer);
    this.transport.send(JSON.stringify({ t: "leave", peerId: this.peerId } satisfies Wire));
    this.transport.close();
  }
}

/* ---------------------------------------------------------------- solo mode -- */

export class SoloMatch {
  state: GameState;
  me: PlayerId = 0;
  private grid = newGridBuffer();
  private mem: ReturnType<typeof createMemory>;
  private skill = SKILLS.veteran;
  private accumulator = 0;
  private last = 0;
  private input: Input = { ...EMPTY_INPUT };
  onNoise?: (n: { at: { x: number; y: number }; kind: NoiseKind; radius: number; by: PlayerId }) => void;

  constructor(public difficulty: Difficulty = "veteran") {
    this.state = createMatch();
    this.mem = createMemory(this.state.players[1].pos);
  }

  setInput(i: Input) { this.input = i; }

  advance(dtMs: number) {
    this.accumulator += Math.min(dtMs, 200);
    const stepMs = 1000 / TICK_HZ;
    let steps = 0;
    while (this.accumulator >= stepMs && steps < 5) {
      this.accumulator -= stepMs;
      steps += 1;
      const ai = aiInput(this.state, 1, this.mem, this.skill, { noises: this.aiNoises, cameraSpot: -1 });
      this.aiNoises = [];
      step(this.state, [this.input, ai], {
        grid: this.grid,
        onNoise: (n) => {
          if (n.by === 1) this.aiNoises.push({ at: n.at, kind: n.kind, radius: n.radius, by: n.by });
          this.onNoise?.(n);
        },
      });
    }
    this.last = performance.now();
  }

  private aiNoises: { at: { x: number; y: number }; kind: NoiseKind; radius: number; by: PlayerId }[] = [];
  get idleMs() { return performance.now() - this.last; }

  restart(difficulty: Difficulty) {
    this.difficulty = difficulty;
    this.skill = SKILLS[difficulty];
    this.state = createMatch();
    this.mem = createMemory(this.state.players[1].pos);
  }
}
