"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { ARC, ARC_CHAIN_ID } from "@/lib/arc/chain";
import { buildMessage } from "@/lib/arc/siwe";
import { useSession } from "@/lib/hooks/use-session";
import { useArcBalance } from "@/lib/hooks/use-arc-balance";
import { shortAddress } from "@/lib/wagmi/config";
import { Stamp } from "@/components/ui/primitives";

type Step = "idle" | "choosing" | "signing" | "error";

export function WalletControl() {
  const { data, refetch } = useSession();
  const qc = useQueryClient();
  const { address, isConnected } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();

  const session = data?.session ?? null;
  const shown = session?.address ?? address ?? null;
  const balance = useArcBalance(shown);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["session"] });
    await refetch();
  }, [qc, refetch]);

  const signIn = useCallback(
    async (account: string) => {
      setStep("signing");
      setMessage(null);
      try {
        const nonceRes = await fetch("/api/auth/nonce", { method: "POST", credentials: "same-origin" });
        if (!nonceRes.ok) throw new Error("Could not reach the sign-in service.");
        const { nonce, issuedAt, domain } = (await nonceRes.json()) as { nonce: string; issuedAt: string; domain: string };
        const msg = buildMessage({ domain, address: account, nonce, issuedAt });
        const provider = (window as unknown as { ethereum?: { request: (a: { method: string; params: unknown[] }) => Promise<unknown> } }).ethereum;
        if (!provider) throw new Error("No EVM wallet detected in this browser.");
        const signature = (await provider.request({ method: "personal_sign", params: [msg, account] })) as string;
        const res = await fetch("/api/auth/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ address: account, signature }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error === "BAD_SIGNATURE" ? "Signature rejected. Try again." : "Sign-in failed.");
        }
        await refresh();
        setStep("idle");
        setOpen(false);
      } catch (error) {
        setStep("error");
        setMessage(error instanceof Error ? error.message : "Sign-in failed.");
      }
    },
    [refresh],
  );

  const handleConnect = useCallback(
    async (connectorId: string) => {
      try {
        const result = await connectAsync({ connector: connectors.find((c) => c.id === connectorId)!, chainId: ARC_CHAIN_ID });
        const account = result.accounts[0];
        if (account) await signIn(account);
      } catch (error) {
        setStep("error");
        setMessage(error instanceof Error ? error.message : "Wallet connection cancelled.");
      }
    },
    [connectAsync, connectors, signIn],
  );

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    if (isConnected) await disconnectAsync().catch(() => {});
    await refresh();
  }, [disconnectAsync, isConnected, refresh]);

  const switchToArc = useCallback(async () => {
    try {
      await switchChainAsync({ chainId: ARC_CHAIN_ID });
    } catch {
      setMessage("Could not switch automatically. Add Arc in your wallet with chain id 5042.");
    }
  }, [switchChainAsync]);

  if (!session && !isConnected) {
    return (
      <>
        <button className="btn btn-action btn-sm" onClick={() => { setOpen(true); setStep("choosing"); }}>
          Connect Wallet
        </button>
        {open && (
          <ConnectDialog
            step={step}
            message={message}
            connectors={connectors.map((c) => ({ id: c.id, name: c.name }))}
            capabilities={data?.capabilities}
            onClose={() => { setOpen(false); setStep("idle"); }}
            onConnect={handleConnect}
          />
        )}
      </>
    );
  }

  if (!session && isConnected) {
    return (
      <div className="flex items-center gap-2">
        <button className="btn btn-signal btn-sm" onClick={() => signIn(address!)} disabled={step === "signing"}>
          {step === "signing" ? "Confirm in wallet…" : "Sign in"}
        </button>
        {step === "error" && <span className="label label-alarm max-w-[16ch]">{message}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link href="/wallet" className="group flex items-center gap-2.5 px-2 py-1">
        <span className="grid size-7 place-items-center border border-[var(--rule-strong)] clip-tag text-[0.6rem] font-bold tracking-wider text-[var(--action)]">
          {session!.username.slice(0, 2).toUpperCase()}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="mono block text-[0.6875rem] text-[var(--ink-2)] group-hover:text-[var(--ink)]">{session!.username}</span>
          <span className="numeral block text-[0.6875rem] text-[var(--ink-3)]">
            {balance.isSuccess ? `${balance.data} USDC` : shown ? shortAddress(shown) : "—"}
          </span>
        </span>
      </Link>
      {step === "error" && message && <span className="label label-alarm hidden max-w-[18ch] lg:block">{message}</span>}
      {isConnected && <button className="label hidden hover:text-[var(--ink)] lg:block" onClick={switchToArc}>Switch to Arc</button>}
      <button className="btn btn-ghost btn-sm" onClick={signOut} title="Sign out">
        Exit
      </button>
    </div>
  );
}

function ConnectDialog({
  step, message, connectors, capabilities, onClose, onConnect,
}: {
  step: Step;
  message: string | null;
  connectors: { id: string; name: string }[];
  capabilities?: { google: boolean; x: boolean };
  onClose: () => void;
  onConnect: (id: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(6,9,13,0.86)] p-4" role="dialog" aria-modal="true" aria-label="Connect to HEIST">
      <div className="panel w-full max-w-md p-6">
        <div className="panel-inner" />
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="label label-action">Access control</div>
              <h2 className="stencil mt-1 text-2xl">Identify yourself</h2>
            </div>
            <button className="label hover:text-[var(--ink)]" onClick={onClose} aria-label="Close">✕</button>
          </div>

          <p className="mt-3 t-small text-[var(--ink-2)]">
            A wallet is your HEIST account. Nothing is staked until you choose to enter a paid match.
          </p>

          <div className="mt-5">
            <div className="label">EVM wallet</div>
            <div className="mt-2 space-y-2">
              {connectors.length === 0 && (
                <p className="mono text-[0.75rem] text-[var(--ink-3)]">
                  No EVM wallet detected. Install a browser wallet that supports Arc, or continue with Google or X below.
                </p>
              )}
              {connectors.map((c) => (
                <button key={c.id} className="btn w-full justify-between" onClick={() => onConnect(c.id)} disabled={step === "signing"}>
                  <span>{c.name}</span>
                  <span className="label">Connect</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <div className="hairline flex-1" />
            <span className="label">or</span>
            <div className="hairline flex-1" />
          </div>

          <div className="mt-5 space-y-2">
            <SocialButton provider="google" label="Continue with Google" enabled={Boolean(capabilities?.google)} />
            <SocialButton provider="x" label="Continue with X" enabled={Boolean(capabilities?.x)} />
          </div>

          {step === "signing" && <p className="mono mt-4 text-[0.75rem] text-[var(--signal)]">Confirm the signature in your wallet — it is free and proves ownership.</p>}
          {step === "error" && message && <p className="mono mt-4 text-[0.75rem] text-[var(--alarm)]">{message}</p>}

          <p className="mono mt-6 text-[0.625rem] leading-relaxed text-[var(--ink-3)]">
            Arc Mainnet · chain id {ARC.id}. HEIST never sees your private keys — a session cookie is all it keeps.
          </p>
        </div>
      </div>
    </div>
  );
}

function SocialButton({ provider, label, enabled }: { provider: "google" | "x"; label: string; enabled: boolean }) {
  if (!enabled) {
    return (
      <button className="btn w-full justify-between" disabled title="This provider is not configured on this deployment">
        <span>{label}</span>
        <span className="label">Not configured</span>
      </button>
    );
  }
  return (
    <a className="btn w-full justify-between" href={`/api/auth/oauth/${provider}?next=/play`}>
      <span>{label}</span>
      <span className="label">Automatic wallet</span>
    </a>
  );
}

export function NetworkStamp({ chainId }: { chainId: number }) {
  const ok = chainId === ARC_CHAIN_ID;
  return <Stamp tone={ok ? "signal" : "alarm"}>{ok ? `ARC · ${chainId}` : `WRONG NETWORK · ${chainId}`}</Stamp>;
}
