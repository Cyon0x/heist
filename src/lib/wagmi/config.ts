"use client";

/**
 * Wallet layer (see docs/ARCHITECTURE.md §12).
 *
 * wagmi is used purely as a connection adapter over EIP-1193 / EIP-6963, so any
 * injected EVM wallet that announces itself is supported — we never hard-code a
 * vendor list. Arc is the only chain we accept; anything else is a wrong-network
 * state the UI must resolve before a stake can be placed.
 *
 * Discovery is left to EIP-6963 (`multiInjectedProviderDiscovery`), which every
 * current wallet speaks. Importing wagmi's connector barrel would pull in the
 * Coinbase/Base account connectors and their optional x402 dependencies, which
 * HEIST never uses.
 */

import { createConfig, http } from "wagmi";
import { ARC } from "@/lib/arc/chain";

export const wagmiConfig = createConfig({
  chains: [ARC] as const,
  multiInjectedProviderDiscovery: true,
  transports: {
    [ARC.id]: http(ARC.rpcUrls.default.http[0], { batch: true }),
  },
  ssr: true,
});

export const shortAddress = (a: string | undefined | null, head = 6, tail = 4) =>
  !a ? "" : a.length <= head + tail + 2 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`;
