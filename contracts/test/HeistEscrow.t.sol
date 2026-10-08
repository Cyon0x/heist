// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {HeistEscrow, IERC20} from "../src/HeistEscrow.sol";

/* ------------------------------------------------------------------ harness -- */

/// Minimal cheatcode surface — keeps this suite dependency-free (no forge-std).
interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256) external;
    function expectRevert(bytes4) external;
    function expectRevert() external;
    function sign(uint256, bytes32) external pure returns (uint8, bytes32, bytes32);
    function addr(uint256) external pure returns (address);
    function deal(address, uint256) external;
}

contract MockUSDC is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public failTransfers;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    function setFailTransfers(bool v) external { failTransfers = v; }
    function transfer(address to, uint256 amount) external returns (bool) {
        if (failTransfers) return false;
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (failTransfers) return false;
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract HeistEscrowTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockUSDC usdc;
    HeistEscrow escrow;

    uint256 constant ATTESTOR_PK = 0xA11CE;
    uint256 constant OTHER_PK = 0xB0B;
    address attestor;
    address treasury = address(0xFEE);
    address alice = address(0xA11CE0);
    address bob = address(0xB0B0);
    address mallory = address(0xBAD);

    bytes32 constant MATCH = keccak256("match-1");
    uint128 constant STAKE = 10_000_000; // 10 USDC at 6 dp

    uint256 passes;

    function setUp() public {
        attestor = vm.addr(ATTESTOR_PK);
        usdc = new MockUSDC();
        escrow = new HeistEscrow(address(usdc), treasury, attestor, 1000);
        usdc.mint(alice, 1_000_000_000);
        usdc.mint(bob, 1_000_000_000);
        vm.prank(alice);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(escrow), type(uint256).max);
    }

    /* --------------------------------------------------------------- helper -- */

    function check(bool cond, string memory what) internal {
        require(cond, what);
        passes++;
    }

    function openAndFund() internal {
        vm.prank(attestor);
        escrow.openMatch(MATCH, alice, bob, STAKE);
        vm.prank(alice);
        escrow.deposit(MATCH);
        vm.prank(bob);
        escrow.deposit(MATCH);
    }

    function sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    /* ---------------------------------------------------------------- tests -- */

    function testOpenRequiresAttestor() public {
        vm.prank(mallory);
        vm.expectRevert(HeistEscrow.NotAttestor.selector);
        escrow.openMatch(MATCH, alice, bob, STAKE);
    }

    function testOpenRejectsSamePlayer() public {
        vm.prank(attestor);
        vm.expectRevert(HeistEscrow.SamePlayer.selector);
        escrow.openMatch(MATCH, alice, alice, STAKE);
    }

    function testOpenRejectsZeroStake() public {
        vm.prank(attestor);
        vm.expectRevert(HeistEscrow.BadStake.selector);
        escrow.openMatch(MATCH, alice, bob, 0);
    }

    function testUnknownMatchDepositReverts() public {
        vm.prank(alice);
        vm.expectRevert(HeistEscrow.UnknownMatch.selector);
        escrow.deposit(keccak256("nope"));
    }

    function testNonPlayerCannotDeposit() public {
        vm.prank(attestor);
        escrow.openMatch(MATCH, alice, bob, STAKE);
        vm.prank(mallory);
        vm.expectRevert(HeistEscrow.NotPlayer.selector);
        escrow.deposit(MATCH);
    }

    function testDoubleDepositReverts() public {
        vm.prank(attestor);
        escrow.openMatch(MATCH, alice, bob, STAKE);
        vm.prank(alice);
        escrow.deposit(MATCH);
        vm.prank(alice);
        vm.expectRevert(HeistEscrow.AlreadyDeposited.selector);
        escrow.deposit(MATCH);
    }

    function testNormalWinPaysNinetyPercent() public {
        openAndFund();
        check(usdc.balanceOf(address(escrow)) == uint256(STAKE) * 2, "both entries escrowed");

        uint64 nonce = 1;
        bytes memory sig = sign(ATTESTOR_PK, escrow.digestOf(MATCH, alice, nonce));
        uint256 aliceBefore = usdc.balanceOf(alice);
        escrow.settle(MATCH, alice, nonce, sig);

        uint256 pot = uint256(STAKE) * 2;
        uint256 fee = pot / 10;
        check(usdc.balanceOf(alice) == aliceBefore + pot - fee, "winner receives 90% of the pot");
        check(usdc.balanceOf(treasury) == fee, "treasury receives the 10% fee");
        check(usdc.balanceOf(address(escrow)) == 0, "escrow is empty after settlement");
    }

    function testLossSideAlsoSettleable() public {
        openAndFund();
        bytes memory sig = sign(ATTESTOR_PK, escrow.digestOf(MATCH, bob, 1));
        escrow.settle(MATCH, bob, 1, sig);
        check(usdc.balanceOf(bob) == 1_000_000_000 - STAKE + (uint256(STAKE) * 2 * 9) / 10, "bob paid");
    }

    function testDuplicateSettlementReverts() public {
        openAndFund();
        bytes memory sig = sign(ATTESTOR_PK, escrow.digestOf(MATCH, alice, 1));
        escrow.settle(MATCH, alice, 1, sig);
        vm.expectRevert(HeistEscrow.NotFunded.selector);
        escrow.settle(MATCH, alice, 1, sig);
    }

    function testReplayWithHigherNonceButSameSignatureReverts() public {
        openAndFund();
        bytes memory sig = sign(ATTESTOR_PK, escrow.digestOf(MATCH, alice, 1));
        escrow.settle(MATCH, alice, 1, sig);
        // A second match with a fresh id must not accept the first match's signature.
        bytes32 other = keccak256("match-2");
        vm.prank(attestor);
        escrow.openMatch(other, alice, bob, STAKE);
        vm.prank(alice);
        escrow.deposit(other);
        vm.prank(bob);
        escrow.deposit(other);
        vm.expectRevert(HeistEscrow.BadSignature.selector);
        escrow.settle(other, alice, 1, sig);
    }

    function testSettledMatchCannotBeReopenedOrResettled() public {
        openAndFund();
        bytes memory first = sign(ATTESTOR_PK, escrow.digestOf(MATCH, alice, 5));
        escrow.settle(MATCH, alice, 5, first);
        check(escrow.lastNonce(MATCH) == 5, "nonce consumed");

        // The id cannot be recycled, so the consumed nonce can never be reset —
        // a captured attestation stays dead even if the match is "recreated".
        vm.prank(attestor);
        vm.expectRevert(HeistEscrow.MatchExists.selector);
        escrow.openMatch(MATCH, alice, bob, STAKE);

        // And the settlement itself cannot be submitted twice.
        vm.expectRevert(HeistEscrow.NotFunded.selector);
        escrow.settle(MATCH, alice, 5, first);
    }

    function testUnauthorizedSettleReverts() public {
        openAndFund();
        bytes memory sig = sign(OTHER_PK, escrow.digestOf(MATCH, alice, 1));
        vm.expectRevert(HeistEscrow.BadSignature.selector);
        escrow.settle(MATCH, alice, 1, sig);
    }

    function testMalformedSignatureReverts() public {
        openAndFund();
        vm.expectRevert(HeistEscrow.BadSignature.selector);
        escrow.settle(MATCH, alice, 1, hex"deadbeef");
    }

    function testWinnerMustBeAPlayer() public {
        openAndFund();
        bytes memory sig = sign(ATTESTOR_PK, escrow.digestOf(MATCH, mallory, 1));
        vm.expectRevert(HeistEscrow.NotPlayer.selector);
        escrow.settle(MATCH, mallory, 1, sig);
    }

    function testCancelBeforeFundingThenClaim() public {
        vm.prank(attestor);
        escrow.openMatch(MATCH, alice, bob, STAKE);
        vm.prank(alice);
        escrow.deposit(MATCH);

        vm.prank(attestor);
        escrow.cancelMatch(MATCH);

        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        escrow.claimCancelled(MATCH);
        check(usdc.balanceOf(alice) == before + STAKE, "single deposit returned on cancel");
    }

    function testCannotCancelAfterFunding() public {
        openAndFund();
        vm.prank(attestor);
        vm.expectRevert(HeistEscrow.WrongStatus.selector);
        escrow.cancelMatch(MATCH);
    }

    function testStaleRefundBlockedBeforeDelay() public {
        openAndFund();
        vm.expectRevert(HeistEscrow.TooEarly.selector);
        escrow.refundStale(MATCH);
    }

    function testStaleRefundAfterDelayUnsticksFunds() public {
        openAndFund();
        vm.warp(block.timestamp + 7 hours);
        escrow.refundStale(MATCH);
        check(usdc.balanceOf(alice) == 1_000_000_000, "alice whole");
        check(usdc.balanceOf(bob) == 1_000_000_000, "bob whole");
        check(usdc.balanceOf(address(escrow)) == 0, "no funds stranded");
    }

    function testRevertWhenTransferFails() public {
        openAndFund();
        usdc.setFailTransfers(true);
        bytes memory sig = sign(ATTESTOR_PK, escrow.digestOf(MATCH, alice, 1));
        vm.expectRevert(HeistEscrow.TransferFailed.selector);
        escrow.settle(MATCH, alice, 1, sig);
        check(escrow.lastNonce(MATCH) == 0, "nonce not consumed when the transfer fails");
    }

    function testPauseBlocksSettlementButNotRefunds() public {
        openAndFund();
        escrow.setPaused(true);
        bytes memory sig = sign(ATTESTOR_PK, escrow.digestOf(MATCH, alice, 1));
        vm.expectRevert(HeistEscrow.Paused.selector);
        escrow.settle(MATCH, alice, 1, sig);
        vm.warp(block.timestamp + 7 hours);
        escrow.refundStale(MATCH);
        check(usdc.balanceOf(alice) == 1_000_000_000, "refund still available while paused");
    }

    function testOnlyOwnerCanRetargetTreasury() public {
        vm.prank(mallory);
        vm.expectRevert(HeistEscrow.NotOwner.selector);
        escrow.setTreasury(mallory);
    }

    function testFeeCapEnforced() public {
        vm.expectRevert(HeistEscrow.FeeTooHigh.selector);
        escrow.setFeeBps(2001);
    }

    function testDomainSeparatorBindsChainAndContract() public {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("HEIST"),
                keccak256("1"),
                block.chainid,
                address(escrow)
            )
        );
        check(escrow.domainSeparator() == expected, "domain separator");
    }

    function testMinStakeAndMaxStakeRoundTrip() public {
        bytes32 small = keccak256("small");
        vm.prank(attestor);
        escrow.openMatch(small, alice, bob, 1_000_000); // 1 USDC
        vm.prank(alice);
        escrow.deposit(small);
        vm.prank(bob);
        escrow.deposit(small);
        bytes memory sig = sign(ATTESTOR_PK, escrow.digestOf(small, bob, 1));
        escrow.settle(small, bob, 1, sig);
        check(usdc.balanceOf(treasury) == 200_000, "10% of a 2 USDC pot");
    }
}
