"use client";

import Link from "next/link";
import { useMe } from "@/lib/hooks/use-me";
import { useSession } from "@/lib/hooks/use-session";
import { useArcBalance } from "@/lib/hooks/use-arc-balance";
import { shortAddress } from "@/lib/wagmi/config";
import { PROTOCOL_FEE_BPS, STAKE_MAX, STAKE_MIN } from "@/lib/arc/chain";
import { Avatar } from "@/components/ui/avatar";
import { Panel, Readout, Stamp } from "@/components/ui/primitives";
import { RequireAuth } from "@/components/require-auth";

export default function PlayPage() {
  return (
    <div className="shell py-10">
      <RequireAuth what="The operations lobby">
        <Lobby />
      </RequireAuth>
    </div>
  );
}

const usd = (units: number) => `$${(units / 1e6).toFixed(2)}`;
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");

function Lobby() {
  const { data: me } = useMe();
  const { data: session } = useSession();
  const caps = session?.capabilities;
  const address = me?.user?.wallets[0]?.address ?? session?.session?.address ?? null;
  const balance = useArcBalance(address);

  const stats = me?.stats;
  const escrow = Boolean(caps?.escrow);

  return (
    <>
      <header className="scene-index">
        <span className="mono t-label tracking-[0.18em] text-[var(--action)]">OPERATIONS</span>
        <h1 className="stencil t-h2">Choose your heist</h1>
        <div className="ml-auto flex items-center gap-3">
          <Stamp tone={caps?.store === "postgres" ? "signal" : "live"}>
            {caps?.store === "postgres" ? "Live ledger" : "Ephemeral store"}
          </Stamp>
          <Stamp tone={escrow ? "signal" : "live"}>{escrow ? "Escrow live" : "Escrow offline"}</Stamp>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.65fr)]">
        {/* ---------------------------------------------------- operator card */}
        <Panel className="h-fit p-6">
          <div className="relative">
            <div className="flex items-center gap-4">
              <Avatar seed={me?.user?.avatarSeed ?? "heist"} name={me?.user?.username ?? "operative"} size={56} />
              <div className="min-w-0">
                <div className="stencil truncate t-h3">{me?.user?.username ?? "—"}</div>
                <div className="mono truncate t-mono-xs text-[var(--ink-3)]">
                  {address ? shortAddress(address, 8, 6) : "no wallet linked"}
                </div>
              </div>
            </div>

            <div className="mt-6 border-y border-[var(--rule)] py-5">
              <div className="label">USDC balance</div>
              <div className="numeral mt-1 text-[clamp(1.9rem,4vw,2.6rem)] font-semibold">
                {balance.isSuccess ? balance.data : balance.isLoading ? "——" : "—"}
              </div>
              <div className="mono mt-1 t-mono-xs text-[var(--ink-3)]">
                {balance.isError ? "Arc RPC unreachable" : "Arc Mainnet · native USDC"}
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4">
              <Readout label="Games" value={stats?.games ?? 0} />
              <Readout label="Win rate" value={pct(stats?.wins ?? 0, stats?.games ?? 0)} tone="signal" />
              <Readout label="Won" value={stats?.wins ?? 0} />
              <Readout label="Lost" value={stats?.losses ?? 0} />
              <Readout label="Staked" value={usd(stats?.totalStakedUnits ?? 0)} tone="muted" />
              <Readout label="Winnings" value={usd(stats?.totalWonUnits ?? 0)} tone="action" />
            </dl>

            <div className="mt-6 flex gap-2">
              <Link href="/profile" className="btn btn-ghost btn-sm flex-1">
                Profile
              </Link>
              <Link href="/wallet" className="btn btn-ghost btn-sm flex-1">
                Wallet
              </Link>
            </div>
          </div>
        </Panel>

        {/* -------------------------------------------------------- mode grid */}
        <div className="grid gap-6">
          <ModePanel
            href="/play/global"
            eyebrow="Real money"
            title="Play globally"
            body={`Pick a stake from $${STAKE_MIN} to $${STAKE_MAX}, get matched with a real opponent anywhere in the world, and settle on Arc. Winner takes ${100 - PROTOCOL_FEE_BPS / 100}%.`}
            meta={["Global matchmaking", `${100 - PROTOCOL_FEE_BPS / 100}% to the winner`, escrow ? "Escrow armed" : "Requires escrow"]}
            accent
            disabled={!escrow}
            disabledNote={escrow ? undefined : "No HeistEscrow deployment is configured on this environment, so no real-money match can be entered. Practice and friend arenas are fully playable."}
          />

          <div className="grid gap-6 sm:grid-cols-2">
            <ModePanel
              href="/play/friend"
              eyebrow="Private"
              title="Play with friend"
              body="Create an arena and send a link or QR code. Your opponent scans, funds, and you drop in together."
              meta={["Invite link", "QR code", "Same facility"]}
            />
            <ModePanel
              href="/play/computer"
              eyebrow="Free"
              title="Play computer"
              body="Four skill levels against an opponent that uses the same map, the same abilities and the same information you do."
              meta={["No stake", "Four difficulties", "Learn the vault"]}
            />
          </div>
        </div>
      </div>

      <RecentMatches matches={me?.matches ?? []} />
    </>
  );
}

