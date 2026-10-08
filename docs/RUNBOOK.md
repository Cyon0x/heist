# HEIST — operations runbook

Everything here is about money or about keeping matches alive. Read it before changing either.

## 1. Current status: escrow is OFF

`HEIST_ESCROW_ADDRESS` is unset on the deployed environment. Consequences, all deliberate:

- `GET /api/health` reports `"escrow": false`.
- `POST /api/matchmaking` answers `503 ESCROW_UNAVAILABLE` **before** enqueueing anyone. Nobody is
  left in a queue that can never be served.
- `POST /api/arenas` refuses a non-zero stake and says `ESCROW_UNAVAILABLE`.
- The lobby prints `ESCROW OFFLINE` with a plain explanation and points at practice and free arenas.
- The arena refuses to start a staked match if the app has no authoritative server to point at.

Nothing is simulated in place of a stake. If you want paid play, work through §4 — in full.

## 2. The honest gap

The contract is written and fully tested (`contracts/src/HeistEscrow.sol`, 24 Forge tests), and the
**settlement** half is wired end to end: the game server reports a result, the app signs an EIP-712
attestation and submits `settle`, and a failure lands in `SETTLEMENT_FAILED` rather than a fake
success.

The **funding** half is not wired. Specifically, nothing yet calls:

```solidity
openMatch(bytes32 matchId, address playerOne, address playerTwo, uint128 stake)  // attestor only
deposit(bytes32 matchId)                                                        // each player, from their own wallet
```

`openMatch` is server-side (the attestor key), so it belongs in a route alongside
`src/lib/arc/settlement.ts`. `deposit` must be signed by the **player**, from the address that owns
their USDC — so it needs a browser-side `writeContract` through wagmi, with the app polling
`matches(matchId)` until `status == Funded` (the contract only flips to `Funded` when both
`deposited[matchId][player]` flags are set).

Until that exists, a "paid" match has no funds behind it, and the correct behaviour is what the app
already does: refuse. Do not weaken that guard to make the lobby look complete.

## 3. Secrets

| Secret | Read by | Notes |
| --- | --- | --- |
| `SESSION_SECRET` | web app | HMAC for session cookies. Rotating it signs everyone out. |
| `WALLET_ENCRYPTION_KEY` | web app | AES-256-GCM for managed wallets. **Rotating it orphans every managed wallet.** Back it up. |
| `CRON_SECRET` | web app + game server | maintenance auth, and the `x-heist-attestor` value the game server sends. |
| `GAME_SERVER_SECRET` | web app + game server | HMAC key for room tickets. Must match on both. |
| `SETTLEMENT_PRIVATE_KEY` | web app | The attestor. Its address must equal the contract's `attestor`, and it needs USDC on Arc for gas. |

Never log or transmit any of these. `src/lib/env.ts` is `server-only`, so a client import is a build
error. The browser is only ever given a signed room ticket.

## 4. Turning escrow on

1. **Deploy the contract** to Arc Mainnet with the fee and treasury you intend:
   `constructor(address usdc, address treasury, address attestor, uint16 feeBps)` — `usdc` is the
   6-decimal ERC-20 view at `0x3600000000000000000000000000000000000000`, `attestor` is
   `SETTLEMENT_PRIVATE_KEY`'s address, `feeBps` is 1000 for 90/10.
2. **Fund the attestor** with native USDC so it can pay gas. Arc drops transactions below 20 Gwei
   without an error; `submitSettlement` applies that floor explicitly.
3. Set `HEIST_ESCROW_ADDRESS`, `SETTLEMENT_PRIVATE_KEY`, `PROTOCOL_TREASURY_ADDRESS`,
   `PROTOCOL_FEE_BPS=1000` in the environment and redeploy. `GET /api/health` must report
   `"escrow": true`.
4. **Implement §2.** Without it, paid matchmaking is a queue with no escrow behind it — do not flip
   the switch before this is done.
5. Dry-run on a throwaway deployment first: open a match, deposit from two wallets, settle, and
   confirm the 90/10 split on the explorer. Then run the negative cases — double settle, unauthorised
   settle, refund after the delay, pause, settle a cancelled match.

## 5. Contract controls

- `pause()` — blocks settlement and new deposits, **never** blocks refunds. Use it if settlement
  looks wrong.
- `refundStale(matchId)` — anyone may call after `refundDelay`, so a funded match the attestor never
  settled cannot strand funds. This is the last-resort recovery path.
- `setAttestor` / `setTreasury` / `setFeeBps` — owner-only, with `AttestorChanged` /
  `TreasuryChanged` events. Fee is capped at 20% in the constructor and setter.
- Replay protection is per-match `lastNonce`; a signature can never be replayed, and a settled match
  can never be reopened.

## 6. Match lifecycle and recovery

```
READY → COUNTDOWN → ACTIVE → (CORE_STOLEN | EXTRACTION) → MATCH_COMPLETE → RESULT
                                                                    ↘ SETTLEMENT (staked) ↗
```

Invalid transitions throw in `store.ts`; the API discovers a legal path rather than writing a
status directly. If a game server report never arrives, the match stays where it is and
`/api/cron/maintenance` sweeps stale queue entries and expiring arenas every ten minutes.

- **Game server down** — matches in flight are lost; clients see `CONNECTION LOST`, the match is not
  settled, and no money moves. Restart the server and the rooms rebuild from client reconnects.
- **Report failed** — logged as `report_failed`, the match stays open, nothing is paid.
- **Settlement failed** — `SETTLEMENT_FAILED`, with a `settlement_failed` event carrying the reason.
  The match can be re-driven; `settle()` refuses a double payout at the contract level as well.

## 7. Health checks

```
GET /api/health          → {"ok":true,"store":"postgres","db":true,"escrow":false,...}
GET <game-server>/health → {"ok":true,"rooms":N,"players":M,"settleReporting":true}
```

`store: "memory"` means `.env.local` has no database URL — the UI shows `EPHEMERAL STORE` and every
account disappears on restart. Never leave production in that state.

## 8. Deploying

- **Web app** — Vercel. Every secret in §3 goes in as an encrypted project env var. `APP_URL` must
  be the production origin, because invite links and the game server's report callback are built
  from it.
- **Game server** — any always-on Node host. It is not serverless. `npm run game:server`, one
  process, loads its own `.env`. Put it behind TLS and give the browser a `wss://` URL in
  `GAME_SERVER_URL`. It holds no database credentials — only the ticket key and the report secret.
- **Database** — Neon. `npm run db:init` applies the schema; migrations are idempotent.
