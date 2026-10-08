# HEIST

**Steal. Outsmart. Escape.** — competitive 1v1 extraction on Arc Mainnet.

Two thieves enter the same facility. One Core. Both want it. Hack the security layer, break the
vault, take the Core, and survive the walk to extraction while the other player hunts you. Matches
run on a 4-minute clock; the winner takes 90% of the pot and the protocol takes 10%.

The game is the product. Blockchain is the payout rail underneath it.

**Live:** https://heist-mauve.vercel.app — web app on Vercel, Postgres on Neon. Practice and free
friend arenas are playable now; staking is disabled until escrow is deployed (`docs/RUNBOOK.md`).
Social sign-in additionally needs the two callback URLs registered in §9 of that runbook.

---

## What is real right now

| Capability | State |
| --- | --- |
| Facility, movement, combat, dash, EMP, scanner, cameras, hacking, vault, Core, extraction, lockdown, 2 lives | **Working** (`src/game/`) |
| Computer opponent — four difficulties, no cheating, flow-field navigation | **Working** (`src/game/ai.ts`) |
| Authoritative Node game server, 30 Hz sim, ticket-authenticated sockets | **Working** (`server/index.ts`) |
| Google / X sign-in, SIWE wallet sign-in, managed Arc wallet, linked identities | **Working** |
| Free friend arenas: invite link, `HEIST-XXXXX` code, QR | **Working** |
| Postgres-backed profile, match history, transaction history, leaderboard | **Working** (Neon) |
| USDC escrow contract, EIP-712 90/10 settlement | **Written and tested (24 Forge tests), not deployed.** `HEIST_ESCROW_ADDRESS` is unset, so paid matchmaking answers `503 ESCROW_UNAVAILABLE` and the lobby says *ESCROW OFFLINE*. |
| On-chain **funding** (`openMatch` + `deposit`) | **Not wired.** The settlement half is complete; the deposit half is the one known gap, spelled out in `docs/RUNBOOK.md` §2. Until it exists, a paid match would have no funds behind it, so the app refuses to start one. |
| Global matchmaking | Queue + stake matching is implemented; it refuses to pair anyone while escrow is off. |

There are no fake balances, fake transactions, fake confirmations, fake matchmaking or fake
payouts anywhere in this codebase. When something cannot be done for real, the UI says so and the
action is disabled.

## Run it

```bash
npm install
cp .env.example .env.local     # fill in what you need; only a few keys are required to boot
npm run dev                    # http://localhost:4320
```

That is enough to play the computer and to open free friend arenas. For real-time 1v1 in the
browser, run the game server too:

```bash
npm run game:server            # ws://localhost:4331, reads .env.local
```

and set `GAME_SERVER_URL=ws://localhost:4331` plus a `GAME_SERVER_SECRET`.

### Verify

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm run test          # vitest — sim, balance, protocol round-trip, ticket auth
npm run contract:test # forge — 24 escrow tests
npm run build         # next build --webpack
```

`build` is pinned to webpack because Turbopack's *build* path spawns a PostCSS worker that binds a
local port, which fails in locked-down/CI sandboxes. `npm run dev` still uses Turbopack, and
`npm run build:turbo` is there for anyone who wants it.

## Layout

```
src/app/          routes: landing, lobby, play modes, arena, profile, history,
                  leaderboard, wallet, settings, terms, privacy, api/
src/components/   the design system, the canvas renderer, the HUD
src/game/         the simulation — no DOM, no network, deterministic
src/lib/          arc/, auth/, db/, wallet/, env.ts   (all server-only where it matters)
server/           the authoritative game server
contracts/        HeistEscrow.sol + Foundry tests
docs/             ARCHITECTURE.md (decisions), RUNBOOK.md (operations)
DIRECTION.md      the art direction the interface was built to
```

## How a match settles

```
game server decides the match   (it owns the only real GameState)
  → POST /api/matches/:id  with the x-heist-attestor secret
      → app records the result, stats and events, walks the match state machine
      → staked: the app signs an EIP-712 {matchId, winner, nonce} attestation
                and submits HeistEscrow.settle  → 90% winner / 10% treasury
```

A browser cannot report a winner for a staked match; `POST /api/matches/:id` answers
`403 ATTESTATION_REQUIRED`. Money never changes what a player can do — stake only changes the size
of the pot. A $1 entrant and a $1,000 entrant have identical health, speed, damage, abilities and
map access.

## Deployment

The web app deploys to Vercel. Neon hosts Postgres. The **game server needs an always-on host**
(Vercel functions cannot hold a WebSocket) — run `npm run game:server` on any Node host and point
`GAME_SERVER_URL` at it. Without it, the app runs in local-authority mode and refuses staked play.

Read `docs/ARCHITECTURE.md` before changing anything structural, and `docs/RUNBOOK.md` before
touching escrow.

---

*Real-value USDC stakes. Gameplay capability is identical at every stake. Play responsibly; you can
lose your stake. Availability depends on your jurisdiction.*
