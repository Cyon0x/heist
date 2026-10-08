/**
 * HEIST — canvas renderer.
 *
 * Two pre-rendered layers of the same facility plan (a dim "remembered" pass and
 * a lit pass) are composited through the player's visibility polygon, so fog of
 * war is a geometric fact rather than a tinted rectangle. Entities are drawn
 * only when a real line-of-sight test passes.
 */

import { TILE } from "@/game/constants";
import { hasLineOfSight, visionCone } from "@/game/los";
import {
  EXTRACTION, GRID, GRID_H, GRID_W, ROOM_LABELS, WALL_FACES, WORLD_H, WORLD_W, rectWorld,
} from "@/game/map";
import { buildGrid } from "@/game/sim";
import type { GameState, PlayerId, Vec } from "@/game/types";
import { C } from "./palette";

export interface Ping {
  pos: Vec;
  kind: string;
  born: number;
  radius: number;
}

export interface ViewModel {
  state: GameState;
  me: PlayerId;
  /** Opponent noises this player has heard, newest last. */
  pings: Ping[];
  scan: { pos: Vec; born: number } | null;
}

const FOV = (76 * Math.PI) / 180;
const VISION_RANGE = 620;

function makeLayer(paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = WORLD_W;
  canvas.height = WORLD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  paint(ctx);
  return canvas;
}

function paintPlan(ctx: CanvasRenderingContext2D, lit: boolean) {
  ctx.fillStyle = lit ? C.void : C.voidHatch;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  ctx.strokeStyle = lit ? "rgba(20,30,42,0.85)" : "rgba(16,24,34,0.7)";
  ctx.lineWidth = 1;
  for (let i = -WORLD_H; i < WORLD_W; i += 9) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + WORLD_H, WORLD_H);
    ctx.stroke();
  }

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (GRID[y * GRID_W + x] !== 1) continue;
      ctx.fillStyle = lit ? C.floor : C.floorDim;
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
  }

  ctx.globalAlpha = lit ? 0.55 : 0.34;
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= GRID_W; x++) {
    ctx.beginPath();
    ctx.moveTo(x * TILE + 0.5, 0);
    ctx.lineTo(x * TILE + 0.5, WORLD_H);
    ctx.stroke();
  }
  for (let y = 0; y <= GRID_H; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * TILE + 0.5);
    ctx.lineTo(WORLD_W, y * TILE + 0.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (!WALL_FACES[y * GRID_W + x]) continue;
      ctx.fillStyle = lit ? C.wall : C.wallDim;
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      const openBelow = y + 1 < GRID_H && GRID[(y + 1) * GRID_W + x] === 1;
      if (openBelow) {
        ctx.fillStyle = lit ? C.wallTop : C.wallTopDim;
        ctx.fillRect(x * TILE, (y + 1) * TILE - 5, TILE, 5);
        ctx.fillStyle = lit ? C.wallEdge : C.wallEdgeDim;
        ctx.fillRect(x * TILE, (y + 1) * TILE - 1, TILE, 1);
      }
    }
  }

  ctx.textAlign = "center";
  ctx.font = "600 17px 'IBM Plex Mono', monospace";
  for (const room of ROOM_LABELS) {
    ctx.globalAlpha = lit ? 0.9 : 0.62;
    ctx.strokeStyle = C.roomEdge;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(room.x + 3, room.y + 3, room.w - 6, room.h - 6);
    ctx.fillStyle = lit ? C.label : "#5d7288";
    ctx.fillText(room.name.toUpperCase(), room.x + room.w / 2, room.y + 27);
    ctx.globalAlpha = 1;
  }

  for (const key of ["A", "B"] as const) {
    const r = rectWorld(EXTRACTION[key].rect);
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.strokeStyle = lit ? "rgba(111,216,232,0.32)" : "rgba(111,216,232,0.13)";
    ctx.lineWidth = 3;
    for (let i = -r.h; i < r.w; i += 18) {
      ctx.beginPath();
      ctx.moveTo(r.x + i, r.y);
      ctx.lineTo(r.x + i + r.h, r.y + r.h);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = lit ? 1 : 0.5;
    ctx.strokeStyle = C.cyanDim;
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    ctx.fillStyle = C.cyan;
    ctx.font = "600 16px 'IBM Plex Mono', monospace";
    ctx.fillText(EXTRACTION[key].label, r.x + r.w / 2, r.y + r.h / 2 + 3);
    ctx.font = "500 12px 'IBM Plex Mono', monospace";
    ctx.fillStyle = C.cyanDim;
    ctx.fillText(EXTRACTION[key].risk, r.x + r.w / 2, r.y + r.h / 2 + 22);
    ctx.globalAlpha = 1;
  }
}

