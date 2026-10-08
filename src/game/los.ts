/**
 * Line of sight, ray casting and the visibility polygon.
 *
 * The game's whole thesis is that *information is the mechanic*, so vision is
 * computed honestly: walls occlude, cones are cones, and nothing is revealed
 * because it would be convenient.
 */

import { TILE } from "./constants";
import { GRID_H, GRID_W, TILE_SOLID, type RectLike } from "./map-types";
import type { Vec } from "./types";

/** DDA over the tile grid. Returns the distance to the first solid cell. */
export function castRay(grid: Uint8Array, origin: Vec, angle: number, maxDist: number): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let tx = Math.floor(origin.x / TILE);
  let ty = Math.floor(origin.y / TILE);

  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;

  const tDeltaX = dx === 0 ? Infinity : Math.abs(TILE / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(TILE / dy);

  let tMaxX = dx === 0
    ? Infinity
    : ((dx > 0 ? (tx + 1) * TILE - origin.x : origin.x - tx * TILE) / Math.abs(dx));
  let tMaxY = dy === 0
    ? Infinity
    : ((dy > 0 ? (ty + 1) * TILE - origin.y : origin.y - ty * TILE) / Math.abs(dy));

  let dist = 0;
  // Bounded: max tiles crossed for the longest sightline on this map.
  for (let i = 0; i < 300; i++) {
    if (tMaxX < tMaxY) {
      dist = tMaxX;
      tMaxX += tDeltaX;
      tx += stepX;
    } else {
      dist = tMaxY;
      tMaxY += tDeltaY;
      ty += stepY;
    }
    if (dist > maxDist) return maxDist;
    if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return Math.min(dist, maxDist);
    if (grid[ty * GRID_W + tx] === TILE_SOLID) return dist;
  }
  return maxDist;
}

export function hasLineOfSight(grid: Uint8Array, a: Vec, b: Vec, maxDist = Infinity): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return true;
  if (len > maxDist) return false;
  return castRay(grid, a, Math.atan2(dy, dx), len) >= len - 0.5;
}

/** Fan of rays → the outline of what a player can see. Used by canvas + AI. */
export function visibilityPolygon(
  grid: Uint8Array,
  origin: Vec,
  radius: number,
  opts: { center?: number; half?: number; rays?: number } = {},
): Vec[] {
  const rays = opts.rays ?? 150;
  const half = opts.half ?? Math.PI;
  const center = opts.center ?? 0;
  const pts: Vec[] = [{ x: origin.x, y: origin.y }];
  for (let i = 0; i <= rays; i++) {
    const a = center - half + (2 * half * i) / rays;
    const d = castRay(grid, origin, a, radius);
    pts.push({ x: origin.x + Math.cos(a) * d, y: origin.y + Math.sin(a) * d });
  }
  return pts;
}

/** Point-in-cone test for cameras, with a 3-ray occlusion check for corners. */
export function inCone(
  grid: Uint8Array,
  from: Vec,
  facing: number,
  fov: number,
  range: number,
  target: Vec,
): boolean {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist > range) return false;
  let delta = Math.atan2(dy, dx) - facing;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  if (Math.abs(delta) > fov / 2) return false;
  if (dist < 1) return true;
  // Cheap and honest: if the centre ray is blocked, try the two edges of the
  // target's silhouette before declaring it hidden.
  const a = Math.atan2(dy, dx);
  const off = Math.atan2(12, dist);
  return (
    castRay(grid, from, a, dist) >= dist - 1 ||
    castRay(grid, from, a - off, dist) >= dist - 1 ||
    castRay(grid, from, a + off, dist) >= dist - 1
  );
}

/** The vision cone a player carries, as a polygon (origin + arc). */
export function visionCone(
  grid: Uint8Array,
  origin: Vec,
  facing: number,
  fov: number,
  range: number,
  rays = 90,
): Vec[] {
  const pts: Vec[] = [{ x: origin.x, y: origin.y }];
  for (let i = 0; i <= rays; i++) {
    const a = facing - fov / 2 + (fov * i) / rays;
    const d = castRay(grid, origin, a, range);
    pts.push({ x: origin.x + Math.cos(a) * d, y: origin.y + Math.sin(a) * d });
  }
  return pts;
}

export type { RectLike };
