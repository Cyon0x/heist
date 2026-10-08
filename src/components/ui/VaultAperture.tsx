"use client";

/**
 * The vault aperture — HEIST's one signature object (see DIRECTION.md §6).
 *
 * A segmented radial iris: twelve machined arc segments around an interlock
 * ring. It is the facility door on the landing page, the search aperture while
 * matchmaking, the countdown lock, and the extraction progress ring. One object,
 * one motion, four meanings. Under reduced motion it is drawn open and still and
 * the *segments* carry the state instead of the rotation.
 */

export type ApertureState = "idle" | "searching" | "locked" | "open";

export function VaultAperture({
  size = 320,
  fluid = false,
  progress = 0,
  state = "idle",
  label,
  sublabel,
}: {
  size?: number;
  /** Fill the parent box instead of a fixed pixel size. The parent must be square. */
  fluid?: boolean;
  /** 0..1 — fill for "locked" (countdown) and "open" (extraction). */
  progress?: number;
  state?: ApertureState;
  label?: string;
  sublabel?: string;
}) {
  const segments = 12;
  const p = Math.max(0, Math.min(1, progress));
  const lit = Math.round(p * segments);
  const spin = state === "searching";

  return (
    <div
      className={`relative grid place-items-center ${fluid ? "size-full aspect-square" : ""}`}
      style={fluid ? undefined : { width: size, height: size }}
      role="img"
      aria-label={label ?? "Vault aperture"}
    >
      <svg
        viewBox="-110 -110 220 220"
        width={fluid ? "100%" : size}
        height={fluid ? "100%" : size}
        className="overflow-visible"
      >
        <defs>
          <linearGradient id="ha-rim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffd79a" />
            <stop offset="55%" stopColor="#ffa227" />
            <stop offset="100%" stopColor="#7a4a0d" />
          </linearGradient>
          <radialGradient id="ha-core" cx="50%" cy="50%">
            <stop offset="0%" stopColor="rgba(255,162,39,0.35)" />
            <stop offset="70%" stopColor="rgba(255,162,39,0.05)" />
            <stop offset="100%" stopColor="rgba(255,162,39,0)" />
          </radialGradient>
        </defs>

        <circle r="96" fill="url(#ha-core)" />
        <circle r="86" fill="none" stroke="#1e2a39" strokeWidth="1" />
        <circle r="78" fill="none" stroke="#2c3b4e" strokeWidth="1" strokeDasharray="2 6" />

        <g className={spin ? "sweep" : undefined} style={{ transformOrigin: "0 0" }}>
          {Array.from({ length: segments }, (_, i) => {
            const a0 = (i / segments) * 360 + 3;
            const a1 = ((i + 1) / segments) * 360 - 3;
            const on = i < lit;
            return (
              <path
                key={i}
                d={arcPath(a0, a1, 62, 86)}
                fill={on ? "url(#ha-rim)" : "#16202d"}
                stroke={on ? "#ffbe63" : "#2c3b4e"}
                strokeWidth="1"
                opacity={on ? 1 : 0.85}
              />
            );
          })}
        </g>

        <g className={state === "searching" ? "sweep" : undefined} style={{ transformOrigin: "0 0", animationDuration: "3.4s" }}>
          {Array.from({ length: 6 }, (_, i) => (
            <path key={i} d={arcPath(i * 60 + 8, i * 60 + 28, 42, 58)} fill="#243343" />
          ))}
        </g>

        <circle r="46" fill="#0c1118" stroke="#2c3b4e" strokeWidth="1" />
        {state === "open" ? (
          <g>
            <circle r="30" fill="none" stroke="#6fd8e8" strokeWidth="2" opacity="0.6" />
            <circle r="18" fill="#6fd8e8" opacity="0.85" />
            <circle r="8" fill="#080b10" />
          </g>
        ) : state === "locked" ? (
          <g>
            <rect x="-9" y="-16" width="18" height="16" fill="none" stroke="#ffa227" strokeWidth="2" />
            <path d="M -6 -16 v -5 a 6 6 0 0 1 12 0 v 5" fill="none" stroke="#ffa227" strokeWidth="2" />
          </g>
        ) : state === "searching" ? (
          <g>
            <line x1="-30" y1="0" x2="30" y2="0" stroke="#ffa227" strokeWidth="1" opacity="0.5" />
            <line x1="0" y1="-30" x2="0" y2="30" stroke="#6fd8e8" strokeWidth="1" opacity="0.45" />
            <circle r="4" fill="#ffa227" />
          </g>
        ) : (
          <circle r="5" fill="#8a5a1a" />
        )}

        <circle r="99" fill="none" stroke="#2c3b4e" strokeWidth="1" />
        {[0, 90, 180, 270].map((deg) => (
          <line
            key={deg}
            x1={Math.cos((deg * Math.PI) / 180) * 99}
            y1={Math.sin((deg * Math.PI) / 180) * 99}
            x2={Math.cos((deg * Math.PI) / 180) * 108}
            y2={Math.sin((deg * Math.PI) / 180) * 108}
            stroke="#2c3b4e"
            strokeWidth="2"
          />
        ))}
      </svg>

      {(label || sublabel) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[-2.4rem] text-center">
          {label && <div className="label label-action">{label}</div>}
          {sublabel && <div className="mono mt-1 text-[0.6875rem] text-[var(--ink-3)]">{sublabel}</div>}
        </div>
      )}
    </div>
  );
}

function arcPath(a0: number, a1: number, rIn: number, rOut: number): string {
  const rad = (d: number) => ((d - 90) * Math.PI) / 180;
  // 3dp rounding keeps server and client output byte-identical (see Wordmark).
  const c = (a: number, r: number) => Math.round(Math.cos(rad(a)) * r * 1000) / 1000;
  const s = (a: number, r: number) => Math.round(Math.sin(rad(a)) * r * 1000) / 1000;
  const x0 = c(a0, rOut);
  const y0 = s(a0, rOut);
  const x1 = c(a1, rOut);
  const y1 = s(a1, rOut);
  const x2 = c(a1, rIn);
  const y2 = s(a1, rIn);
  const x3 = c(a0, rIn);
  const y3 = s(a0, rIn);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${rOut} ${rOut} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${rIn} ${rIn} 0 ${large} 0 ${x3} ${y3} Z`;
}
