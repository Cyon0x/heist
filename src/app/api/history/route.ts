import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "NOT_SIGNED_IN" }, { status: 401 });
  const store = await getStore();
  const matches = await store.listMatchesFor(session.userId, 60);

  const ids = new Set<string>();
  for (const m of matches) {
    if (m.playerOne) ids.add(m.playerOne);
    if (m.playerTwo) ids.add(m.playerTwo);
  }
  const people: Record<string, { username: string; avatarSeed: string }> = {};
  for (const id of ids) {
    const u = await store.getUser(id);
    if (u) people[id] = { username: u.username, avatarSeed: u.avatarSeed };
  }

  const txns = await store.listTransactionsForMatches(matches.map((m) => m.id));

  return NextResponse.json({
    matches: matches.map((m) => ({
      ...m,
      opponent: (() => {
        const other = m.playerOne === session.userId ? m.playerTwo : m.playerOne;
        return other ? people[other] ?? null : null;
      })(),
      outcome: m.winner === null ? (m.status === "RESULT" ? "draw" : "pending") : m.winner === session.userId ? "win" : "loss",
    })),
    transactions: txns,
  });
}
