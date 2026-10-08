"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { Panel, Readout, Stamp } from "@/components/ui/primitives";
import { StakePicker } from "@/components/ui/stake-picker";
import { RequireAuth } from "@/components/require-auth";
import { useMe } from "@/lib/hooks/use-me";
import { useSession } from "@/lib/hooks/use-session";

interface Arena {
  id: string;
  joinCode: string;
  inviteToken: string;
  inviteUrl?: string;
  stakeUnits: number;
  status: "open" | "filled" | "started" | "expired" | "cancelled";
  matchId: string | null;
  expiresAt: string;
  isCreator?: boolean;
  creator: { username: string; avatarSeed: string } | null;
}

export default function FriendPage() {
  return (
    <RequireAuth what="Friend arenas">
      <FriendArena />
    </RequireAuth>
  );
}

function FriendArena() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("arena");
  const { data: session } = useSession();
  const { data: me } = useMe();
  const escrow = Boolean(session?.capabilities.escrow);

  const [stake, setStake] = useState(0);
  const [arena, setArena] = useState<Arena | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const pollRef = useRef<number | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const loadArena = useCallback(async (code: string) => {
    const res = await fetch(`/api/arenas/${encodeURIComponent(code)}`, { credentials: "same-origin" });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "ARENA_NOT_FOUND");
    return body.arena as Arena;
  }, []);

  // Arriving from a link or QR: resolve the token before showing anything.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const found = await loadArena(token);
        if (cancelled) return;
        setArena(found);
        if (found.status === "filled" && found.matchId) setCount((c) => c ?? 3);
      } catch {
        if (!cancelled) setError("That invite is no longer valid. Ask for a fresh link.");
      }
    })();
    return () => { cancelled = true; };
  }, [token, loadArena]);

  useEffect(() => {
    if (!arena || arena.isCreator || arena.status !== "open") {
      if (pollRef.current !== null) { window.clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = window.setInterval(async () => {
      try {
        const fresh = await loadArena(arena.inviteToken);
        setArena(fresh);
      } catch { /* keep the last good state */ }
    }, 2200);
    return () => { if (pollRef.current !== null) window.clearInterval(pollRef.current); };
  }, [arena, loadArena]);

  // Creator waiting room: poll until the opponent is in, then run the countdown.
  useEffect(() => {
    if (!arena?.isCreator) return;
    const id = window.setInterval(async () => {
      try {
        const fresh = await loadArena(arena.joinCode);
        setArena(fresh);
        if (fresh.status === "filled" && fresh.matchId) setCount((c) => c ?? 3);
      } catch { /* ignore */ }
    }, 2200);
    return () => window.clearInterval(id);
  }, [arena?.isCreator, arena?.joinCode, loadArena]);

  useEffect(() => {
    if (count === null) return;
    if (count === 0) {
      const t = window.setTimeout(() => router.push(`/arena/${arena!.matchId}`), 400);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setCount((c) => (c ?? 1) - 1), 900);
    return () => window.clearTimeout(t);
  }, [count, arena, router]);

  const create = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/arenas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ stake }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error === "ESCROW_UNAVAILABLE" ? "Staked arenas need a live escrow deployment." : "Could not create the arena.");
      setArena({ ...body.arena, status: "open", matchId: null, isCreator: true, creator: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the arena.");
    } finally {
      setBusy(false);
    }
  }, [stake]);

  const join = useCallback(async () => {
    if (!arena) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/arenas/${encodeURIComponent(arena.inviteToken)}`, { method: "POST", credentials: "same-origin" });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(
          body.error === "CANNOT_JOIN_OWN_ARENA"
            ? "This is your own arena. Send the link to your opponent."
            : body.error === "ARENA_EXPIRED"
              ? "That arena expired."
              : body.error === "ALREADY_IN_MATCH"
                ? "You already have a match open."
                : "Could not join the arena.",
        );
      }
      router.push(`/arena/${body.matchId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join the arena.");
    } finally {
      setBusy(false);
    }
  }, [arena, router]);

  if (count !== null && count >= 0) {
    return (
      <div className="shell grid min-h-[70vh] place-items-center py-10">
        <div className="text-center">
          <div className="label label-action">Heist starting</div>
          <div className="stencil mt-3 text-[clamp(4rem,14vw,9rem)] leading-none text-[var(--signal)]">{count > 0 ? count : "GO"}</div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------- join screen
  if (arena && !arena.isCreator && arena.status === "open") {
    return (
      <div className="shell grid min-h-[70vh] place-items-center py-10">
        <Panel className="w-full max-w-lg p-8">
          <div className="relative">
            <Stamp tone="live">Invitation</Stamp>
            <h1 className="stencil t-h2 mt-4">Join the heist</h1>
            <p className="mt-3 t-small text-[var(--ink-2)]">
              {arena.creator?.username ?? "An operative"} is holding an arena open for you.
            </p>
            <dl className="mt-6 grid grid-cols-2 gap-5">
              <Readout label="Arena" value={arena.joinCode} tone="action" />
              <Readout label="Stake" value={arena.stakeUnits === 0 ? "Free" : `$${(arena.stakeUnits / 1e6).toFixed(2)}`} />
              <Readout label="Host" value={arena.creator?.username ?? "—"} />
              <Readout label="Closes" value={new Date(arena.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} tone="muted" />
            </dl>
            {error && <p className="mono mt-5 t-mono-xs text-[var(--alarm)]">{error}</p>}
            <button className="btn btn-action mt-7 w-full" disabled={busy} onClick={() => void join()}>
              {busy ? "Entering…" : "Join arena"}
            </button>
            <Link href="/play" className="btn btn-ghost mt-2 w-full">
              Back to lobby
            </Link>
          </div>
        </Panel>
      </div>
    );
  }

  // ----------------------------------------------------------- waiting room
  if (arena?.isCreator) {
    const url = arena.inviteUrl ?? `${origin}/play/friend?arena=${arena.inviteToken}`;
    return (
      <div className="shell py-10">
        <header className="scene-index">
          <span className="mono t-label tracking-[0.18em] text-[var(--action)]">ARENA</span>
          <h1 className="stencil t-h2">Waiting for opponent</h1>
          <Stamp tone="live">
            <i className="inline-block size-[5px] bg-[var(--action)] blink" aria-hidden /> Open
          </Stamp>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
          <Panel className="p-7">
            <div className="relative">
              <div className="label label-action">Arena id</div>
              <div className="stencil mt-2 text-[clamp(2rem,6vw,3.5rem)] leading-none">{arena.joinCode}</div>

              <dl className="mt-7 grid grid-cols-2 gap-5">
                <Readout label="Stake" value={arena.stakeUnits === 0 ? "Free" : `$${(arena.stakeUnits / 1e6).toFixed(2)}`} tone={arena.stakeUnits ? "action" : "ink"} />
                <Readout label="Host" value={me?.user?.username ?? "You"} />
                <Readout label="Opponent" value="Not yet joined" tone="muted" />
                <Readout label="Expires" value={new Date(arena.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} tone="muted" />
              </dl>

              <div className="mt-7">
                <div className="label">Invite link</div>
                <div className="mt-2 flex gap-2">
                  <input className="field" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
                  <button
                    className="btn btn-signal shrink-0"
                    onClick={async () => {
                      await navigator.clipboard?.writeText(url).catch(() => {});
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1800);
                    }}
                  >
                    {copied ? "Copied" : "Copy link"}
                  </button>
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      if (navigator.share) void navigator.share({ title: "HEIST", text: "Join my heist.", url });
                      else void navigator.clipboard?.writeText(url);
                    }}
                  >
                    Share
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>
                    Refresh status
                  </button>
                </div>
              </div>
            </div>
          </Panel>

          <Panel className="grid place-items-center p-7">
            <div className="text-center">
              <div className="label">Scan to join</div>
              <div className="mt-4 inline-grid place-items-center bg-[var(--ink)] p-3 clip-tag">
                <QRCodeSVG value={url} size={208} bgColor="#e8edf5" fgColor="#080b10" level="M" />
              </div>
              <p className="mono mt-4 max-w-[34ch] t-mono-xs leading-relaxed text-[var(--ink-3)]">
                The code opens HEIST on your opponent&apos;s phone, resolves this arena, and drops them straight into the
                join screen.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------- create UI
  return (
    <div className="shell py-10">
      <header className="scene-index">
        <span className="mono t-label tracking-[0.18em] text-[var(--action)]">PRIVATE</span>
        <h1 className="stencil t-h2">Play with friend</h1>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <div>
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="label">Stake</h2>
              <span className="mono t-mono-xs text-[var(--ink-3)]">
                {escrow ? "Escrowed on Arc before the countdown" : "Escrow offline — free arenas only"}
              </span>
            </div>
            <div className="mt-3">
              <StakePicker value={stake} onChange={setStake} allowFree disabled={!escrow && stake !== 0} />
            </div>
          </section>

          {error && <p className="mono mt-6 t-mono-xs text-[var(--alarm)]">{error}</p>}

          <button className="btn btn-action mt-7" disabled={busy || (!escrow && stake !== 0)} onClick={() => void create()}>
            {busy ? "Creating…" : "Create arena"}
          </button>
          <p className="mono mt-3 t-mono-xs leading-relaxed text-[var(--ink-3)]">
            You get an arena id, an invite link and a QR code. Nothing is staked until both of you are in.
          </p>
        </div>

        <Panel flat className="border border-[var(--rule)] p-6">
          <h2 className="label">Have an invite?</h2>
          <p className="mt-3 t-small text-[var(--ink-2)]">
            Arena codes look like <span className="mono text-[var(--action)]">HEIST-7K92</span>. Paste one, or just scan
            your opponent&apos;s QR code and you will land on the join screen automatically.
          </p>
          <JoinByCode onFound={setArena} onError={setError} />
        </Panel>
      </div>
    </div>
  );
}

function JoinByCode({ onFound, onError }: { onFound: (a: Arena) => void; onError: (e: string) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const res = await fetch(`/api/arenas/${encodeURIComponent(code.trim().toUpperCase())}`, { credentials: "same-origin" });
          const body = await res.json();
          if (!res.ok) throw new Error("No arena with that code.");
          onFound(body.arena as Arena);
        } catch (err) {
          onError(err instanceof Error ? err.message : "Could not find that arena.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex gap-2">
        <input
          className="field"
          placeholder="HEIST-7K92"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          aria-label="Arena code"
        />
        <button className="btn shrink-0" disabled={busy || code.trim().length < 4}>
          Find
        </button>
      </div>
    </form>
  );
}
