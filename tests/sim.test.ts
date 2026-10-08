import { describe, expect, it } from "vitest";
import { createMatch, newGridBuffer, step } from "../src/game/sim";
import { buildFlow, createMemory, aiInput, SKILLS } from "../src/game/ai";
import { runHeadless, winRate } from "../src/game/match";
import { EMPTY_INPUT, type Input } from "../src/game/types";
import { SPAWNS, EXTRACTION, TILE, GRID, GRID_W, TILE_SOLID } from "../src/game/map";
import { encodeSnapshot, decodeSnapshot, snapshotOf } from "../src/game/protocol";
import { MATCH_TICKS } from "../src/game/constants";
import { COUNTDOWN_TICKS } from "../src/game/constants";

const hold = (over: Partial<Input> = {}): Input => ({ ...EMPTY_INPUT, ...over });

function advance(state: ReturnType<typeof createMatch>, grid: Uint8Array, n: number, inputs?: [Input, Input]) {
  for (let i = 0; i < n; i++) step(state, inputs ?? [EMPTY_INPUT, EMPTY_INPUT], { grid });
}

describe("facility", () => {
  it("spawns both players on walkable floor, apart from each other", () => {
    for (const s of SPAWNS) {
      expect(GRID[Math.floor(s.y / TILE) * GRID_W + Math.floor(s.x / TILE)]).not.toBe(TILE_SOLID);
    }
    expect(Math.hypot(SPAWNS[0].x - SPAWNS[1].x, SPAWNS[0].y - SPAWNS[1].y)).toBeGreaterThan(600);
  });

  it("seals the vault until the vault terminal is hacked", () => {
    const state = createMatch();
    const grid = newGridBuffer();
    expect(state.doors.some((d) => d.id.startsWith("vault-") && d.open)).toBe(false);
    state.players[0].pos = { x: 20.5 * TILE, y: 20.5 * TILE };
    advance(state, grid, 4);
    expect(state.players[0].pos.x).toBeLessThan(21 * TILE);
  });
});

describe("simulation", () => {
  it("runs a full match to a terminal state without throwing", () => {
    const state = createMatch();
    const grid = newGridBuffer();
    advance(state, grid, MATCH_TICKS + COUNTDOWN_TICKS + 5);
    
    expect(state.phase).toBe("COMPLETE");
    expect(state.endReason).not.toBeNull();
  });

  it("never lets a player move through a wall", () => {
    const state = createMatch();
    const grid = newGridBuffer();
    state.phase = "ACTIVE";
    state.countdown = 0;
    for (let i = 0; i < 90; i++) {
      step(state, [hold({ moveY: -1, moveX: 0 }), EMPTY_INPUT], { grid });
    }
    const p = state.players[0];
    expect(GRID[Math.floor(p.pos.y / TILE) * GRID_W + Math.floor(p.pos.x / TILE)]).not.toBe(TILE_SOLID);
  });

  it("kills, drops the Core and respawns with one life left", () => {
    const state = createMatch();
    const grid = newGridBuffer();
    state.phase = "ACTIVE";
    state.countdown = 0;
    const [a, b] = state.players;
    b.pos = { ...a.pos, x: a.pos.x + 60 };
    b.protect = 0;
    a.aim = 0;
    for (let i = 0; i < 300 && b.alive; i++) {
      step(state, [hold({ fire: true, aimX: 1, aimY: 0 }), EMPTY_INPUT], { grid });
    }
    expect(b.alive).toBe(false);
    expect(b.lives).toBe(1);
    advance(state, grid, 120);
    expect(state.players[1].alive).toBe(true);
  });

  it("round-trips a snapshot through the wire codec", () => {
    const state = createMatch();
    const grid = newGridBuffer();
    advance(state, grid, 30);
    const snap = snapshotOf(state);
    const round = decodeSnapshot(encodeSnapshot(snap));
    expect(round.tick).toBe(snap.tick);
    expect(round.phase).toBe(snap.phase);
    expect(round.players[0].pos.x).toBeCloseTo(snap.players[0].pos.x, 2);
    expect(round.cameras.length).toBe(snap.cameras.length);
    expect(round.core.holder).toBe(snap.core.holder);
  });

  it("keeps the extraction zones walkable", () => {
    for (const key of ["A", "B"] as const) {
      const r = EXTRACTION[key].rect;
      expect(GRID[(r.y + 1) * GRID_W + (r.x + 1)]).not.toBe(TILE_SOLID);
    }
  });
});

describe("ai", () => {
  it("builds a flow field that reaches the far spawn", () => {
    const grid = newGridBuffer();
    const flow = buildFlow(grid, Math.floor(SPAWNS[0].y / TILE) * GRID_W + Math.floor(SPAWNS[0].x / TILE));
    const a = Math.floor(SPAWNS[1].y / TILE) * GRID_W + Math.floor(SPAWNS[1].x / TILE);
    expect(flow[a]).toBeGreaterThan(0);
  });

  it("only ever emits inputs a human keyboard could emit", () => {
    const state = createMatch();
    state.phase = "ACTIVE";
    state.countdown = 0;
    const mem = createMemory(state.players[0].pos);
    const input = aiInput(state, 0, mem, SKILLS.veteran, { noises: [], cameraSpot: -1 });
    for (const v of [input.moveX, input.moveY]) expect(Math.abs(v)).toBeLessThanOrEqual(1.0001);
    expect(Object.keys(input).sort()).toEqual(Object.keys(EMPTY_INPUT).sort());
  });

  it("plays a complete match with both sides acting, and produces a result", () => {
    const r = runHeadless({ a: "veteran", b: "recruit" });
    expect(r.ticks).toBeGreaterThan(60);
    const acted = r.stats.some((s) => s.distance > 200 || s.hacks > 0);
    expect(acted).toBe(true);
  });

  it("is measurably stronger at a higher difficulty", () => {
    const strong = winRate("veteran", "recruit", 6);
    expect(strong).toBeGreaterThan(0.5);
  });
});
