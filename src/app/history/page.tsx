"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Panel, Stamp } from "@/components/ui/primitives";
import { RequireAuth } from "@/components/require-auth";
import { txUrl } from "@/lib/arc/chain";

interface MatchRow {
  id: string;
  mode: string;
  status: string;
  stakeUnits: number;
  potUnits: number;
  winner: string | null;
  endReason: string | null;
  createdAt: string;
  completedAt: string | null;
  settleTx: string | null;
  opponent: { username: string; avatarSeed: string } | null;
  outcome: string;
}

interface Txn {
  id: string;
  matchId: string | null;
  txHash: string;
  type: string;
  amountUnits: number;
  status: string;
  createdAt: string;
}

export default function HistoryPage() {
  return (
    <div className="shell py-10">
      <RequireAuth what="Match history">
        <History />
      </RequireAuth>
    </div>
  );
}

function History() {
  const { data, isLoading } = useQuery({
    queryKey: ["history"],
    queryFn: async () => {
      const res = await fetch("/api/history", { credentials: "same-origin" });
      if (!res.ok) throw new Error("history unavailable");
      return (await res.json()) as { matches: MatchRow[]; transactions: Txn[] };
    },
  });

  const matches = data?.matches ?? [];
  const txns = data?.transactions ?? [];
  const byMatch = new Map(txns.filter((t) => t.matchId).map((t) => [t.matchId!, t]));

  return (
    <>
      <header className="scene-index">
        <span className="mono t-label tracking-[0.18em] text-[var(--action)]">ARCHIVE</span>
        <h1 className="stencil t-h2">Match history</h1>
        <p className="ml-auto hidden max-w-[42ch] t-small text-[var(--ink-2)] lg:block">
          Settled matches with their onchain transaction. Nothing here is estimated.
        </p>
      </header>

      {isLoading && <Panel className="p-12 text-center t-small text-[var(--ink-2)]">Loading archive…</Panel>}

      {!isLoading && matches.length === 0 && (
        <Panel flat className="border border-dashed border-[var(--rule-strong)] p-12 text-center">
          <p className="t-small text-[var(--ink-2)]">No heists on record yet.</p>
          <Link href="/play" className="btn btn-action btn-sm mt-5">Enter the lobby</Link>
        </Panel>
      )}

      <div className="grid gap-3">
        {matches.map((m) => {
          const tx = byMatch.get(m.id);
          const won = m.outcome === "win";
          return (
            <Panel key={m.id} id={m.id} className={won ? "border-l-2 border-l-[var(--signal)]" : m.outcome === "loss" ? "border-l-2 border-l-[var(--alarm)]" : ""}>
              <div className="relative grid items-center gap-4 p-5 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                <Avatar seed={m.opponent?.avatarSeed ?? m.id} name={m.opponent?.username ?? "unknown"} size={40} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="stencil t-h3">{m.opponent?.username ?? "Awaiting opponent"}</span>
                    <Stamp tone={won ? "signal" : m.outcome === "loss" ? "alarm" : "muted"}>
                      {won ? "Win" : m.outcome === "loss" ? "Loss" : m.outcome === "draw" ? "Draw" : "Pending"}
                    </Stamp>
                    <span className="label">{m.mode}</span>
                  </div>
                  <div className="mono mt-1 flex flex-wrap gap-x-4 gap-y-1 t-mono-xs text-[var(--ink-3)]">
                    <span>{new Date(m.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
                    <span>HEIST #{m.id.slice(0, 6).toUpperCase()}</span>
                    {m.endReason && <span>{(m.endReason ?? "").replace(/_/g, " ")}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="label">Stake</div>
                  <div className="numeral t-h3">${(m.stakeUnits / 1e6).toFixed(2)}</div>
                  <div className={`numeral t-small ${won ? "text-[var(--signal)]" : "text-[var(--ink-3)]"}`}>
                    {won ? `+$${((m.potUnits * 0.9) / 1e6).toFixed(2)}` : m.outcome === "loss" ? `-$${(m.stakeUnits / 1e6).toFixed(2)}` : "—"}
                  </div>
                </div>
              </div>
              {tx && (
                <div className="relative border-t border-[var(--rule)] px-5 py-2.5">
                  <a
                    href={txUrl(tx.txHash)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mono t-mono-xs text-[var(--signal)] hover:underline"
                  >
                    {tx.type.toUpperCase()} · {tx.txHash.slice(0, 14)}…{tx.txHash.slice(-6)} ↗
                  </a>
                </div>
              )}
            </Panel>
          );
        })}
      </div>
    </>
  );
}
