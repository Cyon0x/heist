-- HEIST schema. Idempotent: applied on first connection and by `npm run db:init`.
-- Lives in its own database (or schema) so it never shares tables with anything else.

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  username_ci   TEXT NOT NULL UNIQUE,
  auth_provider TEXT NOT NULL CHECK (auth_provider IN ('wallet','google','x')),
  avatar_seed   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallets (
  id             UUID PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  wallet_type    TEXT NOT NULL CHECK (wallet_type IN ('injected','walletconnect','managed')),
  chain          TEXT NOT NULL DEFAULT 'arc',
  encrypted_key  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS wallets_address_chain_uniq ON wallets (lower(wallet_address), chain);
CREATE INDEX IF NOT EXISTS wallets_user_idx ON wallets (user_id);

CREATE TABLE IF NOT EXISTS player_stats (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  games             INTEGER NOT NULL DEFAULT 0,
  wins              INTEGER NOT NULL DEFAULT 0,
  losses            INTEGER NOT NULL DEFAULT 0,
  draws             INTEGER NOT NULL DEFAULT 0,
  total_staked_units BIGINT NOT NULL DEFAULT 0,
  total_won_units    BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS arenas (
  id           UUID PRIMARY KEY,
  join_code    TEXT NOT NULL UNIQUE,
  invite_token TEXT NOT NULL UNIQUE,
  creator      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stake_units  BIGINT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('open','filled','started','expired','cancelled')),
  match_id     UUID,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS arenas_status_idx ON arenas (status, expires_at);

CREATE TABLE IF NOT EXISTS matches (
  id            UUID PRIMARY KEY,
  mode          TEXT NOT NULL CHECK (mode IN ('global','friend','computer')),
  status        TEXT NOT NULL CHECK (status IN (
                  'LOBBY','MATCHMAKING','MATCH_FOUND','FUNDING','READY','COUNTDOWN','ACTIVE',
                  'CORE_STOLEN','EXTRACTION','MATCH_COMPLETE','SETTLEMENT','RESULT',
                  'CANCELLED','ABANDONED','DISCONNECTED','REFUND_PENDING','REFUNDED','SETTLEMENT_FAILED')),
  stake_units   BIGINT NOT NULL DEFAULT 0,
  pot_units     BIGINT NOT NULL DEFAULT 0,
  player_one    UUID REFERENCES users(id) ON DELETE SET NULL,
  player_two    UUID REFERENCES users(id) ON DELETE SET NULL,
  winner        UUID REFERENCES users(id) ON DELETE SET NULL,
  end_reason    TEXT,
  arena_id      UUID REFERENCES arenas(id) ON DELETE SET NULL,
  result_hash   TEXT,
  settle_tx     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS matches_players_idx ON matches (player_one, player_two, created_at DESC);
CREATE INDEX IF NOT EXISTS matches_status_idx ON matches (status);
CREATE UNIQUE INDEX IF NOT EXISTS matches_live_uniq
  ON matches (player_one) WHERE status IN ('FUNDING','READY','COUNTDOWN','ACTIVE','CORE_STOLEN','EXTRACTION');

CREATE TABLE IF NOT EXISTS match_events (
  id        BIGSERIAL PRIMARY KEY,
  match_id  UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  player_id UUID,
  at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata  JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS match_events_match_idx ON match_events (match_id, at);

CREATE TABLE IF NOT EXISTS transactions (
  id           UUID PRIMARY KEY,
  match_id     UUID REFERENCES matches(id) ON DELETE SET NULL,
  wallet       TEXT NOT NULL,
  tx_hash      TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('entry','payout','refund','deposit','withdrawal')),
  amount_units BIGINT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('pending','confirmed','failed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS transactions_hash_type_uniq ON transactions (lower(tx_hash), type);
CREATE INDEX IF NOT EXISTS transactions_wallet_idx ON transactions (lower(wallet), created_at DESC);

CREATE TABLE IF NOT EXISTS queue (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stake_units  BIGINT NOT NULL,
  mode         TEXT NOT NULL DEFAULT 'global',
  enqueued_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS queue_stake_idx ON queue (stake_units, enqueued_at);

-- Social identity: one HEIST account per (provider, provider account id).
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_provider_external_uniq
  ON users (auth_provider, external_id) WHERE external_id IS NOT NULL;
