import "server-only";
import { verifyMessage, getAddress, isAddress } from "viem";
import { randomToken } from "./crypto";

/**
 * Wallet sign-in. The nonce is a server-issued, httpOnly cookie; the message
 * binds host + nonce + address, so a signature captured on another site is
 * useless here. We verify with viem and never trust a client-supplied address
 * without a matching signature.
 */
export async function verifyWalletSignature(input: {
  address: string;
  message: string;
  signature: string;
}): Promise<string | null> {
  if (!isAddress(input.address)) return null;
  try {
    const ok = await verifyMessage({
      address: getAddress(input.address),
      message: input.message,
      signature: input.signature as `0x${string}`,
    });
    return ok ? getAddress(input.address) : null;
  } catch {
    return null;
  }
}

export const newNonce = () => randomToken(16);
