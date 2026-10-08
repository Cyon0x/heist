import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { currentSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await currentSession();
  if (!session) return NextResponse.json({ session: null, user: null, stats: null, matches: [] });
  const store = await getStore();
  const user = await store.getUser(session.userId);
  if (!user) return NextResponse.json({ session: null, user: null, stats: null, matches: [] });
  const [stats, wallets, matches] = await Promise.all([
    store.getStats(user.id),
    store.getWallets(user.id),
    store.listMatchesFor(user.id, 8),
  ]);

  // Resolve counterparts in one pass so the lobby can show "vs Nightjar".
  const ids = new Set<string>();
  for (const m of matches) {
    if (m.playerOne && m.playerOne !== user.id) ids.add(m.playerOne);
    if (m.playerTwo && m.playerTwo !== user.id) ids.add(m.playerTwo);
  }
  const people: Record<string, { username: string; avatarSeed: string }> = {};
  for (const id of ids) {
    const u = await store.getUser(id);
    if (u) people[id] = { username: u.username, avatarSeed: u.avatarSeed };
  }

  const rank = await rankOf(user.id, stats);

  return NextResponse.json({
    session,
    user: { ...user, wallets: wallets.map((w) => ({ address: w.address, type: w.type })) },
    stats,
    rank,
    matches: matches.map((m) => ({
      ...m,
      opponentId: m.playerOne === user.id ? m.playerTwo : m.playerOne,
      opponent: (() => {
        const otherId = m.playerOne === user.id ? m.playerTwo : m.playerOne;
        return otherId ? people[otherId] ?? null : null;
      })(),
      outcome: m.winner === null ? (m.status === "RESULT" ? "draw" : "pending") : m.winner === user.id ? "win" : "loss",
    })),
  });
}

async function rankOf(userId: string, _stats: { wins: number }) {
  const store = await getStore();
  const board = await store.leaderboard("wins", 500);
  const idx = board.findIndex((r) => r.userId === userId);
  return idx >= 0 ? idx + 1 : board.length + 1;
}
