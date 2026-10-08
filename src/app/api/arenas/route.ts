import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, isResponse } from "@/lib/auth/require";
import { STAKE_MAX, STAKE_MIN } from "@/lib/arc/chain";
import { isEscrowConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

const body = z.object({ stake: z.number().finite() });

export async function POST(request: Request) {
  const ctx = await requireSession();
  if (isResponse(ctx)) return ctx;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const stake = parsed.data.stake;
  // With no escrow deployment the only honest option is a zero-stake arena.
  if (isEscrowConfigured()) {
    if (stake < STAKE_MIN || stake > STAKE_MAX) {
      return NextResponse.json({ error: "STAKE_OUT_OF_RANGE", min: STAKE_MIN, max: STAKE_MAX }, { status: 400 });
    }
  } else if (stake !== 0) {
    return NextResponse.json({ error: "ESCROW_UNAVAILABLE" }, { status: 503 });
  }

  const arena = await ctx.store.createArena({
    creator: ctx.session.userId,
    stakeUnits: Math.round(stake * 1e6),
    ttlSeconds: 60 * 30,
  });

  const origin = new URL(request.url).origin;
  return NextResponse.json({
    arena: {
      id: arena.id,
      joinCode: arena.joinCode,
      inviteUrl: `${origin}/play/friend?arena=${arena.inviteToken}`,
      stakeUnits: arena.stakeUnits,
      expiresAt: arena.expiresAt,
    },
  });
}
