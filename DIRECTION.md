# HEIST — Design Direction

Derived from the reference pack in `~/Downloads/Web Designer` (`references/directions.md`,
`type.md`, `color.md`, `layout.md`, `motion.md`, `slop.md`). Nothing below is copied from a
reference; the references set the *process*, the concept sets the *values*.

## 1. Concept

Three sentences, three different source families, second idea not first:

1. **Places** — "HEIST is a decommissioned municipal bank after midnight: deep blue-black
   interiors, sodium service lamps, and the cold white of the security system that never
   sleeps."
2. **Printed matter** — "HEIST is a redacted operations dossier: stencilled headings,
   `CLASSIFIED` stamps, hand-annotated facility plans, and a signature block you initial."
3. **Media** — "HEIST is a surveillance feed wall: the same facility seen across a grid of
   monitors, each with a timestamp, an index, and a camera that is always watching."

**The direction is a synthesis: 1 is the ground, 3 is the interface, 2 is the texture.**
Family = **Instrument (C)** in its darkest register, shell = **map-led / canvas**.
Concept name: **"Vault District, 03:40."** ("Night-vision heist deck" was the first idea and it
was discarded — too close to the launch-page default.)

## 2. Tokens

```
--ground      #080B10   the unlit facility; deep blue-black, never #000
--ground-2    #0C1118   recessed corridor
--surface     #111823   panels that float above the plan
--surface-2   #16202D   raised / interactive
--rule        #1E2A39   hairlines, one weight only
--rule-strong #2C3B4E
--ink         #E8EDF5   primary text (15.1:1 on ground)
--ink-2       #97A3B6   secondary text (7.0:1)
--ink-3       #6B7789   meta only, never body
--action      #FFA227   sodium service lamp — the ONE act-now colour
--action-ink  #1A1206
--signal      #6FD8E8   the security system's own cold light (intel, confirmed, money)
--alarm       #FF4D5E   breach / lockdown / defeat, and nothing else
```

Justified hues: **amber** = you, the thief, the thing you press; **cyan** = the facility watching
and the ledger settling; **red** = alarm. Three families, four tokens, one job each. No violet,
no lime, no gradient text, no glow.

## 3. Type

- **Archivo** (variable, `wdth` 62–125) — display and body. *Because* the concept is stencilled
  facility signage and stamped dossiers: it holds a wide, confident wordmark at 125 and a
  condensed data label at 75 in the same family, which is exactly what a security room does.
- **IBM Plex Mono** — coordinates, timestamps, hashes, match IDs, balances. *Because* the
  reference for all of it is an instrument readout, and figures must align in columns.
- Two families. Display sits at 3–6× body. Uppercase labels tracked +6%. Tabular numerals
  everywhere numbers move (timers, balances, odds).

## 4. Shapes

Chamfered corners (cut 12px, from the plan-view corner of a room), tactical corner brackets,
hairline rules that extend past their content, `03 / 05`-style section indices, stamp blocks
(`CLASSIFIED`, `LIVE`, `SETTLED`) rotated 0° and set in a dashed box. Rounded rectangles are
banned except where a thing is physically round: the vault aperture, status lamps, avatars.

## 5. Grammar (page = argument, not template)

Landing is a **scroll-story** told in scenes that answer the next question in order:
*what is this → how does a heist actually go → what does it cost → is it fair → play*.
App shell is **map-led**: the facility plan is the ground of the play screens; chrome floats.
Never nav → pill → hero → three cards → bento → pricing → FAQ.

## 6. Signature

**The vault aperture.** A segmented radial iris — 12 machined arc segments, a rotating
interlock ring, a hairline rim light. One object, one motion, four meanings:

| Where | Meaning |
| --- | --- |
| Landing hero | the facility door, breathing, scan sweeping |
| `FIND OPPONENT` | the iris closing to a search aperture; it opens when a match lands |
| Match start | `3 · 2 · 1` as segments locking into place, then `GO` |
| Core extraction | the aperture is the extraction progress ring |

Trigger → frames → timing is storyboarded in `docs/DESIGN.md` §5. Reduced motion: the iris is
drawn fully open and still; state is carried by the segment fill, not the rotation.

## 7. Anti-slop checks (from `slop.md`, run against the build)

- Face-test: shares ≤ 2 features with any of the four 2026 faces. The dark-ground instrument
  register is closest to **face 4 ("Dark Dev Tool")** — so we deliberately break from it:
  no sidebar-with-icon-tiles, no KPI card row, no `Inter` + `JetBrains Mono`, no zinc greys,
  no pill toggles, no sparklines, no breadcrumb. Layout is a facility plan, not a table.
- No fade-up-on-scroll for every block (content is visible by default).
- No marquee, no hover-lift-on-every-card, no gradient text, no blurred blobs, no dot-grid
  backdrop, no emoji, no Lucide set at default stroke, no "supercharge/seamless/unlock".
- Every colour, size, gap and word in the final build must survive the specificity test:
  *why this value and not the default?*

## 8. Do NOT copy from the references

The reference pack's own ruts: warm paper + serif + mono labels (face 1), the purple launch
page (face 2), the light shadcn dashboard (face 3), the studio-portfolio overcorrection
(`slop.md` §8), and the transit **board** (\(slop.md\) §8 second rut). None of them appear here.
