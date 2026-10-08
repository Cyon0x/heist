import "server-only";

/**
 * Server-only configuration. Nothing in this file may be imported from a client
 * component; `server-only` makes that a build error rather than a leak.
 */

function required(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export function serverEnv() {
  const databaseUrl = process.env.HEIST_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim() || "";
  return {
    appUrl: required("APP_URL", "http://localhost:4320"),
    isProd: process.env.NODE_ENV === "production",
    databaseUrl,
    sessionSecret: required("SESSION_SECRET"),
    walletKey: required("WALLET_ENCRYPTION_KEY"),
    escrowAddress: required("HEIST_ESCROW_ADDRESS"),
    settlementKey: required("SETTLEMENT_PRIVATE_KEY"),
    treasury: required("PROTOCOL_TREASURY_ADDRESS"),
    google: { id: required("GOOGLE_CLIENT_ID"), secret: required("GOOGLE_CLIENT_SECRET") },
    x: { id: required("X_CLIENT_ID"), secret: required("X_CLIENT_SECRET") },
    cronSecret: required("CRON_SECRET"),
    /** Shared with the standalone game server. Never sent to the browser. */
    gameServerSecret: required("GAME_SERVER_SECRET"),
    /** Where the browser opens its authoritative socket, if anywhere. */
    gameServerUrl: (process.env.NEXT_PUBLIC_GAME_SERVER_URL || process.env.GAME_SERVER_URL || "").trim(),
  };
}

export const isEscrowConfigured = () => Boolean(serverEnv().escrowAddress && serverEnv().settlementKey);

export function assertProdSecrets() {
  const env = serverEnv();
  if (!env.isProd) return;
  const missing: string[] = [];
  if (!env.sessionSecret) missing.push("SESSION_SECRET");
  if (!env.walletKey) missing.push("WALLET_ENCRYPTION_KEY");
  if (missing.length > 0) {
    throw new Error(
      `HEIST refuses to run in production without: ${missing.join(", ")}. Run \`openssl rand -base64 32\` for each.`,
    );
  }
}
