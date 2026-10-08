/**
 * HEIST — authoritative game server.
 *
 * One process owns every live match: it runs the same deterministic 30 Hz
 * simulation the browser runs, accepts only `Input` from clients, and is the
 * sole source of truth for positions, health, Core ownership, extraction and
 * the final result. A client can ask to move; it cannot declare that it moved.
 *
 * This is the only component allowed to write a result for a staked match. When
 * a match ends it reports to the web app over HTTPS with the shared attestor
 * secret; the app (not the browser) then settles escrow.
 *
 *   node server/index.ts
 *
 * Protocol (see src/game/room.ts)
 *   client -> server  {"t":"hello"}, {"t":"input", input}, {"t":"leave"}
 *   server -> client  {"t":"welcome"}, {"t":"leave"}, <binary Snapshot>
 *
 * Auth: the app mints a short-lived HMAC room ticket (src/lib/game/ticket.ts)
 * so the shared secret never reaches a browser. `?key=<secret>` is also
 * accepted for operator-run smoke tests.
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { AuthoritativeRoom } from "../src/game/room";
import { decodeInput } from "../src/game/protocol";
import { TICK_HZ } from "../src/game/constants";
import { verifyRoomTicket } from "../src/lib/game/ticket";
import type { PlayerId } from "../src/game/types";

/* ------------------------------------------------------------------- env --- */

/** Minimal .env reader — the game server is not a Next process, so it has to
 *  load its own configuration rather than relying on the framework. */
function loadEnv(files = [".env.local", ".env"]): void {
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(join(process.cwd(), file), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (process.env[key] !== undefined) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

loadEnv();

const PORT = Number(process.env.GAME_SERVER_PORT ?? 4331);
const SECRET = process.env.GAME_SERVER_SECRET ?? "";
const APP_URL = (process.env.APP_URL ?? "").replace(/\/$/, "");
const ATTESTOR = process.env.CRON_SECRET ?? "";
const MAX_ROOMS = Number(process.env.GAME_SERVER_MAX_ROOMS ?? 400);
const IDLE_MS = 90_000;

interface Peer {
  socket: WebSocket;
  roomId: string;
  /** Server-side handle, used as the authority key. */
  id: string;
  /** The client's own id, echoed back so it recognises its `welcome`. */
  clientId: string | null;
  /** Authenticated HEIST user id, from the ticket. Never client-supplied. */
  userId: string | null;
  name: string;
  player: PlayerId | null;
  lastSeen: number;
}

interface Room {
  id: string;
  authority: AuthoritativeRoom;
  peers: Map<string, Peer>;
  /** Slot -> user id. Survives a disconnect so a result is still attributable. */
  slots: [string | null, string | null];
  createdAt: number;
  lastActivity: number;
  timer: NodeJS.Timeout | null;
  reportedStart: boolean;
  reportedEnd: boolean;
}

const rooms = new Map<string, Room>();
const peerSeq = { n: 0 };

/** Structured log line — never includes input payloads or credentials. */
function log(event: string, fields: Record<string, unknown> = {}) {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), event, ...fields })}\n`);
}

function createRoom(id: string): Room {
  const room: Room = {
    id,
    authority: new AuthoritativeRoom(() => {}),
    peers: new Map(),
    slots: [null, null],
    createdAt: Date.now(),
    lastActivity: Date.now(),
    timer: null,
    reportedStart: false,
    reportedEnd: false,
  };

  // Fixed 30 Hz server loop. The accumulator lives inside AuthoritativeRoom, so
  // a slow tick stretches the next one instead of spiralling.
  let last = Date.now();
  room.timer = setInterval(() => {
    const now = Date.now();
    const dt = now - last;
    last = now;
    room.lastActivity = now;

    room.authority.advance(dt);

    const state = room.authority.state;
    if (!room.reportedStart && (state.phase === "ACTIVE" || state.phase === "CORE_STOLEN")) {
      room.reportedStart = true;
      void report(room, "started");
    }
    if (!room.reportedEnd && state.phase === "COMPLETE") {
      room.reportedEnd = true;
      const winnerSlot = state.winner;
      const winnerUserId = winnerSlot === null ? null : room.slots[winnerSlot];
      const winner = winnerSlot === null ? null : state.players[winnerSlot];
      void report(room, "result", {
        winnerUserId,
        reason: state.endReason ?? "unknown",
        stats: winner
          ? {
              kills: winner.kills,
              hacks: winner.hacks,
              seconds: Math.round(state.tick / TICK_HZ),
              coreHeldSeconds: Math.round(winner.coreHeldTicks / TICK_HZ),
            }
          : undefined,
      });
    }

    const snapshot = room.authority.snapshot();
    for (const peer of room.peers.values()) {
      if (peer.socket.readyState === peer.socket.OPEN) peer.socket.send(snapshot, { binary: true });
    }

    if (now - room.lastActivity > IDLE_MS && room.peers.size === 0) destroyRoom(id, "idle");
  }, 1000 / 30);

  return room;
}

function destroyRoom(id: string, reason: string) {
  const room = rooms.get(id);
  if (!room) return;
  if (room.timer) clearInterval(room.timer);
  for (const peer of room.peers.values()) {
    try { peer.socket.close(1001, reason); } catch { /* already gone */ }
  }
  rooms.delete(id);
  log("room_closed", { room: id, reason });
}

/**
 * Push an authoritative event to the web app. The app is the only thing that
 * talks to escrow, and it trusts this call only because of the shared secret in
 * the header. Failures are logged, not hidden: an unreported match stays open
 * and is picked up by the maintenance sweep.
 */
let reportChain: Promise<unknown> = Promise.resolve();
function report(room: Room, event: "started" | "result", body: Record<string, unknown> = {}) {
  if (!APP_URL || !ATTESTOR) {
    log("report_skipped", { room: room.id, event, reason: "APP_URL/CRON_SECRET unset" });
    return;
  }
  // Serialise so a start and an end for the same match cannot race.
  reportChain = reportChain
    .then(() =>
      fetch(`${APP_URL}/api/matches/${encodeURIComponent(room.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-heist-attestor": ATTESTOR },
        body: JSON.stringify({ event, ...body }),
        signal: AbortSignal.timeout(10_000),
      }),
    )
    .then(async (res) => {
      log("reported", { room: room.id, event, status: res.status });
      if (!res.ok) log("report_rejected", { room: room.id, event, status: res.status });
    })
    .catch((error) => {
      log("report_failed", { room: room.id, event, message: String(error) });
    });
  return reportChain;
}

