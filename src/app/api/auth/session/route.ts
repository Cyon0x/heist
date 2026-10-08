import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getAddress } from "viem";
import { getStore, sanitizeUsername } from "@/lib/db/store";
import { configuredProviders } from "@/lib/auth/oauth";
import { buildMessage } from "@/lib/arc/siwe";
import { verifyWalletSignature } from "@/lib/auth/wallet-auth";
import { clearSessionCookie, currentSession, setSessionCookie } from "@/lib/auth/session";
import { isEscrowConfigured, serverEnv } from "@/lib/env";
import { ARC, ARC_CHAIN_ID, ARC_EXPLORER } from "@/lib/arc/chain";

export const dynamic = "force-dynamic";

const NONCE_COOKIE = "heist_nonce";

async function payload() {
  const session = await currentSession();
  const store = await getStore();
  const user = session ? await store.getUser(session.userId) : null;
  const stats = user ? await store.getStats(user.id) : null;
  const wallets = user ? await store.getWallets(user.id) : [];
  return {
    session,
    user: user ? { ...user, stats, wallets: wallets.map((w) => ({ address: w.address, type: w.type, chain: w.chain })) } : null,
    capabilities: {
      google: configuredProviders().includes("google"),
      x: configuredProviders().includes("x"),
      managedWallet: true,
      escrow: isEscrowConfigured(),
      // Without a game server there is no shared simulation, so two people on
      // different machines cannot actually play each other. The UI has to be
      // able to say that rather than silently giving each player their own
      // private copy of the match.
      realtime: Boolean(serverEnv().gameServerUrl && serverEnv().gameServerSecret),
      store: store.driver,
    },
    network: { chainId: ARC_CHAIN_ID, name: ARC.name, explorer: ARC_EXPLORER },
  };
}

export async function GET() {
  return NextResponse.json(await payload());
}

const body = z.object({
  address: z.string(),
  signature: z.string(),
  username: z.string().optional(),
});

/** Sign in with an injected EVM wallet (SIWE-shaped, nonce bound to a cookie). */
export async function POST(request: Request) {
  const jar = await cookies();
  const raw = jar.get(NONCE_COOKIE)?.value;
  if (!raw) return NextResponse.json({ error: "NONCE_EXPIRED" }, { status: 400 });

  let nonce: string;
  let issuedAt: string;
  let domain: string;
  try {
    ({ nonce, issuedAt, domain } = JSON.parse(raw) as { nonce: string; issuedAt: string; domain: string });
  } catch {
    return NextResponse.json({ error: "NONCE_EXPIRED" }, { status: 400 });
  }

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const message = buildMessage({ domain, address: getAddress(parsed.data.address), nonce, issuedAt });
  const verified = await verifyWalletSignature({
    address: parsed.data.address,
    message,
    signature: parsed.data.signature,
  });
  if (!verified) return NextResponse.json({ error: "BAD_SIGNATURE" }, { status: 401 });

  jar.delete(NONCE_COOKIE);

  const store = await getStore();
  let user = await store.findUserByAddress(verified);
  let created = false;
  if (!user) {
    user = await store.createUser(sanitizeUsername(parsed.data.username || ""), "wallet");
    await store.addWallet(user.id, verified, "injected");
    created = true;
  } else {
    const owned = await store.getWallets(user.id);
    if (!owned.some((w) => w.address.toLowerCase() === verified.toLowerCase())) {
      await store.addWallet(user.id, verified, "injected");
    }
  }

  const existing = await currentSession();
  await setSessionCookie({
    userId: user.id,
    username: user.username,
    address: verified,
    provider: "wallet",
    acceptedTermsAt: existing?.userId === user.id ? existing.acceptedTermsAt : null,
  });

  return NextResponse.json({ ...(await payload()), created });
}

export async function DELETE() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
