import Link from "next/link";
import type { ReactNode } from "react";

/** Shared shell for Terms and Privacy so both read as one document family. */
export function LegalPage({
  code,
  title,
  updated,
  intro,
  children,
}: {
  code: string;
  title: string;
  updated: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="shell grid gap-12 py-12 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:h-fit">
        <div className="label label-action">{code}</div>
        <h1 className="stencil t-h2 mt-3">{title}</h1>
        <p className="mono mt-3 t-mono-xs text-[var(--ink-3)]">Last updated {updated}</p>
        <nav className="mt-6 space-y-2 border-t border-[var(--rule)] pt-5">
          <Link href="/terms" className="block label hover:text-[var(--ink)]" style={{ color: code === "LEGAL / TERMS" ? "var(--action)" : undefined }}>
            Terms &amp; Conditions
          </Link>
          <Link href="/privacy" className="block label hover:text-[var(--ink)]" style={{ color: code === "LEGAL / PRIVACY" ? "var(--action)" : undefined }}>
            Privacy Policy
          </Link>
        </nav>
        <p className="mono mt-6 t-mono-xs leading-relaxed text-[var(--ink-3)]">
          HEIST involves real-value USDC stakes. Read this document before entering a paid match.
        </p>
      </aside>

      <article className="max-w-[74ch]">
        <p className="t-lede text-[var(--ink-2)]">{intro}</p>
        <div className="mt-10 space-y-9">{children}</div>
      </article>
    </div>
  );
}

export function Clause({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="scroll-mt-24" id={`clause-${n}`}>
      <h2 className="flex items-baseline gap-4 border-b border-[var(--rule)] pb-3">
        <span className="mono t-label tracking-[0.14em] text-[var(--action)]">{n}</span>
        <span className="stencil t-h3">{title}</span>
      </h2>
      <div className="mt-4 space-y-3 t-small leading-relaxed text-[var(--ink-2)] [&_strong]:text-[var(--ink)] [&_ul]:mt-2 [&_ul]:space-y-2 [&_ul]:pl-0 [&_li]:list-none">
        {children}
      </div>
    </section>
  );
}

export function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span className="mt-[0.45rem] size-[5px] shrink-0 bg-[var(--action)]" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
