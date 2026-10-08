import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { configuredProviders } from "@/lib/auth/oauth";
import { isEscrowConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let store: "postgres" | "memory" = "memory";
  let dbOk = false;
  try {
    const s = await getStore();
    store = s.driver;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return NextResponse.json({
    ok: dbOk,
    service: "heist",
    store,
    db: dbOk,
    escrow: isEscrowConfigured(),
    oauth: configuredProviders(),
    latencyMs: Date.now() - started,
    at: new Date().toISOString(),
  });
}
