"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { setSound as persistSound, useSoundPreference } from "@/lib/hooks/use-sound";
import { Panel, Readout, Stamp } from "@/components/ui/primitives";
import { RequireAuth } from "@/components/require-auth";
import { useMe } from "@/lib/hooks/use-me";
import { useSession } from "@/lib/hooks/use-session";

const subscribeMotion = (cb: () => void) => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export default function SettingsPage() {
  return (
    <div className="shell py-10">
      <RequireAuth what="Settings">
        <Settings />
      </RequireAuth>
    </div>
  );
}

function Settings() {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: session } = useSession();
  const sound = useSoundPreference();
  const reduced = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );

  const toggleSound = () => {
    persistSound(!sound);
  };

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    router.push("/");
    router.refresh();
  };

  return (
    <>
      <header className="scene-index">
        <span className="mono t-label tracking-[0.18em] text-[var(--action)]">ACCOUNT</span>
        <h1 className="stencil t-h2">Settings</h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-6">
          <h2 className="label">Preferences</h2>
          <Toggle
            label="Facility audio"
            note="Ambience, footsteps, alarms and extraction cues."
            on={sound}
            onChange={toggleSound}
          />
          <div className="mt-4 flex items-center justify-between gap-4 border-t border-[var(--rule)] pt-4">
            <span>
              <span className="block t-small">Reduced motion</span>
              <span className="mono block t-mono-xs text-[var(--ink-3)]">
                {reduced ? "Honoured from your system settings" : "Your system has motion enabled"}
              </span>
            </span>
            <Stamp tone={reduced ? "signal" : "muted"}>{reduced ? "On" : "Off"}</Stamp>
          </div>
          <p className="mono mt-4 t-mono-xs text-[var(--ink-3)]">
            Sound and motion preferences are stored locally in this browser only.
          </p>
        </Panel>

        <Panel className="p-6">
          <h2 className="label">Account</h2>
          <dl className="mt-4 grid grid-cols-2 gap-5">
            <Readout label="Username" value={me?.user?.username ?? "—"} />
            <Readout label="Sign-in method" value={session?.session?.provider ?? "—"} />
            <Readout label="Games" value={me?.stats?.games ?? 0} />
            <Readout label="Rank" value={`#${me?.rank ?? "—"}`} />
          </dl>
          <div className="mt-6 flex items-center justify-between gap-4 border-t border-[var(--rule)] pt-4">
            <span>
              <span className="block t-small">Terms acceptance</span>
              <span className="mono block t-mono-xs text-[var(--ink-3)]">
                {session?.session?.acceptedTermsAt
                  ? `Accepted ${new Date(session.session.acceptedTermsAt).toLocaleDateString()}`
                  : "Not yet accepted — required before a paid match"}
              </span>
            </span>
            <Stamp tone={session?.session?.acceptedTermsAt ? "signal" : "alarm"}>
              {session?.session?.acceptedTermsAt ? "Recorded" : "Pending"}
            </Stamp>
          </div>
        </Panel>

        <Panel className="p-6">
          <h2 className="label">Legal</h2>
          <ul className="mt-4 space-y-3">
            <li>
              <Link href="/terms" className="t-small text-[var(--ink-2)] hover:text-[var(--action)]">
                Terms &amp; Conditions →
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="t-small text-[var(--ink-2)] hover:text-[var(--action)]">
                Privacy Policy →
              </Link>
            </li>
          </ul>
          <p className="mono mt-4 t-mono-xs leading-relaxed text-[var(--ink-3)]">
            HEIST involves real-value USDC stakes. Gameplay capability is identical at every stake, and you can lose the
            amount you stake.
          </p>
        </Panel>

        <Panel flat className="border border-[var(--rule)] p-6">
          <h2 className="label">Session</h2>
          <p className="mt-4 t-small text-[var(--ink-2)]">
            Signing out clears this browser&apos;s session cookie. Your account, wallet and match history are unaffected.
          </p>
          <button className="btn btn-ghost mt-5" onClick={() => void signOut()}>
            Sign out
          </button>
        </Panel>
      </div>
    </>
  );
}

function Toggle({ label, note, on, onChange }: { label: string; note: string; on: boolean; onChange: () => void }) {
  return (
    <button
      className="mt-4 flex w-full items-center justify-between gap-4 border-t border-[var(--rule)] pt-4 text-left"
      onClick={onChange}
      role="switch"
      aria-checked={on}
    >
      <span>
        <span className="block t-small">{label}</span>
        <span className="mono block t-mono-xs text-[var(--ink-3)]">{note}</span>
      </span>
      <span className="flex items-center gap-2">
        <span className="label">{on ? "On" : "Off"}</span>
        <span className="relative block h-[18px] w-[38px] border border-[var(--rule-strong)] clip-tag bg-[var(--ground-2)]">
          <span
            className="absolute top-[2px] block h-[12px] w-[14px] transition-all"
            style={{ left: on ? 20 : 2, background: on ? "var(--action)" : "var(--rule-strong)" }}
          />
        </span>
      </span>
    </button>
  );
}
