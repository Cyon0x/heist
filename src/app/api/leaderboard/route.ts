import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";

export const dynamic = "force-dynamic";
export const revalidate = 30;

const SORTS = ["wins", "winRate", "winnings", "games"] as const;
type Sort = (typeof SORTS)[number];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("sort") ?? "wins";
  const sort: Sort = (SORTS as readonly string[]).includes(raw) ? (raw as Sort) : "wins";
  const store = await getStore();
  const rows = await store.leaderboard(sort, 100);
  return NextResponse.json({ sort, rows });
}
