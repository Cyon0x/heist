export type AuthProvider = "wallet" | "google" | "x";
export type WalletType = "injected" | "walletconnect" | "managed";
export type MatchMode = "global" | "friend" | "computer";

/** The match state machine (§54). Invalid transitions are rejected in `store.ts`. */
export type MatchStatus =
  | "LOBBY" | "MATCHMAKING" | "MATCH_FOUND" | "FUNDING" | "READY" | "COUNTDOWN"
  | "ACTIVE" | "CORE_STOLEN" | "EXTRACTION" | "MATCH_COMPLETE" | "SETTLEMENT" | "RESULT"
  | "CANCELLED" | "ABANDONED" | "DISCONNECTED" | "REFUND_PENDING" | "REFUNDED" | "SETTLEMENT_FAILED";

export const MATCH_TRANSITIONS: Record<MatchStatus, MatchStatus[]> = {
  LOBBY: ["MATCHMAKING", "MATCH_FOUND", "CANCELLED"],
  MATCHMAKING: ["MATCH_FOUND", "CANCELLED", "ABANDONED"],
  MATCH_FOUND: ["FUNDING", "CANCELLED", "ABANDONED"],
  FUNDING: ["READY", "CANCELLED", "REFUND_PENDING", "REFUNDED", "ABANDONED"],
  READY: ["COUNTDOWN", "CANCELLED", "REFUND_PENDING", "REFUNDED", "ABANDONED"],
  COUNTDOWN: ["ACTIVE", "DISCONNECTED", "ABANDONED", "REFUND_PENDING", "REFUNDED"],
  ACTIVE: ["CORE_STOLEN", "EXTRACTION", "MATCH_COMPLETE", "DISCONNECTED", "ABANDONED"],
  CORE_STOLEN: ["EXTRACTION", "ACTIVE", "MATCH_COMPLETE", "DISCONNECTED", "ABANDONED"],
  EXTRACTION: ["MATCH_COMPLETE", "CORE_STOLEN", "DISCONNECTED", "ABANDONED"],
  MATCH_COMPLETE: ["SETTLEMENT", "RESULT", "SETTLEMENT_FAILED"],
  SETTLEMENT: ["RESULT", "SETTLEMENT_FAILED", "REFUND_PENDING"],
  RESULT: [],
  CANCELLED: ["REFUND_PENDING", "REFUNDED"],
  ABANDONED: ["REFUND_PENDING", "REFUNDED"],
  DISCONNECTED: ["ACTIVE", "ABANDONED", "REFUND_PENDING", "REFUNDED", "MATCH_COMPLETE"],
  REFUND_PENDING: ["REFUNDED", "SETTLEMENT_FAILED"],
  REFUNDED: [],
  SETTLEMENT_FAILED: ["SETTLEMENT", "REFUND_PENDING"],
};

export function canTransition(from: MatchStatus, to: MatchStatus): boolean {
  if (from === to) return true;
  return MATCH_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface User {
  id: string;
  username: string;
  authProvider: AuthProvider;
  avatarSeed: string;
  /** The provider's own account id (Google `sub`, X user id). Null for wallets. */
  externalId: string | null;
  createdAt: string;
}

export interface WalletRow {
  id: string;
  userId: string;
  address: string;
  type: WalletType;
  chain: string;
  encryptedKey: string | null;
  createdAt: string;
}

export interface PlayerStats {
  userId: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  totalStakedUnits: number;
  totalWonUnits: number;
}

export interface MatchRow {
  id: string;
  mode: MatchMode;
  status: MatchStatus;
  stakeUnits: number;
  potUnits: number;
  playerOne: string | null;
  playerTwo: string | null;
  winner: string | null;
  endReason: string | null;
  arenaId: string | null;
  resultHash: string | null;
  settleTx: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface TransactionRow {
  id: string;
  matchId: string | null;
  wallet: string;
  txHash: string;
  type: "entry" | "payout" | "refund" | "deposit" | "withdrawal";
  amountUnits: number;
  status: "pending" | "confirmed" | "failed";
  createdAt: string;
}

export interface ArenaRow {
  id: string;
  joinCode: string;
  inviteToken: string;
  creator: string;
  stakeUnits: number;
  status: "open" | "filled" | "started" | "expired" | "cancelled";
  matchId: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface LeaderboardRow {
  userId: string;
  username: string;
  avatarSeed: string;
  games: number;
  wins: number;
  losses: number;
  totalWonUnits: number;
  winRate: number;
}
