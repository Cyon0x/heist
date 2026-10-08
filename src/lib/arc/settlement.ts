import "server-only";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC, ARC_MIN_MAX_FEE_PER_GAS, USDC_EVM } from "./chain";
import { serverEnv, isEscrowConfigured } from "../env";

/**
 * The only bridge between a finished match and money.
 *
 *   match completes (server-authoritative)
 *     -> server signs an EIP-712 Settlement attestation
 *       -> anyone submits `settle` to HeistEscrow
 *         -> contract pays the winner and takes the fee
 *
 * HEIST never calls `transfer` from an operator wallet. If this service is
 * misconfigured or down, funds sit safely in escrow and become refundable after
 * the contract's refund delay — they never become unreachable.
 */

export const ESCROW_ABI = parseAbi([
  "function openMatch(bytes32 matchId, address playerOne, address playerTwo, uint128 stake) external",
  "function settle(bytes32 matchId, address winner, uint64 nonce, bytes signature) external",
  "function cancelMatch(bytes32 matchId) external",
  "function lastNonce(bytes32 matchId) external view returns (uint64)",
  "function matches(bytes32 matchId) external view returns (address playerOne, address playerTwo, uint128 stake, uint64 createdAt, uint8 status)",
  "function digestOf(bytes32 matchId, address winner, uint64 nonce) external view returns (bytes32)",
  "event Settled(bytes32 indexed matchId, address indexed winner, uint128 toWinner, uint128 toTreasury, uint64 nonce)",
]);

/** Mirror of HeistEscrow.Settlement — the exact struct the contract hashes. */
export const SETTLEMENT_TYPES = {
  Settlement: [
    { name: "matchId", type: "bytes32" },
    { name: "winner", type: "address" },
    { name: "nonce", type: "uint64" },
  ],
} as const;

const STATUS_NAMES = ["NONE", "OPEN", "FUNDED", "SETTLED", "CANCELLED"] as const;

export interface SettlementPlan {
  matchId: Hex;
  winner: Address;
  nonce: bigint;
  digest: Hex;
  signature: Hex;
}

export class EscrowNotConfigured extends Error {
  constructor() {
    super("HEIST_ESCROW_ADDRESS / SETTLEMENT_PRIVATE_KEY are not set on this environment.");
    this.name = "EscrowNotConfigured";
  }
}

function clients(): { pub: PublicClient; wallet: WalletClient; escrow: Address; account: ReturnType<typeof privateKeyToAccount> } {
  const env = serverEnv();
  if (!isEscrowConfigured()) throw new EscrowNotConfigured();
  const account = privateKeyToAccount(env.settlementKey as Hex);
  const transport = http(ARC_RPC_URL(), { batch: false, retryCount: 2 });
  return {
    pub: createPublicClient({ chain: ARC, transport }) as PublicClient,
    wallet: createWalletClient({ chain: ARC, transport, account }) as WalletClient,
    escrow: env.escrowAddress as Address,
    account,
  };
}

const ARC_RPC_URL = () => ARC.rpcUrls.default.http[0];

/** match ids are UUIDs off-chain; the chain wants bytes32. */
export function toMatchId(uuid: string): Hex {
  const clean = uuid.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(clean)) {
    throw new Error(`not a uuid: ${uuid}`);
  }
  return `0x${clean}` as Hex;
}

/** Stake in the 6-decimal ERC-20 units the escrow contract uses. */
export const stakeToUnits = (stakeUnits: number): bigint => BigInt(Math.round(stakeUnits));

export async function readMatchState(matchId: Hex) {
  const { pub, escrow } = clients();
  const [playerOne, playerTwo, stake, createdAt, status] = (await pub.readContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "matches",
    args: [matchId],
  })) as readonly [Address, Address, bigint, bigint, number];
  return { playerOne, playerTwo, stake, createdAt, status, statusName: STATUS_NAMES[status]! };
}

/**
 * Build and sign the attestation, without broadcasting. Keeping the two steps
 * apart means the caller can persist the plan and retry the broadcast.
 */
export async function signSettlement(input: { matchId: Hex; winner: Address }): Promise<SettlementPlan> {
  const { pub, wallet, escrow, account } = clients();
  const nonce = ((await pub.readContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "lastNonce",
    args: [input.matchId],
  })) as bigint) + 1n;

  const signature = await wallet.signTypedData({
    account,
    domain: { name: "HEIST", version: "1", chainId: ARC.id, verifyingContract: escrow },
    types: SETTLEMENT_TYPES,
    primaryType: "Settlement",
    message: { matchId: input.matchId, winner: input.winner, nonce },
  });

  const digest = (await pub.readContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "digestOf",
    args: [input.matchId, input.winner, nonce],
  })) as Hex;

  return { matchId: input.matchId, winner: input.winner, nonce, digest, signature };
}

/**
 * Submit a signed settlement. Waits for one confirmation — Arc has sub-second
 * deterministic finality, so one confirmation is final, not probabilistic.
 */
export async function submitSettlement(plan: SettlementPlan): Promise<Hex> {
  const { pub, wallet, escrow } = clients();
  const gasPrice = await pub.getGasPrice();
  const maxFeePerGas = gasPrice > ARC_MIN_MAX_FEE_PER_GAS ? gasPrice : ARC_MIN_MAX_FEE_PER_GAS;

  const hash = await wallet.writeContract({
    chain: ARC,
    account: wallet.account!,
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "settle",
    args: [plan.matchId, plan.winner, plan.nonce, plan.signature],
    // Arc drops anything below the 20 Gwei floor without an error, so the floor
    // is applied explicitly rather than trusting the estimator.
    maxFeePerGas,
    maxPriorityFeePerGas: maxFeePerGas,
  });

  const receipt = await pub.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 60_000 });
  if (receipt.status !== "success") {
    throw new Error(`settlement reverted: ${hash}`);
  }
  return hash;
}

export async function settleMatch(input: { matchId: Hex; winner: Address }): Promise<{ txHash: Hex; plan: SettlementPlan }> {
  const state = await readMatchState(input.matchId);
  if (state.statusName === "SETTLED") throw new Error("already settled");
  if (state.statusName !== "FUNDED") throw new Error(`cannot settle a match in state ${state.statusName}`);
  if (state.playerOne !== input.winner && state.playerTwo !== input.winner) {
    throw new Error("winner is not a participant");
  }
  const plan = await signSettlement(input);
  const txHash = await submitSettlement(plan);
  return { txHash, plan };
}

export const escrowAddress = () => (serverEnv().escrowAddress || null) as Address | null;
export const settlementSigner = () => {
  if (!serverEnv().settlementKey) return null;
  return privateKeyToAccount(serverEnv().settlementKey as Hex).address;
};
export const usdcAddress = USDC_EVM;
