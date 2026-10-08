"use client";

import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http } from "viem";
import { ARC } from "@/lib/arc/chain";

const client = createPublicClient({ chain: ARC, transport: http(ARC.rpcUrls.default.http[0], { batch: true }) });

/** Native USDC on Arc is 18-decimal; the ERC-20 view of the same asset is 6. */
export function formatNativeUsdc(wei: bigint, dp = 2) {
  const base = 10n ** 18n;
  const whole = wei / base;
  const frac = (wei % base).toString().padStart(18, "0").slice(0, dp);
  return `${whole}.${frac}`;
}

export function useArcBalance(address: string | null | undefined) {
  return useQuery({
    queryKey: ["arc-balance", address?.toLowerCase() ?? "none"],
    enabled: Boolean(address),
    refetchInterval: 30_000,
    queryFn: async () => {
      const value = await client.getBalance({ address: address as `0x${string}` });
      return formatNativeUsdc(value, 2);
    },
  });
}
