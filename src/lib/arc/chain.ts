/**
 * Arc network configuration.
 *
 * Values are transcribed from the official Arc documentation
 * (docs.arc.io/arc/references/connect-to-arc and .../contract-addresses) rather
 * than pulled from a library constant, so they are auditable and cannot drift
 * silently underneath us. Arc Mainnet chain id 5042, native gas token USDC.
 *
 * NOTE ON DECIMALS — the single easiest way to lose money on Arc:
 *   native USDC (msg.value, gas, `balance`) = 18 decimals
 *   the ERC-20 interface at 0x3600…0000  =  6 decimals
 * These are the same asset. Never compare them without scaling by 10^12.
 */

import { defineChain } from "viem";

export const ARC_MAINNET = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc.mainnet.arc.io"],
      webSocket: ["wss://rpc.quicknode.mainnet.arc.io"],
    },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
});

export const ARC_TESTNET = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.io"],
      webSocket: ["wss://rpc.testnet.arc.io"],
    },
  },
  blockExplorers: {
    default: { name: "Arc Testnet Explorer", url: "https://explorer.testnet.arc.io" },
  },
  testnet: true,
});

export const ARC_TESTNET_MODE = process.env.NEXT_PUBLIC_ARC_NETWORK === "testnet";

/**
 * The active chain. Typed as mainnet so every downstream `ARC.id` is the literal
 * 5042 and transports stay exhaustive; in testnet mode the *runtime* value is
 * the testnet chain, which is why `ARC_TESTNET_MODE` is exported separately.
 */
export const ARC: typeof ARC_MAINNET = ARC_TESTNET_MODE
  ? (ARC_TESTNET as unknown as typeof ARC_MAINNET)
  : ARC_MAINNET;
export const ARC_CHAIN_ID = ARC.id;
export const ARC_RPC = ARC.rpcUrls.default.http[0]!;
export const ARC_EXPLORER = ARC.blockExplorers.default.url;

/** Optional ERC-20 interface over the native USDC balance. 6 decimals. */
export const USDC_EVM = "0x3600000000000000000000000000000000000000" as const;
export const USDC_DECIMALS = 6;
/** Arc enforces a 20 Gwei floor; anything lower is silently dropped by the mempool. */
export const ARC_MIN_MAX_FEE_PER_GAS = 20_000_000_000n;

export const txUrl = (hash: string) => `${ARC_EXPLORER}/tx/${hash}`;
export const addressUrl = (address: string) => `${ARC_EXPLORER}/address/${address}`;

/** 12.5 USDC → 12500000n (6 dp). Uses string math to avoid float drift. */
export function usdcToUnits(amount: number): bigint {
  const fixed = amount.toFixed(USDC_DECIMALS);
  const [whole, frac = ""] = fixed.split(".");
  return BigInt(whole!) * 10n ** BigInt(USDC_DECIMALS) + BigInt(frac.padEnd(USDC_DECIMALS, "0"));
}

export function formatUsdc(units: bigint, dp = 2): string {
  const neg = units < 0n;
  const v = neg ? -units : units;
  const base = 10n ** BigInt(USDC_DECIMALS);
  const whole = v / base;
  const frac = (v % base).toString().padStart(USDC_DECIMALS, "0").slice(0, dp);
  return `${neg ? "-" : ""}${whole}${dp > 0 ? `.${frac}` : ""}`;
}

/** Stake limits, enforced server-side (§32). */
export const STAKE_MIN = 1;
export const STAKE_MAX = 1000;
export const STAKE_PRESETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000] as const;
export const PROTOCOL_FEE_BPS = 1000; // 10%
