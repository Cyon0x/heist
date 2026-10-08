#!/usr/bin/env node
/** Thin wrapper so the contract commands work without Arc Foundry on PATH. */
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const bin = process.env.FORGE_BIN || "forge";
const res = spawnSync(bin, args, { cwd: join(root, "contracts"), stdio: "inherit" });
process.exit(res.status ?? 1);
