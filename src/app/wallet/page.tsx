"use client";

import { useQuery } from "@tanstack/react-query";
import { useSwitchChain } from "wagmi";
import { Panel, Readout, Stamp } from "@/components/ui/primitives";
import { RequireAuth } from "@/components/require-auth";
import { useMe } from "@/lib/hooks/use-me";
import { useSession } from "@/lib/hooks/use-session";
import { useArcBalance } from "@/lib/hooks/use-arc-balance";
import { ARC, ARC_CHAIN_ID, addressUrl, txUrl } from "@/lib/arc/chain";
import { shortAddress } from "@/lib/wagmi/config";

export default function WalletPage() {
  return (
    <div className="shell py-10">
      <RequireAuth what="Your wallet">
        <Wallet />
      </RequireAuth>
    </div>
  );
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

function Wallet() {
  const { data: me } = useMe();
  const { data: session } = useSession();
  const address = me?.user?.wallets[0]?.address ?? session?.session?.address ?? null;
  const balance = useArcBalance(address);
  const { switchChainAsync } = useSwitchChain();
  const caps = session?.capabilities;

  const { data: txData } = useQuery({
    queryKey: ["transactions", address],
    enabled: Boolean(address),
    queryFn: async () => {
      const res = await fetch("/api/wallet/transactions", { credentials: "same-origin" });
      if (!res.ok) throw new Error("transactions unavailable");
      return (await res.json()) as { rows: Txn[] };
    },
  });

  const stats = me?.stats;
  const txns = txData?.rows ?? [];

  return (
    <>
      <header className="scene-index">
        <span className="mono t-label tracking-[0.18em] text-[var(--action)]">ACCOUNT</span>
        <h1 className="stencil t-h2">Wallet</h1>
        <Stamp tone={caps?.escrow ? "signal" : "live"}>{caps?.escrow ? "Escrow armed" : "Escrow offline"}</Stamp>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Panel className="p-7">
          <div className="relative">
            <div className="label">Arc address</div>
            <div className="mono mt-2 break-all t-small text-[var(--ink)]">{address ?? "—"}</div>
            {address && (
              <a href={addressUrl(address)} target="_blank" rel="noreferrer noopener" className="mono mt-2 inline-block t-mono-xs text-[var(--signal)] hover:underline">
                View on Arc Explorer ↗
              </a>
            )}

            <div className="mt-7 border-y border-[var(--rule)] py-6">
              <div className="label">USDC balance</div>
              <div className="numeral mt-1 text-[clamp(2.2rem,5vw,3.2rem)] font-semibold">
                {balance.isSuccess ? balance.data : balance.isLoading ? "——" : "—"}
              </div>
              <div className="mono mt-1 t-mono-xs text-[var(--ink-3)]">
                {balance.isError
                  ? "Could not reach the Arc RPC. Balance unknown — never assume zero."
                  : `Native USDC on ${ARC.name} · chain id ${ARC_CHAIN_ID}`}
              </div>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
              <Readout label="Auth method" value={session?.session?.provider ?? "—"} />
              <Readout label="Games" value={stats?.games ?? 0} />
              <Readout label="Winnings" value={`$${((stats?.totalWonUnits ?? 0) / 1e6).toFixed(2)}`} tone="action" />
            </dl>

            <div className="mt-7 flex flex-wrap gap-2">
              <button className="btn btn-sm" onClick={() => void switchChainAsync({ chainId: ARC_CHAIN_ID }).catch(() => {})}>
                Add / switch to Arc
              </button>
              <a className="btn btn-ghost btn-sm" href={ARC.rpcUrls.default.http[0]} target="_blank" rel="noreferrer noopener">
                RPC endpoint
              </a>
            </div>
          </div>
        </Panel>

        <Panel flat className="border border-[var(--rule)] p-6">
          <h2 className="label">Linked wallets</h2>
          <ul className="mt-4 space-y-2">
            {(me?.user?.wallets ?? []).map((w) => (
              <li key={w.address} className="flex items-center justify-between gap-4 border-b border-[var(--rule)] pb-3">
                <span className="mono t-meta">{shortAddress(w.address, 10, 8)}</span>
                <Stamp tone={w.type === "managed" ? "signal" : "muted"}>{w.type}</Stamp>
              </li>
            ))}
            {(me?.user?.wallets ?? []).length === 0 && <li className="t-small text-[var(--ink-2)]">No wallet linked.</li>}
          </ul>

          <h2 className="label mt-8">Security</h2>
          <ul className="mt-4 space-y-3 t-meta text-[var(--ink-2)]">
            <li>HEIST never stores or transmits a private key for an injected wallet.</li>
            <li>A managed wallet key is sealed with AES-256-GCM and only opened to sign.</li>
            <li>Paid entries settle through escrow; nothing is paid from a hot wallet by hand.</li>
          </ul>
        </Panel>
      </div>

      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="label">Transactions</h2>
          <span className="mono t-mono-xs text-[var(--ink-3)]">{txns.length} on record</span>
        </div>

        <Panel className="mt-3 overflow-hidden">
          <div className="relative">
            <div className="hidden grid-cols-[6rem_minmax(0,1fr)_8rem_7rem] items-center gap-3 border-b border-[var(--rule-strong)] px-4 py-3 sm:grid">
              <span className="label">Type</span>
              <span className="label">Transaction</span>
              <span className="label text-right">Amount</span>
              <span className="label text-right">Status</span>
            </div>
            {txns.length === 0 && (
              <p className="px-6 py-12 text-center t-small text-[var(--ink-2)]">
                No onchain activity yet. Entry and payout transactions appear here once a staked match settles.
              </p>
            )}
            {txns.map((t) => (
              <div key={t.id} className="flex flex-col gap-1.5 border-b border-[var(--rule)] px-4 py-3 last:border-0 sm:grid sm:grid-cols-[6rem_minmax(0,1fr)_8rem_7rem] sm:items-center sm:gap-3">
                <span className="label" style={{ color: t.type === "payout" ? "var(--signal)" : t.type === "refund" ? "var(--action)" : undefined }}>
                  {t.type}
                </span>
                <a href={txUrl(t.txHash)} target="_blank" rel="noreferrer noopener" className="mono truncate t-mono-xs text-[var(--ink-2)] hover:text-[var(--signal)]">
                  {t.txHash}
                </a>
                <span className="numeral t-small sm:text-right">${(t.amountUnits / 1e6).toFixed(2)}</span>
                <span className="sm:text-right">
                  <Stamp tone={t.status === "confirmed" ? "signal" : t.status === "failed" ? "alarm" : "muted"}>{t.status}</Stamp>
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </>
  );
}
