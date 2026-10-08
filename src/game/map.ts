/**
 * HEIST — Facility "KESTREL". One map. Thirty-five rooms and corridors of
 * compound geometry, authored as data so the renderer, the navigator and the
 * server all read the same truth.
 *
 *   #  solid            .  floor            D  vault door
 *   T  terminal         C  camera           X  extraction A      Y  extraction B
 *   p  spawn A          q  spawn B          *  Core pedestal
 */

import { TILE } from "./constants";
export { TILE };
import { GRID_H, GRID_W, TILE_DOOR, TILE_FLOOR, TILE_SOLID } from "./map-types";
import type { Vec } from "./types";

export { GRID_H, GRID_W, TILE_DOOR, TILE_FLOOR, TILE_SOLID };
export const WORLD_W = GRID_W * TILE;
export const WORLD_H = GRID_H * TILE;

type Cell = { x: number; y: number; w: number; h: number };

export interface Room {
  id: string;
  name: string;
  rect: Cell;
  kind: "room" | "corridor" | "void";
}

/** Walkable volumes, in tile cells. Order does not matter; overlap is fine. */
export const ROOMS: Room[] = [
  { id: "armory", name: "Armory", rect: { x: 4, y: 3, w: 11, h: 7 }, kind: "room" },
  { id: "security", name: "Security Room", rect: { x: 24, y: 3, w: 8, h: 7 }, kind: "room" },
  { id: "server", name: "Server Room", rect: { x: 41, y: 3, w: 11, h: 7 }, kind: "room" },
  { id: "westwing", name: "West Wing", rect: { x: 4, y: 16, w: 11, h: 9 }, kind: "room" },
  { id: "eastwing", name: "East Wing", rect: { x: 41, y: 16, w: 11, h: 9 }, kind: "room" },
  { id: "maintenance", name: "Maintenance", rect: { x: 22, y: 31, w: 12, h: 4 }, kind: "room" },
  { id: "extractB", name: "Extraction B", rect: { x: 4, y: 30, w: 13, h: 5 }, kind: "room" },
  { id: "extractA", name: "Extraction A", rect: { x: 39, y: 30, w: 13, h: 5 }, kind: "room" },
  { id: "ring", name: "Ring Corridor", rect: { x: 16, y: 11, w: 24, h: 19 }, kind: "corridor" },
  // The north spine that ties the three northern rooms into the ring. Without
  // it the Armory and Server Room are sealed islands and the vault terminal is
  // unreachable — the facility must connect, not merely look connected.
  { id: "north", name: "North Corridor", rect: { x: 4, y: 11, w: 48, h: 2 }, kind: "corridor" },
  // links from the ring into each outlying room
  { id: "l-armory", name: "North-West Link", rect: { x: 8, y: 9, w: 2, h: 3 }, kind: "corridor" },
  { id: "l-security", name: "Security Link", rect: { x: 27, y: 9, w: 2, h: 3 }, kind: "corridor" },
  { id: "l-server", name: "Server Link", rect: { x: 45, y: 9, w: 2, h: 3 }, kind: "corridor" },
  { id: "l-west", name: "West Wing Link", rect: { x: 14, y: 19, w: 3, h: 3 }, kind: "corridor" },
  { id: "l-east", name: "East Wing Link", rect: { x: 39, y: 19, w: 3, h: 3 }, kind: "corridor" },
  { id: "l-maint", name: "Maintenance Link", rect: { x: 27, y: 29, w: 2, h: 3 }, kind: "corridor" },
  { id: "l-xb", name: "Extraction B Link", rect: { x: 16, y: 30, w: 3, h: 3 }, kind: "corridor" },
  { id: "l-xa", name: "Extraction A Link", rect: { x: 36, y: 30, w: 4, h: 3 }, kind: "corridor" },
];

/** The vault: a sealed 1-tile shell punched out of the ring, one door on the west face. */
export const VAULT_SHELL: Cell = { x: 20, y: 14, w: 16, h: 14 };
export const VAULT_INTERIOR: Cell = { x: 21, y: 15, w: 14, h: 12 };

export const VAULT_DOORS: Cell[] = [
  { x: 20, y: 20, w: 1, h: 2 },
];

