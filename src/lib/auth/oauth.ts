import "server-only";
import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { serverEnv } from "../env";
import { randomToken } from "./crypto";

export type OAuthProvider = "google" | "x";

export interface ProviderProfile {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string | null;
  displayName: string | null;
  avatar: string | null;
}

export function providerConfigured(provider: OAuthProvider): boolean {
  const env = serverEnv();
  return provider === "google"
    ? Boolean(env.google.id && env.google.secret)
    : Boolean(env.x.id && env.x.secret);
}

export function configuredProviders(): OAuthProvider[] {
  return (["google", "x"] as OAuthProvider[]).filter(providerConfigured);
}

function credentials(provider: OAuthProvider) {
  const env = serverEnv();
  if (provider === "google") return { clientId: env.google.id, clientSecret: env.google.secret };
  return { clientId: env.x.id, clientSecret: env.x.secret };
}

export function redirectUri(provider: OAuthProvider, appUrl: string): string {
  return `${appUrl}/api/auth/oauth/${provider}/callback`;
}

export function createPkcePair() {
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function authorizeUrl(input: {
  provider: OAuthProvider; state: string; codeChallenge: string; appUrl: string;
}): string {
  const { clientId } = credentials(input.provider);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(input.provider, input.appUrl),
    response_type: "code",
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  if (input.provider === "google") {
    params.set("scope", "openid email profile");
    params.set("access_type", "online");
    params.set("prompt", "select_account");
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  params.set("scope", "users.read tweet.read");
  return `https://twitter.com/i/oauth2/authorize?${params}`;
}

export async function exchangeCode(input: {
  provider: OAuthProvider; code: string; codeVerifier: string; appUrl: string;
}): Promise<{ accessToken: string; idToken: string | null }> {
  const { clientId, clientSecret } = credentials(input.provider);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: redirectUri(input.provider, input.appUrl),
    client_id: clientId,
    code_verifier: input.codeVerifier,
  });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (input.provider === "x") {
    headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  } else {
    body.set("client_secret", clientSecret);
  }
  const res = await fetch(
    input.provider === "google"
      ? "https://oauth2.googleapis.com/token"
      : "https://api.twitter.com/2/oauth2/token",
    { method: "POST", headers, body },
  );
  if (!res.ok) throw new Error(`${input.provider} token exchange failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; id_token?: string };
  return { accessToken: json.access_token, idToken: json.id_token ?? null };
}

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export async function fetchProfile(input: {
  provider: OAuthProvider; accessToken: string; idToken: string | null;
}): Promise<ProviderProfile> {
  if (input.provider === "google") {
    if (!input.idToken) throw new Error("google returned no id_token");
    const { payload } = await jwtVerify(input.idToken, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: credentials("google").clientId,
    });
    return {
      provider: "google",
      providerAccountId: String(payload.sub),
      email: (payload.email as string) ?? null,
      displayName: (payload.name as string) ?? (payload.email as string)?.split("@")[0] ?? null,
      avatar: (payload.picture as string) ?? null,
    };
  }
  const res = await fetch("https://api.twitter.com/2/users/me?user.fields=profile_image_url,name,username", {
    headers: { authorization: `Bearer ${input.accessToken}` },
  });
  if (!res.ok) throw new Error(`x profile fetch failed: ${res.status}`);
  const json = (await res.json()) as { data: { id: string; name: string; username: string; profile_image_url?: string } };
  return {
    provider: "x",
    providerAccountId: json.data.id,
    email: null,
    displayName: json.data.name || json.data.username,
    avatar: json.data.profile_image_url ?? null,
  };
}
