"use client";

import { useSyncExternalStore } from "react";

/**
 * The sound preference, as an external store rather than component state.
 *
 * Two places care about it — the settings page and the in-game mute button — and
 * they must never disagree. localStorage is the store; React subscribes to it
 * with `useSyncExternalStore`, which also keeps the server-rendered default
 * (`on`) from mismatching the client value during hydration.
 */

const SOUND_KEY = "heist.sound";
const listeners = new Set<() => void>();

export const subscribeSound = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

const read = () => {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true; // storage blocked (private mode) — default to audible
  }
};

const server = () => true;

export function setSound(on: boolean) {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* storage blocked; the in-memory listeners still update */
  }
  for (const cb of listeners) cb();
}

export const useSoundPreference = () => useSyncExternalStore(subscribeSound, read, server);
