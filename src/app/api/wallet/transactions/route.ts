import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "NOT_SIGNED_IN" }, { status: 401 });
  const store = await getStore();
  const wallets = await store.getWallets(session.userId);
  const rows = await store.listTransactions(wallets[0]?.address ?? null, 60);
  return NextResponse.json({ rows });
}
