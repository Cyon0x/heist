# HEIST — Architecture

> Steal. Outsmart. Escape. — a competitive 1v1 onchain extraction game on Arc Mainnet.

This document is the decision record (§64.26). It was written **after** inspecting the existing
machine (no prior HEIST project existed; Chain Duel was reviewed as prior art), and **after**
reading the current official documentation for Arc and the named social-wallet provider.

---

## 0. Verified external facts (nothing here is invented)

| Fact | Value | Source |
| --- | --- | --- |
| Arc Mainnet chain id | `5042` | docs.arc.io/arc/references/connect-to-arc |
| Arc Mainnet name / native currency | `Arc` / `USDC` (18 decimals) | same |
| Arc Mainnet HTTP RPC | `https://rpc.mainnet.arc.io` | same |
| Arc Mainnet WS RPC | `wss://rpc.quicknode.mainnet.arc.io` | same |
| Arc Mainnet explorer | `https://explorer.arc.io` | same |
| Arc Testnet chain id | `5042002`, `https://rpc.testnet.arc.io` | same |
| USDC ERC-20 interface on Arc | `0x3600000000000000000000000000000000000000` (6 dp) | docs.arc.io/arc/references/contract-addresses |
| Native USDC gas token decimals | **18** (not 6) | docs.arc.io/arc/references/evm-differences |
| `maxFeePerGas` floor | 20 Gwei — lower txs are silently dropped | same |
| Finality | deterministic, sub-second; act after 1 confirmation | docs.arc.io/arc/concepts/deterministic-finality |
| `viem` | ships `arc` and `arcTestnet` chains | docs.arc.io/arc/references/connect-to-arc |

### The "Saiku Developer Causal Wallet" — investigated, does not exist as a wallet SDK

`docs.saiku.bi` is **Saiku Cloud**, a hosted analytics/agent data plane (warehouse connections,
semantic schemas, AI query endpoints). Its full sitemap contains no wallet, signer, key-custody
or account-abstraction product. There is no package, endpoint or SDK to integrate, and §64.13/§64.25
forbid fabricating one.

**Resolution:** the social-login path is built behind a first-class adapter
(`src/lib/wallet/social/provider.ts`, interface `SocialWalletProvider`). The shipped
implementation (`EmbeddedArcWallet`) is a *real* custodial EVM wallet: the server generates a
secp256k1 keypair, derives the Arc address, and stores the key as AES-256-GCM ciphertext (the
same model Chain Duel uses for its managed wallets). Swapping in a third-party provider later is
one file. This is disclosed in the UI ("Managed by HEIST · non-custodial wallets can be linked")
and in `docs/ARC.md`.

---

## 1. Frontend

**Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4.** Chosen because the project is
one product — landing, lobby, wallet, history, leaderboard, legal — with a single canvas-based game
screen, and Next gives us SSR for the money/history pages, route handlers for the API, and one
deploy target. Tailwind is used only for layout primitives; the HEIST design system is plain CSS
custom properties (`src/app/globals.css`) so the tokens are readable and themeable (§DESIGN.md).

No component library. The shape language (chamfers, brackets, apertures) is bespoke; a UI kit
would push the product toward face-3 "shadcn dashboard" slop.

One non-obvious rule: **all of `globals.css` lives inside `@layer components`.** Unlayered rules
outrank every Tailwind utility regardless of specificity, which silently killed `flex-wrap` and
produced real horizontal overflow at 390 px. Inside the layer, utilities win as intended and the
design system stays overridable. Verified by measuring `document.scrollWidth === window.innerWidth`
on every route at 390 px.

## 2. Game engine

`src/game/` is a **pure, deterministic, fixed-timestep simulation** with no DOM and no network:

```
src/game/
  constants.ts   tick rate, speeds, damage, radii, timings
  map.ts         the facility: geometry, rooms, doors, cameras, terminals, extraction zones
  map-types.ts   the shape of that map data
  types.ts       GameState, PlayerState, Input, CoreState, MatchPhase
  sim.ts         step(state, [inputA, inputB], dt) -> state   (the only mutator)
  los.ts         line-of-sight / vision-cone / ray-vs-wall queries
  ai.ts          the computer opponent (same Input surface as a human)
  protocol.ts    snapshot encode/decode, input framing
  match.ts       headless match runner + win-rate harness (client, server and tests share it)
  room.ts        AuthoritativeRoom (the one true sim) + the three client transports
```

