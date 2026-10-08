import { describe, expect, it } from "vitest";
import { buildGrid, createMatch, newGridBuffer, step } from "@/game/sim";
import { decodeInput, decodeSnapshot, encodeSnapshot, snapshotOf } from "@/game/protocol";
import { EMPTY_INPUT } from "@/game/types";

describe("wire protocol", () => {
  it("round-trips a real snapshot without losing the parts that matter", () => {
    const state = createMatch();
    const grid = newGridBuffer();
    buildGrid(state, grid);
    state.phase = "ACTIVE";
    state.countdown = 0;
    for (let i = 0; i < 240; i++) step(state, [EMPTY_INPUT, EMPTY_INPUT], { grid });

    const encoded = encodeSnapshot(snapshotOf(state));
    const decoded = decodeSnapshot(encoded);
    const original = snapshotOf(state);

    expect(decoded.tick).toBe(original.tick);
    expect(decoded.phase).toBe(original.phase);
    expect(decoded.clock).toBe(original.clock);
    expect(decoded.players[0].pos.x).toBeCloseTo(original.players[0].pos.x, 1);
    expect(decoded.players[1].pos.y).toBeCloseTo(original.players[1].pos.y, 1);
    expect(decoded.players.map((p) => p.hp)).toEqual(original.players.map((p) => p.hp));

    // The client's local player slot is what decides VICTORY vs DEFEAT, so a
    // mismatch here would show the wrong result screen.
    expect(decoded.players.length).toBe(2);
  });

  it("keeps the documented header layout", () => {
    const state = createMatch();
    state.phase = "ACTIVE";
    state.tick = 12345;
    const encoded = encodeSnapshot(snapshotOf(state));
    // [0] version, [1..4] tick, [5] phase, [6..7] clock — all big-endian, which
    // is DataView's default and therefore what both sides of the wire use.
    expect(encoded[0]).toBe(1);
    const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
    expect(view.getUint32(1)).toBe(state.tick);
    expect(view.getUint32(1, true)).not.toBe(state.tick); // guards against a silent endianness flip
  });

  it("sanitises input shapes a keyboard could never produce", () => {
    expect(decodeInput(null)).toBeNull();
    expect(decodeInput("nope")).toBeNull();
    // Junk is coerced to a safe default rather than trusted or rejected: a
    // hostile client must not be able to inject NaN or a truthy string.
    const junk = decodeInput({ moveX: "yes", aimX: Number.NaN, sprint: "yes", fire: 1 })!;
    expect(junk.moveX).toBe(0);
    expect(junk.aimX).toBe(1);
    expect(junk.sprint).toBe(false);
    expect(junk.fire).toBe(false);
    const ok = decodeInput({ seq: 1, moveX: 1, moveY: -1, aimX: 3, aimY: 4 });
    expect(ok).not.toBeNull();
    expect(ok!.moveX).toBe(1);
  });
});
