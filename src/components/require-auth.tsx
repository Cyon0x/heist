"use client";

import type { ReactNode } from "react";
import { useSession } from "@/lib/hooks/use-session";
import { Panel, Stamp } from "@/components/ui/primitives";

/**
 * Gate for every screen that needs an account. Shows a deliberate locked state
 * rather than an empty shell, and always offers the way out.
 */
export function RequireAuth({ children, what = "this screen" }: { children: ReactNode; what?: string }) {
  const { data, isLoading, isError } = useSession();

  if (isLoading) {
    return (
      <Panel className="p-8">
        <div className="label label-signal">Verifying session…</div>
        <div className="mt-4 h-[3px] w-40 bg-[var(--rule)]">
          <div className="indeterminate h-full w-1/3 bg-[var(--signal)]" />
        </div>
      </Panel>
    );
  }

  if (isError || !data?.session) {
    return (
      <Panel className="p-8">
        <div className="relative">
          <Stamp tone="live">Access control</Stamp>
          <h2 className="stencil t-h2 mt-4">Connect wallet to continue</h2>
          <p className="mt-3 max-w-[52ch] text-[var(--t-small)] text-[var(--ink-2)]">
            {what} is tied to your operator profile. Connect an EVM wallet on Arc, or continue with Google or X to have
            one created for you.
          </p>
          <p className="mono mt-6 t-mono-xs text-[var(--ink-3)]">
            Use the <span className="text-[var(--action)]">CONNECT WALLET</span> control in the header. No stake is
            taken until you confirm a paid entry.
          </p>
        </div>
      </Panel>
    );
  }

  return <>{children}</>;
}
