/**
 * Short-lived room tickets.
 *
 * The browser must never hold `GAME_SERVER_SECRET`. Instead the web app mints a
 * ticket — a base64url payload plus an HMAC of that payload under the shared
 * secret — and the game server re-computes the MAC locally. Neither side has to
 * call the other on the connection path, and the secret never leaves the server.
 *
 * Deliberately free of `server-only` so the standalone Node game server (which
 * is not a React runtime) can import the same verifier the API route signs with.
 * It must never be imported by a client component: the only thing it does is
 * handle the shared secret.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface RoomTicket {
  /** Room id — always the match id. */
  room: string;
  /** Stable subject: the HEIST user id. Survives a browser refresh. */
  sub: string;
  /** Unix seconds. */
  exp: number;
}

const b64u = (buf: Buffer) => buf.toString("base64url");
const mac = (body: string, secret: string) => b64u(createHmac("sha256", secret).update(body).digest());

export function signRoomTicket(ticket: RoomTicket, secret: string): string {
  const body = b64u(Buffer.from(JSON.stringify(ticket), "utf8"));
  return `${body}.${mac(body, secret)}`;
}

export function verifyRoomTicket(raw: string, secret: string, now = Math.floor(Date.now() / 1000)): RoomTicket | null {
  if (!secret || !raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return null;

  const body = raw.slice(0, dot);
  const given = Buffer.from(raw.slice(dot + 1), "base64url");
  const want = Buffer.from(mac(body, secret), "base64url");
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const t = parsed as Partial<RoomTicket>;
  if (typeof t?.room !== "string" || typeof t?.sub !== "string" || typeof t?.exp !== "number") return null;
  if (!Number.isFinite(t.exp) || t.exp < now) return null;
  return { room: t.room, sub: t.sub, exp: t.exp };
}
