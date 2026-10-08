import "server-only";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serverEnv } from "../env";
import {
  canTransition, type ArenaRow, type AuthProvider, type LeaderboardRow, type MatchMode,
  type MatchRow, type MatchStatus, type PlayerStats, type TransactionRow, type User,
  type WalletRow, type WalletType,
} from "./types";

export interface Store {
  readonly driver: "postgres" | "memory";
  ensureSchema(): Promise<void>;

  createUser(username: string, provider: AuthProvider, avatarSeed?: string, externalId?: string | null): Promise<User>;
  getUser(id: string): Promise<User | null>;
  getUserByUsername(username: string): Promise<User | null>;
  /** Resolve a social account to its HEIST user, so one person never ends up
   *  with two accounts because they signed in with Google twice. */
  getUserByExternal(provider: AuthProvider, externalId: string): Promise<User | null>;
  searchUsers(query: string, limit: number): Promise<User[]>;

  addWallet(userId: string, address: string, type: WalletType, encryptedKey?: string | null): Promise<WalletRow>;
  getWallets(userId: string): Promise<WalletRow[]>;
  findUserByAddress(address: string): Promise<User | null>;
  getManagedWallet(userId: string): Promise<WalletRow | null>;

  getStats(userId: string): Promise<PlayerStats>;
  bumpStats(userId: string, delta: Partial<Omit<PlayerStats, "userId">>): Promise<void>;
  leaderboard(sort: "wins" | "winRate" | "winnings" | "games", limit: number): Promise<LeaderboardRow[]>;

  createMatch(input: { mode: MatchMode; stakeUnits: number; playerOne: string | null; playerTwo?: string | null; arenaId?: string | null; status?: MatchStatus }): Promise<MatchRow>;
  getMatch(id: string): Promise<MatchRow | null>;
  updateMatchStatus(id: string, to: MatchStatus, patch?: Partial<MatchRow>): Promise<MatchRow>;
  setMatchResult(id: string, winner: string | null, endReason: string): Promise<MatchRow>;
  listMatchesFor(userId: string, limit: number): Promise<MatchRow[]>;
  countLiveMatches(userId: string): Promise<number>;

  addEvent(matchId: string, type: string, playerId: string | null, metadata?: Record<string, unknown>): Promise<void>;
  listEvents(matchId: string): Promise<{ eventType: string; at: string; metadata: Record<string, unknown> }[]>;

  addTransaction(row: Omit<TransactionRow, "id" | "createdAt">): Promise<TransactionRow>;
  listTransactions(address: string | null, limit: number): Promise<TransactionRow[]>;
  listTransactionsForMatches(matchIds: string[]): Promise<TransactionRow[]>;

  createArena(input: { creator: string; stakeUnits: number; ttlSeconds: number }): Promise<ArenaRow>;
  getArenaByCode(code: string): Promise<ArenaRow | null>;
  getArenaByToken(token: string): Promise<ArenaRow | null>;
  updateArena(id: string, patch: Partial<ArenaRow>): Promise<ArenaRow>;
  expireArenas(): Promise<number>;

  enqueue(userId: string, stakeUnits: number): Promise<void>;
  dequeue(userId: string): Promise<void>;
  getQueueEntry(userId: string): Promise<{ stakeUnits: number; enqueuedAt: string } | null>;
  /** Atomically claim an opponent at the same stake. Returns the matched user or null. */
  claimOpponent(userId: string, stakeUnits: number): Promise<string | null>;
  /** The user's unfinished match, if any. Used to survive refreshes mid-match. */
  liveMatchFor(userId: string): Promise<MatchRow | null>;
  /** How many players are currently waiting for an opponent. */
  queuedCount(): Promise<number>;
  /** Drop queue entries older than `ms`. Returns how many were removed. */
  sweepQueue(ms: number): Promise<number>;
}

/* ------------------------------------------------------------------ helpers */

const nowIso = () => new Date().toISOString();
const uid = () => randomUUID();

