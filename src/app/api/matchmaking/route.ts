import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, isResponse } from "@/lib/auth/require";
import { STAKE_MAX, STAKE_MIN } from "@/lib/arc/chain";
import { isEscrowConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

const body = z.object({ stake: z.number().finite() });

/** Present the shape the lobby needs without leaking internal ids. */
async function describe(ctx: { session: { userId: string }; store: Awaited<ReturnType<typeof import("@/lib/db/store").getStore>> }, matchId: string) {
  const { store } = ctx;
  const match = await store.getMatch(matchId);
  if (!match) return null;
  const otherId = match.playerOne === ctx.session.userId ? match.playerTwo : match.playerOne;
  const other = otherId ? await store.getUser(otherId) : null;
  const stats = otherId ? await store.getStats(otherId) : null;
  return {
    matchId: match.id,
    stakeUnits: match.stakeUnits,
    potUnits: match.potUnits,
    status: match.status,
    mode: match.mode,
    opponent: other
      ? {
          username: other.username,
          avatarSeed: other.avatarSeed,
          games: stats?.games ?? 0,
          wins: stats?.wins ?? 0,
          winRate: stats && stats.games > 0 ? stats.wins / stats.games : 0,
        }
      : null,
  };
}

export async function GET() {
  const ctx = await requireSession();
  if (isResponse(ctx)) return ctx;
  const live = await ctx.store.liveMatchFor(ctx.session.userId);
  if (live) return NextResponse.json({ state: "matched", match: await describe(ctx, live.id) });
  const queued = await ctx.store.getQueueEntry(ctx.session.userId);
  if (queued) {
    return NextResponse.json({
      state: "searching",
      stakeUnits: queued.stakeUnits,
      since: queued.enqueuedAt,
      queued: await ctx.store.queuedCount().catch(() => null),
    });
  }
  return NextResponse.json({ state: "idle" });
}

export async function POST(request: Request) {
  const ctx = await requireSession();
  if (isResponse(ctx)) return ctx;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const { stake } = parsed.data;
  if (stake < STAKE_MIN || stake > STAKE_MAX) {
    return NextResponse.json({ error: "STAKE_OUT_OF_RANGE", min: STAKE_MIN, max: STAKE_MAX }, { status: 400 });
  }
  if (!isEscrowConfigured()) {
    // Refuse rather than simulate. A staked match without escrow is not a match.
    return NextResponse.json(
      { error: "ESCROW_UNAVAILABLE", detail: "No HeistEscrow deployment is configured on this environment." },
      { status: 503 },
    );
  }
  if (await ctx.store.countLiveMatches(ctx.session.userId)) {
    return NextResponse.json({ error: "ALREADY_IN_MATCH" }, { status: 409 });
  }

  const stakeUnits = Math.round(stake * 1e6);
  await ctx.store.enqueue(ctx.session.userId, stakeUnits);

  const opponentId = await ctx.store.claimOpponent(ctx.session.userId, stakeUnits);
  if (!opponentId) {
    return NextResponse.json({ state: "searching", stakeUnits, since: new Date().toISOString() });
  }

  const match = await ctx.store.createMatch({
    mode: "global",
    stakeUnits,
    playerOne: opponentId,
    playerTwo: ctx.session.userId,
    status: "MATCH_FOUND",
  });
  await ctx.store.dequeue(ctx.session.userId);
  return NextResponse.json({ state: "matched", match: await describe(ctx, match.id) });
}

export async function DELETE() {
  const ctx = await requireSession();
  if (isResponse(ctx)) return ctx;
  await ctx.store.dequeue(ctx.session.userId);
  return NextResponse.json({ state: "idle" });
}
