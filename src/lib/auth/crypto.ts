import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { serverEnv } from "../env";

/**
 * AES-256-GCM for managed-wallet keys. A database dump alone is not enough to
 * sign for a user: the key lives only in WALLET_ENCRYPTION_KEY.
 */
function key(): Buffer {
  const secret = serverEnv().walletKey || "heist-dev-wallet-key-not-for-production-000";
  return createHash("sha256").update(secret).digest();
}

export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${enc.toString("base64url")}.${tag.toString("base64url")}`;
}

export function open(sealed: string): string {
  const [v, iv, data, tag] = sealed.split(".");
  if (v !== "v1" || !iv || !data || !tag) throw new Error("malformed sealed key");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Constant-time-ish comparison for signatures and tokens. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return ha.equals(hb) && a.length === b.length;
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}