function toUser(r: { id: string; username: string; auth_provider: AuthProvider; avatar_seed: string; external_id: string | null; created_at: Date }): User {
  return {
    id: r.id,
    username: r.username,
    authProvider: r.auth_provider,
    avatarSeed: r.avatar_seed,
    externalId: r.external_id ?? null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export const CODE_ALPHABET = "ACDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeJoinCode(len = 5): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return out;
}

export function sanitizeUsername(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 18);
  return cleaned.length >= 3 ? cleaned : `thief${randomBytes(2).toString("hex")}`;
}

/* ------------------------------------------------------------------- memory */

class MemoryStore implements Store {
  readonly driver = "memory" as const;
  private users = new Map<string, User>();
  private usernames = new Map<string, string>();
  private wallets = new Map<string, WalletRow>();
  private stats = new Map<string, PlayerStats>();
  private matches = new Map<string, MatchRow>();
  private events: { matchId: string; eventType: string; at: string; metadata: Record<string, unknown> }[] = [];
  private txns: TransactionRow[] = [];
  private arenas = new Map<string, ArenaRow>();
  private queue = new Map<string, { stakeUnits: number; at: string }>();

  async ensureSchema() {}

  async createUser(username: string, provider: AuthProvider, avatarSeed = uid(), externalId: string | null = null): Promise<User> {
    const user: User = {
      id: uid(), username, authProvider: provider, avatarSeed, externalId, createdAt: nowIso(),
    };
    this.users.set(user.id, user);
    this.usernames.set(username.toLowerCase(), user.id);
    this.stats.set(user.id, { userId: user.id, games: 0, wins: 0, losses: 0, draws: 0, totalStakedUnits: 0, totalWonUnits: 0 });
    return user;
  }
  async getUser(id: string) { return this.users.get(id) ?? null; }
  async getUserByUsername(username: string) {
    const id = this.usernames.get(username.toLowerCase());
    return id ? this.users.get(id) ?? null : null;
  }
  async getUserByExternal(provider: AuthProvider, externalId: string) {
    return [...this.users.values()].find((u) => u.authProvider === provider && u.externalId === externalId) ?? null;
  }
  async searchUsers(query: string, limit: number) {
    const q = query.toLowerCase();
    return [...this.users.values()].filter((u) => u.username.toLowerCase().includes(q)).slice(0, limit);
  }

  async addWallet(userId: string, address: string, type: WalletType, encryptedKey: string | null = null) {
    const row: WalletRow = { id: uid(), userId, address, type, chain: "arc", encryptedKey, createdAt: nowIso() };
    this.wallets.set(row.id, row);
    return row;
  }
  async getWallets(userId: string) { return [...this.wallets.values()].filter((w) => w.userId === userId); }
  async findUserByAddress(address: string) {
    const w = [...this.wallets.values()].find((x) => x.address.toLowerCase() === address.toLowerCase());
    return w ? this.users.get(w.userId) ?? null : null;
  }
  async getManagedWallet(userId: string) {
    return [...this.wallets.values()].find((w) => w.userId === userId && w.type === "managed") ?? null;
  }

  async getStats(userId: string) {
    return this.stats.get(userId) ?? { userId, games: 0, wins: 0, losses: 0, draws: 0, totalStakedUnits: 0, totalWonUnits: 0 };
  }
  async bumpStats(userId: string, delta: Partial<Omit<PlayerStats, "userId">>) {
    const cur = await this.getStats(userId);
    this.stats.set(userId, {
      userId,
      games: cur.games + (delta.games ?? 0),
      wins: cur.wins + (delta.wins ?? 0),
      losses: cur.losses + (delta.losses ?? 0),
      draws: cur.draws + (delta.draws ?? 0),
      totalStakedUnits: cur.totalStakedUnits + (delta.totalStakedUnits ?? 0),
      totalWonUnits: cur.totalWonUnits + (delta.totalWonUnits ?? 0),
    });
  }
  async leaderboard(sort: "wins" | "winRate" | "winnings" | "games", limit: number) {
    const rows: LeaderboardRow[] = [...this.users.values()].map((u) => {
      const s = this.stats.get(u.id)!;
      return {
        userId: u.id, username: u.username, avatarSeed: u.avatarSeed,
        games: s.games, wins: s.wins, losses: s.losses, totalWonUnits: s.totalWonUnits,
        winRate: s.games > 0 ? s.wins / s.games : 0,
      };
    });
    const key = sort === "winRate" ? "winRate" : sort === "winnings" ? "totalWonUnits" : sort === "games" ? "games" : "wins";
    return rows.sort((a, b) => (b[key] as number) - (a[key] as number)).slice(0, limit);
  }