/** Blast doors. Open until lockdown, then sealed until EMP'd or forced. */
export const BLAST_DOORS: { id: string; rect: Cell }[] = [
  { id: "ring-nw", rect: { x: 17, y: 12, w: 2, h: 1 } },
  { id: "ring-ne", rect: { x: 37, y: 12, w: 2, h: 1 } },
  { id: "ring-sw", rect: { x: 17, y: 28, w: 2, h: 1 } },
  { id: "ring-se", rect: { x: 37, y: 28, w: 2, h: 1 } },
];

/**
 * Every door, in the exact order `createMatch()` builds them. Clients need the
 * geometry (a snapshot only carries the open flag), so this is the contract
 * between the wire format and the plan.
 */
export const DOOR_LAYOUT: { id: string; rect: Cell }[] = [
  ...VAULT_DOORS.map((rect, i) => ({ id: `vault-${i}`, rect })),
  ...BLAST_DOORS,
];

/** Cover. Solid blocks placed inside rooms so no sightline runs the whole map. */
export const PROPS: Cell[] = [
  { x: 7, y: 5, w: 2, h: 1 },
  { x: 11, y: 7, w: 1, h: 2 },
  { x: 25, y: 4, w: 2, h: 1 },
  { x: 29, y: 7, w: 2, h: 1 },
  { x: 43, y: 5, w: 1, h: 2 },
  { x: 49, y: 5, w: 1, h: 2 },
  { x: 46, y: 8, w: 2, h: 1 },
  { x: 6, y: 18, w: 1, h: 2 },
  { x: 12, y: 22, w: 1, h: 2 },
  { x: 44, y: 18, w: 1, h: 2 },
  { x: 49, y: 22, w: 1, h: 2 },
  { x: 24, y: 32, w: 2, h: 1 },
  { x: 30, y: 32, w: 2, h: 1 },
  { x: 44, y: 31, w: 1, h: 1 },
  { x: 47, y: 33, w: 1, h: 1 },
  { x: 49, y: 31, w: 1, h: 1 },
  { x: 7, y: 32, w: 1, h: 1 },
  { x: 12, y: 31, w: 1, h: 1 },
  { x: 22, y: 16, w: 1, h: 1 },
  { x: 33, y: 16, w: 1, h: 1 },
  { x: 22, y: 25, w: 1, h: 1 },
  { x: 33, y: 25, w: 1, h: 1 },
];

export const SPAWNS: [Vec, Vec] = [
  { x: 9.5 * TILE, y: 20.5 * TILE },
  { x: 46.5 * TILE, y: 20.5 * TILE },
];

/** Where a body reappears — the nearest owned corner, so respawns are never adjacent. */
export const RESPAWN: [Vec, Vec] = [
  { x: 6.5 * TILE, y: 22.5 * TILE },
  { x: 49.5 * TILE, y: 18.5 * TILE },
];

export const CORE_SPAWN: Vec = { x: 27.5 * TILE, y: 20.5 * TILE };

export const TERMINALS: { id: "cameras" | "vault"; pos: Vec; room: string }[] = [
  { id: "cameras", pos: { x: 27.5 * TILE, y: 5.5 * TILE }, room: "security" },
  { id: "vault", pos: { x: 46.5 * TILE, y: 5.5 * TILE }, room: "server" },
];

export const EXTRACTION: Record<"A" | "B", { rect: Cell; label: string; risk: string }> = {
  A: { rect: { x: 40, y: 31, w: 12, h: 4 }, label: "EXTRACTION A", risk: "FAST · EXPOSED" },
  B: { rect: { x: 5, y: 31, w: 11, h: 4 }, label: "EXTRACTION B", risk: "SLOW · COVERED" },
};

export const CAMERAS: { pos: Vec; facing: number; label: string }[] = [
  { pos: { x: 17.0 * TILE, y: 12.0 * TILE }, facing: Math.PI * 0.32, label: "CAM-01" },
  { pos: { x: 38.0 * TILE, y: 12.0 * TILE }, facing: Math.PI * 0.68, label: "CAM-02" },
  { pos: { x: 17.0 * TILE, y: 28.0 * TILE }, facing: -Math.PI * 0.3, label: "CAM-03" },
  { pos: { x: 38.0 * TILE, y: 28.0 * TILE }, facing: -Math.PI * 0.7, label: "CAM-04" },
  { pos: { x: 27.5 * TILE, y: 30.0 * TILE }, facing: -Math.PI / 2, label: "CAM-05" },
  { pos: { x: 9.5 * TILE, y: 11.5 * TILE }, facing: Math.PI / 2, label: "CAM-06" },
];

