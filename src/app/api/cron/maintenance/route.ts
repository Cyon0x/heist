import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { serverEnv } from "@/lib/env";
import { safeEqual } from "@/lib/auth/crypto";

export const dynamic = "force-dynamic";

/**
 * Expires stale arenas and queue entries. Protected by CRON_SECRET so the
 * endpoint cannot be used to clear another player's queue slot.
 */
export async function GET(request: Request) {
  const secret = serverEnv().cronSecret;
  const provided = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (secret && !safeEqual(provided, secret)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const store = await getStore();
  const expired = await store.expireArenas();
  const swept = await store.sweepQueue(90_000);
  return NextResponse.json({ ok: true, expiredArenas: expired, sweptQueue: swept });
}
