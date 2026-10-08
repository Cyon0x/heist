"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Paid entries require explicit acceptance (§57). The stamp is written into the
 * signed session, so a server route can enforce it rather than trusting this
 * checkbox alone.
 */
export function TermsGate({ accepted, onChange }: { accepted: boolean; onChange: (v: boolean) => void }) {
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const accept = async (next: boolean) => {
    onChange(next);
    if (!next) return;
    setSaving(true);
    try {
      await fetch("/api/terms/accept", { method: "POST", credentials: "same-origin" });
      await qc.invalidateQueries({ queryKey: ["session"] });
      await qc.invalidateQueries({ queryKey: ["me"] });
    } finally {
      setSaving(false);
    }
  };

  return (
    <label className="flex cursor-pointer items-start gap-3">
      <span className="relative mt-[2px] grid size-[18px] shrink-0 place-items-center border border-[var(--rule-strong)] clip-tag bg-[var(--ground-2)]">
        <input
          type="checkbox"
          className="absolute inset-0 cursor-pointer opacity-0"
          checked={accepted}
          onChange={(e) => void accept(e.target.checked)}
        />
        {accepted && <span className="block size-[8px] bg-[var(--action)]" aria-hidden />}
      </span>
      <span className="t-meta leading-relaxed text-[var(--ink-2)]">
        By entering this match, you agree to the HEIST{" "}
        <Link href="/terms" target="_blank" className="text-[var(--action)] underline underline-offset-2">
          Terms &amp; Conditions
        </Link>{" "}
        and acknowledge the game&apos;s staking and payout rules. I have read the{" "}
        <Link href="/privacy" target="_blank" className="text-[var(--action)] underline underline-offset-2">
          Privacy Policy
        </Link>
        . You can lose your stake. {accepted && <span className="mono text-[var(--signal)]">{saving ? "saving…" : "accepted"}</span>}
      </span>
    </label>
  );
}
