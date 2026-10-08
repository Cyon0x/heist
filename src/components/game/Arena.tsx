"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { TICK_HZ } from "@/game/constants";
import { EXTRACTION } from "@/game/map";
import { stateFromSnapshot, type Snapshot } from "@/game/protocol";
import { RoomClient, SoloMatch, type Authority, WebSocketTransport } from "@/game/room";
import type { Difficulty } from "@/game/ai";
import { HeistAudio, type StepKind } from "@/game/audio";
import { EMPTY_INPUT, type GameState, type PlayerId } from "@/game/types";
import { VaultAperture } from "@/components/ui/VaultAperture";
import { cameraFor, draw, type Ping } from "./render";
import { createInputController, screenToWorld } from "./input";
import { setSound, useSoundPreference } from "@/lib/hooks/use-sound";

export interface ArenaProps {
  mode: "ai" | "room";
  roomId?: string;
  difficulty?: Difficulty;
  playerName: string;
  opponentName?: string | null;
  stakeUsdc?: number;
  /** Authoritative socket details minted by the app for this participant. */
  serverLink?: { url: string; ticket?: string } | null;
  onExit: () => void;
  onResult?: (r: { winner: PlayerId | null; reason: string }) => void;
}

interface Hud {
  phase: string;
  clock: number;
  countdown: number;
  hp: number;
  stamina: number;
  lives: number;
  carrying: boolean;
  hacking: number;
  hackNeed: number;
  hackLabel: string;
  grabbing: number;
  extracting: number;
  extractNeed: number;
  extractZone: "A" | "B" | null;
  coreHolder: PlayerId | null;
  lockdown: boolean;
  securityDisabled: boolean;
  feed: { text: string; player: number }[];
  winner: PlayerId | null;
  /** Which slot this client is actually playing, per the authority. */
  me: PlayerId;
  reason: string | null;
  dash: number;
  emp: number;
  scan: number;
  alive: boolean;
  respawn: boolean;
}

const NEED = { cameras: 105, vault: 150, door: 60 };

/**
 * Everything audio needs to know about a frame. Kept separate from `Hud` so the
 * sound layer never has to reason about rendering, and so it is obvious which
 * state transitions are considered audible.
 */
interface AudioCues {
  phase: string;
  dash: number;
  emp: number;
  scan: number;
  melee: number;
  hacking: number;
  extracting: number;
  lockdown: boolean;
  feed: { kind: string }[];
}

/**
 * Fire the one-shot sounds for whatever changed since the last sample, and
 * return the new sample. Ability use is detected by a cooldown jumping up
 * (cooldowns count down, and are reset to their maximum on use); world events
 * are detected by new entries in the sim's own feed, so the sound can never
 * disagree with what the HUD is telling the player.
 */
function soundFor(audio: HeistAudio, prev: AudioCues | null, next: AudioCues): AudioCues {
  if (!prev) return next;

  if (next.dash > prev.dash) audio.dash();
  if (next.emp > prev.emp) audio.emp();
  if (next.scan > prev.scan) audio.scanner();
  if (next.melee > prev.melee) audio.melee();

  // Hacking is a held action, so it ticks rather than stings.
  if (next.hacking > 0 && Math.floor(next.hacking / 8) !== Math.floor(prev.hacking / 8)) audio.hackTick();

  // Extraction beeps once per second of the countdown, faster near the end.
  if (next.extracting > 0) {
    const before = Math.ceil(prev.extracting / TICK_HZ);
    const after = Math.ceil(next.extracting / TICK_HZ);
    if (after !== before) audio.extractTick(after);
  }

  if (next.lockdown && !prev.lockdown) audio.lockdown();
  if (next.phase === "COMPLETE" && prev.phase !== "COMPLETE") return next;

  const before = new Set(prev.feed.map((f) => f.kind));
  for (const item of next.feed) {
    if (before.has(item.kind)) continue;
    if (item.kind === "core-taken" || item.kind === "core-drop") audio.coreTaken();
    else if (item.kind === "breach" || item.kind === "alert" || item.kind === "eliminated") audio.alarm();
    else if (item.kind === "lockdown") audio.lockdown();
  }
  return next;
}

