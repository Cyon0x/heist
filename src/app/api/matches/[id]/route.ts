import { NextResponse } from "next/server";
import { z } from "zod";
import { isAddress, type Address } from "viem";
import { getStore, type Store } from "@/lib/db/store";
import { currentSession } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { safeEqual } from "@/lib/auth/crypto";
import { MATCH_TRANSITIONS, type MatchStatus } from "@/lib/db/types";

export const dynamic = "force-dynamic";

const report = z.object({
  /** `started` marks the match live; `result` (the default) closes it. */
  event: z.enum(["started", "result"]).default("result"),
  /** Browser path: relative to the caller. Ignored for staked matches. */
  winner: z.enum(["me", "opponent", "draw"]).optional(),
  /** Attestor path: an absolute user id, so there is no ambiguity about "me". */
  winnerUserId: z.string().min(1).max(64).nullable().optional(),
  reason: z.string().max(64).default("unknown"),
  stats: z
    .object({
      kills: z.number().int().min(0).max(99),
      hacks: z.number().int().min(0).max(99),
      seconds: z.number().min(0).max(3600),
      coreHeldSeconds: z.number().min(0).max(3600),
    })
    .optional(),
});

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "NOT_SIGNED_IN" }, { status: 401 });
  const store = await getStore();
  const match = await store.getMatch(id);
  if (!match) return NextResponse.json({ error: "MATCH_NOT_FOUND" }, { status: 404 });
  if (match.playerOne !== session.userId && match.playerTwo !== session.userId) {
    return NextResponse.json({ error: "NOT_A_PARTICIPANT" }, { status: 403 });
  }
  const otherId = match.playerOne === session.userId ? match.playerTwo : match.playerOne;
  const other = otherId ? await store.getUser(otherId) : null;
  return NextResponse.json({ match, opponent: other ? { username: other.username, avatarSeed: other.avatarSeed } : null });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = report.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const env = serverEnv();
  const attestor = request.headers.get("x-heist-attestor") ?? "";
  const fromGameServer = Boolean(env.cronSecret) && safeEqual(attestor, env.cronSecret);

  const store = await getStore();
  const match = await store.getMatch(id);
  if (!match) return NextResponse.json({ error: "MATCH_NOT_FOUND" }, { status: 404 });

  if (parsed.data.event === "started") {
    // Not a money decision — but still only the authority may declare a match
    // live, so a browser cannot pre-date a match it has not played.
    if (!fromGameServer) return NextResponse.json({ error: "ATTESTATION_REQUIRED" }, { status: 403 });
    await advance(id, "ACTIVE");
    return NextResponse.json({ match: await store.getMatch(id) });
  }

  if (fromGameServer) return settle(store, id, parsed.data);

  // Staked matches are only ever settled by the authoritative game server. A
  // browser claiming victory on a $25 match is not evidence of anything.
  if (match.stakeUnits > 0) {
    return NextResponse.json({ error: "ATTESTATION_REQUIRED" }, { status: 403 });
  }

  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "NOT_SIGNED_IN" }, { status: 401 });
  if (match.playerOne !== session.userId && match.playerTwo !== session.userId) {
    return NextResponse.json({ error: "NOT_A_PARTICIPANT" }, { status: 403 });
  }
  if (match.status === "RESULT") return NextResponse.json({ match, alreadySettled: true });

  const claimed = parsed.data.winner ?? "draw";
  const winnerId =
    claimed === "draw"
      ? null
      : claimed === "me"
        ? session.userId
        : match.playerOne === session.userId
          ? match.playerTwo
          : match.playerOne;

  await recordResult(store, id, winnerId, parsed.data.reason, parsed.data.stats);
  return NextResponse.json({ match: await store.getMatch(id) });
}

/**
 * The authoritative path. The game server owns the simulation, so it owns the
 * result; the shared secret proves the claim came from it. Idempotent — a
 * duplicate POST cannot pay twice.
 */
async function settle(store: Store, id: string, data: z.infer<typeof report>) {
  const match = await store.getMatch(id);
  if (!match) return NextResponse.json({ error: "MATCH_NOT_FOUND" }, { status: 404 });
  if (match.status === "RESULT" || match.status === "SETTLEMENT") {
    return NextResponse.json({ match, alreadySettled: true });
  }

  const declared = data.winnerUserId !== undefined ? data.winnerUserId : null;
  if (declared !== null && declared !== match.playerOne && declared !== match.playerTwo) {
    return NextResponse.json({ error: "WINNER_NOT_A_PARTICIPANT" }, { status: 400 });
  }
  const winnerId = declared;

  await recordResult(store, id, winnerId, data.reason, data.stats);
  if (match.stakeUnits > 0 && winnerId) {
    await payOut(store, id, winnerId);
  }
  return NextResponse.json({ match: await store.getMatch(id) });
}

