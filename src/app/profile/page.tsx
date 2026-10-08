"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Panel, Readout, Stamp } from "@/components/ui/primitives";
import { OutcomeTag } from "@/app/play/page";
import { RequireAuth } from "@/components/require-auth";
import { useMe } from "@/lib/hooks/use-me";
import { useArcBalance } from "@/lib/hooks/use-arc-balance";
import { useSession } from "@/lib/hooks/use-session";
import { shortAddress } from "@/lib/wagmi/config";

export default function ProfilePage() {
  return (
    <div className="shell py-10">
      <RequireAuth what="Your profile">
        <Profile />
      </RequireAuth>
    </div>
  );
}

function Profile() {
  const { data: me, isLoading } = useMe();
  const { data: session } = useSession();
  const address = me?.user?.wallets[0]?.address ?? session?.session?.address ?? null;
  const balance = useArcBalance(address);
  const stats = me?.stats;

  if (isLoading || !me?.user) {
    return <Panel className="p-12 text-center t-small text-[var(--ink-2)]">Loading operator record…</Panel>;
  }

  const user = me.user;
  const games = stats?.games ?? 0;
  const winRate = games > 0 ? Math.round(((stats?.wins ?? 0) / games) * 100) : 0;

  const achievements = [
    { id: "first-heist", label: "First Heist", note: "Complete a match", earned: games >= 1 },
    { id: "first-win", label: "First Win", note: "Win a match", earned: (stats?.wins ?? 0) >= 1 },
    { id: "five-wins", label: "Five Wins", note: "Win five matches", earned: (stats?.wins ?? 0) >= 5 },
    { id: "ten-wins", label: "Ten Wins", note: "Win ten matches", earned: (stats?.wins ?? 0) >= 10 },
    { id: "balanced", label: "Bookmaker", note: "Reach a 50% win rate over 10 games", earned: games >= 10 && winRate >= 50 },
    { id: "high-roller", label: "High Roller", note: "Stake $100 or more on a single heist", earned: (stats?.totalStakedUnits ?? 0) >= 100e6 },
  ];

  return (
    <>
      <Panel className="p-7 sm:p-9">
        <div className="relative flex flex-wrap items-center gap-7">
          <Avatar seed={user.avatarSeed} name={user.username} size={84} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="stencil t-h1 break-all">{user.username}</h1>
              <Stamp tone="signal">Rank #{me.rank ?? "—"}</Stamp>
            </div>
            <div className="mono mt-2 flex flex-wrap gap-x-5 gap-y-1 t-mono-xs text-[var(--ink-3)]">
              <span>{address ? shortAddress(address, 8, 6) : "no wallet"}</span>
              <span>via {user.authProvider}</span>
              <span>joined {new Date(user.createdAt).toLocaleDateString([], { month: "short", year: "numeric" })}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="label">USDC balance</div>
            <div className="numeral t-h2">{balance.isSuccess ? balance.data : "—"}</div>
          </div>
        </div>
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Panel className="p-6">
          <h2 className="label">Combat record</h2>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5">
            <Readout label="Games" value={games} />
            <Readout label="Win rate" value={games > 0 ? `${winRate}%` : "—"} tone="signal" />
            <Readout label="Wins" value={stats?.wins ?? 0} tone="signal" />
            <Readout label="Losses" value={stats?.losses ?? 0} />
            <Readout label="Draws" value={stats?.draws ?? 0} tone="muted" />
            <Readout label="Total staked" value={`$${((stats?.totalStakedUnits ?? 0) / 1e6).toFixed(2)}`} tone="muted" />
            <Readout label="Total winnings" value={`$${((stats?.totalWonUnits ?? 0) / 1e6).toFixed(2)}`} tone="action" />
            <Readout label="Rank" value={`#${me.rank ?? "—"}`} />
          </dl>
        </Panel>

        <Panel className="p-6">
          <h2 className="label">Achievements</h2>
          <ul className="mt-5 grid gap-px bg-[var(--rule)] sm:grid-cols-2">
            {achievements.map((a) => (
              <li key={a.id} className="flex items-start gap-3 bg-[var(--surface)] p-4" style={{ opacity: a.earned ? 1 : 0.45 }}>
                <span className={`mt-[3px] size-[10px] shrink-0 ${a.earned ? "bg-[var(--action)]" : "border border-[var(--rule-strong)]"}`} aria-hidden />
                <span>
                  <span className="block t-small font-semibold">{a.label}</span>
                  <span className="mono block t-mono-xs text-[var(--ink-3)]">{a.note}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mono mt-4 t-mono-xs leading-relaxed text-[var(--ink-3)]">
            Only achievements HEIST can verify from settled match records are listed.
          </p>
        </Panel>
      </div>

      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="label">Recent heists</h2>
          <Link href="/history" className="label hover:text-[var(--ink)]">Full archive →</Link>
        </div>
        {me.matches.length === 0 ? (
          <Panel flat className="mt-3 border border-dashed border-[var(--rule-strong)] p-10 text-center t-small text-[var(--ink-2)]">
            No matches recorded yet.
          </Panel>
        ) : (
          <div className="mt-3 grid gap-px bg-[var(--rule)] sm:grid-cols-2 lg:grid-cols-4">
            {me.matches.map((m) => (
              <Link key={m.id} href={`/history#${m.id}`} className="flex items-center gap-3 bg-[var(--ground)] p-4 hover:bg-[var(--surface)]">
                <Avatar seed={m.opponent?.avatarSeed ?? m.id} name={m.opponent?.username ?? "unknown"} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate t-small">{m.opponent?.username ?? "Awaiting opponent"}</span>
                  <span className="mono block t-mono-xs text-[var(--ink-3)]">${(m.stakeUnits / 1e6).toFixed(2)} stake</span>
                </span>
                <OutcomeTag outcome={m.outcome} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