export function Arena(props: ArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  // Purely derived from props: nothing about "who owns the simulation" changes
  // after mount, so it does not need to be state.
  const authority: Authority =
    props.mode === "ai" ? "SOLO" : props.serverLink?.url ? "SERVER" : "LOCAL";
  const [notice, setNotice] = useState<string | null>(() =>
    props.mode === "room" ? "WAITING FOR OPPONENT" : null,
  );
  const soundOn = useSoundPreference();
  const muted = !soundOn;
  const [showPlan, setShowPlan] = useState(false);

  /** Latest authoritative state, published out of the render loop for the plan overlay. */
  const [planState, setPlanState] = useState<GameState | null>(null);
  const pingsRef = useRef<Ping[]>([]);
  const scanRef = useRef<{ pos: { x: number; y: number }; born: number } | null>(null);
  const planRef = useRef(false);
  const reportedRef = useRef(false);
  const audioRef = useRef<HeistAudio | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const controller = createInputController(canvas);
    // Synthesised audio (see src/game/audio.ts). Browsers refuse to start an
    // AudioContext before a gesture, so it is created lazily and resumed on the
    // first key or click — which is also the first moment a player is listening.
    const audio = new HeistAudio();
    audioRef.current = audio;
    audio.setMuted(!soundOn);
    const wake = () => {
      audio.resume();
      audio.startAmbience();
    };
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);

    let disposed = false;
    const seenBullets = new Set<number>();
    let prevSelfPos = { x: 0, y: 0 };
    let prevCues: AudioCues | null = null;
    let me: PlayerId = 0;
    let room: RoomClient | null = null;
    let solo: SoloMatch | null = null;
    let prevBullets = new Map<number, { x: number; y: number }>();
    let lastTs = performance.now();
    let raf = 0;

    if (props.mode === "ai") {
      solo = new SoloMatch(props.difficulty ?? "veteran");
      solo.onNoise = (n) => {
        if (n.by === me) return;
        pingsRef.current.push({ pos: { ...n.at }, kind: n.kind, born: performance.now(), radius: n.radius });
        if (pingsRef.current.length > 24) pingsRef.current.shift();
      };
    } else {
      // The app decides which transport this participant gets; a browser that
      // has not been issued a ticket cannot reach an authoritative server.
      const link = props.serverLink;
      const transport = link?.url
        ? new WebSocketTransport(link.url, props.roomId ?? "arena", link.ticket)
        : undefined;
      room = new RoomClient(props.roomId ?? "arena", props.playerName, transport);
      room.events.onReady = (player, opponent) => {
        me = player;
        if (opponent) setNotice(`OPPONENT CONNECTED — ${opponent}`);
      };
      room.events.onOpponentLeft = () => setNotice("OPPONENT LEFT");
    }

    const ensureSize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    };
    let { w: vw, h: vh } = ensureSize();
    const onResize = () => { const s = ensureSize(); vw = s.w; vh = s.h; };
    window.addEventListener("resize", onResize);

    let hudAccum = 0;

    const frame = (ts: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(64, ts - lastTs);
      lastTs = ts;

      const raw = controller.read();
      const plan = controller.plan();
      if (plan !== planRef.current) { planRef.current = plan; setShowPlan(plan); }

      let state: GameState | null = null;
      let liveBullets: readonly { id: number; owner: number }[] = [];

      if (solo) {
        const self = solo.state.players[me];
        const cursor = controller.cursor();
        const cam = cameraFor(solo.state, me, vw, vh);
        const aim = cursor ? screenToWorld(cursor, cam, vw, vh) : null;
        const input = { ...raw, aimX: aim ? aim.x - self.pos.x : Math.cos(self.aim), aimY: aim ? aim.y - self.pos.y : Math.sin(self.aim) };
        solo.setInput(input);
        solo.advance(dt);
        state = solo.state;
        liveBullets = solo.state.bullets;
      } else if (room) {
        const view = room.view();
        if (view) {
          const selfSnap = view.players[me];
          const cursor = controller.cursor();
          const cam = cameraFor(_state(view, me, 0, prevBullets), me, vw, vh);
          const aim = cursor ? screenToWorld(cursor, cam, vw, vh) : null;
          room.setInput({
            ...EMPTY_INPUT, ...raw,
            aimX: aim ? aim.x - selfSnap.pos.x : 1,
            aimY: aim ? aim.y - selfSnap.pos.y : 0,
          });
          state = _state(view, me, 0, prevBullets);
          liveBullets = view.bullets;
          const next = new Map<number, { x: number; y: number }>();
          for (const b of view.bullets) next.set(b.id, { x: b.x, y: b.y });
          prevBullets = next;
        } else {
          room.setInput(raw);
        }
      }

      if (state) {
        // Local scan pulse, purely presentational.
        const self = state.players[me];
        if (self.scanTicks > 0 && room) scanRef.current = { pos: { ...self.pos }, born: performance.now() };

        // New bullets since the last frame are gunshots. Owner decides whether
        // it is your own weapon (close, loud) or the opponent's (a distant crack
        // — which is itself information, which is the point of the mechanic).
        for (const b of liveBullets) {
          if (seenBullets.has(b.id)) continue;
          seenBullets.add(b.id);
          audio.shot(b.owner === me);
        }
        if (seenBullets.size > 512) seenBullets.clear();

        const speed = Math.hypot(self.pos.x - prevSelfPos.x, self.pos.y - prevSelfPos.y);
        prevSelfPos = { x: self.pos.x, y: self.pos.y };
        audio.step((self.mode ?? "walk") as StepKind, speed > 0.35);

        const cam = cameraFor(state, me, vw, vh);
        draw(ctx, { state, me, pings: pingsRef.current, scan: scanRef.current }, cam, vw, vh, ts);

        hudAccum += dt;
        if (hudAccum > 90) {
          hudAccum = 0;
          const foe = state.players[me === 0 ? 1 : 0];
          setHud({
            phase: state.phase,
            clock: state.clock,
            countdown: state.countdown,
            hp: self.hp,
            stamina: self.stamina,
            lives: self.lives,
            carrying: self.carrying,
            hacking: self.hacking,
            hackNeed: NEED[(self.hackTarget ?? "door") as keyof typeof NEED] ?? 1,
            hackLabel: self.hackTarget === "cameras" ? "DISABLING CAMERA NETWORK" : self.hackTarget === "vault" ? "BYPASSING VAULT SECURITY" : self.hackTarget === "door" ? "FORCING BLAST DOOR" : "",
            grabbing: self.grabbing,
            extracting: self.extracting,
            extractNeed: self.extractZone === "A" ? 120 : 210,
            extractZone: self.extractZone,
            coreHolder: state.core.holder,
            lockdown: state.lockdown,
            securityDisabled: state.securityDisabled,
            feed: state.feed.slice(-5).reverse().map((f) => ({ text: f.text, player: f.player })),
            winner: state.winner,
            me,
            reason: state.endReason,
            dash: self.cooldowns.dash,
            emp: self.cooldowns.emp,
            scan: self.cooldowns.scanner,
            alive: self.alive,
            respawn: !self.alive && self.lives > 0,
          });
          prevCues = soundFor(audio, prevCues, {
            phase: state.phase,
            dash: self.cooldowns.dash,
            emp: self.cooldowns.emp,
            scan: self.cooldowns.scanner,
            melee: self.cooldowns.melee,
            hacking: self.hacking,
            extracting: self.extracting,
            lockdown: state.lockdown,
            feed: state.feed.slice(-5),
          });
          // Publishing the plan snapshot here (a timer callback, not render)
          // keeps `FacilityPlan` free of any ref read during render.
          setPlanState(planRef.current ? state : null);
          void foe;
      if (state.phase === "COMPLETE" && !reportedRef.current) {
            reportedRef.current = true;
            if (state.winner !== null) audio.sting(state.winner === me);
            props.onResult?.({ winner: state.winner, reason: state.endReason ?? "unknown" });
          }
        }
      }
      void plan;
    };
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      controller.dispose();
      audio.dispose();
      audioRef.current = null;
      room?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode, props.roomId, props.difficulty, props.playerName]);

  const seconds = hud ? Math.max(0, Math.ceil(hud.clock / TICK_HZ)) : 0;
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  // Victory is a fact about *this* player's slot, not about slot zero. In a
  // server-authoritative room the local player is whichever slot the authority
  // handed out, so the check has to come from the HUD's own `me`.
  const won = hud !== null && hud.winner !== null && hud.winner === hud.me;
  const done = hud?.phase === "COMPLETE";

  const authorityLabel = useMemo(() => {
    const base =
      authority === "SERVER"
        ? "SERVER AUTHORITY"
        : authority === "LOCAL"
          ? "LOCAL AUTHORITY · SAME MACHINE"
          : "PRACTICE";
    return props.stakeUsdc ? `${base} · $${props.stakeUsdc}` : base;
  }, [authority, props.stakeUsdc]);

  // One place that owns the mute decision, so the in-game button, the M key and
  // the settings page always mean the same thing.
  const toggleMute = useCallback(() => {
    const next = !soundOn;
    setSound(next);
    audioRef.current?.setMuted(!next);
  }, [soundOn]);

  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.code === "Escape") props.onExit();
    if (e.code === "KeyM") toggleMute();
  }, [props, toggleMute]);
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  return (
    <div className="fixed inset-0 z-40 bg-[var(--ground)]" ref={wrapRef}>
      <canvas ref={canvasRef} className="arena-canvas block h-full w-full touch-none" />

      {/* ---------------------------------------------------------- top rail */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="pointer-events-auto flex items-center gap-2">
          <button className="btn btn-ghost btn-sm" onClick={props.onExit}>◀ ABORT</button>
          <span className="stamp stamp-signal">{authorityLabel}</span>
          {hud?.lockdown && <span className="stamp stamp-alarm blink">LOCKDOWN</span>}
        </div>

        <div className="panel brackets brackets-live px-4 py-2">
          <div className="relative z-10 text-center">
            <div className="label">{hud?.phase ?? "—"}</div>
            <div className="numeral text-3xl font-semibold leading-none">
              {hud && hud.phase === "COUNTDOWN" ? "—" : `${mm}:${ss}`}
            </div>
          </div>
          <div className="panel-inner" />
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <span className={`stamp ${hud?.securityDisabled ? "stamp-live" : ""}`}>
            CAM {hud?.securityDisabled ? "OFFLINE" : "LIVE"}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={toggleMute} aria-pressed={muted}>
            {muted ? "SOUND OFF" : "SOUND ON"}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------- alert feed */}
      <div className="pointer-events-none absolute left-3 top-24 w-[min(22rem,60vw)] space-y-1 sm:left-4">
        {hud?.feed.map((f, i) => (
          <div
            key={`${f.text}-${i}`}
            className={`mono text-[0.6875rem] tracking-[0.14em] ${i === 0 ? "text-[var(--ink)]" : "text-[var(--ink-3)]"}`}
          >
            <span className="text-[var(--ink-3)]">›</span>{" "}
            <span className={f.player === 0 ? "text-[var(--action)]" : f.player === 1 ? "text-[var(--signal)]" : ""}>
              {f.text}
            </span>
          </div>
        ))}
      </div>

      {notice && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 grid -translate-y-1/2 place-items-center">
          <div className="panel clip-panel px-6 py-4">
            <div className="relative z-10 label label-action">{notice}</div>
            <div className="panel-inner" />
          </div>
        </div>
      )}

      {/* ------------------------------------------------------- vitals bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 sm:p-4">
        <div className="flex items-end justify-between gap-4">
          <div className="panel min-w-[15rem] px-4 py-3">
            <div className="relative z-10">
              <div className="flex items-baseline justify-between">
                <span className="label label-action">VITALS</span>
                <span className="numeral text-lg">{Math.round(hud?.hp ?? 0)}</span>
              </div>
              <div className="mt-2 h-[6px] w-full bg-[var(--rule)]">
                <div
                  className="h-full transition-[width] duration-150"
                  style={{
                    width: `${Math.max(0, Math.min(100, ((hud?.hp ?? 0) / 130) * 100))}%`,
                    background: (hud?.hp ?? 0) > 58 ? "var(--action)" : "var(--alarm)",
                  }}
                />
              </div>
              <div className="mt-2 flex items-center gap-3">
                <span className="label">STAMINA</span>
                <div className="h-[4px] flex-1 bg-[var(--rule)]">
                  <div className="h-full bg-[var(--signal)]" style={{ width: `${hud?.stamina ?? 0}%` }} />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="label">LIVES</span>
                <span className="flex gap-1">
                  {[0, 1].map((i) => (
                    <span
                      key={i}
                      className="inline-block h-3 w-5"
                      style={{ background: i < (hud?.lives ?? 0) ? "var(--action)" : "var(--rule-strong)" }}
                    />
                  ))}
                </span>
                {hud?.carrying && <span className="stamp stamp-live blink">CORE CARRIED</span>}
              </div>
            </div>
            <div className="panel-inner" />
          </div>

          <div className="panel px-4 py-3">
            <div className="relative z-10 flex items-end gap-4">
              <Ability label="DASH" hint="SPACE" cd={hud?.dash ?? 0} max={108} />
              <Ability label="EMP" hint="Q" cd={hud?.emp ?? 0} max={660} />
              <Ability label="SCAN" hint="R" cd={hud?.scan ?? 0} max={540} />
              <div className="hidden sm:block">
                <div className="label">MELEE / FIRE / INTERACT</div>
                <div className="mono text-[var(--ink-3)] text-[0.6875rem]">V · LMB · F (HOLD)</div>
              </div>
            </div>
            <div className="panel-inner" />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------ channel ring */}
      {hud && (hud.hacking > 6 || hud.grabbing > 6 || hud.extracting > 0) && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-16">
          <div className="panel px-4 py-3 text-center">
            <div className="relative z-10">
              <div className="label label-action">
                {hud.extracting > 0 ? `EXTRACTING — ${hud.extractZone}` : hud.grabbing > 6 ? "SECURING CORE" : hud.hackLabel}
              </div>
              <div className="mt-2 h-[5px] w-56 bg-[var(--rule)]">
                <div
                  className="h-full bg-[var(--signal)]"
                  style={{
                    width: `${Math.round(
                      (hud.extracting > 0
                        ? hud.extracting / hud.extractNeed
                        : hud.grabbing > 6
                          ? hud.grabbing / 75
                          : hud.hacking / hud.hackNeed) * 100,
                    )}%`,
                  }}
                />
              </div>
            </div>
            <div className="panel-inner" />
          </div>
        </div>
      )}

      {hud?.respawn && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 grid -translate-y-1/2 place-items-center">
          <div className="text-center">
            <div className="stencil text-5xl text-[var(--alarm)]">RE-DEPLOYING</div>
            <div className="label mt-2">ONE LIFE REMAINING</div>
          </div>
        </div>
      )}

      {hud && hud.phase === "COUNTDOWN" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[rgba(8,11,16,0.55)]">
          <div className="flex flex-col items-center gap-6">
            <VaultAperture
              size={230}
              state="locked"
              progress={1 - hud.countdown / 90}
              label="HEIST STARTING"
              sublabel={`${Math.max(1, Math.ceil(hud.countdown / 30))}`}
            />
            <p className="max-w-sm text-center text-[var(--ink-2)]">
              Two thieves, one Core. Hack the cameras, breach the vault, and be the one who walks out.
            </p>
          </div>
        </div>
      )}

      {done && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-[rgba(8,11,16,0.86)] p-4">
          <div className="panel w-full max-w-xl p-8">
            <div className="relative z-10">
              <div className="label">{hud?.reason === "core_extracted" ? "CORE SUCCESSFULLY EXTRACTED" : hud?.reason === "opponent_eliminated" ? "TARGET ELIMINATED" : hud?.reason === "eliminated" ? "YOU WERE ELIMINATED" : hud?.reason?.replace(/_/g, " ").toUpperCase()}</div>
              <h2 className={`stencil mt-2 text-6xl ${hud?.winner === null ? "text-[var(--ink-2)]" : won ? "text-[var(--signal)]" : "text-[var(--alarm)]"}`}>
                {hud?.winner === null ? "DRAW" : won ? "VICTORY" : "DEFEAT"}
              </h2>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/play" className="btn btn-action">RUN IT BACK</Link>
                <button className="btn btn-ghost" onClick={props.onExit}>RETURN TO LOBBY</button>
              </div>
            </div>
            <div className="panel-inner" />
          </div>
        </div>
      )}

      {showPlan && <FacilityPlan state={planState} />}

      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 sm:hidden">
        <span className="label">TAB — FACILITY PLAN</span>
      </div>
    </div>
  );
}