export const EXTRAS: { pos: Vec; kind: "health" | "stamina" }[] = [
  { pos: { x: 25.5 * TILE, y: 33.5 * TILE }, kind: "stamina" },
  { pos: { x: 32.5 * TILE, y: 33.5 * TILE }, kind: "health" },
  { pos: { x: 26.5 * TILE, y: 22.5 * TILE }, kind: "health" },
  { pos: { x: 45.5 * TILE, y: 20.5 * TILE }, kind: "stamina" },
  { pos: { x: 10.5 * TILE, y: 20.5 * TILE }, kind: "health" },
  { pos: { x: 27.5 * TILE, y: 8.5 * TILE }, kind: "stamina" },
];

/* ------------------------------------------------------------------ grid ---- */

const idx = (x: number, y: number) => y * GRID_W + x;

function fill(grid: Uint8Array, c: Cell, value: number) {
  for (let y = c.y; y < c.y + c.h; y++) {
    for (let x = c.x; x < c.x + c.w; x++) {
      if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
      grid[idx(x, y)] = value;
    }
  }
}

/** Static collision grid. Doors are dynamic and overlaid at runtime. */
export const GRID: Uint8Array = (() => {
  const g = new Uint8Array(GRID_W * GRID_H).fill(TILE_SOLID);
  for (const room of ROOMS) fill(g, room.rect, TILE_FLOOR);
  fill(g, VAULT_INTERIOR, TILE_FLOOR);
  // Everything inside the shell that is not interior becomes wall again.
  fill(g, VAULT_SHELL, TILE_SOLID);
  fill(g, VAULT_INTERIOR, TILE_FLOOR);
  for (const door of VAULT_DOORS) fill(g, door, TILE_DOOR);
  for (const prop of PROPS) fill(g, prop, TILE_SOLID);
  return g;
})();

export const tileAt = (x: number, y: number): number => {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return TILE_SOLID;
  return GRID[idx(x, y)]!;
};

export const tileAtWorld = (p: Vec): number => tileAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE));

/** Is this point inside a solid or a closed door? */
export function blocked(grid: Uint8Array, p: Vec): boolean {
  const tx = Math.floor(p.x / TILE);
  const ty = Math.floor(p.y / TILE);
  if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return true;
  return grid[idx(tx, ty)] === TILE_SOLID;
}

export function isWall(grid: Uint8Array, p: Vec): boolean {
  const tx = Math.floor(p.x / TILE);
  const ty = Math.floor(p.y / TILE);
  if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return true;
  return grid[idx(tx, ty)] === TILE_SOLID;
}

export const rectWorld = (c: Cell) => ({
  x: c.x * TILE,
  y: c.y * TILE,
  w: c.w * TILE,
  h: c.h * TILE,
});

export function inRect(p: Vec, c: Cell): boolean {
  return p.x >= c.x * TILE && p.x < (c.x + c.w) * TILE && p.y >= c.y * TILE && p.y < (c.y + c.h) * TILE;
}

/** Solid tiles that touch a floor tile — the ones that need a drawn wall face. */
export const WALL_FACES: Uint8Array = (() => {
  const out = new Uint8Array(GRID_W * GRID_H);
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (GRID[idx(x, y)] !== TILE_SOLID) continue;
      let touches = false;
      for (let dy = -1; dy <= 1 && !touches; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const t = tileAt(x + dx, y + dy);
          if (t === TILE_FLOOR || t === TILE_DOOR) { touches = true; break; }
        }
      }
      if (touches) out[idx(x, y)] = 1;
    }
  }
  return out;
})();

/** Rooms as world rects, for labels on the plan. */
export const ROOM_LABELS = ROOMS.filter((r) => r.kind === "room").map((r) => ({
  id: r.id,
  name: r.name,
  ...rectWorld(r.rect),
}));
