import Link from "next/link";
import { FacilityPlan } from "@/components/landing/facility-plan";
import { VaultAperture } from "@/components/ui/VaultAperture";
import { Panel, SceneHead, Stamp } from "@/components/ui/primitives";
import { STAKE_MAX, STAKE_MIN } from "@/lib/arc/chain";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <TheFacility />
      <TheLedger />
      <FinalCall />
    </>
  );
}

/* ------------------------------------------------------------------- hero --- */

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-[var(--rule)]">
      <div className="shell grid items-center gap-14 py-[clamp(3rem,7vw,7rem)] lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
        <div className="enter">
          <div className="flex flex-wrap items-center gap-3">
            <Stamp tone="live">
              <i className="inline-block size-[5px] bg-[var(--action)] blink" aria-hidden /> Live on Arc Mainnet
            </Stamp>
            <span className="label">Facility Kestrel · 03:40</span>
          </div>

          <h1 className="stencil mt-[clamp(1.75rem,4vw,3rem)] t-display">
            <span className="block">Steal.</span>
            <span className="block">Outsmart.</span>
            <span className="block text-[var(--action)]">Escape.</span>
          </h1>

          <p className="mt-8 max-w-[52ch] t-lede text-[var(--ink-2)]">
            Two thieves enter the same high-security facility for one Core. Breach the vault, take it, and get out
            before the other does it first. Three to five minutes. No second chances on the second death.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/play" className="btn btn-action">
              Play now
            </Link>
            <Link href="#how" className="btn btn-ghost">
              How it works
            </Link>
          </div>

          <dl className="mt-12 grid max-w-lg grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
            {[
              ["Format", "1 v 1"],
              ["Match", "3–5 min"],
              ["Stake", `$${STAKE_MIN}–$${STAKE_MAX}`],
              ["To winner", "90%"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="label">{k}</dt>
                <dd className="numeral mt-1 t-h3 whitespace-nowrap">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="enter relative grid place-items-center">
          <Telemetry />
          <div className="w-[min(78vw,460px)] max-w-full">
            <VaultAperture fluid state="searching" progress={0.42} />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Four corner readouts, arranged so the eye reads them clockwise like a HUD. */
function Telemetry() {
  const items = [
    { k: "Cameras", v: "06 online", t: "var(--alarm)" },
    { k: "Vault integrity", v: "100%", t: "var(--action)" },
    { k: "Core", v: "Secured", t: "var(--signal)" },
    { k: "Extraction", v: "A / B ready", t: "var(--signal)" },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 hidden sm:block" aria-hidden>
      <div className="absolute left-0 top-2">
        <HudItem {...items[0]} />
      </div>
      <div className="absolute right-0 top-2 text-right">
        <HudItem {...items[1]} align="right" />
      </div>
      <div className="absolute bottom-2 left-0">
        <HudItem {...items[2]} />
      </div>
      <div className="absolute bottom-2 right-0 text-right">
        <HudItem {...items[3]} align="right" />
      </div>
    </div>
  );
}

function HudItem({ k, v, t, align = "left" }: { k: string; v: string; t: string; align?: "left" | "right" }) {
  return (
    <div className={align === "right" ? "border-r-2 pr-3" : "border-l-2 pl-3"} style={{ borderColor: t, width: "min(30vw,190px)" }}>
      <div className="label">{k}</div>
      <div className="label mt-1" style={{ color: t }}>
        {v}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ how it works -- */

const STEPS = [
  {
    n: "01",
    title: "Infiltrate",
    body:
      "Spawn on opposite sides of Facility Kestrel with nothing but a sidearm, a dash and two lives. Cameras sweep the corridors. Every step you take can be heard.",
    detail: ["Enter from the west or east wing", "Walk quiet, run loud", "Two lives, then you are out"],
  },
  {
    n: "02",
    title: "Steal",
    body:
      "Hack the camera terminal, then the vault terminal in the server room. The Core is sealed until both are down — and the moment you break the seal, your opponent knows.",
    detail: ["Kill the camera network", "Breach the vault terminal", "Take the Core — become the target"],
  },
  {
    n: "03",
    title: "Escape",
    body:
      "Carry the Core to Extraction A or B and hold the zone. Extraction A is fast and exposed; B is slow and covered. Lockdown closes in at sixty seconds.",
    detail: ["A: 4s, wide open", "B: 7s, behind cover", "Whoever extracts, wins"],
  },
];

function HowItWorks() {
  return (
    <section id="how" className="scene">
      <div className="shell">
        <SceneHead index="01 / HOW IT WORKS" title="Six moves, one Core" lede="Explore, hack, disable, track, hunt, escape. The Core can change hands more than once before anyone walks out." />

        <ol className="grid gap-x-10 gap-y-14 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.n} className={i === 1 ? "md:mt-14" : i === 2 ? "md:mt-28" : undefined}>
              <div className="flex items-baseline gap-4 border-b border-[var(--rule-strong)] pb-4">
                <span
                  className="stencil text-[clamp(3rem,7vw,5.25rem)] leading-[0.8]"
                  style={{ color: "transparent", WebkitTextStroke: "1px var(--rule-strong)" }}
                >
                  {step.n}
                </span>
                <h3 className="stencil t-h3">{step.title}</h3>
              </div>
              <p className="mt-4 t-small text-[var(--ink-2)]">{step.body}</p>
              <ul className="mt-5 space-y-1.5">
                {step.detail.map((d) => (
                  <li key={d} className="mono flex gap-2 text-[0.6875rem] text-[var(--ink-3)]">
                    <span aria-hidden className="text-[var(--action)]">
                      ›
                    </span>
                    {d}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- the facility - */

const ROOM_NOTES: { name: string; note: string; tone?: "action" | "signal" | "alarm" }[] = [
  { name: "Central Vault", note: "The Core. Sealed behind a single blast door until the vault terminal falls.", tone: "action" },
  { name: "Security Room", note: "Camera-control terminal. Take it down and the facility stops seeing you.", tone: "signal" },
  { name: "Server Room", note: "Vault terminal, long sightlines, and the shortest line into the east wing.", tone: "action" },
  { name: "Armory", note: "Dense cover and a north-spine flank nobody expects.", tone: "signal" },
  { name: "West / East Wing", note: "Where both operatives spawn. Health and stamina sit on the wings." },
  { name: "Maintenance", note: "The south crossing. Narrow, loud, and the fastest way to Extraction A." },
  { name: "Extraction A", note: "4-second channel. Wide open on the east side.", tone: "alarm" },
  { name: "Extraction B", note: "7-second channel, behind cover on the west.", tone: "signal" },
];

function TheFacility() {
  return (
    <section className="scene border-y border-[var(--rule)] bg-[var(--ground-3)]">
      <div className="shell">
        <SceneHead
          index="02 / FACILITY KESTREL"
          title="One map. Every room costs something."
          lede="No filler space. Each corridor is a bet: the fast route is always the loud one."
        />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <Panel className="h-fit self-start overflow-hidden p-2 sm:p-3">
            <FacilityPlan className="h-auto w-full" />
          </Panel>
          <div className="grid gap-px self-start bg-[var(--rule)]">
            {ROOM_NOTES.map((room) => (
              <div key={room.name} className="flex gap-4 bg-[var(--ground-3)] px-1 py-3.5">
                <span
                  className="mt-[0.45rem] size-[6px] shrink-0"
                  style={{ background: room.tone ? `var(--${room.tone})` : "var(--ink-3)" }}
                  aria-hidden
                />
                <div>
                  <div className="t-small font-semibold">{room.name}</div>
                  <p className="mt-0.5 t-meta text-[var(--ink-2)]">{room.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- the ledger - */

function TheLedger() {
  const stake = 100;
  const pot = stake * 2;
  const win = pot * 0.9;
  const fee = pot * 0.1;
  return (
    <section className="scene">
      <div className="shell">
        <SceneHead
          index="03 / THE LEDGER"
          title="Skill decides the match. USDC decides the prize."
          lede="Your stake changes the pot and nothing else — not health, not speed, not weapons, not access."
        />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <Panel className="p-6 sm:p-8">
            <div className="relative">
              <div className="label label-action">Worked example</div>

              <div className="mt-6 grid grid-cols-2 gap-6">
                <EntryBlock label="Your entry" value={`$${stake.toFixed(2)}`} />
                <EntryBlock label="Opponent entry" value={`$${stake.toFixed(2)}`} />
              </div>

              <div className="mt-6 flex items-end justify-between gap-4 border-y border-[var(--rule)] py-5">
                <span className="label">Prize pot</span>
                <span className="numeral t-h2 font-semibold">${pot.toFixed(2)}</span>
              </div>

              <div className="mt-6">
                <div className="flex h-14 w-full overflow-hidden clip-tag">
                  <div className="grid flex-[9] place-items-center bg-[var(--action)] text-[var(--action-ink)]">
                    <span className="mono text-[0.6875rem] font-semibold tracking-[0.14em]">90% WINNER · ${win.toFixed(2)}</span>
                  </div>
                  <div className="grid flex-[1] place-items-center bg-[var(--surface-3)]">
                    <span className="mono text-[0.625rem] tracking-[0.1em] text-[var(--ink-3)]">10%</span>
                  </div>
                </div>
                <p className="mono mt-3 text-[0.6875rem] text-[var(--ink-3)]">
                  Protocol fee ${fee.toFixed(2)} funds the escrow and settlement layer on Arc.
                </p>
              </div>
            </div>
          </Panel>

          <div className="space-y-4">
            <Panel flat className="border border-[var(--rule-strong)] p-6">
              <h3 className="stencil t-h3">Equal capability, always</h3>
              <p className="mt-3 t-small text-[var(--ink-2)]">
                A $1 stake and a $1,000 stake buy the identical loadout: 130 HP, one weapon, melee, dash, EMP, scanner.
                There is nothing to buy that makes you stronger.
              </p>
            </Panel>
            <Panel flat className="border border-[var(--rule-strong)] p-6">
              <h3 className="stencil t-h3">Held in escrow</h3>
              <p className="mt-3 t-small text-[var(--ink-2)]">
                Both entries lock in an onchain escrow contract before the countdown starts. The match result is
                attested by the game server and settled on Arc in one transaction — winner paid, fee taken, nothing
                routed through us by hand.
              </p>
            </Panel>
            <Panel flat className="border border-[var(--rule-strong)] p-6">
              <h3 className="stencil t-h3">Practice is free</h3>
              <p className="mt-3 t-small text-[var(--ink-2)]">
                The computer opponent plays by exactly the same rules — same map, same abilities, same information.
                It never sees through walls and never gets extra damage. Learn the vault for nothing.
              </p>
            </Panel>
          </div>
        </div>
      </div>
    </section>
  );
}

function EntryBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="numeral mt-1 t-h3">{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------- final call --- */

function FinalCall() {
  return (
    <section className="relative overflow-hidden border-t border-[var(--rule)]">
      <div className="hatch absolute inset-0 opacity-[0.14]" aria-hidden />
      <div className="shell relative flex flex-wrap items-center justify-between gap-8 py-[clamp(3rem,6vw,5.5rem)]">
        <div>
          <h2 className="stencil t-h1">Walk out with the Core.</h2>
          <p className="mt-3 max-w-[46ch] text-[var(--ink-2)]">
            Connect a wallet, pick a stake, and find an opponent anywhere in the world.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/play" className="btn btn-action">
            Play now
          </Link>
          <Link href="/play/computer" className="btn btn-ghost">
            Practice free
          </Link>
        </div>
      </div>
    </section>
  );
}
