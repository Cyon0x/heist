import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, fetchProfile, providerConfigured, type OAuthProvider } from "@/lib/auth/oauth";
import { getStore, sanitizeUsername } from "@/lib/db/store";
import { socialWalletProvider } from "@/lib/wallet/social";
import { setSessionCookie } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "heist_oauth";

export async function GET(request: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const jar = await cookies();
  const raw = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  if (provider !== "google" && provider !== "x") return NextResponse.redirect(new URL("/?auth=unsupported", url));
  if (!providerConfigured(provider)) return NextResponse.redirect(new URL("/?auth=not_configured", url));
  if (!code || !raw) return NextResponse.redirect(new URL("/?auth=cancelled", url));

  let stored: { provider: string; state: string; verifier: string; next: string };
  try {
    stored = JSON.parse(raw);
  } catch {
    return NextResponse.redirect(new URL("/?auth=cancelled", url));
  }
  // CSRF: the state must round-trip through an httpOnly cookie.
  if (stored.state !== returnedState || stored.provider !== provider) {
    return NextResponse.redirect(new URL("/?auth=state_mismatch", url));
  }

  try {
    const env = serverEnv();
    const tokens = await exchangeCode({ provider: provider as OAuthProvider, code, codeVerifier: stored.verifier, appUrl: env.appUrl });
    const profile = await fetchProfile({ provider: provider as OAuthProvider, accessToken: tokens.accessToken, idToken: tokens.idToken });

    const store = await getStore();
    let user = await store.getUserByExternal(profile.provider, profile.providerAccountId);
    if (!user) {
      const base = sanitizeUsername((profile.displayName ?? "operative").replace(/[^a-zA-Z0-9_]/g, "_")).slice(0, 14);
      user = await store.createUser(await uniqueUsername(base), profile.provider, undefined, profile.providerAccountId);
      const wallet = await socialWalletProvider().createWallet();
      await store.addWallet(user.id, wallet.address, "managed", wallet.encryptedKey);
    }

    const wallets = await store.getWallets(user.id);
    await setSessionCookie({
      userId: user.id,
      username: user.username,
      address: wallets.find((w) => w.type === "managed")?.address ?? wallets[0]?.address ?? null,
      provider: profile.provider,
      acceptedTermsAt: null,
    });

    return NextResponse.redirect(new URL(stored.next || "/play", env.appUrl));
  } catch (error) {
    console.error("[heist] oauth callback failed", error);
    return NextResponse.redirect(new URL("/?auth=failed", url));
  }
}

async function uniqueUsername(base: string): Promise<string> {
  const store = await getStore();
  if (!(await store.getUserByUsername(base))) return base;
  for (let i = 0; i < 50; i++) {
    const candidate = `${base.slice(0, 14)}_${Math.floor(Math.random() * 9000 + 1000)}`;
    if (!(await store.getUserByUsername(candidate))) return candidate;
  }
  return `thief${Date.now().toString(36).slice(-6)}`;
}
