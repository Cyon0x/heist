"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/ui/wordmark";
import { WalletControl } from "@/components/wallet-control";

const NAV = [
  { href: "/play", label: "Lobby" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/history", label: "Matches" },
  { href: "/profile", label: "Profile" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--rule)] bg-[rgba(8,11,16,0.82)] backdrop-blur-[14px]">
      <div className="shell flex h-[60px] items-center gap-6">
        <Link href="/" className="shrink-0 text-[var(--ink)] hover:text-[var(--action)]" aria-label="HEIST home">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="label px-3 py-2 transition-colors"
                style={{ color: active ? "var(--action)" : undefined }}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="mono hidden items-center gap-2 text-[0.625rem] tracking-[0.18em] text-[var(--ink-3)] xl:inline-flex">
            <i className="inline-block size-[5px] bg-[var(--signal)] blink" aria-hidden />
            ARC MAINNET · 5042
          </span>
          <WalletControl />
        </div>
      </div>
    </header>
  );
}
