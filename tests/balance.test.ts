import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runHeadless, winRate } from "../src/game/match";

/**
 * Balance harness. This does not assert a hard-coded difficulty — it *measures*
 * the AI and prints the result, so a change to the sim or the AI that makes the
 * game trivially winnable shows up as a moved number rather than a vibe.
 *
 * The game is intentionally stochastic (weapon spread, AI aim error, AI
 * mistakes), which is right for play and wrong for measurement: an unseeded run
 * drifts and the assertions below flake. So the RNG is pinned for the duration
 * of the run — same seed, same printed numbers, on any machine.
 */
const SEED = 0x48454953; // "HEIS"

function seeded<T>(fn: () => T): T {
  const real = Math.random;
  let s = SEED >>> 0;
  Math.random = () => {
    // Numerical Recipes LCG — deterministic, and good enough for sampling.
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

describe("balance", () => {
  it("reports AI-vs-AI strength and match shape", () => {
    const { rows, w1, w2, shapes } = seeded(() => {
      const diffs = ["recruit", "professional", "veteran", "mastermind"] as const;
      const out: string[] = [];
      const shapes: string[] = [];
      for (const d of diffs) {
        const r = runHeadless({ a: d, b: d });
        shapes.push(r.endReason ?? "none");
        out.push(
          `${d.padEnd(12)} ticks=${String(r.ticks).padStart(4)} (${(r.ticks / 30).toFixed(0)}s) ` +
          `reason=${r.endReason} kills=${r.stats.map((s) => s.kills).join("/")} ` +
          `hacks=${r.stats.map((s) => s.hacks).join("/")} coreHeld=${r.stats.map((s) => s.coreHeldTicks).join("/")}`,
        );
      }
      const w1 = winRate("veteran", "recruit", 8);
      const w2 = winRate("mastermind", "professional", 8);
      out.push(`veteran vs recruit: ${(w1 * 100).toFixed(0)}%`);
      out.push(`mastermind vs professional: ${(w2 * 100).toFixed(0)}%`);
      return { rows: out, w1, w2, shapes };
    });

    writeFileSync("/tmp/heist-balance.txt", rows.join("\n"));

    // The game must be *playing*: the objective loop completes, matches end in
    // a real heist rather than a timeout, and skill ordering is monotonic.
    expect(w1).toBeGreaterThan(0.5);
    expect(w2).toBeGreaterThan(0.5);
    expect(shapes).toContain("core_extracted");
    expect(shapes).not.toContain("draw_time");
  });
});
