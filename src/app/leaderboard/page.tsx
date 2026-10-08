"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Avatar } from "@/components/ui/avatar";
import { Panel, Stamp } from "@/components/ui/primitives";

type Sort = "wins" | "winRate" | "winnings" | "games";

interface Row {
  userId: string;
  username: string;
  avatarSeed: string;
  games: number;
  wins: number;
  losses: number;
  totalWonUnits: number;
  winRate: number;
}

const TABS: { key: Sort; label: string }[] = [
  { key: "wins", label: "Wins" },
  { key: "winRate", label: "Win rate" },
  { key: "winnings", label: "Winnings" },
  { key: "games", label: "Games" },
];

export default function LeaderboardPage() {
  const [sort, setSort] = useState<Sort>("wins");
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard", sort],
    queryFn: async () => {
      const res = await fetch(`/api/leaderboard?sort=${sort}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error("leaderboard unavailable");
      return (await res.json()) as { rows: Row[] };
    },
  });

  const rows = data?.rows ?? [];

  return (
    <div className="shell py-10">
      <header className="scene-index">
        <span className="mono t-label tracking-[0.18em] text-[var(--action)]">RANKINGS</span>
        <h1 className="stencil t-h2">Leaderboard</h1>
        <p className="ml-auto hidden max-w-[42ch] t-small text-[var(--ink-2)] lg:block">
          Every column is read from settled matches. Practice runs are never counted.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSort(t.key)}
            aria-pressed={sort === t.key}
            className="btn btn-sm"
            style={sort === t.key ? { ["--btn-bg" as string]: "var(--action-soft)", ["--btn-edge" as string]: "var(--action)", ["--btn-ink" as string]: "var(--action)" } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Panel className="overflow-hidden">
        <div className="relative">
          <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem_4rem] items-center gap-2 border-b border-[var(--rule-strong)] px-4 py-3 sm:grid-cols-[3.5rem_minmax(0,1fr)_4.5rem_4.5rem_6rem_4.5rem] sm:gap-3 sm:px-6">
            <span className="label">#</span>
            <span className="label">Operative</span>
            <span className="label text-right">W</span>
            <span className="label hidden text-right sm:block">L</span>
            <span className="label text-right">Rate</span>
            <span className="label hidden text-right sm:block">Won</span>
          </div>

          {isLoading &&
            Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-[58px] animate-pulse border-b border-[var(--rule)]" />
            ))}

          {!isLoading && rows.length === 0 && (
            <p className="px-6 py-12 text-center t-small text-[var(--ink-2)]">No settled matches yet. The board fills as heists resolve.</p>
          )}

          {rows.map((r, i) => (
            <div
              key={r.userId}
              className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem_4rem] items-center gap-2 border-b border-[var(--rule)] px-4 py-3 last:border-0 hover:bg-[var(--surface)] sm:grid-cols-[3.5rem_minmax(0,1fr)_4.5rem_4.5rem_6rem_4.5rem] sm:gap-3 sm:px-6"
            >
              <span className={`numeral t-small ${i < 3 ? "text-[var(--action)]" : "text-[var(--ink-3)]"}`}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex min-w-0 items-center gap-3">
                <Avatar seed={r.avatarSeed} name={r.username} size={32} />
                <span className="truncate t-small">{r.username}</span>
                {i === 0 && <span className="hidden sm:block"><Stamp tone="live">Top</Stamp></span>}
              </span>
              <span className="numeral t-small text-right text-[var(--signal)]">{r.wins}</span>
              <span className="numeral hidden t-small text-right text-[var(--ink-3)] sm:block">{r.losses}</span>
              <span className="numeral t-small text-right">{r.games > 0 ? `${Math.round(r.winRate * 100)}%` : "—"}</span>
              <span className="numeral hidden t-small text-right text-[var(--action)] sm:block">${(r.totalWonUnits / 1e6).toFixed(0)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