function _state(view: Snapshot, me: PlayerId, scanTicks: number, prev: Map<number, { x: number; y: number }>) {
  return stateFromSnapshot(view, { scanTicks, previousBullets: prev });
}

function Ability({ label, hint, cd, max }: { label: string; hint: string; cd: number; max: number }) {
  const ready = cd <= 0;
  return (
    <div className="w-16">
      <div className="label" style={{ color: ready ? "var(--signal)" : "var(--ink-3)" }}>{label}</div>
      <div className="mt-1 h-[4px] bg-[var(--rule)]">
        <div
          className="h-full"
          style={{ width: `${ready ? 100 : Math.max(0, 100 - (cd / max) * 100)}%`, background: ready ? "var(--signal)" : "var(--ink-3)" }}
        />
      </div>
      <div className="mono mt-1 text-[0.625rem] text-[var(--ink-3)]">{hint}</div>
    </div>
  );
}

function FacilityPlan({ state }: { state: GameState | null }) {
  if (!state) return null;
  const zones = ["A", "B"] as const;
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[rgba(8,11,16,0.78)]">
      <div className="panel p-6">
        <div className="relative z-10">
          <div className="label label-signal">FACILITY KESTREL — LEVEL PLAN</div>
          <svg viewBox="0 0 2240 1440" width="min(78vw, 900px)" className="mt-3">
            <rect width="2240" height="1440" fill="#0c1118" />
            <g fill="#16202d" stroke="#2c3b4e" strokeWidth="3">
              {ROOMS_FOR_PLAN.map((r) => (
                <rect key={r.id} x={r.x + 2} y={r.y + 2} width={r.w - 4} height={r.h - 4} />
              ))}
            </g>
            {zones.map((k) => {
              const r = EXTRACTION[k].rect;
              return (
                <rect
                  key={k}
                  x={r.x * 40} y={r.y * 40} width={r.w * 40} height={r.h * 40}
                  fill="rgba(111,216,232,0.18)" stroke="#6fd8e8" strokeWidth="3"
                />
              );
            })}
            <circle cx={state.core.pos.x} cy={state.core.pos.y} r="16" fill="#ffa227" />
            {state.players.map((p, i) => (
              <g key={i}>
                <circle cx={p.pos.x} cy={p.pos.y} r="14" fill={i === 0 ? "#ffa227" : "#6fd8e8"} />
                <circle cx={p.pos.x} cy={p.pos.y} r="34" fill="none" stroke={i === 0 ? "#ffa227" : "#6fd8e8"} strokeWidth="2" opacity="0.4" />
              </g>
            ))}
          </svg>
        </div>
        <div className="panel-inner" />
      </div>
    </div>
  );
}

import { ROOM_LABELS } from "@/game/map";
const ROOMS_FOR_PLAN = ROOM_LABELS;
