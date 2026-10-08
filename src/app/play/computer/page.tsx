"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Arena } from "@/components/game/Arena";
import { Panel, Stamp } from "@/components/ui/primitives";
import { SKILLS, type Difficulty } from "@/game/ai";
import { useMe } from "@/lib/hooks/use-me";
import { useSession } from "@/lib/hooks/use-session";

const ORDER: Difficulty[] = ["recruit", "professional", "veteran", "mastermind"];

const BRIEF: Record<Difficulty, { label: string; note: string; threat: number }> = {
  recruit: { label: "Recruit", note: "Learns the route, fumbles the ambush. Start here.", threat: 1 },
  professional: { label: "Professional", note: "Hacks on schedule and will punish a slow breach.", threat: 2 },
  veteran: { label: "Veteran", note: "Clears the camera net, sets up on the vault door, hunts the carrier.", threat: 3 },
  mastermind: { label: "Mastermind", note: "Wins the information war. Expect it to know where you are going.", threat: 4 },
};

export default function ComputerPage() {
  const router = useRouter();
  const [difficulty, setDifficulty] = useState<Difficulty>("professional");
  const [running, setRunning] = useState(false);
  const { data: me } = useMe();
  const { data: session } = useSession();

  const name = me?.user?.username ?? session?.session?.username ?? "OPERATIVE";

  const onExit = useCallback(() => {
    setRunning(false);
    router.push("/play");
  }, [router]);

  if (running) {
    return (
      <div className="fixed inset-0 z-[60] bg-[var(--ground)]">
        <Arena mode="ai" difficulty={difficulty} playerName={name} opponentName={BRIEF[difficulty].label} onExit={onExit} />
      </div>
    );
  }

  return (
    <div className="shell py-10">
      <header className="scene-index">
        <span className="mono t-label tracking-[0.18em] text-[var(--action)]">PRACTICE</span>
        <h1 className="stencil t-h2">Play computer</h1>
        <p className="ml-auto hidden max-w-[44ch] t-small text-[var(--ink-2)] lg:block">
          No stake, no settlement. The opponent reads the same map you do, through the same abilities, with the same
          information limits.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.62fr)]">
        <div className="grid gap-3">
          {ORDER.map((d) => {
            const active = d === difficulty;
            const skill = SKILLS[d];
            return (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className="text-left"
                aria-pressed={active}
              >
                <Panel live={active} className={`transition-colors ${active ? "" : "border border-[var(--rule)] hover:border-[var(--rule-strong)]"}`}>
                  <div className="relative flex flex-wrap items-center gap-x-5 gap-y-3 p-5">
                    <div className="flex shrink-0 gap-1" aria-hidden>
                      {[1, 2, 3, 4].map((n) => (
                        <span
                          key={n}
                          className="block h-8 w-[5px]"
                          style={{ background: n <= BRIEF[d].threat ? (active ? "var(--action)" : "var(--ink-3)") : "var(--rule)" }}
                        />
                      ))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-3">
                        <span className={`stencil t-h3 ${active ? "text-[var(--action)]" : ""}`}>{BRIEF[d].label}</span>
                        <span className="label">reaction {Math.round(skill.reaction / 30 * 1000)}ms</span>
                      </div>
                      <p className="mt-1 t-small text-[var(--ink-2)]">{BRIEF[d].note}</p>
                    </div>
                    {active && <span className="hidden sm:block"><Stamp tone="live">Selected</Stamp></span>}
                  </div>
                </Panel>
              </button>
            );
          })}
        </div>

        <div className="grid content-start gap-6">
          <Panel className="p-6">
            <div className="relative">
              <div className="label label-action">Deployment</div>
              <dl className="mt-4 space-y-3">
                <Row k="Map" v="Facility Kestrel" />
                <Row k="Format" v="1 v 1 · best of one" />
                <Row k="Lives" v="2 each" />
                <Row k="Stake" v="None" />
                <Row k="Opponent" v={BRIEF[difficulty].label} />
              </dl>
              <button className="btn btn-action mt-6 w-full" onClick={() => setRunning(true)}>
                Enter facility
              </button>
              <Link href="/play" className="btn btn-ghost mt-2 w-full">
                Back to lobby
              </Link>
            </div>
          </Panel>

          <Panel flat className="border border-[var(--rule)] p-6">
            <h2 className="label">Controls</h2>
            <dl className="mt-4 grid gap-2.5">
              {[
                ["Move", "W A S D  ·  arrows"],
                ["Aim", "Mouse"],
                ["Fire", "Left click"],
                ["Dash", "Space"],
                ["Sprint", "Shift (hold)"],
                ["Melee", "V"],
                ["EMP", "Q"],
                ["Scanner", "R"],
                ["Interact / hack", "F or E  ·  hold"],
                ["Facility plan", "Tab"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 border-b border-[var(--rule)] pb-2">
                  <dt className="t-meta text-[var(--ink-2)]">{k}</dt>
                  <dd className="mono t-mono-xs text-[var(--ink)]">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mono mt-4 t-mono-xs leading-relaxed text-[var(--ink-3)]">
              Touch devices get twin-stick controls automatically: left thumb moves, right thumb aims and fires.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--rule)] pb-2.5">
      <dt className="label">{k}</dt>
      <dd className="t-small">{v}</dd>
    </div>
  );
}
