/** The HEIST wordmark: an iris glyph plus a condensed stencil setting. */
export function Wordmark({ size = 22, withText = true }: { size?: number; withText?: boolean }) {
  // Rounded to 3dp: an unrounded trig value differs in its last digit between
  // the Node and browser float paths and React reports a hydration mismatch.
  const p = (a: number, r: number) => `${round(Math.cos(a) * r)} ${round(Math.sin(a) * r)}`;
  return (
    <span className="inline-flex items-center gap-[0.55rem]">
      <svg width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true">
        <circle r="11" fill="none" stroke="var(--rule-strong)" strokeWidth="1" />
        {Array.from({ length: 8 }, (_, i) => {
          const a0 = (i / 8) * Math.PI * 2 + 0.09;
          const a1 = ((i + 1) / 8) * Math.PI * 2 - 0.09;
          const r0 = 6.4;
          const r1 = 9.6;
          return (
            <path
              key={i}
              d={`M ${p(a0, r1)} A ${r1} ${r1} 0 0 1 ${p(a1, r1)} L ${p(a1, r0)} A ${r0} ${r0} 0 0 0 ${p(a0, r0)} Z`}
              fill={i % 3 === 0 ? "var(--action)" : "var(--rule-strong)"}
            />
          );
        })}
        <circle r="3.1" fill="var(--action)" />
        <circle r="1.3" fill="var(--ground)" />
      </svg>
      {withText && <span className="stencil text-[1.05rem] leading-none">HEIST</span>}
    </span>
  );
}

const round = (n: number) => Math.round(n * 1000) / 1000;
