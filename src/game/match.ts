/**
 * Headless match runner. Used by the tests, by the AI win-rate harness and by
 * the server's practice mode. It drives the exact same `step()` the browser
 * runs, so a bug here is a bug in the game.
 */

import { MATCH_TICKS, type NoiseKind } from "./constants";
import { aiInput, createMemory, SKILLS, type AiMemory, type Difficulty } from "./ai";
import { buildGrid, createMatch, newGridBuffer, step } from "./sim";
import { EMPTY_INPUT, other, type EndReason, type GameState, type Input, type MatchPhase, type PlayerId, type Vec } from "./types";

export interface HeadlessResult {
  winner: PlayerId | null;
  endReason: EndReason | null;
  ticks: number;
  stats: {
    kills: number;
    hacks: number;
    damage: number;
    distance: number;
    coreHeldTicks: number;
  }[];
}

export function runHeadless(opts: {
  a: Difficulty;
  b: Difficulty;
  maxTicks?: number;
  onTick?: (state: GameState) => void;
}): HeadlessResult {
  const state = createMatch();
  state.countdown = 0;
  state.phase = "ACTIVE";
  const grid = newGridBuffer();
  buildGrid(state, grid);

  const mem: [AiMemory, AiMemory] = [createMemory(state.players[0].pos), createMemory(state.players[1].pos)];
  const skill = [SKILLS[opts.a], SKILLS[opts.b]];
  const maxTicks = opts.maxTicks ?? MATCH_TICKS + 30;

  let tickNoise: { at: Vec; kind: NoiseKind; radius: number; by: PlayerId }[] = [];

  const phase = () => state.phase as MatchPhase;
  while (phase() !== "COMPLETE" && state.tick < maxTicks) {
    const inputs: [Input, Input] = [EMPTY_INPUT, EMPTY_INPUT];
    for (let i = 0; i < 2; i++) {
      const me = i as PlayerId;
      inputs[me] = aiInput(state, me, mem[me], skill[me], {
        noises: tickNoise.filter((n) => n.by !== me),
        cameraSpot: state.cameras.find((c) => c.sees !== -1)?.sees ?? -1,
      });
    }
    tickNoise = [];
    step(state, inputs, {
      grid,
      onNoise: (n) => tickNoise.push(n),
    });
    opts.onTick?.(state);
  }

  if (phase() !== "COMPLETE") {
    // Hard stop: whoever holds the Core at the buzzer takes it.
    state.phase = "COMPLETE";
    state.winner = state.core.holder;
    state.endReason = state.core.holder === null ? "draw_time" : "time_expired_core";
  }

  return {
    winner: state.winner,
    endReason: state.endReason,
    ticks: state.tick,
    stats: state.players.map((p) => ({
      kills: p.kills,
      hacks: p.hacks,
      damage: Math.round(p.damageDealt),
      distance: Math.round(p.distance),
      coreHeldTicks: p.coreHeldTicks,
    })),
  };
}

/** Win rate of `a` against `b` over n matches, sides swapped each round. */
export function winRate(a: Difficulty, b: Difficulty, n: number): number {
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const swap = i % 2 === 1;
    const r = swap ? runHeadless({ a: b, b: a }) : runHeadless({ a, b });
    const id = swap ? 1 : 0;
    if (r.winner === id) wins += 1;
    else if (r.winner === null) wins += 0.5;
  }
  return wins / n;
}

export { other };
