/**
 * Operator glyph. Not a picture of a person — a faceted identicon stamped from
 * the account seed, so every player has a mark that reads at 28px.
 */
export function Avatar({ seed, name, size = 44, className = "" }: { seed: string; name: string; size?: number; className?: string }) {
  const h = hash(seed || name);
  const cells = Array.from({ length: 9 }, (_, i) => ((h >> (i * 3)) & 7) > 3);
  const accent = ["var(--action)", "var(--signal)", "var(--alarm)", "#97a3b6"][h % 4];
  const cell = size / 3;
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center clip-tag ${className}`}
      style={{
        width: size,
        height: size,
        background: "var(--ground-2)",
        boxShadow: "inset 0 0 0 1px var(--rule-strong)",
      }}
      title={name}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="absolute inset-0">
        {cells.map((on, i) =>
          on ? <rect key={i} x={(i % 3) * cell} y={Math.floor(i / 3) * cell} width={cell} height={cell} fill="var(--rule-strong)" opacity="0.55" /> : null,
        )}
        <rect x={0} y={size - 3} width={size} height={3} fill={accent} />
      </svg>
      <span className="stencil relative leading-none" style={{ fontSize: Math.max(9, size * 0.32) }} aria-hidden>
        {name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "??"}
      </span>
      <span className="sr-only">{name}</span>
    </span>
  );
}

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
