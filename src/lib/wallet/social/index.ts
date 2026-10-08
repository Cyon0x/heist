import "server-only";
import { open, seal } from "@/lib/auth/crypto";
import { EmbeddedArcWallet, type SocialWalletProvider } from "./provider";

let cached: SocialWalletProvider | null = null;

/** The active managed-wallet provider. Swap this line to change providers. */
export function socialWalletProvider(): SocialWalletProvider {
  if (!cached) cached = new EmbeddedArcWallet(seal, open);
  return cached;
}

export type { SocialWalletProvider };
