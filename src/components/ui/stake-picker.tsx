"use client";

import { useState } from "react";
import { STAKE_MAX, STAKE_MIN, STAKE_PRESETS } from "@/lib/arc/chain";

/**
 * Stake selection. Presets are chamfered keys, not pill chips; the custom entry
 * is always visible so nothing hides behind an "other" affordance.
 */
export function StakePicker({
  value,
  onChange,
  allowFree = false,
  disabled = false,
}: {
  value: number;
  onChange: (v: number) => void;
  allowFree?: boolean;
  disabled?: boolean;
}) {
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Derived, not mirrored: the text box is empty exactly when the committed
  // stake is already one of the keys above, so there is no state to sync.
  const onPreset =
    STAKE_PRESETS.includes(value as (typeof STAKE_PRESETS)[number]) || (allowFree && value === 0);
  const shown = onPreset ? "" : custom;

  const commit = (raw: string) => {
    setCustom(raw);
    if (raw.trim() === "") {
      setError(null);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return setError("Enter a number");
    if (n < STAKE_MIN) return setError(`Minimum $${STAKE_MIN}`);
    if (n > STAKE_MAX) return setError(`Maximum $${STAKE_MAX}`);
    setError(null);
    onChange(Math.round(n * 100) / 100);
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {allowFree && (
          <StakeKey active={value === 0} disabled={disabled} onClick={() => onChange(0)} label="Free" sub="no stake" />
        )}
        {STAKE_PRESETS.map((p) => (
          <StakeKey key={p} active={value === p} disabled={disabled} onClick={() => onChange(p)} label={`$${p}`} />
        ))}
      </div>

      <label className="mt-4 block">
        <span className="label">Custom amount</span>
        <div className="mt-2 flex items-stretch gap-2">
          <div className="relative flex-1">
            <span className="mono pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 t-small text-[var(--ink-3)]">$</span>
            <input
              className="field pl-7"
              inputMode="decimal"
              placeholder={`${STAKE_MIN} – ${STAKE_MAX}`}
              value={shown}
              disabled={disabled}
              aria-invalid={Boolean(error)}
              onChange={(e) => commit(e.target.value)}
            />
          </div>
          <span className="mono flex items-center t-mono-xs text-[var(--ink-3)]">USDC</span>
        </div>
      </label>
      {error && <p className="mono mt-2 t-mono-xs text-[var(--alarm)]">{error}</p>}
    </div>
  );
}

function StakeKey({ active, label, sub, onClick, disabled }: { active: boolean; label: string; sub?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className="btn justify-center"
      style={
        active
          ? { ["--btn-bg" as string]: "var(--action-soft)", ["--btn-edge" as string]: "var(--action)", ["--btn-ink" as string]: "var(--action)" }
          : undefined
      }
    >
      <span className="flex flex-col items-center leading-tight">
        <span>{label}</span>
        {sub && <span className="label">{sub}</span>}
      </span>
    </button>
  );
}
