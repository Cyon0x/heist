import Link from "next/link";
import { Wordmark } from "@/components/ui/wordmark";
import { ARC } from "@/lib/arc/chain";

const COLUMNS = [
  {
    title: "Play",
    links: [
      { href: "/play", label: "Lobby" },
      { href: "/play/computer", label: "Practice vs AI" },
      { href: "/play/friend", label: "Friend arena" },
      { href: "/leaderboard", label: "Leaderboard" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/profile", label: "Profile" },
      { href: "/history", label: "Match history" },
      { href: "/wallet", label: "Wallet" },
      { href: "/settings", label: "Settings" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms & Conditions" },
      { href: "/privacy", label: "Privacy Policy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-[var(--rule)] bg-[var(--ground-3)]">
      <div className="shell grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Wordmark size={26} />
          <p className="mt-4 max-w-[34ch] t-small text-[var(--ink-2)]">
            Competitive 1v1 onchain extraction. Stake USDC, steal the Core, escape with the payout.
          </p>
          <p className="mono mt-4 text-[0.6875rem] text-[var(--ink-3)]">
            Settlement on Arc Mainnet · chain id {ARC.id}
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <div className="label">{col.title}</div>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="t-small text-[var(--ink-2)] hover:text-[var(--action)]">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--rule)]">
        <div className="shell flex flex-wrap items-center justify-between gap-3 py-5">
          <span className="mono text-[0.625rem] tracking-[0.14em] text-[var(--ink-3)]">
            © {new Date().getFullYear()} HEIST PROTOCOL
          </span>
          <span className="mono max-w-[70ch] text-[0.625rem] leading-relaxed text-[var(--ink-3)]">
            Real-value USDC stakes. Gameplay capability is identical at every stake. Play responsibly; you can lose your
            stake. Availability depends on your jurisdiction.
          </span>
        </div>
      </div>
    </footer>
  );
}
