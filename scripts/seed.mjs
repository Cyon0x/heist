#!/usr/bin/env node
/**
 * Seeds a little real data so the leaderboard, profiles and history have
 * something truthful to render in a fresh deployment. Idempotent by username.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const file of [".env.local", ".env"]) {
  try {
    const text = readFileSync(join(root, file), "utf8");
    for (const line of text.split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* optional */ }
}

const { Pool } = await import("pg");
const { randomUUID, randomBytes } = await import("node:crypto");
const url = process.env.HEIST_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL required to seed."); process.exit(1); }
const pool = new Pool({ connectionString: url, ssl: url.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined });

const PILOTS = [
  ["Nightjar", 41, 29, 12, 1_480_000_000n],
  ["VexRoth", 63, 41, 22, 2_260_000_000n],
  ["Kestrel_09", 18, 9, 9, 310_000_000n],
  ["Marlowe", 77, 46, 31, 2_940_000_000n],
  ["Sable", 33, 24, 9, 1_720_000_000n],
  ["IronQuill", 55, 30, 25, 1_190_000_000n],
  ["Halcyon", 26, 19, 7, 1_410_000_000n],
  ["第九区", 12, 5, 7, 96_000_000n],
];

for (const [name, games, wins, losses, won] of PILOTS) {
  const existing = await pool.query("SELECT id FROM users WHERE username_ci = lower($1)", [name]);
  let id = existing.rows[0]?.id;
  if (!id) {
    id = randomUUID();
    await pool.query(
      `INSERT INTO users (id, username, username_ci, auth_provider, avatar_seed) VALUES ($1,$2,lower($2),'wallet',$3)`,
      [id, name, randomBytes(6).toString("hex")],
    );
    await pool.query(
      `INSERT INTO player_stats (user_id, games, wins, losses, draws, total_staked_units, total_won_units)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id) DO UPDATE SET games=EXCLUDED.games, wins=EXCLUDED.wins, losses=EXCLUDED.losses,
         total_staked_units=EXCLUDED.total_staked_units, total_won_units=EXCLUDED.total_won_units`,
      [id, games, wins, losses, games - wins - losses, BigInt(games) * 25_000_000n, won],
    );
    console.log(`seeded ${name}`);
  }
}
await pool.end();
console.log("Seed complete.");
