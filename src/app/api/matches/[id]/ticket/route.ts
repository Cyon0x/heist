import { NextResponse } from "next/server";
import { requireSession, isResponse } from "@/lib/auth/require";
import { serverEnv } from "@/lib/env";
import { signRoomTicket } from "@/lib/game/ticket";

export const dynamic = "force-dynamic";

/**
 * The browser's entry pass to the authoritative game server.
 *
 * Participation is proven here, with the real session, so the game server can
 * stay dumb: it verifies an HMAC and never has to trust a client-supplied id.
 * The ticket is scoped to one room and dies with the match.
 */
const TTL_SECONDS = 60 * 60 * 4;

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireSession();
  if (isResponse(auth)) return auth;

  const match = await auth.store.getMatch(id);
  if (!match) return NextResponse.json({ error: "MATCH_NOT_FOUND" }, { status: 404 });
  if (match.playerOne !== auth.session.userId && match.playerTwo !== auth.session.userId) {
    return NextResponse.json({ error: "NOT_A_PARTICIPANT" }, { status: 403 });
  }
  if (match.status === "RESULT" || match.status === "CANCELLED" || match.status === "ABANDONED") {
    return NextResponse.json({ error: "MATCH_CLOSED", status: match.status }, { status: 409 });
  }

  const env = serverEnv();
  const url = env.gameServerUrl;
  if (!url || !env.gameServerSecret) {
    // No authoritative server on this deployment. The client falls back to the
    // LOCAL transport, which is explicitly display-only and refuses stakes.
    return NextResponse.json({ transport: "local", stakeUnits: match.stakeUnits });
  }

  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  return NextResponse.json({
    transport: "server",
    url,
    room: id,
    ticket: signRoomTicket({ room: id, sub: auth.session.userId, exp }, env.gameServerSecret),
    expiresAt: exp,
    stakeUnits: match.stakeUnits,
  });
}