let staticDim: HTMLCanvasElement | null = null;
let staticLit: HTMLCanvasElement | null = null;
function layers() {
  if (!staticDim) staticDim = makeLayer((ctx) => paintPlan(ctx, false));
  if (!staticLit) staticLit = makeLayer((ctx) => paintPlan(ctx, true));
  return { dim: staticDim, lit: staticLit };
}

const scratch = new Uint8Array(GRID_W * GRID_H);

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export function cameraFor(state: GameState, me: PlayerId, vw: number, vh: number): Camera {
  const p = state.players[me].pos;
  const zoom = Math.max(0.4, Math.min(1.35, Math.min(vw / 1180, vh / 780)));
  const halfW = vw / 2 / zoom;
  const halfH = vh / 2 / zoom;
  return {
    x: halfW * 2 > WORLD_W ? WORLD_W / 2 : Math.max(halfW, Math.min(WORLD_W - halfW, p.x)),
    y: halfH * 2 > WORLD_H ? WORLD_H / 2 : Math.max(halfH, Math.min(WORLD_H - halfH, p.y)),
    zoom,
  };
}

export function draw(
  ctx: CanvasRenderingContext2D,
  vm: ViewModel,
  cam: Camera,
  vw: number,
  vh: number,
  now: number,
) {
  const { state, me } = vm;
  const self = state.players[me];
  const foe = state.players[me === 0 ? 1 : 0];
  const grid = buildGrid(state, scratch);
  const { dim, lit } = layers();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, vw, vh);

  ctx.save();
  ctx.translate(vw / 2, vh / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  if (dim) ctx.drawImage(dim, 0, 0);

  const cone = visionCone(grid, self.pos, self.aim, FOV, VISION_RANGE, 110);
  const near = visionCone(grid, self.pos, self.aim, Math.PI * 0.98, 210, 40);
  const litPath = new Path2D();
  litPath.moveTo(near[0]!.x, near[0]!.y);
  for (const pt of near.slice(1)) litPath.lineTo(pt.x, pt.y);
  const conePath = new Path2D();
  conePath.moveTo(cone[0]!.x, cone[0]!.y);
  for (const pt of cone.slice(1)) conePath.lineTo(pt.x, pt.y);
  litPath.addPath(conePath);

  ctx.save();
  ctx.clip(litPath);
  if (lit) ctx.drawImage(lit, 0, 0);
  const grad = ctx.createRadialGradient(self.pos.x, self.pos.y, 40, self.pos.x, self.pos.y, VISION_RANGE);
  grad.addColorStop(0, C.amberSoft);
  grad.addColorStop(1, "rgba(255,162,39,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.restore();

  ctx.save();
  ctx.clip(litPath);

  for (const door of state.doors) {
    const r = rectWorld(door.rect);
    const sealed = !door.open && door.disabled <= 0;
    if (!sealed) {
      ctx.strokeStyle = "rgba(255,162,39,0.3)";
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = C.amber;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.globalAlpha = 1;
      for (let i = 0; i < r.h; i += 12) {
        ctx.globalAlpha = 0.35;
        ctx.fillRect(r.x - 4, r.y + i, r.w + 8, 2);
      }
      ctx.globalAlpha = 1;
    }
  }

  for (const t of state.terminals) {
    ctx.strokeStyle = t.done ? C.cyanDim : C.cyan;
    ctx.lineWidth = 2;
    ctx.globalAlpha = t.done ? 0.5 : 1;
    ctx.strokeRect(t.pos.x - 11, t.pos.y - 13, 22, 26);
    ctx.fillStyle = t.done ? C.cyanDim : C.cyan;
    ctx.fillRect(t.pos.x - 7, t.pos.y - 9, 14, 8);
    ctx.globalAlpha = 1;
    if (!t.done) {
      ctx.fillStyle = C.cyan;
      ctx.font = "600 11px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(t.id === "cameras" ? "CAM CTRL" : "VAULT CTRL", t.pos.x, t.pos.y - 20);
    }
  }

  for (const e of state.extras) {
    if (e.taken) continue;
    ctx.strokeStyle = e.kind === "health" ? C.red : C.cyan;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(e.pos.x, e.pos.y - 9);
    ctx.lineTo(e.pos.x + 9, e.pos.y);
    ctx.lineTo(e.pos.x, e.pos.y + 9);
    ctx.lineTo(e.pos.x - 9, e.pos.y);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  for (const cam of state.cameras) {
    if (!hasLineOfSight(grid, self.pos, cam.pos, 1500)) continue;
    const live = cam.disabled <= 0;
    const col = live ? (cam.alert > 0 ? C.red : C.cyan) : "#3a4552";
    ctx.save();
    ctx.translate(cam.pos.x, cam.pos.y);
    ctx.rotate(cam.facing);
    if (live) {
      const g = ctx.createLinearGradient(0, 0, 320, 0);
      g.addColorStop(0, cam.alert > 0 ? "rgba(255,77,94,0.18)" : "rgba(111,216,232,0.15)");
      g.addColorStop(1, "rgba(111,216,232,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 320, -0.62, 0.62);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(cam.pos.x, cam.pos.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = cam.alert > 0 ? 1 : 0.45;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cam.pos.x, cam.pos.y, 10 + (cam.alert > 0 ? Math.sin(now / 90) * 3 : 0), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (state.core.holder === null) {
    drawCore(ctx, state.core.pos, 1 + Math.sin(now / 320) * 0.12, state.core.lock <= 0);
  }

  ctx.strokeStyle = C.amber;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  for (const b of state.bullets) {
    const len = Math.hypot(b.vel.x, b.vel.y) || 1;
    ctx.beginPath();
    ctx.moveTo(b.pos.x, b.pos.y);
    ctx.lineTo(b.pos.x - (b.vel.x / len) * 14, b.pos.y - (b.vel.y / len) * 14);
    ctx.stroke();
  }

  for (const ping of vm.pings) {
    const age = (now - ping.born) / 1000;
    if (age > 3.4) continue;
    const t = Math.min(1, age / 3.4);
    ctx.globalAlpha = (1 - t) * 0.7;
    ctx.strokeStyle = ping.kind === "fire" || ping.kind === "emp" ? C.red : C.cyan;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.arc(ping.pos.x, ping.pos.y, 16 + t * (ping.radius * 0.5), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  if (vm.scan) {
    const age = (now - vm.scan.born) / 1000;
    if (age < 2.6) {
      ctx.globalAlpha = (1 - age / 2.6) * 0.9;
      ctx.strokeStyle = C.red;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(vm.scan.pos.x, vm.scan.pos.y, 14, 0, Math.PI * 2);
      ctx.moveTo(vm.scan.pos.x - 18, vm.scan.pos.y);
      ctx.lineTo(vm.scan.pos.x + 18, vm.scan.pos.y);
      ctx.moveTo(vm.scan.pos.x, vm.scan.pos.y - 18);
      ctx.lineTo(vm.scan.pos.x, vm.scan.pos.y + 18);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  if (foe.alive && hasLineOfSight(grid, self.pos, foe.pos, VISION_RANGE + 60)) {
    drawPlayer(ctx, foe.pos, foe.aim, C.cyan, foe.hp / 130, foe.carrying, foe.protect > 0, now, false);
  }
  ctx.restore();

  const fog = new Path2D();
  fog.rect(0, 0, WORLD_W, WORLD_H);
  fog.addPath(litPath);
  ctx.fillStyle = "rgba(6,9,13,0.62)";
  ctx.fill(fog, "evenodd");

  drawPlayer(ctx, self.pos, self.aim, C.amber, self.hp / 130, self.carrying, self.protect > 0, now, true);

  if (self.scanTicks > 0) {
    const k = 1 - self.scanTicks / 78;
    ctx.globalAlpha = 0.5 * (1 - k);
    ctx.strokeStyle = C.cyan;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(self.pos.x, self.pos.y, 60 + k * 520, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawCore(ctx: CanvasRenderingContext2D, pos: Vec, scale: number, armed: boolean) {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(Math.PI / 8);
  ctx.scale(scale, scale);
  ctx.strokeStyle = armed ? C.amber : C.amberDim;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.cos(a) * 13;
    const y = Math.sin(a) * 13;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = armed ? "rgba(255,162,39,0.5)" : "rgba(255,162,39,0.18)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fillStyle = armed ? C.amber : C.amberDim;
  ctx.fill();
  ctx.restore();
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  pos: Vec,
  aim: number,
  colour: string,
  hp: number,
  carrying: boolean,
  protect: boolean,
  now: number,
  isSelf: boolean,
) {
  ctx.save();
  ctx.translate(pos.x, pos.y);

  if (protect) {
    ctx.strokeStyle = "rgba(232,237,245,0.45)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, 23, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (carrying) {
    ctx.globalAlpha = 0.6 + Math.sin(now / 220) * 0.2;
    ctx.strokeStyle = C.amber;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 19, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.save();
  ctx.rotate(aim);
  const g = ctx.createLinearGradient(0, 0, 34, 0);
  g.addColorStop(0, colour);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(30, -7);
  ctx.lineTo(30, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;

  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(8,11,16,0.85)";
  ctx.beginPath();
  ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 17, -Math.PI / 2, Math.PI * 1.5);
  ctx.stroke();
  ctx.strokeStyle = hp > 0.45 ? colour : C.red;
  ctx.beginPath();
  ctx.arc(0, 0, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, hp)));
  ctx.stroke();

  if (isSelf) {
    ctx.strokeStyle = "rgba(232,237,245,0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
