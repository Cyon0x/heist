/** Types and constants shared by map.ts and los.ts without a cycle. */
export const GRID_W = 56;
export const GRID_H = 36;
export const TILE_SOLID = 0;
export const TILE_FLOOR = 1;
export const TILE_DOOR = 2;
export type RectLike = { x: number; y: number; w: number; h: number };