Rendering is **Canvas 2D** (`src/components/game/`) with a React HUD overlay. A top-down tactical
view is the correct register for this game: it makes information (vision, sound, cameras, the
Core) the visible mechanic, which is the whole design. 2D canvas also runs at 60 fps on a phone,
which a 3D scene of equivalent fidelity would not.

Collision is circle-vs-AABB against a static tile grid plus dynamic doors — no physics engine,
no floating-point jitter (`sim.ts` is integer-scaled and clamped).

## 3. Multiplayer

**Server-authoritative.** The server owns the only real `GameState`; clients send `Input` at 20 Hz
and receive snapshot frames every 2 ticks (15 Hz). Clients run **no prediction**: they render the
authority's state, interpolated 100 ms behind the newest frame so motion looks smooth without ever
inventing a position the server did not produce. That costs a little local responsiveness and buys
the property that matters here — a client cannot be ahead of, or disagree with, the truth.

One `Room` implementation, two transports:

| Mode | Transport | Authority | Money |
| --- | --- | --- | --- |
| **Solo / vs computer** | none (in-process) | the browser, for itself only | none |
| **Local authority** | `BroadcastTransport` (BroadcastChannel) | first client in the room is elected host | **refused** |
| **Server authority** | `WebSocketTransport` → `server/index.ts` (Node `ws`) | the Node server | enabled |

The app, not the browser, chooses the transport. `GET /api/matches/[id]/ticket` proves the caller
is a participant using the real session, then returns a **short-lived HMAC room ticket**
(`src/lib/game/ticket.ts`) bound to `{room, sub, exp}`. The game server recomputes the MAC locally
with the same `GAME_SERVER_SECRET` — so the shared secret never reaches a browser, the socket needs
no callback into the web app, and a connection without a valid ticket is closed with code 1008
(asserted by `tests/ticket.test.ts` and the two-client WS harness). The ticket's `sub` is also the
only source of a user id, which is what lets the server attribute a result to a real player.

Vercel serverless cannot hold a WebSocket, so an app-only deployment returns `transport: "local"`,
the HUD says `LOCAL AUTHORITY`, and **staking is blocked**. A staked match with no authoritative
server refuses to start rather than being decided by a browser. No fake authority, no fake
settlement.

## 4. Server

`server/index.ts` (Node 22+, `ws`): room registry with an idle reaper, one 30 Hz loop per room, and
input decoding. It loads its own `.env` (it is not a Next process). On the transition into
`ACTIVE` and again on `COMPLETE` it POSTs to the web app with the `x-heist-attestor` secret, which
is how a finished match becomes a recorded result and a payout. It is deliberately small: it
simulates and reports, and owns no database credentials.

Reporting is serialised through one promise chain so a start and an end for the same match cannot
race. A failed report is logged and the match stays open for the maintenance sweep — never
silently marked settled.

## 5. Database

**PostgreSQL** (the machine already has a Neon production Postgres in use by a sibling project;
HEIST uses its own `heist` database so the two never share tables). Access is through a small
hand-written layer (`src/lib/db/`) rather than an ORM, for two reasons: the schema is small and
explicit, and settlement needs real transactional control (`BEGIN … SELECT … FOR UPDATE … COMMIT`)
which reads better in SQL than through an ORM's escape hatch.

- `src/lib/db/schema.sql` — tables, indexes, constraints, enums (§50 of the brief).
- Migrations are idempotent and applied on first connection; `npm run db:init` applies them eagerly.
- An in-memory driver implements the same interface for tests and for a zero-config local boot; the
  UI shows an `EPHEMERAL STORE` badge whenever it is in use, so it can never be mistaken for
  production.

## 6. Auth

Three ways in, one identity:

```
Google OAuth  ─┐
X OAuth       ─┼─→ HEIST user ─→ linked wallet(s) ─→ Arc account
EVM wallet    ─┘   (SIWE-style signature binding)
```

