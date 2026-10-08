"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Panel, Stamp } from "@/components/ui/primitives";
import { VaultAperture } from "@/components/ui/VaultAperture";
import { StakePicker } from "@/components/ui/stake-picker";
import { TermsGate } from "@/components/terms-gate";
import { RequireAuth } from "@/components/require-auth";
import { PROTOCOL_FEE_BPS, STAKE_MAX, STAKE_MIN } from "@/lib/arc/chain";
import { useMe } from "@/lib/hooks/use-me";
import { useSession } from "@/lib/hooks/use-session";
import { useArcBalance } from "@/lib/hooks/use-arc-balance";

type Phase = "idle" | "searching" | "matched";

interface Opponent {
  username: string;
  avatarSeed: string;
  games: number;
  wins: number;
  winRate: number;
}

export default function GlobalPage() {
  return (
    <div className="shell py-10">
      <RequireAuth what="Global matchmaking">
        <GlobalMatch />
      </RequireAuth>
    </div>
  );
}

function GlobalMatch() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data: me } = useMe();
  const escrow = Boolean(session?.capabilities.escrow);
  const address = me?.user?.wallets[0]?.address ?? session?.session?.address ?? null;
  const balance = useArcBalance(address);

  const [stake, setStake] = useState(10);
  // Acceptance lives on the server (it is a legal record); the local flag only
  // covers the window between ticking the box and the session refreshing.
  const [justAccepted, setJustAccepted] = useState(false);
  const accepted = justAccepted || Boolean(session?.session?.acceptedTermsAt);
  const [phase, setPhase] = useState<Phase>("idle");
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const search = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/matchmaking", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ stake }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(
        body.error === "ESCROW_UNAVAILABLE"
          ? "Escrow is not deployed on this environment, so no staked match can be entered."
          : body.error === "ALREADY_IN_MATCH"
            ? "You already have a match in progress."
            : "Could not enter the queue.",
      );
      return;
    }
    if (body.state === "matched") {
      setOpponent(body.match.opponent);
      setMatchId(body.match.matchId);
      setPhase("matched");
      return;
    }
    setPhase("searching");
  }, [stake]);

  useEffect(() => {
    if (phase !== "searching") {
      stopPolling();
      return;
    }
    const started = Date.now();
    const tick = async () => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
      const res = await fetch("/api/matchmaking", { credentials: "same-origin" });
      if (!res.ok) return;
      const body = await res.json();
      setQueued(typeof body.queued === "number" ? body.queued : null);
      if (body.state === "matched") {
        setOpponent(body.match.opponent);
        setMatchId(body.match.matchId);
        setPhase("matched");
      } else if (body.state === "idle") {
        setPhase("idle");
      }
    };
    pollRef.current = window.setInterval(tick, 1600);
    return stopPolling;
  }, [phase, stopPolling]);

  const cancel = useCallback(async () => {
    await fetch("/api/matchmaking", { method: "DELETE", credentials: "same-origin" });
    setPhase("idle");
    setElapsed(0);
  }, []);

  // Leaving the page must not leave a stale queue slot behind.
  useEffect(() => () => {
    if (phase === "searching") void fetch("/api/matchmaking", { method: "DELETE", credentials: "same-origin", keepalive: true });
  }, [phase]);

  const pot = stake * 2;
  const winnings = pot * (1 - PROTOCOL_FEE_BPS / 10_000);
  const fee = pot * (PROTOCOL_FEE_BPS / 10_000);
  const insufficient = balance.isSuccess && Number(balance.data) < stake;
  const ready = escrow && accepted && !insufficient && stake >= STAKE_MIN && stake <= STAKE_MAX;

  if (phase === "matched" && opponent && matchId) {
    return <OpponentFound opponent={opponent} stake={stake} pot={pot} winnings={winnings} onReady={() => router.push(`/arena/${matchId}`)} />;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <div>
        <header className="scene-index">
          <span className="mono t-label tracking-[0.18em] text-[var(--action)]">GLOBAL</span>
          <h1 className="stencil t-h2">Real-money heist</h1>
        </header>

        {!escrow && (
          <Panel flat className="mb-6 border-l-2 border-[var(--action-deep)] bg-[var(--ground-2)] p-5">
            <div className="label label-action">Escrow offline</div>
            <p className="mt-2 t-small text-[var(--ink-2)]">
              This deployment has no <span className="mono">HeistEscrow</span> address configured, so staked entry is
              disabled rather than simulated. Practice against the computer, or open a free friend arena — both are
              fully playable.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/play/computer" className="btn btn-action btn-sm">
                Practice free
              </Link>
              <Link href="/play/friend" className="btn btn-ghost btn-sm">
                Friend arena
              </Link>
            </div>
          </Panel>
        )}

        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="label">Stake</h2>
            <span className="mono t-mono-xs text-[var(--ink-3)]">
              balance {balance.isSuccess ? balance.data : "—"} USDC
            </span>
          </div>
          <div className="mt-3">
            <StakePicker value={stake} onChange={setStake} disabled={!escrow || phase === "searching"} />
          </div>
        </section>

        <Panel className="mt-8 p-6">
          <div className="relative">
            <div className="label label-action">Entry summary</div>
            <dl className="mt-5 space-y-3">
              <Line k="Entry" v={`$${stake.toFixed(2)} USDC`} />
              <Line k="Pot" v={`$${pot.toFixed(2)} USDC`} />
              <Line k="Your winnings if victorious" v={`$${winnings.toFixed(2)} USDC`} tone="action" />
              <Line k="Protocol fee" v={`$${fee.toFixed(2)} USDC`} muted />
            </dl>

            <div className="mt-6">
              <TermsGate accepted={accepted} onChange={setJustAccepted} />
            </div>

            {insufficient && (
              <p className="mono mt-4 t-mono-xs text-[var(--alarm)]">
                Insufficient USDC balance for a ${stake.toFixed(2)} entry.
              </p>
            )}
            {error && <p className="mono mt-4 t-mono-xs text-[var(--alarm)]">{error}</p>}

            <button className="btn btn-action mt-5 w-full" disabled={!ready || phase === "searching"} onClick={() => void search()}>
              {phase === "searching" ? "Searching…" : "Confirm entry"}
            </button>
            <p className="mono mt-3 t-mono-xs leading-relaxed text-[var(--ink-3)]">
              Your stake is escrowed on Arc before the countdown. The result is attested by the game server and settled
              in one transaction — 90% to the winner, 10% protocol fee.
            </p>
          </div>
        </Panel>
      </div>

      <Panel className="grid h-fit place-items-center p-8 lg:sticky lg:top-24">
        <div className="relative grid w-full place-items-center gap-8">
          <div className="w-[min(60vw,300px)] max-w-full">
            <VaultAperture
              fluid
              state={phase === "searching" ? "searching" : "idle"}
              progress={phase === "searching" ? 0.35 : 0}
            />
          </div>
          <div className="text-center">
            <div className={`stencil t-h3 ${phase === "searching" ? "text-[var(--action)]" : ""}`}>
              {phase === "searching" ? "Searching globally…" : "Ready to deploy"}
            </div>
            <p className="mono mt-2 t-mono-xs text-[var(--ink-3)]">
              {phase === "searching"
                ? `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")} elapsed${queued !== null ? ` · ${queued} in queue` : ""}`
                : "Pick a stake and confirm your entry."}
            </p>
            {phase === "searching" && (
              <button className="btn btn-ghost btn-sm mt-5" onClick={() => void cancel()}>
                Cancel search
              </button>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Line({ k, v, tone, muted }: { k: string; v: string; tone?: "action"; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--rule)] pb-2.5">
      <dt className="label">{k}</dt>
      <dd className={`numeral t-small ${tone === "action" ? "text-[var(--action)]" : muted ? "text-[var(--ink-3)]" : ""}`}>{v}</dd>
    </div>
  );
}

function OpponentFound({
  opponent, stake, pot, winnings, onReady,
}: {
  opponent: Opponent;
  stake: number;
  pot: number;
  winnings: number;
  onReady: () => void;
}) {
  const [count, setCount] = useState(3);
  useEffect(() => {
    if (count === 0) {
      const t = window.setTimeout(onReady, 400);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setCount((c) => c - 1), 900);
    return () => window.clearTimeout(t);
  }, [count, onReady]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <Stamp tone="live">Opponent found</Stamp>
        <span className="mono t-mono-xs text-[var(--ink-3)]">$. {stake.toFixed(2)} · pot ${pot.toFixed(2)}</span>
      </div>

      <Panel live className="mt-5 p-8">
        <div className="relative grid items-center gap-8 sm:grid-cols-[1fr_auto_1fr]">
          <Combatant name="You" seed="self" />
          <div className="grid place-items-center">
            <span className="stencil text-[var(--alarm)] t-h2">VS</span>
          </div>
          <div className="sm:text-right">
            <Combatant name={opponent.username} seed={opponent.avatarSeed} right
              sub={`${opponent.games} games · ${Math.round(opponent.winRate * 100)}% win rate`} />
          </div>
        </div>

        <div className="mt-8 border-t border-[var(--rule)] pt-6 text-center">
          <div className="label label-action">Heist starting</div>
          <div className="stencil mt-2 text-[clamp(3rem,9vw,5.5rem)] leading-none text-[var(--signal)]">
            {count > 0 ? count : "GO"}
          </div>
          <p className="mono mt-3 t-mono-xs text-[var(--ink-3)]">Winner receives ${winnings.toFixed(2)} USDC on settlement.</p>
        </div>
      </Panel>
    </div>
  );
}

function Combatant({ name, seed, sub, right = false }: { name: string; seed: string; sub?: string; right?: boolean }) {
  return (
    <div className={`flex items-center gap-4 ${right ? "sm:flex-row-reverse" : ""}`}>
      <Avatar seed={seed} name={name} size={54} />
      <div className={right ? "sm:text-right" : ""}>
        <div className="stencil t-h3">{name}</div>
        {sub && <div className="mono t-mono-xs text-[var(--ink-3)]">{sub}</div>}
      </div>
    </div>
  );
}