  async createMatch(input: { mode: MatchMode; stakeUnits: number; playerOne: string | null; playerTwo?: string | null; arenaId?: string | null; status?: MatchStatus }) {
    const row: MatchRow = {
      id: uid(), mode: input.mode, status: input.status ?? "LOBBY",
      stakeUnits: input.stakeUnits, potUnits: input.stakeUnits * 2,
      playerOne: input.playerOne, playerTwo: input.playerTwo ?? null,
      winner: null, endReason: null, arenaId: input.arenaId ?? null,
      resultHash: null, settleTx: null, createdAt: nowIso(), startedAt: null, completedAt: null,
    };
    this.matches.set(row.id, row);
    return row;
  }
  async getMatch(id: string) { return this.matches.get(id) ?? null; }
  async updateMatchStatus(id: string, to: MatchStatus, patch: Partial<MatchRow> = {}) {
    const cur = this.matches.get(id);
    if (!cur) throw new Error(`match ${id} not found`);
    if (!canTransition(cur.status, to)) throw new Error(`illegal match transition ${cur.status} → ${to}`);
    const next: MatchRow = { ...cur, ...patch, status: to };
    this.matches.set(id, next);
    return next;
  }
  async setMatchResult(id: string, winner: string | null, endReason: string) {
    const cur = this.matches.get(id);
    if (!cur) throw new Error(`match ${id} not found`);
    const next: MatchRow = { ...cur, winner, endReason, completedAt: nowIso(), status: "MATCH_COMPLETE" };
    this.matches.set(id, next);
    return next;
  }
  async listMatchesFor(userId: string, limit: number) {
    return [...this.matches.values()]
      .filter((m) => m.playerOne === userId || m.playerTwo === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  async countLiveMatches(userId: string) {
    const live: MatchStatus[] = ["FUNDING", "READY", "COUNTDOWN", "ACTIVE", "CORE_STOLEN", "EXTRACTION"];
    return [...this.matches.values()].filter(
      (m) => live.includes(m.status) && (m.playerOne === userId || m.playerTwo === userId),
    ).length;
  }

  async addEvent(matchId: string, eventType: string, _playerId: string | null, metadata: Record<string, unknown> = {}) {
    this.events.push({ matchId, eventType, at: nowIso(), metadata });
  }
  async listEvents(matchId: string) {
    return this.events.filter((e) => e.matchId === matchId).map((e) => ({ eventType: e.eventType, at: e.at, metadata: e.metadata }));
  }

  async addTransaction(row: Omit<TransactionRow, "id" | "createdAt">) {
    const t: TransactionRow = { ...row, id: uid(), createdAt: nowIso() };
    this.txns.unshift(t);
    return t;
  }
  async listTransactions(address: string | null, limit: number) {
    const list = address ? this.txns.filter((t) => t.wallet.toLowerCase() === address.toLowerCase()) : this.txns;
    return list.slice(0, limit);
  }
  async listTransactionsForMatches(matchIds: string[]) {
    const set = new Set(matchIds);
    return this.txns.filter((t) => t.matchId && set.has(t.matchId));
  }

  async createArena(input: { creator: string; stakeUnits: number; ttlSeconds: number }) {
    const row: ArenaRow = {
      id: uid(), joinCode: makeJoinCode(), inviteToken: randomBytes(16).toString("hex"),
      creator: input.creator, stakeUnits: input.stakeUnits, status: "open", matchId: null,
      expiresAt: new Date(Date.now() + input.ttlSeconds * 1000).toISOString(), createdAt: nowIso(),
    };
    this.arenas.set(row.id, row);
    return row;
  }
  async getArenaByCode(code: string) {
    return [...this.arenas.values()].find((a) => a.joinCode === code.toUpperCase()) ?? null;
  }
  async getArenaByToken(token: string) {
    return [...this.arenas.values()].find((a) => a.inviteToken === token) ?? null;
  }
  async updateArena(id: string, patch: Partial<ArenaRow>) {
    const cur = this.arenas.get(id);
    if (!cur) throw new Error(`arena ${id} not found`);
    const next = { ...cur, ...patch };
    this.arenas.set(id, next);
    return next;
  }
  async expireArenas() {
    let n = 0;
    for (const a of this.arenas.values()) {
      if (a.status === "open" && Date.parse(a.expiresAt) < Date.now()) { a.status = "expired"; n += 1; }
    }
    return n;
  }

  async enqueue(userId: string, stakeUnits: number) {
    if (this.queue.has(userId)) return;
    this.queue.set(userId, { stakeUnits, at: nowIso() });
  }
  async dequeue(userId: string) { this.queue.delete(userId); }
  async getQueueEntry(userId: string) {
    const e = this.queue.get(userId);
    return e ? { stakeUnits: e.stakeUnits, enqueuedAt: e.at } : null;
  }
  async liveMatchFor(userId: string) {
    const live: MatchStatus[] = ["MATCH_FOUND", "FUNDING", "READY", "COUNTDOWN", "ACTIVE", "CORE_STOLEN", "EXTRACTION"];
    return (
      [...this.matches.values()]
        .filter((m) => live.includes(m.status) && (m.playerOne === userId || m.playerTwo === userId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
    );
  }
  async claimOpponent(userId: string, stakeUnits: number) {
    const candidates = [...this.queue.entries()]
      .filter(([id, q]) => id !== userId && q.stakeUnits === stakeUnits)
      .sort((a, b) => a[1].at.localeCompare(b[1].at));
    const first = candidates[0];
    if (!first) return null;
    this.queue.delete(first[0]);
    return first[0];
  }
  async queuedCount() { return this.queue.size; }
  async sweepQueue(ms: number) {
    let n = 0;
    const cutoff = Date.now() - ms;
    for (const [id, entry] of this.queue) {
      if (Date.parse(entry.at) < cutoff) { this.queue.delete(id); n += 1; }
    }
    return n;
  }
}

/* ----------------------------------------------------------------- postgres */

type PgPool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  connect: () => Promise<{ query: PgPool["query"]; release: () => void }>;
};

class PostgresStore implements Store {
  readonly driver = "postgres" as const;
  constructor(private pool: PgPool) {}

  private async schema() {
    const env = serverEnv();
    void env;
  }

  async ensureSchema() {
    await this.schema();
  }

  private async q<T = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
    const res = await this.pool.query(text, values);
    return res.rows as T[];
  }

  async createUser(username: string, provider: AuthProvider, avatarSeed = uid(), externalId: string | null = null): Promise<User> {
    const rows = await this.q<{ id: string }>(
      `INSERT INTO users (id, username, username_ci, auth_provider, avatar_seed, external_id)
       VALUES ($1, $2, lower($2), $3, $4, $5) RETURNING id`,
      [uid(), username, provider, avatarSeed, externalId],
    );
    const id = rows[0]!.id;
    await this.q(`INSERT INTO player_stats (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [id]);
    return (await this.getUser(id))!;
  }
  async getUser(id: string) {
    const rows = await this.q<{ id: string; username: string; auth_provider: AuthProvider; avatar_seed: string; external_id: string | null; created_at: Date }>(
      `SELECT id, username, auth_provider, avatar_seed, external_id, created_at FROM users WHERE id = $1`, [id]);
    return rows[0] ? toUser(rows[0]) : null;
  }
  async getUserByUsername(username: string) {
    const rows = await this.q<{ id: string }>(`SELECT id FROM users WHERE username_ci = lower($1)`, [username]);
    return rows[0] ? this.getUser(rows[0].id) : null;
  }
  async getUserByExternal(provider: AuthProvider, externalId: string) {
    const rows = await this.q<{ id: string }>(
      `SELECT id FROM users WHERE auth_provider = $1 AND external_id = $2 LIMIT 1`, [provider, externalId]);
    return rows[0] ? this.getUser(rows[0].id) : null;
  }
  async searchUsers(query: string, limit: number) {
    const rows = await this.q<{ id: string }>(`SELECT id FROM users WHERE username_ci LIKE lower($1) LIMIT $2`, [`%${query}%`, limit]);
    const out: User[] = [];
    for (const r of rows) { const u = await this.getUser(r.id); if (u) out.push(u); }
    return out;
  }

  async addWallet(userId: string, address: string, type: WalletType, encryptedKey: string | null = null) {
    const rows = await this.q<{ id: string; created_at: Date }>(
      `INSERT INTO wallets (id, user_id, wallet_address, wallet_type, chain, encrypted_key)
       VALUES ($1,$2,$3,$4,'arc',$5) RETURNING id, created_at`, [uid(), userId, address, type, encryptedKey]);
    return { id: rows[0]!.id, userId, address, type, chain: "arc", encryptedKey, createdAt: new Date(rows[0]!.created_at).toISOString() };
  }
  async getWallets(userId: string) {
    const rows = await this.q<{ id: string; wallet_address: string; wallet_type: WalletType; chain: string; encrypted_key: string | null; created_at: Date }>(
      `SELECT id, wallet_address, wallet_type, chain, encrypted_key, created_at FROM wallets WHERE user_id = $1 ORDER BY created_at`, [userId]);
    return rows.map((r) => ({ id: r.id, userId, address: r.wallet_address, type: r.wallet_type, chain: r.chain, encryptedKey: r.encrypted_key, createdAt: new Date(r.created_at).toISOString() }));
  }
  async findUserByAddress(address: string) {
    const rows = await this.q<{ user_id: string }>(`SELECT user_id FROM wallets WHERE lower(wallet_address) = lower($1) LIMIT 1`, [address]);
    return rows[0] ? this.getUser(rows[0].user_id) : null;
  }
  async getManagedWallet(userId: string) {
    const rows = await this.q<{ id: string; wallet_address: string; wallet_type: WalletType; chain: string; encrypted_key: string | null; created_at: Date }>(
      `SELECT id, wallet_address, wallet_type, chain, encrypted_key, created_at FROM wallets WHERE user_id = $1 AND wallet_type = 'managed' LIMIT 1`, [userId]);
    const r = rows[0];
    return r ? { id: r.id, userId, address: r.wallet_address, type: r.wallet_type, chain: r.chain, encryptedKey: r.encrypted_key, createdAt: new Date(r.created_at).toISOString() } : null;
  }

  async getStats(userId: string): Promise<PlayerStats> {
    const rows = await this.q<{ games: number; wins: number; losses: number; draws: number; total_staked_units: string; total_won_units: string }>(
      `SELECT games, wins, losses, draws, total_staked_units, total_won_units FROM player_stats WHERE user_id = $1`, [userId]);
    const r = rows[0];
    if (!r) return { userId, games: 0, wins: 0, losses: 0, draws: 0, totalStakedUnits: 0, totalWonUnits: 0 };
    return {
      userId, games: r.games, wins: r.wins, losses: r.losses, draws: r.draws,
      totalStakedUnits: Number(r.total_staked_units), totalWonUnits: Number(r.total_won_units),
    };
  }
  async bumpStats(userId: string, delta: Partial<Omit<PlayerStats, "userId">>) {
    await this.q(
      `INSERT INTO player_stats (user_id, games, wins, losses, draws, total_staked_units, total_won_units)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id) DO UPDATE SET
         games = player_stats.games + EXCLUDED.games,
         wins = player_stats.wins + EXCLUDED.wins,
         losses = player_stats.losses + EXCLUDED.losses,
         draws = player_stats.draws + EXCLUDED.draws,
         total_staked_units = player_stats.total_staked_units + EXCLUDED.total_staked_units,
         total_won_units = player_stats.total_won_units + EXCLUDED.total_won_units`,
      [userId, delta.games ?? 0, delta.wins ?? 0, delta.losses ?? 0, delta.draws ?? 0, delta.totalStakedUnits ?? 0, delta.totalWonUnits ?? 0],
    );
  }
  async leaderboard(sort: "wins" | "winRate" | "winnings" | "games", limit: number) {
    const order = sort === "winRate"
      ? "CASE WHEN s.games > 0 THEN s.wins::float / s.games ELSE 0 END DESC"
      : sort === "winnings" ? "s.total_won_units DESC"
      : sort === "games" ? "s.games DESC" : "s.wins DESC";
    const rows = await this.q<{ user_id: string; username: string; avatar_seed: string; games: number; wins: number; losses: number; total_won_units: string }>(
      `SELECT s.user_id, u.username, u.avatar_seed, s.games, s.wins, s.losses, s.total_won_units
       FROM player_stats s JOIN users u ON u.id = s.user_id
       WHERE s.games > 0
       ORDER BY ${order} LIMIT $1`, [limit]);
    return rows.map((r) => ({
      userId: r.user_id, username: r.username, avatarSeed: r.avatar_seed,
      games: r.games, wins: r.wins, losses: r.losses,
      totalWonUnits: Number(r.total_won_units),
      winRate: r.games > 0 ? r.wins / r.games : 0,
    }));
  }

  private mapMatch(r: Record<string, unknown>): MatchRow {
    return {
      id: r.id as string, mode: r.mode as MatchMode, status: r.status as MatchStatus,
      stakeUnits: Number(r.stake_units), potUnits: Number(r.pot_units),
      playerOne: (r.player_one as string) ?? null, playerTwo: (r.player_two as string) ?? null,
      winner: (r.winner as string) ?? null, endReason: (r.end_reason as string) ?? null,
      arenaId: (r.arena_id as string) ?? null, resultHash: (r.result_hash as string) ?? null,
      settleTx: (r.settle_tx as string) ?? null,
      createdAt: new Date(r.created_at as string).toISOString(),
      startedAt: r.started_at ? new Date(r.started_at as string).toISOString() : null,
      completedAt: r.completed_at ? new Date(r.completed_at as string).toISOString() : null,
    };
  }
  async createMatch(input: { mode: MatchMode; stakeUnits: number; playerOne: string | null; playerTwo?: string | null; arenaId?: string | null; status?: MatchStatus }) {
    const rows = await this.q(`INSERT INTO matches (id, mode, status, stake_units, pot_units, player_one, player_two, arena_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [uid(), input.mode, input.status ?? "LOBBY", input.stakeUnits, input.stakeUnits * 2, input.playerOne, input.playerTwo ?? null, input.arenaId ?? null]);
    return this.mapMatch(rows[0]!);
  }
  async getMatch(id: string) {
    const rows = await this.q(`SELECT * FROM matches WHERE id = $1`, [id]);
    return rows[0] ? this.mapMatch(rows[0]) : null;
  }
  async updateMatchStatus(id: string, to: MatchStatus, patch: Partial<MatchRow> = {}) {
    const cur = await this.getMatch(id);
    if (!cur) throw new Error(`match ${id} not found`);
    if (!canTransition(cur.status, to)) throw new Error(`illegal match transition ${cur.status} → ${to}`);
    const rows = await this.q(`UPDATE matches SET
        status = $2,
        winner = COALESCE($3, winner),
        end_reason = COALESCE($4, end_reason),
        result_hash = COALESCE($5, result_hash),
        settle_tx = COALESCE($6, settle_tx),
        player_two = COALESCE($7, player_two),
        started_at = CASE WHEN $2 = 'ACTIVE' THEN COALESCE(started_at, now()) ELSE started_at END,
        completed_at = CASE WHEN $2 IN ('MATCH_COMPLETE','RESULT','REFUNDED','CANCELLED','ABANDONED') THEN COALESCE(completed_at, now()) ELSE completed_at END
      WHERE id = $1 RETURNING *`,
      [id, to, patch.winner ?? null, patch.endReason ?? null, patch.resultHash ?? null, patch.settleTx ?? null, patch.playerTwo ?? null]);
    return this.mapMatch(rows[0]!);
  }
  async setMatchResult(id: string, winner: string | null, endReason: string) {
    const rows = await this.q(
      `UPDATE matches SET winner = $2, end_reason = $3, status = 'MATCH_COMPLETE', completed_at = now() WHERE id = $1 RETURNING *`,
      [id, winner, endReason]);
    return this.mapMatch(rows[0]!);
  }
  async listMatchesFor(userId: string, limit: number) {
    const rows = await this.q(`SELECT * FROM matches WHERE player_one = $1 OR player_two = $1 ORDER BY created_at DESC LIMIT $2`, [userId, limit]);
    return rows.map((r) => this.mapMatch(r));
  }
  async countLiveMatches(userId: string) {
    const rows = await this.q<{ n: string }>(
      `SELECT count(*)::text AS n FROM matches
       WHERE (player_one = $1 OR player_two = $1)
         AND status IN ('FUNDING','READY','COUNTDOWN','ACTIVE','CORE_STOLEN','EXTRACTION')`, [userId]);
    return Number(rows[0]?.n ?? 0);
  }

  async addEvent(matchId: string, eventType: string, playerId: string | null, metadata: Record<string, unknown> = {}) {
    await this.q(`INSERT INTO match_events (match_id, event_type, player_id, metadata) VALUES ($1,$2,$3,$4)`,
      [matchId, eventType, playerId, JSON.stringify(metadata)]);
  }
  async listEvents(matchId: string) {
    const rows = await this.q<{ event_type: string; at: string; metadata: Record<string, unknown> }>(
      `SELECT event_type, at, metadata FROM match_events WHERE match_id = $1 ORDER BY at`, [matchId]);
    return rows.map((r) => ({ eventType: r.event_type, at: new Date(r.at).toISOString(), metadata: r.metadata }));
  }

  async addTransaction(row: Omit<TransactionRow, "id" | "createdAt">) {
    const created = new Date().toISOString();
    await this.q(
      `INSERT INTO transactions (id, match_id, wallet, tx_hash, type, amount_units, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (lower(tx_hash), type) DO NOTHING`,
      [uid(), row.matchId, row.wallet, row.txHash, row.type, row.amountUnits, row.status]);
    return { ...row, id: uid(), createdAt: created };
  }
  async listTransactions(address: string | null, limit: number) {
    const rows = address
      ? await this.q(`SELECT * FROM transactions WHERE lower(wallet) = lower($1) ORDER BY created_at DESC LIMIT $2`, [address, limit])
      : await this.q(`SELECT * FROM transactions ORDER BY created_at DESC LIMIT $1`, [limit]);
    return rows.map(mapTxn);
  }
  async listTransactionsForMatches(matchIds: string[]) {
    if (matchIds.length === 0) return [];
    const rows = await this.q(`SELECT * FROM transactions WHERE match_id = ANY($1) ORDER BY created_at DESC`, [matchIds]);
    return rows.map(mapTxn);
  }

  async createArena(input: { creator: string; stakeUnits: number; ttlSeconds: number }) {
    const rows = await this.q(`INSERT INTO arenas (id, join_code, invite_token, creator, stake_units, status, expires_at)
      VALUES ($1,$2,$3,$4,$5,'open', now() + ($6 || ' seconds')::interval) RETURNING *`,
      [uid(), makeJoinCode(), randomBytes(16).toString("hex"), input.creator, input.stakeUnits, String(input.ttlSeconds)]);
    return mapArena(rows[0]!);
  }
  async getArenaByCode(code: string) {
    const rows = await this.q(`SELECT * FROM arenas WHERE join_code = $1`, [code.toUpperCase()]);
    return rows[0] ? mapArena(rows[0]) : null;
  }
  async getArenaByToken(token: string) {
    const rows = await this.q(`SELECT * FROM arenas WHERE invite_token = $1`, [token]);
    return rows[0] ? mapArena(rows[0]) : null;
  }
  async updateArena(id: string, patch: Partial<ArenaRow>) {
    const rows = await this.q(`UPDATE arenas SET
        status = COALESCE($2, status),
        match_id = COALESCE($3, match_id)
      WHERE id = $1 RETURNING *`, [id, patch.status ?? null, patch.matchId ?? null]);
    return mapArena(rows[0]!);
  }
  async expireArenas() {
    const rows = await this.q<{ id: string }>(
      `UPDATE arenas SET status = 'expired' WHERE status = 'open' AND expires_at < now() RETURNING id`);
    return rows.length;
  }

  async enqueue(userId: string, stakeUnits: number) {
    await this.q(`INSERT INTO queue (user_id, stake_units, enqueued_at, heartbeat_at)
      VALUES ($1,$2, now(), now())
      ON CONFLICT (user_id) DO UPDATE SET stake_units = EXCLUDED.stake_units, heartbeat_at = now()`, [userId, stakeUnits]);
  }
  async dequeue(userId: string) {
    await this.q(`DELETE FROM queue WHERE user_id = $1`, [userId]);
  }
  async getQueueEntry(userId: string) {
    const rows = await this.q<{ stake_units: string; enqueued_at: Date }>(
      `SELECT stake_units, enqueued_at FROM queue WHERE user_id = $1`, [userId]);
    const r = rows[0];
    return r ? { stakeUnits: Number(r.stake_units), enqueuedAt: new Date(r.enqueued_at).toISOString() } : null;
  }
  async liveMatchFor(userId: string) {
    const rows = await this.q(
      `SELECT * FROM matches
        WHERE (player_one = $1 OR player_two = $1)
          AND status IN ('MATCH_FOUND','FUNDING','READY','COUNTDOWN','ACTIVE','CORE_STOLEN','EXTRACTION')
        ORDER BY created_at DESC LIMIT 1`, [userId]);
    return rows[0] ? this.mapMatch(rows[0]) : null;
  }
  async claimOpponent(userId: string, stakeUnits: number) {
    // DELETE ... RETURNING is atomic: two simultaneous claim calls cannot both win.
    const rows = await this.q<{ user_id: string }>(
      `DELETE FROM queue WHERE user_id = (
         SELECT user_id FROM queue
         WHERE stake_units = $1 AND user_id <> $2 AND heartbeat_at > now() - interval '45 seconds'
         ORDER BY enqueued_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       ) RETURNING user_id`, [stakeUnits, userId]);
    return rows[0]?.user_id ?? null;
  }
  async queuedCount() {
    const rows = await this.q<{ n: string }>(
      `SELECT count(*)::text AS n FROM queue WHERE heartbeat_at > now() - interval '45 seconds'`);
    return Number(rows[0]?.n ?? 0);
  }
  async sweepQueue(ms: number) {
    const rows = await this.q<{ user_id: string }>(
      `DELETE FROM queue WHERE enqueued_at < now() - ($1::text || ' milliseconds')::interval RETURNING user_id`,
      [String(ms)]);
    return rows.length;
  }
}

function mapTxn(r: Record<string, unknown>): TransactionRow {
  return {
    id: r.id as string,
    matchId: (r.match_id as string) ?? null,
    wallet: r.wallet as string,
    txHash: r.tx_hash as string,
    type: r.type as TransactionRow["type"],
    amountUnits: Number(r.amount_units),
    status: r.status as TransactionRow["status"],
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

function mapArena(r: Record<string, unknown>): ArenaRow {
  return {
    id: r.id as string,
    joinCode: r.join_code as string,
    inviteToken: r.invite_token as string,
    creator: r.creator as string,
    stakeUnits: Number(r.stake_units),
    status: r.status as ArenaRow["status"],
    matchId: (r.match_id as string) ?? null,
    expiresAt: new Date(r.expires_at as string).toISOString(),
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

/* --------------------------------------------------------------- singleton */

let storePromise: Promise<Store> | null = null;

export async function getStore(): Promise<Store> {
  if (!storePromise) storePromise = createStore();
  return storePromise;
}

async function createStore(): Promise<Store> {
  const url = serverEnv().databaseUrl;
  if (!url) return new MemoryStore();
  try {
    const { Pool } = (await import("pg")) as unknown as { Pool: new (cfg: Record<string, unknown>) => PgPool };
    const pool = new Pool({
      connectionString: url,
      max: 8,
      ssl: url.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
    });
    const store = new PostgresStore(pool);
    await applySchema(pool);
    return store;
  } catch (error) {
    console.error("[heist] Postgres unavailable, falling back to the ephemeral store:", error);
    return new MemoryStore();
  }
}

async function applySchema(pool: PgPool) {
  const raw = readFileSync(join(process.cwd(), "src/lib/db/schema.sql"), "utf8");
  // Strip line comments *before* splitting, or the first statement is skipped.
  const sql = raw
    .split("\n")
    .map((line) => (line.trimStart().startsWith("--") ? "" : line))
    .join("\n");
  for (const stmt of sql.split(";")) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;
    await pool.query(trimmed);
  }
}