/**
 * Move a match to a terminal state along the declared state machine. The path
 * is discovered, not hard-coded, so READY/ACTIVE/CORE_STOLEN all reach the same
 * destination without any caller having to know the graph.
 */
function pathTo(from: MatchStatus, to: MatchStatus): MatchStatus[] | null {
  if (from === to) return [];
  const queue: MatchStatus[][] = [[from]];
  const seen = new Set<MatchStatus>([from]);
  while (queue.length > 0) {
    const path = queue.shift()!;
    for (const next of MATCH_TRANSITIONS[path[path.length - 1]!] ?? []) {
      if (next === to) return [...path, next];
      if (!seen.has(next)) {
        seen.add(next);
        queue.push([...path, next]);
      }
    }
  }
  return null;
}

async function advance(matchId: string, to: MatchStatus, patch: Record<string, unknown> = {}) {
  const store = await getStore();
  const cur = await store.getMatch(matchId);
  if (!cur || cur.status === to) return;
  const path = pathTo(cur.status, to);
  if (!path) {
    console.error("[heist] no legal transition", { matchId, from: cur.status, to });
    return;
  }
  for (const step of path) {
    try {
      await store.updateMatchStatus(matchId, step, step === to ? patch : {});
    } catch (error) {
      console.error("[heist] transition failed", { matchId, step, error });
      return;
    }
  }
}

async function recordResult(
  store: Store,
  matchId: string,
  winnerId: string | null,
  reason: string,
  stats?: { kills: number; hacks: number; seconds: number; coreHeldSeconds: number },
) {
  const match = await store.getMatch(matchId);
  if (!match) return;

  await advance(matchId, "MATCH_COMPLETE", { winner: winnerId, endReason: reason });
  await store.addEvent(matchId, "match_complete", winnerId, { reason, ...(stats ?? {}) });

  const players = [match.playerOne, match.playerTwo].filter((p): p is string => Boolean(p));
  for (const pid of players) {
    const won = winnerId === pid;
    const drew = winnerId === null;
    await store.bumpStats(pid, {
      games: 1,
      wins: won ? 1 : 0,
      losses: drew ? 0 : won ? 0 : 1,
      draws: drew ? 1 : 0,
      totalStakedUnits: match.stakeUnits,
      totalWonUnits: won ? Math.floor(match.potUnits * 0.9) : 0,
    });
  }

  // Non-staked matches are done the moment they are recorded.
  if (match.stakeUnits > 0) await advance(matchId, "SETTLEMENT");
  else await advance(matchId, "RESULT");
}

/**
 * Settle a staked match against the escrow contract and record the receipt.
 * A failure leaves the match in SETTLEMENT_FAILED — recoverable — rather than
 * pretending the player was paid.
 */
async function payOut(store: Store, matchId: string, winnerId: string) {
  try {
    const { readMatchState, settleMatch, toMatchId } = await import("@/lib/arc/settlement");
    const onchain = await readMatchState(toMatchId(matchId));
    const wallets = await store.getWallets(winnerId);
    const winner = wallets
      .map((w) => w.address)
      .find(
        (a): a is Address =>
          isAddress(a) &&
          (a.toLowerCase() === onchain.playerOne.toLowerCase() ||
            a.toLowerCase() === onchain.playerTwo.toLowerCase()),
      );
    if (!winner) throw new Error("winner has no address in this escrow match");

    const { txHash } = await settleMatch({ matchId: toMatchId(matchId), winner });
    await store.updateMatchStatus(matchId, "RESULT", { settleTx: txHash, winner: winnerId });
    await store.addTransaction({
      matchId,
      wallet: winner,
      txHash,
      type: "payout",
      amountUnits: Math.floor((await store.getMatch(matchId))!.potUnits * 0.9),
      status: "confirmed",
    });
  } catch (error) {
    console.error("[heist] settlement failed", { matchId, error });
    await store.addEvent(matchId, "settlement_failed", winnerId, {
      message: error instanceof Error ? error.message : String(error),
    });
    await advance(matchId, "SETTLEMENT_FAILED");
  }
}