OAuth is a real PKCE authorization-code flow (`src/lib/auth/oauth.ts`), the same model proven in
Chain Duel. EVM sign-in uses SIWE-style EIP-191 challenge/response: the server issues a nonce,
the wallet signs it, the server verifies and binds the address to the session. Sessions are
stateless HMAC-signed cookies (`jose`), `HttpOnly; SameSite=Lax; Secure`.

## 7. Wallet

`WalletProvider → WalletAdapter → HeistAccount → application` (§64.12).

- **Injected EVM wallets** — wagmi with `multiInjectedProviderDiscovery`. Any wallet that announces
  itself over EIP-6963 is listed by name at runtime, so no vendor is baked in. Deliberately
  **not** importing `wagmi/connectors`: that barrel drags in the Coinbase/Base account connectors,
  which import optional `@x402/*` packages that are not installed — the production build failed
  on them. Discovery covers current MetaMask, OKX, Rabby and friends; the connect dialog shows an
  explicit empty state if no wallet is present.
- **Managed Arc wallet** — the wallet created by Google/X sign-in (`src/lib/wallet/social/`).

Both expose connect / disconnect / address / chainId / switch-to-Arc / sign-message /
read-USDC-balance. The app never touches a private key.

## 8. Arc integration

`src/lib/arc/chain.ts` defines the chain from the verified values above (not from viem's bundled
`arc`, so the config is auditable and version-proof). A `NetworkGuard` component detects the wrong
chain and offers `SWITCH TO ARC`. Balances read the native 18-decimal balance for gas and the
ERC-20 interface for the token amount, and the code never mixes them (§EVM differences warning).

## 9. Smart contract

`contracts/src/HeistEscrow.sol` — onchain: deposits, escrow, settlement with an EIP-712 attestation,
protocol fee, cancellation, refund, replay protection (`settled[matchId]`), `Pausable`, and a
`Ownable` treasury. Offchain: everything about gameplay (see §10).
Tests: `contracts/test/HeistEscrow.t.sol` covers normal win, loss, cancel, refund, duplicate
settlement, invalid match, unauthorized settle, replay, malformed input, and stuck-funds recovery.

## 10. Settlement

```
match ends (game server, authoritative)
  → POST /api/matches/:id  {event:"result", winnerUserId, reason, stats}
        header x-heist-attestor: CRON_SECRET        ← server-to-server only
  → app validates, walks the state machine READY/ACTIVE → MATCH_COMPLETE
  → stats + match_events written for both players
  → staked only: MATCH_COMPLETE → SETTLEMENT
        readMatchState(matchId)                    ← who really deposited onchain
        winner's wallet must be one of the two escrow participants
        signSettlement()  EIP-712 {matchId, winner, nonce}   nonce = lastNonce + 1
        submitSettlement() → HeistEscrow.settle(...)   ≥20 Gwei, 1 confirmation
      → RESULT + settle_tx + a `payout` transaction row
      → on failure: SETTLEMENT_FAILED (recoverable) — never a fake success
```

The frontend never submits a winner. `POST /api/matches/:id` returns `403 ATTESTATION_REQUIRED` for
any staked match that does not carry the attestor secret — a browser claiming victory on a $25
match is not evidence of anything, and that guard is covered by the route's tests. Gameplay never
waits on the chain: the match is over the moment the simulation says it is; settlement is a
separate, observable, retryable step.

**Current deployment:** `HEIST_ESCROW_ADDRESS` is unset, so escrow is *off*. Paid matchmaking
answers `503 ESCROW_UNAVAILABLE` and the lobby says so; free arenas and practice are fully
playable. Nothing is simulated in its place. `docs/RUNBOOK.md` is the procedure for turning it on.

## 11. AI

`src/game/ai.ts` produces the same `Input` struct a human keyboard produces — it cannot teleport,
see through walls, or deal extra damage. It perceives through the engine's own sensors (LOS,
camera coverage, sound events, Core alerts) and a `Belief` record with decay, so it *guesses*.
Navigation is a proper flow field over the walkable grid, recomputed on door/objective change.
Difficulty is expressible (reaction latency, belief decay, aggression, mistake rate).

