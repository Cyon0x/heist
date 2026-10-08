"use client";

import { useQuery } from "@tanstack/react-query";

export interface SessionUser {
  id: string;
  username: string;
  provider: "wallet" | "google" | "x";
  avatarSeed: string;
  createdAt: string;
  stats: { games: number; wins: number; losses: number; draws: number; totalStakedUnits: number; totalWonUnits: number };
  wallets: { address: string; type: string; chain: string }[];
}

export interface SessionResponse {
  session: null | { userId: string; username: string; address: string | null; provider: string; acceptedTermsAt: string | null };
  user: SessionUser | null;
  capabilities: { google: boolean; x: boolean; managedWallet: boolean; escrow: boolean; store: "postgres" | "memory" };
  network: { chainId: number; name: string; explorer: string };
}

async function load(): Promise<SessionResponse> {
  const res = await fetch("/api/auth/session", { credentials: "same-origin" });
  if (!res.ok) throw new Error("session unavailable");
  return (await res.json()) as SessionResponse;
}

export function useSession() {
  return useQuery({ queryKey: ["session"], queryFn: load });
}
