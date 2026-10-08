"use client";

import { useQuery } from "@tanstack/react-query";

export interface MeMatch {
  id: string;
  mode: "global" | "friend" | "computer";
  status: string;
  stakeUnits: number;
  potUnits: number;
  winner: string | null;
  endReason: string | null;
  createdAt: string;
  opponent: { username: string; avatarSeed: string } | null;
  outcome: "win" | "loss" | "draw" | "pending";
}

export interface MeResponse {
  session: { userId: string; username: string; address: string | null; provider: string; acceptedTermsAt: string | null } | null;
  user: null | {
    id: string;
    username: string;
    avatarSeed: string;
    authProvider: string;
    createdAt: string;
    wallets: { address: string; type: string }[];
  };
  stats: null | { games: number; wins: number; losses: number; draws: number; totalStakedUnits: number; totalWonUnits: number };
  rank: number | null;
  matches: MeMatch[];
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<MeResponse> => {
      const res = await fetch("/api/me", { credentials: "same-origin" });
      if (!res.ok) throw new Error("profile unavailable");
      return (await res.json()) as MeResponse;
    },
  });
}
