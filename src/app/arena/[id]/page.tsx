"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Arena } from "@/components/game/Arena";
import { Panel, Stamp } from "@/components/ui/primitives";
import { RequireAuth } from "@/components/require-auth";
import { useMe } from "@/lib/hooks/use-me";
import { useSession } from "@/lib/hooks/use-session";

interface MatchInfo {
  match: { id: string; mode: string; status: string; stakeUnits: number };
  opponent: { username: string; avatarSeed: string } | null;
}

/** What the app told us about where this match is actually simulated. */
type Link = { url: string; ticket?: string } | null;

export default function ArenaPage() {
  return (
    <RequireAuth what="A match">
      <MatchShell />
    </RequireAuth>
  );
}

function MatchShell() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const me = useMe();
  const { data: session } = useSession();
  const [info, setInfo] = useState<MatchInfo | null>(null);
  const [link, setLink] = useState<Link | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const id = params.id;
  const reported = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [matchRes, ticketRes] = await Promise.all([
        fetch(`/api/matches/${encodeURIComponent(id)}`, { credentials: "same-origin" }),
        fetch(`/api/matches/${encodeURIComponent(id)}/ticket`, { credentials: "same-origin" }),
      ]);
      if (cancelled) return;
      if (!matchRes.ok) {
        setError(matchRes.status === 403 ? "This match is not yours." : "Match not found.");
        return;
      }
      const body = (await matchRes.json()) as MatchInfo;
      setInfo(body);

      if (!ticketRes.ok) {
        setError("Could not reach the match authority.");
        return;
      }
      const ticket = (await ticketRes.json()) as { transport: string; url?: string; ticket?: string };
      setLink(ticket.transport === "server" && ticket.url ? { url: ticket.url, ticket: ticket.ticket } : null);
    })();
    return () => { cancelled = true; };
  }, [id]);

  const onExit = useCallback(() => router.push("/play"), [router]);

  const onResult = useCallback(
    async (r: { winner: number | null; reason: string }) => {
      if (reported.current || !info) return;
      // A staked match is settled by the game server, which owns the
      // simulation. The browser reporting a result would be hearsay.
      if (info.match.stakeUnits > 0) return;
      reported.current = true;
      await fetch(`/api/matches/${encodeURIComponent(id)}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: "result",
          winner: r.winner === null ? "draw" : "me",
          reason: r.reason,
        }),
      }).catch(() => { reported.current = false; });
    },
    [id, info],
  );

  if (error) {
    return (
      <div className="shell grid min-h-[60vh] place-items-center py-10">
        <Panel className="max-w-md p-8 text-center">
          <div className="relative">
            <Stamp tone="alarm">Aborted</Stamp>
            <h1 className="stencil t-h2 mt-4">{error}</h1>
            <button className="btn btn-action mt-6" onClick={onExit}>Return to lobby</button>
          </div>
        </Panel>
      </div>
    );
  }

  if (!info || link === undefined) {
    return (
      <div className="shell grid min-h-[70vh] place-items-center py-10">
        <div className="text-center">
          <div className="label label-signal">Locating match…</div>
          <div className="mt-4 h-[3px] w-52 overflow-hidden bg-[var(--rule)]">
            <div className="indeterminate h-full w-1/3 bg-[var(--signal)]" />
          </div>
        </div>
      </div>
    );
  }

  // Money is only ever played on an authoritative server. If the app has no
  // server to point at, a staked match must not start at all rather than be
  // decided by a browser.
  if (info.match.stakeUnits > 0 && link === null) {
    return (
      <div className="shell grid min-h-[60vh] place-items-center py-10">
        <Panel className="max-w-md p-8 text-center">
          <div className="relative">
            <Stamp tone="alarm">Unavailable</Stamp>
            <h1 className="stencil t-h2 mt-4">No authoritative server</h1>
            <p className="mt-3 text-sm text-[var(--ink-dim)]">
              This staked match cannot start without the authoritative game server. No funds have moved.
            </p>
            <button className="btn btn-action mt-6" onClick={onExit}>Return to lobby</button>
          </div>
        </Panel>
      </div>
    );
  }

  const name = me.data?.user?.username ?? session?.session?.username ?? "OPERATIVE";

  return (
    <div className="fixed inset-0 z-[60] bg-[var(--ground)]">
      <Arena
        mode="room"
        roomId={id}
        playerName={name}
        opponentName={info.opponent?.username ?? null}
        stakeUsdc={info.match.stakeUnits / 1e6}
        serverLink={link}
        onResult={onResult}
        onExit={onExit}
      />
    </div>
  );
}
