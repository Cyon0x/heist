import { NextResponse } from "next/server";
import { currentSession, setSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Terms acceptance is stamped into the session so a paid match can require it. */
export async function POST() {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "NOT_SIGNED_IN" }, { status: 401 });
  const at = new Date().toISOString();
  await setSessionCookie({ ...session, acceptedTermsAt: at });
  return NextResponse.json({ acceptedTermsAt: at });
}
