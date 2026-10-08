import { CAMERAS, CORE_SPAWN, EXTRACTION, GRID_H, GRID_W, ROOMS, SPAWNS, TERMINALS, TILE } from "@/game/map";

/**
 * The landing-page plan is not decoration — it is drawn from the same constants
 * the simulation builds its collision grid from, so what a visitor studies here
 * is exactly what they will walk through in a match.
 */
export function FacilityPlan({ className = "" }: { className?: string }) {
  const W = GRID_W * TILE;
  const H = GRID_H * TILE;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label="Facility Kestrel level plan">
      <defs>
        <pattern id="fp-grid" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
          <path d={`M ${TILE} 0 H 0 V ${TILE}`} fill="none" stroke="#1e2a39" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="#0a0e14" />
      <rect width={W} height={H} fill="url(#fp-grid)" opacity="0.5" />

      {/* walkable volumes */}
      <g>
        {ROOMS.map((room) => (
          <rect
            key={room.id}
            x={room.rect.x * TILE}
            y={room.rect.y * TILE}
            width={room.rect.w * TILE}
            height={room.rect.h * TILE}
            fill={room.kind === "corridor" ? "#0e141cc" : "#111823"}
            stroke={room.kind === "corridor" ? "#1e2a39" : "#2c3b4e"}
            strokeWidth={room.kind === "corridor" ? 2 : 3}
          />
        ))}
      </g>

      {/* vault */}
      <g>
        <rect x={20 * TILE} y={14 * TILE} width={16 * TILE} height={14 * TILE} fill="#141a12" stroke="#7a4a0d" strokeWidth="4" />
        <rect x={21 * TILE} y={15 * TILE} width={14 * TILE} height={12 * TILE} fill="#1a1608" stroke="#ffa227" strokeWidth="2" strokeDasharray="10 6" />
        <text x={28 * TILE} y={17.95 * TILE} textAnchor="middle" fontSize="34" letterSpacing="10" fill="#ffa227" fontFamily="IBM Plex Mono, monospace">
          VAULT
        </text>
        <circle cx={CORE_SPAWN.x} cy={CORE_SPAWN.y} r="16" fill="#ffa227" />
        <circle cx={CORE_SPAWN.x} cy={CORE_SPAWN.y} r="40" fill="none" stroke="#ffa227" strokeWidth="2" opacity="0.4" />
        <text x={CORE_SPAWN.x} y={CORE_SPAWN.y + 92} textAnchor="middle" fontSize="26" letterSpacing="6" fill="#ffa227" fontFamily="IBM Plex Mono, monospace">
          THE CORE
        </text>
      </g>

      {/* extraction zones */}
      {(["A", "B"] as const).map((k) => {
        const { rect, label } = EXTRACTION[k];
        return (
          <g key={k}>
            <rect x={rect.x * TILE} y={rect.y * TILE} width={rect.w * TILE} height={rect.h * TILE} fill="rgba(111,216,232,0.14)" stroke="#6fd8e8" strokeWidth="3" />
            <text x={(rect.x + rect.w / 2) * TILE} y={(rect.y + rect.h / 2) * TILE + 10} textAnchor="middle" fontSize="34" letterSpacing="6" fill="#6fd8e8" fontFamily="IBM Plex Mono, monospace">
              {label.toUpperCase()}
            </text>
          </g>
        );
      })}

      {/* terminals */}
      {TERMINALS.map((t) => (
        <g key={t.id}>
          <rect x={t.pos.x - 16} y={t.pos.y - 16} width="32" height="32" fill="#6fd8e8" opacity="0.85" />
          <text x={t.pos.x} y={t.pos.y - 30} textAnchor="middle" fontSize="24" letterSpacing="3" fill="#6fd8e8" fontFamily="IBM Plex Mono, monospace">
            {t.id === "cameras" ? "CAM CTRL" : "VAULT CTRL"}
          </text>
        </g>
      ))}

      {/* cameras */}
      {CAMERAS.map((c, i) => (
        <g key={i} transform={`translate(${c.pos.x} ${c.pos.y}) rotate(${(c.facing * 180) / Math.PI})`}>
          <path d="M 0 0 L 44 -22 L 44 22 Z" fill="rgba(255,77,94,0.16)" />
          <circle r="9" fill="#ff4d5e" />
        </g>
      ))}

      {/* spawns */}
      {SPAWNS.map((s, i) => (
        <g key={i}>
          <circle cx={s.x} cy={s.y} r="17" fill={i === 0 ? "#ffa227" : "#6fd8e8"} />
          <circle cx={s.x} cy={s.y} r="44" fill="none" stroke={i === 0 ? "#ffa227" : "#6fd8e8"} strokeWidth="2" opacity="0.45" />
          <text x={s.x} y={s.y + 76} textAnchor="middle" fontSize="26" letterSpacing="4" fill={i === 0 ? "#ffa227" : "#6fd8e8"} fontFamily="IBM Plex Mono, monospace">
            {i === 0 ? "OPERATIVE 01" : "OPERATIVE 02"}
          </text>
        </g>
      ))}

      {/* room names */}
      <g fontFamily="IBM Plex Mono, monospace" fontSize="27" letterSpacing="4" fill="#8a99ae">
        {ROOMS.filter((r) => r.kind === "room" && r.id !== "extractA" && r.id !== "extractB").map((r) => (
          <text key={r.id} x={(r.rect.x + r.rect.w / 2) * TILE} y={(r.rect.y + 1.2) * TILE} textAnchor="middle">
            {r.name.toUpperCase()}
          </text>
        ))}
      </g>
    </svg>
  );
}