`tests/balance.test.ts` is a **measurement**, not an assertion of a hard-coded outcome. It runs bots
head-to-head and prints the result to `/tmp/heist-balance.txt`; it only asserts what is actually
true and stable — that skill ordering is monotonic (`veteran` beats `recruit`, `mastermind` beats
`professional`), and that matches end in a real heist (`core_extracted` / `opponent_eliminated`)
rather than a timeout.

The game is deliberately stochastic (weapon spread, AI aim error, AI mistakes), so the harness
pins `Math.random` to a fixed seed. Unseeded, the assertions flaked about once in five runs; seeded,
12 consecutive runs are green and the printed numbers are comparable across machines.

Seeded run: `veteran vs recruit 88%`, `mastermind vs professional 88%`, 23–50 s per bot match, all
four decided by the objective. The brief's ~80%-against-an-average-*player* target is a design goal
for human play; bot-vs-bot is not that measurement, and the AI is tuned by hand rather than by
rigging outcomes, which the brief forbids. Bot matches are short because two perfect flow-field
navigators converge on the vault immediately; a human opponent adds the hesitation, fake-outs and
hunting that stretch a real match toward the 3–5 minute target.

## 12. Deployment

| Layer | Where |
| --- | --- |
| Web app | Vercel (`cyon0xs-projects`) |
| Postgres | Neon (`heist` database) |
| Game server | any always-on Node host — `npm run game:server` (`server/index.ts`). Vercel cannot host a WebSocket. |
| Contracts | Arc Mainnet, Foundry (`contracts/`) |
| Static | `/public` (self-hosted fonts) |

The web app and the game server are separate deployments that share two secrets and nothing else.
The app never dials the game server; the browser does, with a ticket the app minted.

## 13. Environment

| Variable | Public? | Purpose |
| --- | --- | --- |
| `APP_URL` | no | absolute origin used in invite links and by the game server's report callback |
| `HEIST_DATABASE_URL` | **no** | Neon connection string |
| `SESSION_SECRET` | **no** | HMAC key for session cookies |
| `WALLET_ENCRYPTION_KEY` | **no** | AES-256-GCM key for managed wallets |
| `HEIST_ESCROW_ADDRESS` | no | blank ⇒ escrow off, paid play disabled |
| `SETTLEMENT_PRIVATE_KEY` | **no** | the attestor; signs settlements only |
| `PROTOCOL_TREASURY_ADDRESS` | no | single source of the 10% treasury address |
| `PROTOCOL_FEE_BPS` | no | 1000 = 10% |
| `CRON_SECRET` | **no** | maintenance auth **and** the game server's attestor secret |
| `GAME_SERVER_SECRET` | **no** | HMAC key for room tickets; must match on app and game server |
| `GAME_SERVER_URL` / `NEXT_PUBLIC_GAME_SERVER_URL` | public (URL only) | where the browser opens its socket |
| `GOOGLE_CLIENT_ID/SECRET`, `X_CLIENT_ID/SECRET` | secret pair | OAuth |

`src/lib/env.ts` is `server-only`, so importing it from a client component is a build error rather
than a leak. Secrets are never read through `NEXT_PUBLIC_*`.

## 14. Security boundaries

Frontend is untrusted for: stake, balance, winner, Core ownership, health, damage, extraction,
match result, tx success. Every one is re-derived server-side, and settlement is enforced by the
contract. Rate limits + zod validation on every route handler; `server-only` on all secret modules;
no secret reaches the client bundle; CSP + `X-Frame-Options: DENY`; the settlement key lives only
in `SETTLEMENT_PRIVATE_KEY` on the server.

## 15. Performance

Fixed 30 Hz sim / 15 Hz snapshot, delta-encoded protocol, ~40 bytes/entity. Canvas draws from a
pre-rendered static map layer with per-frame only-dynamic overlay. Fonts self-hosted and subset.
Route handlers are `force-dynamic` only where they touch money or sessions. No polling of the
chain: receipts are watched with `watchContractEvent`/`waitForTransactionReceipt` and the UI is
event-driven.

## 16. Explicit non-goals (MVP, per §60)

No NFT marketplace, token, clans, battle pass, skins, multiple maps, inventory, tournaments.
One map, one Core, one weapon, melee, dash, EMP, scanner — polished.
