import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomToken } from "@/lib/auth/crypto";
import { authorizeUrl, createPkcePair, providerConfigured, type OAuthProvider } from "@/lib/auth/oauth";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "heist_oauth";

export async function GET(request: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (provider !== "google" && provider !== "x") {
    return NextResponse.redirect(new URL("/?auth=unsupported", request.url));
  }
  if (!providerConfigured(provider)) {
    return NextResponse.redirect(new URL(`/?auth=not_configured&provider=${provider}`, request.url));
  }
  const env = serverEnv();
  const state = randomToken(16);
  const { verifier, challenge } = createPkcePair();
  const jar = await cookies();
  jar.set(STATE_COOKIE, JSON.stringify({ provider, state, verifier, next: new URL(request.url).searchParams.get("next") ?? "/play" }), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    path: "/",
    maxAge: 600,
  });
  const url = authorizeUrl({ provider: provider as OAuthProvider, state, codeChallenge: challenge, appUrl: env.appUrl });
  return NextResponse.redirect(url);
}
