// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/// Catbox Dash on BSC.
/// Ticket prices: SCOUT 1 / RUNNER 3 / PHANTOM 6 / VAULT 10 LIM.
/// Leftover after a run: weekly board 50% / invite board 20% / burn to dead 30%.
contract CatboxDash {
    address public constant LIM = 0x1D6430FDFC63ea481fE157017B47530663C96001;
    address public constant OWNER = 0x252B70B928B0cEF1326305cB6eb065852d0F76Eb;
    address public constant VAULT = 0x252B70B928B0cEF1326305cB6eb065852d0F76Eb;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 private constant ACC = 1e18;
    uint256 public constant TIER_COUNT = 4;

    uint256[4] private _ticketPrice;
    uint256 public nextRunId = 1;
    uint256 public burnedTotal;

    uint256 public weekPool;
    uint256 public invitePool;

    uint256 public weekAcc;
    uint256 public inviteAcc;

    uint256 public weekPtsTotal;
    uint256 public invitePtsTotal;

    mapping(address => uint256) public weekPts;
    mapping(address => uint256) public invitePts;
    mapping(address => uint256) public weekDebt;
    mapping(address => uint256) public inviteDebt;
    mapping(address => address) public refOf;

    struct Run {
        address player;
        uint256 paid;
        uint64 startedAt;
        bool settled;
    }
    mapping(uint256 => Run) public runs;
    mapping(address => uint256) public activeRun;

    event TicketSet(uint256 indexed tierId, uint256 price);
    event RunStarted(uint256 indexed runId, address indexed player, address indexed referrer, uint256 paid);
    event RunSettled(
        uint256 indexed runId,
        address indexed player,
        uint256 collected,
        uint256 leftover,
        uint256 score,
        uint256 burned
    );
    event Burned(address indexed player, uint256 amount);
    event Claimed(address indexed player, uint256 amount);
    event WeeklyWithdraw(address indexed to, uint256 amount);

    constructor() {
        _ticketPrice[0] = 1 ether;
        _ticketPrice[1] = 3 ether;
        _ticketPrice[2] = 6 ether;
        _ticketPrice[3] = 10 ether;
    }

    modifier onlyOwner() {
        require(msg.sender == OWNER, "not owner");
        _;
    }

    function ticketPrice(uint256 tierId) public view returns (uint256) {
        require(tierId < TIER_COUNT, "tier");
        return _ticketPrice[tierId];
    }

    function setTicketPrice(uint256 tierId, uint256 price) external onlyOwner {
        require(tierId < TIER_COUNT, "tier");
        require(price > 0, "price");
        _ticketPrice[tierId] = price;
        emit TicketSet(tierId, price);
    }

    function enter(address referrer, uint256 tierId) external returns (uint256 runId) {
        require(activeRun[msg.sender] == 0, "active run");
        uint256 price = ticketPrice(tierId);
        _pull(msg.sender, price);

        if (refOf[msg.sender] == address(0) && referrer != address(0) && referrer != msg.sender) {
            refOf[msg.sender] = referrer;
        }
        address ref = refOf[msg.sender];
        if (ref != address(0)) _addInvite(ref, 10);

        runId = nextRunId++;
        runs[runId] = Run(msg.sender, price, uint64(block.timestamp), false);
        activeRun[msg.sender] = runId;
        emit RunStarted(runId, msg.sender, ref, price);
    }

    function settle(uint256 collected, uint256 score) external {
        uint256 runId = activeRun[msg.sender];
        require(runId != 0, "no run");
        _settle(runId, collected, score);
    }

    function expire(address player) external {
        uint256 runId = activeRun[player];
        require(runId != 0, "no run");
        require(block.timestamp >= uint256(runs[runId].startedAt) + 2 hours, "too early");
        _settle(runId, 0, 0);
    }

    function pending(address user) public view returns (uint256 inv, uint256 wk, uint256 total) {
        inv = invitePts[user] * inviteAcc / ACC - inviteDebt[user];
        wk = weekPts[user] * weekAcc / ACC - weekDebt[user];
        total = inv + wk;
    }

    function claim() external {
        (uint256 inv, uint256 wk, uint256 tot) = pending(msg.sender);
        require(tot > 0, "none");
        inviteDebt[msg.sender] = invitePts[msg.sender] * inviteAcc / ACC;
        weekDebt[msg.sender] = weekPts[msg.sender] * weekAcc / ACC;
        if (inv > invitePool) inv = invitePool;
        if (wk > weekPool) wk = weekPool;
        tot = inv + wk;
        invitePool -= inv;
        weekPool -= wk;
        _push(msg.sender, tot);
        emit Claimed(msg.sender, tot);
    }

    function withdrawWeekly(uint256 amount) external onlyOwner {
        uint256 avail = weekPool + invitePool;
        require(amount > 0 && amount <= avail, "pool");
        uint256 left = amount;
        uint256 take = left > invitePool ? invitePool : left;
        invitePool -= take;
        left -= take;
        weekPool -= left;
        _push(VAULT, amount);
        emit WeeklyWithdraw(VAULT, amount);
    }

    function _settle(uint256 runId, uint256 collected, uint256 score) internal {
        Run storage r = runs[runId];
        require(!r.settled, "settled");
        require(block.timestamp >= uint256(r.startedAt) + 5, "too soon");
        if (collected > r.paid) collected = r.paid;
        r.settled = true;
        activeRun[r.player] = 0;

        uint256 leftover = r.paid - collected;
        uint256 burned = 0;
        if (collected > 0) _push(r.player, collected);
        if (score > 0) _addWeek(r.player, score);
        if (leftover > 0) {
            uint256 toInvite = leftover * 20 / 100;
            uint256 toWeek = leftover * 50 / 100;
            burned = leftover - toInvite - toWeek;
            _fund(toInvite, toWeek);
            if (burned > 0) {
                _push(DEAD, burned);
                burnedTotal += burned;
                emit Burned(r.player, burned);
            }
        }
        emit RunSettled(runId, r.player, collected, leftover, score, burned);
    }

    function _fund(uint256 i, uint256 w) internal {
        if (i > 0 && invitePtsTotal > 0) {
            inviteAcc += i * ACC / invitePtsTotal;
            invitePool += i;
        } else {
            w += i;
        }
        if (w > 0 && weekPtsTotal > 0) {
            weekAcc += w * ACC / weekPtsTotal;
            weekPool += w;
        } else if (w > 0) {
            weekPool += w;
        }
    }

    function _addWeek(address u, uint256 pts) internal {
        weekDebt[u] += pts * weekAcc / ACC;
        weekPts[u] += pts;
        weekPtsTotal += pts;
    }

    function _addInvite(address u, uint256 pts) internal {
        inviteDebt[u] += pts * inviteAcc / ACC;
        invitePts[u] += pts;
        invitePtsTotal += pts;
    }

    function _pull(address from, uint256 value) internal {
        (bool ok, bytes memory data) = LIM.call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, address(this), value)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "pay failed");
    }

    function _push(address to, uint256 value) internal {
        (bool ok, bytes memory data) = LIM.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, value)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "transfer failed");
    }
}