/* ---------------------------------------------------------------- http/ws --- */

const http = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      rooms: rooms.size,
      players: [...rooms.values()].reduce((n, r) => n + r.peers.size, 0),
      settleReporting: Boolean(APP_URL && ATTESTOR),
    }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server: http, maxPayload: 8 * 1024 });

wss.on("connection", (socket, request) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const roomId = url.pathname.replace(/^\/room\/?/, "") || "default";

  // Two ways in, both server-side secrets:
  //  - `ticket` a per-user HMAC minted by the app for one room (browsers)
  //  - `key`    the raw shared secret (operator smoke tests only)
  const key = url.searchParams.get("key");
  const ticket = url.searchParams.get("ticket");
  const viaKey = Boolean(SECRET) && key === SECRET;
  const claims = ticket ? verifyRoomTicket(ticket, SECRET) : null;

  if (SECRET && !viaKey && !claims) {
    socket.close(1008, "unauthorised");
    return;
  }
  if (claims && claims.room !== roomId) {
    socket.close(1008, "ticket/room mismatch");
    return;
  }
  if (rooms.size >= MAX_ROOMS && !rooms.has(roomId)) {
    socket.close(1013, "at capacity");
    return;
  }

  const room = rooms.get(roomId) ?? createRoom(roomId);
  rooms.set(roomId, room);

  const id = `p${++peerSeq.n}`;
  const peer: Peer = {
    socket, roomId, id, clientId: null,
    userId: claims?.sub ?? null,
    name: "OPERATIVE", player: null, lastSeen: Date.now(),
  };
  room.peers.set(id, peer);
  room.lastActivity = Date.now();
  log("peer_connected", { room: roomId, peer: id, peers: room.peers.size, authenticated: Boolean(claims || viaKey) });

  socket.on("message", (raw, isBinary) => {
    peer.lastSeen = Date.now();
    room.lastActivity = Date.now();

    if (isBinary) return; // clients never send authoritative state

    let msg: { t?: string; input?: unknown; peerId?: string; name?: string };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.t) {
      case "hello": {
        peer.clientId = typeof msg.peerId === "string" ? msg.peerId : id;
        peer.name = typeof msg.name === "string" && msg.name ? msg.name.slice(0, 18) : "OPERATIVE";

        const player = room.authority.join(id);
        if (player === null) {
          socket.send(JSON.stringify({ t: "leave", reason: "room_full" }));
          socket.close(1013, "room full");
          return;
        }
        peer.player = player;
        // The ticket is the only source of a user id — a client cannot claim one.
        if (peer.userId) room.slots[player] = peer.userId;

        // The newcomer learns its own slot and who it is up against.
        const opponent = [...room.peers.values()].find((p) => p.id !== id && p.player !== null);
        socket.send(JSON.stringify({
          t: "welcome",
          peerId: peer.clientId,
          player,
          opponent: opponent ? opponent.name : null,
        }));

        // ...and the peer already in the room learns the newcomer's name.
        for (const other of room.peers.values()) {
          if (other === peer || other.socket.readyState !== other.socket.OPEN) continue;
          other.socket.send(JSON.stringify({
            t: "welcome",
            peerId: other.clientId ?? other.id,
            player: other.player,
            opponent: peer.name,
          }));
        }

        log("peer_joined", { room: roomId, peer: id, player });
        break;
      }
      case "input": {
        // Movement is the client's only lever. Values are clamped in the
        // authority, so an out-of-range input is corrected rather than trusted.
        const input = decodeInput(msg.input);
        if (input) room.authority.setInput(id, input);
        break;
      }
      case "leave": {
        socket.close(1000, "left");
        break;
      }
      default:
        break;
    }
  });

  socket.on("close", () => {
    room.peers.delete(id);
    room.authority.leave(id);
    log("peer_disconnected", { room: roomId, peer: id, remaining: room.peers.size });
    for (const other of room.peers.values()) {
      if (other.socket.readyState === other.socket.OPEN) {
        other.socket.send(JSON.stringify({ t: "leave", peerId: id }));
      }
    }
    if (room.peers.size === 0) room.lastActivity = Date.now();
  });

  socket.on("error", () => socket.close());
});

http.listen(PORT, () => {
  log("listening", {
    port: PORT,
    authority: "server",
    ticketAuth: Boolean(SECRET),
    settleReporting: Boolean(APP_URL && ATTESTOR),
  });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log("shutdown", { signal, rooms: rooms.size });
    for (const id of [...rooms.keys()]) destroyRoom(id, "shutdown");
    wss.close();
    http.close(() => process.exit(0));
  });
}
