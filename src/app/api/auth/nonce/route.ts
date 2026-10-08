import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { newNonce } from "@/lib/auth/wallet-auth";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const NONCE_COOKIE = "heist_nonce";

export async function POST(request: Request) {
  const env = serverEnv();
  const domain = (() => {
    const header = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (header) return header;
    try {
      return new URL(env.appUrl).host;
    } catch {
      return "localhost:4320";
    }
  })();

  const nonce = newNonce();
  const issuedAt = new Date().toISOString();
  const jar = await cookies();
  jar.set(NONCE_COOKIE, JSON.stringify({ nonce, issuedAt, domain }), {
    httpOnly: true,
    sameSite: "strict",
    secure: env.isProd,
    path: "/",
    maxAge: 300,
  });
  return NextResponse.json({ nonce, issuedAt, domain });
}
