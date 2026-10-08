import type { ReactNode } from "react";

/** A chamfered surface. `flat` drops the 1px edge for nested use. */
export function Panel({
  children,
  className = "",
  flat = false,
  live = false,
  signal = false,
  id,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  flat?: boolean;
  live?: boolean;
  signal?: boolean;
  id?: string;
  as?: "div" | "section" | "article" | "aside";
}) {
  const bracket = live ? "brackets brackets-live" : signal ? "brackets brackets-signal" : "";
  return (
    <As id={id} className={`${flat ? "panel-flat" : "panel"} ${bracket} ${className}`}>
      {!flat && <div className="panel-inner" />}
      {children}
    </As>
  );
}

/** A section opener: index, title, and a one-line lede. Used on every page so
 *  the document reads as one facility logbook rather than a set of screens. */
export function SceneHead({
  index,
  title,
  lede,
  aside,
}: {
  index: string;
  title: string;
  lede?: string;
  aside?: ReactNode;
}) {
  return (
    <header className="scene-index flex-wrap">
      <span className="mono t-label tracking-[0.18em] text-[var(--action)] whitespace-nowrap">{index}</span>
      <h2 className="stencil t-h2">{title}</h2>
      {lede && <p className="ml-auto hidden max-w-[46ch] t-small text-[var(--ink-2)] lg:block">{lede}</p>}
      {aside}
    </header>
  );
}

export function Stamp({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "live" | "signal" | "alarm";
}) {
  const cls = tone === "live" ? "stamp-live" : tone === "signal" ? "stamp-signal" : tone === "alarm" ? "stamp-alarm" : "";
  return <span className={`stamp ${cls}`}>{children}</span>;
}

/** label / value pair — the atom of every readout in HEIST. */
export function Readout({
  label,
  value,
  tone = "ink",
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: "ink" | "action" | "signal" | "alarm" | "muted";
  hint?: string;
}) {
  const color =
    tone === "action" ? "var(--action)" : tone === "signal" ? "var(--signal)" : tone === "alarm" ? "var(--alarm)" : tone === "muted" ? "var(--ink-3)" : "var(--ink)";
  return (
    <div className="min-w-0">
      <div className="label truncate">{label}</div>
      <div className="numeral mt-1 truncate t-h3 font-semibold" style={{ color }}>
        {value}
      </div>
      {hint && <div className="mono mt-0.5 truncate text-[0.6875rem] text-[var(--ink-3)]">{hint}</div>}
    </div>
  );
}

export function Rule({ className = "" }: { className?: string }) {
  return <div className={`hairline ${className}`} />;
}

/** Three-state page banner used by every wallet-gated flow. */
export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "warn" | "alarm";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const edge = tone === "alarm" ? "var(--alarm-deep)" : tone === "warn" ? "var(--action-deep)" : "var(--signal-deep)";
  const ink = tone === "alarm" ? "var(--alarm)" : tone === "warn" ? "var(--action)" : "var(--signal)";
  return (
    <div className="panel" style={{ padding: 1 }}>
      <div className="panel-inner" style={{ background: "var(--ground-2)" }} />
      <div className="relative flex flex-wrap items-center gap-4 border-l-2 p-4" style={{ borderColor: edge }}>
        <div className="min-w-0 flex-1">
          <div className="label" style={{ color: ink }}>
            {title}
          </div>
          {children && <div className="mt-1 t-small text-[var(--ink-2)]">{children}</div>}
        </div>
        {action}
      </div>
    </div>
  );
}
