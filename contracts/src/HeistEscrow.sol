// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title HeistEscrow
 * @notice Holds both players' USDC entries for a HEIST match and pays the winner
 *         on a signed attestation from the game server. Gameplay never touches
 *         the chain; this contract only moves money once a result is final.
 *
 * Settlement model
 * ----------------
 * The authoritative game server signs an EIP-712 `Settlement` struct. Anyone may
 * submit it (the server, a player, or a relayer) — the signature is the authority,
 * not the sender. `matchId` + a strictly increasing `nonce` make a settlement
 * single-use, so a replayed or duplicated attestation cannot pay twice.
 *
 * Loss-of-funds safety: if a funded match is never settled, either player can
 * claim a full refund after `refundDelay`. Funds cannot be stuck behind an
 * unresponsive operator.
 */
contract HeistEscrow {
    /* ------------------------------------------------------------- types --- */

    enum Status {
        None,
        Open, // created, awaiting deposits
        Funded, // both entries escrowed
        Settled, // winner + treasury paid
        Cancelled // created but never funded
    }

    struct Match {
        address playerOne;
        address playerTwo;
        uint128 stake; // per player, in USDC units (6 dp)
        uint64 createdAt;
        Status status;
    }

    struct Settlement {
        bytes32 matchId;
        address winner; // address(0) only for a fee-free void
        uint64 nonce;
    }

    /* ------------------------------------------------------------ storage --- */

    bytes32 public constant SETTLEMENT_TYPEHASH =
        keccak256("Settlement(bytes32 matchId,address winner,uint64 nonce)");

    /// @notice USDC's ERC-20 interface on Arc (6 decimals).
    IERC20 public immutable usdc;
    address public immutable owner;

    /// @notice Receives the protocol fee. Set once, visible forever.
    address public treasury;

    /// @notice 900 = 90% to the winner, 10% to the treasury. Capped at 20%.
    uint16 public feeBps;

    /// @notice The only key whose EIP-712 signature can settle a match.
    address public attestor;

    /// @notice How long a funded match may sit unsettled before either player
    /// can take a refund. Default 6 hours.
    uint64 public refundDelay = 6 hours;

    bool public paused;

    mapping(bytes32 => Match) public matches;
    mapping(bytes32 => mapping(address => bool)) public deposited;
    /// @notice Highest nonce already used per match id. Settlement nonces must
    /// exceed it, which makes any captured signature worthless after use.
    mapping(bytes32 => uint64) public lastNonce;

    /* ------------------------------------------------------------- events --- */

    event MatchOpened(bytes32 indexed matchId, address indexed playerOne, address indexed playerTwo, uint128 stake);
    event Deposited(bytes32 indexed matchId, address indexed player, uint128 amount);
    event MatchFunded(bytes32 indexed matchId, uint128 pot);
    event Settled(bytes32 indexed matchId, address indexed winner, uint128 toWinner, uint128 toTreasury, uint64 nonce);
    event Cancelled(bytes32 indexed matchId);
    event Refunded(bytes32 indexed matchId, address indexed player, uint128 amount);
    event AttestorChanged(address indexed previous, address indexed next);
    event TreasuryChanged(address indexed previous, address indexed next);
    event FeeChanged(uint16 previous, uint16 next);
    event PausedSet(bool paused);

    /* ------------------------------------------------------------- errors --- */

    error NotOwner();
    error NotAttestor();
    error Paused();
    error ZeroAddress();
    error BadStake();
    error SamePlayer();
    error MatchExists();
    error UnknownMatch();
    error WrongStatus();
    error NotPlayer();
    error AlreadyDeposited();
    error NotFunded();
    error AlreadySettled();
    error BadSignature();
    error StaleNonce();
    error TooEarly();
    error FeeTooHigh();
    error TransferFailed();

    /* --------------------------------------------------------- modifiers --- */

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAttestor() {
        if (msg.sender != attestor) revert NotAttestor();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    /* ------------------------------------------------------ construction --- */

    constructor(address usdc_, address treasury_, address attestor_, uint16 feeBps_) {
        if (usdc_ == address(0) || treasury_ == address(0) || attestor_ == address(0)) revert ZeroAddress();
        if (feeBps_ > 2000) revert FeeTooHigh();
        usdc = IERC20(usdc_);
        treasury = treasury_;
        attestor = attestor_;
        feeBps = feeBps_;
        owner = msg.sender;
    }

    /* ------------------------------------------------------------ opening --- */

    /**
     * @notice Register a match and its two players. Only the attestor may do
     *         this, so a stranger cannot create junk matches that block ids.
     */
    function openMatch(bytes32 matchId, address playerOne, address playerTwo, uint128 stake)
        external
        onlyAttestor
        whenNotPaused
    {
        if (playerOne == address(0) || playerTwo == address(0)) revert ZeroAddress();
        if (playerOne == playerTwo) revert SamePlayer();
        if (stake == 0) revert BadStake();
        if (matches[matchId].status != Status.None) revert MatchExists();

        matches[matchId] = Match({
            playerOne: playerOne,
            playerTwo: playerTwo,
            stake: stake,
            createdAt: uint64(block.timestamp),
            status: Status.Open
        });
        emit MatchOpened(matchId, playerOne, playerTwo, stake);
    }

    /**
     * @notice Escrow one entry. Each player deposits exactly once; the match
     *         becomes Funded when both have. Funds stay in this contract until
     *         settlement or refund — never in an operator wallet.
     */
    function deposit(bytes32 matchId) external whenNotPaused {
        Match storage m = matches[matchId];
        if (m.status == Status.None) revert UnknownMatch();
        if (m.status != Status.Open) revert WrongStatus();
        if (msg.sender != m.playerOne && msg.sender != m.playerTwo) revert NotPlayer();
        if (deposited[matchId][msg.sender]) revert AlreadyDeposited();

        deposited[matchId][msg.sender] = true;
        if (!_pull(msg.sender, m.stake)) revert TransferFailed();
        emit Deposited(matchId, msg.sender, m.stake);

        if (deposited[matchId][m.playerOne] && deposited[matchId][m.playerTwo]) {
            m.status = Status.Funded;
            emit MatchFunded(matchId, uint128(uint256(m.stake) * 2));
        }
    }

    /* --------------------------------------------------------- settlement --- */

    /**
     * @notice Pay out a finished match. Anyone can relay this transaction; the
     *         EIP-712 signature from the attestor is what authorises it.
     */
    function settle(bytes32 matchId, address winner, uint64 nonce, bytes calldata signature)
        external
        whenNotPaused
    {
        Match storage m = matches[matchId];
        if (m.status != Status.Funded) revert NotFunded();
        if (nonce <= lastNonce[matchId]) revert StaleNonce();
        if (winner != m.playerOne && winner != m.playerTwo) revert NotPlayer();

        bytes32 digest = _digest(matchId, winner, nonce);
        if (_recover(digest, signature) != attestor) revert BadSignature();

        // Effects before interactions, and the nonce is consumed here so a
        // duplicate submission of the same signed payload reverts as StaleNonce.
        lastNonce[matchId] = nonce;
        m.status = Status.Settled;

        uint256 pot = uint256(m.stake) * 2;
        uint256 fee = (pot * feeBps) / 10_000;
        uint256 toWinner = pot - fee;

        if (toWinner > 0 && !_push(winner, toWinner)) revert TransferFailed();
        if (fee > 0 && !_push(treasury, fee)) revert TransferFailed();

        emit Settled(matchId, winner, uint128(toWinner), uint128(fee), nonce);
    }

    /**
     * @notice Cancel a match that never reached Funded. If one player already
     *         deposited, their entry is returned to them.
     */
    function cancelMatch(bytes32 matchId) external onlyAttestor {
        Match storage m = matches[matchId];
        if (m.status != Status.Open) revert WrongStatus();
        m.status = Status.Cancelled;
        emit Cancelled(matchId);
    }

    /** @notice Withdraw a deposit from a cancelled match. */
    function claimCancelled(bytes32 matchId) external {
        Match storage m = matches[matchId];
        if (m.status != Status.Cancelled) revert WrongStatus();
        if (!deposited[matchId][msg.sender]) revert NotPlayer();
        deposited[matchId][msg.sender] = false;
        if (!_push(msg.sender, m.stake)) revert TransferFailed();
        emit Refunded(matchId, msg.sender, m.stake);
    }

    /**
     * @notice Escape hatch for a funded match the attestor never settled.
     *         Reverts before the delay so it cannot be used to race a legitimate
     *         settlement, and pays both players their own entry back.
     */
    function refundStale(bytes32 matchId) external {
        Match storage m = matches[matchId];
        if (m.status != Status.Funded) revert NotFunded();
        if (block.timestamp < uint256(m.createdAt) + refundDelay) revert TooEarly();

        m.status = Status.Cancelled;
        if (!_push(m.playerOne, m.stake)) revert TransferFailed();
        if (!_push(m.playerTwo, m.stake)) revert TransferFailed();
        emit Refunded(matchId, m.playerOne, m.stake);
        emit Refunded(matchId, m.playerTwo, m.stake);
    }

    /* --------------------------------------------------------------- view --- */

    function digestOf(bytes32 matchId, address winner, uint64 nonce) external view returns (bytes32) {
        return _digest(matchId, winner, nonce);
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparator();
    }

    function matchState(bytes32 matchId)
        external
        view
        returns (address playerOne, address playerTwo, uint128 stake, Status status, bool oneIn, bool twoIn)
    {
        Match storage m = matches[matchId];
        return (m.playerOne, m.playerTwo, m.stake, m.status, deposited[matchId][m.playerOne], deposited[matchId][m.playerTwo]);
    }

    /* ------------------------------------------------------------ admin --- */

    function setAttestor(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        emit AttestorChanged(attestor, next);
        attestor = next;
    }

    function setTreasury(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        emit TreasuryChanged(treasury, next);
        treasury = next;
    }

    function setFeeBps(uint16 next) external onlyOwner {
        if (next > 2000) revert FeeTooHigh();
        emit FeeChanged(feeBps, next);
        feeBps = next;
    }

    function setRefundDelay(uint64 next) external onlyOwner {
        refundDelay = next;
    }

    /** @notice Freezes new deposits and settlements. Refunds stay open. */
    function setPaused(bool next) external onlyOwner {
        paused = next;
        emit PausedSet(next);
    }

    /* ---------------------------------------------------------- internals --- */

    function _digest(bytes32 matchId, address winner, uint64 nonce) internal view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(SETTLEMENT_TYPEHASH, matchId, winner, nonce));
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("HEIST"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    /// @dev EIP-2098-tolerant ECDSA recovery with malleability rejection.
    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        // Reject the upper half of the curve order: for every valid (r, s) there
        // is a second signature (r, -s) that recovers the same address.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        return ecrecover(digest, v, r, s);
    }

    function _pull(address from, uint128 amount) internal returns (bool) {
        return _safeTransferFrom(from, address(this), amount);
    }

    function _push(address to, uint256 amount) internal returns (bool) {
        return _safeTransfer(to, amount);
    }

    function _safeTransfer(address to, uint256 amount) internal returns (bool) {
        (bool ok, bytes memory data) = address(usdc).call(abi.encodeCall(IERC20.transfer, (to, amount)));
        return ok && (data.length == 0 || abi.decode(data, (bool)));
    }

    function _safeTransferFrom(address from, address to, uint256 amount) internal returns (bool) {
        (bool ok, bytes memory data) = address(usdc).call(abi.encodeCall(IERC20.transferFrom, (from, to, amount)));
        return ok && (data.length == 0 || abi.decode(data, (bool)));
    }
}

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}
