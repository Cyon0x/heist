"use client";

/**
 * HEIST — input. Keyboard + mouse on desktop, twin virtual sticks on touch.
 * This module produces nothing but a legal `Input`; it can never move a player.
 */

import { EMPTY_INPUT, type Input, type Vec } from "@/game/types";

export interface InputController {
  read(): Input;
  plan(): boolean;
  cursor(): Vec | null;
  dispose(): void;
}

const KEY_MAP: Record<string, string> = {
  KeyW: "up", ArrowUp: "up",
  KeyS: "down", ArrowDown: "down",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
};

export function createInputController(canvas: HTMLCanvasElement): InputController {
  const held = new Set<string>();
  let pointer: Vec | null = null;
  let firing = false;
  let planHeld = false;
  let meleeEdge = false;
  let dashEdge = false;
  let empEdge = false;
  let scanEdge = false;

  // ---- touch state
  const touches = new Map<number, { x: number; y: number; originX: number; originY: number; side: "left" | "right" }>();
  let touchFire = false;
  const buttons = { dash: false, emp: false, scan: false, interact: false };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const mapped = KEY_MAP[e.code];
    if (mapped) { held.add(mapped); e.preventDefault(); }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") held.add("sprint");
    if (e.code === "Space") { held.add("sprint"); dashEdge = true; e.preventDefault(); }
    if (e.code === "KeyQ") empEdge = true;
    if (e.code === "KeyR") scanEdge = true;
    if (e.code === "KeyF" || e.code === "KeyE") held.add("interact");
    if (e.code === "KeyV") meleeEdge = true;
    if (e.code === "Tab") { planHeld = true; e.preventDefault(); }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const mapped = KEY_MAP[e.code];
    if (mapped) held.delete(mapped);
    if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.code === "Space") held.delete("sprint");
    if (e.code === "KeyF" || e.code === "KeyE") held.delete("interact");
    if (e.code === "Tab") planHeld = false;
  };
  const onBlur = () => { held.clear(); firing = false; planHeld = false; };

  const onMouseMove = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) firing = true;
    if (e.button === 2) { meleeEdge = true; e.preventDefault(); }
  };
  const onMouseUp = (e: MouseEvent) => { if (e.button === 0) firing = false; };
  const onContext = (e: Event) => e.preventDefault();

  const onTouchStart = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      const r = canvas.getBoundingClientRect();
      const x = t.clientX - r.left;
      const y = t.clientY - r.top;
      const side: "left" | "right" = x < r.width / 2 ? "left" : "right";
      if (side === "right" && y > r.height - 120) continue; // virtual buttons live there
      touches.set(t.identifier, { x, y, originX: x, originY: y, side });
    }
    e.preventDefault();
  };
  const onTouchMove = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      const rec = touches.get(t.identifier);
      if (!rec) continue;
      const r = canvas.getBoundingClientRect();
      rec.x = t.clientX - r.left;
      rec.y = t.clientY - r.top;
    }
    e.preventDefault();
  };
  const onTouchEnd = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) touches.delete(t.identifier);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("contextmenu", onContext);
  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd);
  canvas.addEventListener("touchcancel", onTouchEnd);

  const read = (): Input => {
    let moveX = 0;
    let moveY = 0;
    if (held.has("left")) moveX -= 1;
    if (held.has("right")) moveX += 1;
    if (held.has("up")) moveY -= 1;
    if (held.has("down")) moveY += 1;

    // Touch sticks override the keyboard when present.
    for (const t of touches.values()) {
      const dx = (t.x - t.originX) / 46;
      const dy = (t.y - t.originY) / 46;
      const len = Math.hypot(dx, dy);
      if (len < 0.14) continue;
      const nx = dx / Math.max(1, len);
      const ny = dy / Math.max(1, len);
      const mag = Math.min(1, len);
      if (t.side === "left") { moveX = nx * mag; moveY = ny * mag; }
    }
    const hasTouch = touches.size > 0;

    const input: Input = {
      ...EMPTY_INPUT,
      moveX,
      moveY,
      sprint: held.has("sprint") || (hasTouch && Math.hypot(moveX, moveY) > 0.86),
      dash: dashEdge || buttons.dash,
      fire: firing || touchFire || !!Array.from(touches.values()).find((t) => t.side === "right"),
      melee: meleeEdge,
      emp: empEdge || buttons.emp,
      scanner: scanEdge || buttons.scan,
      interact: held.has("interact") || buttons.interact,
      aimX: 1,
      aimY: 0,
    };
    dashEdge = false;
    meleeEdge = false;
    empEdge = false;
    scanEdge = false;
    buttons.dash = false;
    buttons.emp = false;
    buttons.scan = false;
    return input;
  };

  return {
    read,
    plan: () => planHeld,
    cursor: () => pointer,
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("contextmenu", onContext);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
    },
  };
}

/** Screen point → world point, given the same camera transform the renderer uses. */
export function screenToWorld(
  pt: Vec,
  cam: { x: number; y: number; zoom: number },
  vw: number,
  vh: number,
): Vec {
  return {
    x: (pt.x - vw / 2) / cam.zoom + cam.x,
    y: (pt.y - vh / 2) / cam.zoom + cam.y,
  };
}
