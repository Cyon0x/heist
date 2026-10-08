import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { serverEnv } from "../env";

const COOKIE = "heist_session";
const AUD = "heist";

export interface Session {
  userId: string;
  username: string;
  address: string | null;
  provider: "wallet" | "google" | "x";
  /** Terms acceptance is required before any paid match (§57). */
  acceptedTermsAt: string | null;
}

function key(): Uint8Array {
  const secret = serverEnv().sessionSecret;
  if (!secret) {
    // Development-only fallback. Production refuses to boot without a secret.
    return new TextEncoder().encode("heist-dev-session-secret-do-not-ship-000000");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(session: Session): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(AUD)
    .setIssuer("heist")
    .setExpirationTime("30d")
    .sign(key());
}

export async function readSessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { audience: AUD, issuer: "heist" });
    return {
      userId: String(payload.userId),
      username: String(payload.username),
      address: (payload.address as string | null) ?? null,
      provider: payload.provider as Session["provider"],
      acceptedTermsAt: (payload.acceptedTermsAt as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

export async function currentSession(): Promise<Session | null> {
  const jar = await cookies();
  return readSessionToken(jar.get(COOKIE)?.value);
}

export async function setSessionCookie(session: Session) {
  const jar = await cookies();
  jar.set(COOKIE, await signSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: serverEnv().isProd,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export const SESSION_COOKIE = COOKIE;
