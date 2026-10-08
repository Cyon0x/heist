import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { currentSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** A join code (`HEIST-7K92`) or an invite token, whichever the client has. */
async function resolve(code: string) {
  const store = await getStore();
  const byToken = code.length > 12 ? await store.getArenaByToken(code) : null;
  return byToken ?? (await store.getArenaByCode(code));
}

export async function GET(_request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const store = await getStore();
  const arena = await resolve(code);
  if (!arena) return NextResponse.json({ error: "ARENA_NOT_FOUND" }, { status: 404 });
  if (Date.parse(arena.expiresAt) < Date.now() && arena.status === "open") {
    await store.updateArena(arena.id, { status: "expired" });
    arena.status = "expired";
  }
  const creator = await store.getUser(arena.creator);
  const session = await currentSession();
  return NextResponse.json({
    arena: {
      id: arena.id,
      joinCode: arena.joinCode,
      inviteToken: arena.inviteToken,
      stakeUnits: arena.stakeUnits,
      status: arena.status,
      matchId: arena.matchId,
      expiresAt: arena.expiresAt,
      isCreator: session?.userId === arena.creator,
      creator: creator ? { username: creator.username, avatarSeed: creator.avatarSeed } : null,
    },
  });
}

export async function POST(_request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "NOT_SIGNED_IN" }, { status: 401 });

  const store = await getStore();
  const arena = await resolve(code);
  if (!arena) return NextResponse.json({ error: "ARENA_NOT_FOUND" }, { status: 404 });

  if (arena.creator === session.userId) {
    return NextResponse.json({ error: "CANNOT_JOIN_OWN_ARENA", matchId: arena.matchId }, { status: 409 });
  }
  if (arena.status !== "open") {
    return NextResponse.json({ error: "ARENA_NOT_OPEN", status: arena.status }, { status: 409 });
  }
  if (Date.parse(arena.expiresAt) < Date.now()) {
    await store.updateArena(arena.id, { status: "expired" });
    return NextResponse.json({ error: "ARENA_EXPIRED" }, { status: 410 });
  }
  if (await store.countLiveMatches(session.userId)) {
    return NextResponse.json({ error: "ALREADY_IN_MATCH" }, { status: 409 });
  }

  const match = await store.createMatch({
    mode: "friend",
    stakeUnits: arena.stakeUnits,
    playerOne: arena.creator,
    playerTwo: session.userId,
    arenaId: arena.id,
    status: "READY",
  });
  await store.updateArena(arena.id, { status: "filled", matchId: match.id });
  await store.addEvent(match.id, "arena_joined", session.userId, { joinCode: arena.joinCode });

  return NextResponse.json({ matchId: match.id, arenaId: arena.id });
}
