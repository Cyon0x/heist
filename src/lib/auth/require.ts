import "server-only";
import { NextResponse } from "next/server";
import { currentSession, type Session } from "./session";
import { getStore, type Store } from "@/lib/db/store";

export type Ctx = { session: Session; store: Store };

/** Every route that touches money or a profile goes through here. */
export async function requireSession(): Promise<Ctx | NextResponse> {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "NOT_SIGNED_IN" }, { status: 401 });
  const store = await getStore();
  return { session, store };
}

export const isResponse = (v: unknown): v is NextResponse => v instanceof NextResponse;