function ModePanel({
  href, eyebrow, title, body, meta, accent = false, disabled = false, disabledNote,
}: {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  meta: string[];
  accent?: boolean;
  disabled?: boolean;
  disabledNote?: string;
}) {
  const inner = (
    <div className="relative flex h-full flex-col p-6 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <span className={`label ${accent ? "label-action" : ""}`}>{eyebrow}</span>
        <span className="label">{disabled ? "Unavailable" : "Enter"} {!disabled && <span aria-hidden>→</span>}</span>
      </div>

      <h2 className={`stencil mt-4 ${accent ? "text-[clamp(1.75rem,3.4vw,2.6rem)]" : "t-h3"}`}>{title}</h2>
      <p className="mt-3 max-w-[58ch] text-[var(--t-small)] text-[var(--ink-2)]">{body}</p>

      <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
        {meta.map((m) => (
          <li key={m} className="mono flex items-center gap-2 t-mono-xs text-[var(--ink-3)]">
            <span className={`inline-block size-[5px] ${accent ? "bg-[var(--action)]" : "bg-[var(--rule-strong)]"}`} aria-hidden />
            {m}
          </li>
        ))}
      </ul>

      {disabledNote && (
        <p className="mono mt-5 border-l-2 border-[var(--action-deep)] pl-3 t-mono-xs leading-relaxed text-[var(--ink-3)]">
          {disabledNote}
        </p>
      )}
    </div>
  );

  if (disabled) {
    return (
      <Panel flat className="relative border border-[var(--rule)] opacity-80" aria-disabled="true">
        {inner}
      </Panel>
    );
  }

  return (
    <Link href={href} className="group block focus-visible:outline-offset-4">
      <Panel
        live={accent}
        className={`h-full transition-colors ${accent ? "" : "border border-[var(--rule)]"} ${accent ? "" : "hover:border-[var(--rule-strong)]"}`}
      >
        {inner}
      </Panel>
    </Link>
  );
}

function RecentMatches({ matches }: { matches: { id: string; outcome: string; stakeUnits: number; potUnits: number; opponent: { username: string; avatarSeed: string } | null; createdAt: string }[] }) {
  if (matches.length === 0) {
    return (
      <section className="mt-14">
        <h2 className="label">Recent heists</h2>
        <Panel flat className="mt-3 border border-dashed border-[var(--rule-strong)] p-8 text-center">
          <p className="text-[var(--t-small)] text-[var(--ink-2)]">No matches yet. Run a practice heist to learn the facility.</p>
          <Link href="/play/computer" className="btn btn-signal btn-sm mt-5">
            Practice vs computer
          </Link>
        </Panel>
      </section>
    );
  }

  return (
    <section className="mt-14">
      <div className="flex items-baseline justify-between">
        <h2 className="label">Recent heists</h2>
        <Link href="/history" className="label hover:text-[var(--ink)]">
          All matches →
        </Link>
      </div>
      <div className="mt-3 grid gap-px bg-[var(--rule)] sm:grid-cols-2 lg:grid-cols-4">
        {matches.slice(0, 4).map((m) => (
          <Link key={m.id} href={`/history#${m.id}`} className="flex items-center gap-3 bg-[var(--ground)] p-4 hover:bg-[var(--surface)]">
            <Avatar seed={m.opponent?.avatarSeed ?? m.id} name={m.opponent?.username ?? "unknown"} size={34} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[var(--t-small)]">{m.opponent?.username ?? "Awaiting opponent"}</div>
              <div className="mono t-mono-xs text-[var(--ink-3)]">{usd(m.stakeUnits)} stake</div>
            </div>
            <OutcomeTag outcome={m.outcome} />
          </Link>
        ))}
      </div>
    </section>
  );
}

export function OutcomeTag({ outcome }: { outcome: string }) {
  const tone = outcome === "win" ? "signal" : outcome === "loss" ? "alarm" : "muted";
  const label = outcome === "win" ? "Win" : outcome === "loss" ? "Loss" : outcome === "draw" ? "Draw" : "Open";
  return <Stamp tone={tone as "signal" | "alarm" | "muted"}>{label}</Stamp>;
}
