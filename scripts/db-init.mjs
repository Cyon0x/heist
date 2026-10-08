#!/usr/bin/env node
/**
 * Applies the HEIST schema. Usage:
 *   DATABASE_URL=postgres://... node scripts/db-init.mjs
 * Or run `npm run db:init` with .env.local present.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = readFileSync(join(root, file), "utf8");
      for (const line of text.split("\n")) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (!m) continue;
        const value = m[2].replace(/^["']|["']$/g, "");
        if (!process.env[m[1]]) process.env[m[1]] = value;
      }
    } catch { /* file is optional */ }
  }
}

loadEnv();

const url = process.env.HEIST_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL set — HEIST will run on the ephemeral in-memory store.");
  process.exit(0);
}

const { Pool } = await import("pg");
const sql = readFileSync(join(root, "src/lib/db/schema.sql"), "utf8");
const cleaned = sql.split("\n").map((l) => (l.trimStart().startsWith("--") ? "" : l)).join("\n");

const pool = new Pool({
  connectionString: url,
  ssl: url.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
});

let applied = 0;
for (const stmt of cleaned.split(";")) {
  const t = stmt.trim();
  if (!t) continue;
  await pool.query(t);
  applied += 1;
}
console.log(`HEIST schema applied: ${applied} statements.`);
await pool.end();
