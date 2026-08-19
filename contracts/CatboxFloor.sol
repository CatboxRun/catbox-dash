// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IFreeGame {
    function runs(uint256)
        external
        view
        returns (address player, uint256 paid, uint64 startedAt, bool settled);
}

interface IPaidGame {
    function runs(uint256)
        external
        view
        returns (address player, uint256 paid, uint64 startedAt, bool settled, bool free);
}

/// Equal-split floor pool. Independent of V6 dayPts board.
/// One share per address that recorded a settled run that Singapore day.
/// Claim yesterday during the 1-hour Singapore midnight window.
/// Unclaimed leftover rolls into the next day's live pool.
contract CatboxFloor {
    address public constant LIM = 0x1D6430FDFC63ea481fE157017B47530663C96001;
    address public constant OWNER = 0x252B70B928B0cEF1326305cB6eb065852d0F76Eb;
    address public constant V5 = 0x1825d6a5dB35c5417E7a11dF9cB188E0F7b4a4C2;
    address public constant V6 = 0x72Ef0ab9C44dc7c97300C6dc8DF331a33D5783B5;
    uint256 public constant DAY = 1 days;
    uint256 public constant BJ_OFFSET = 8 hours;
    uint256 public constant CLAIM_WINDOW = 1 hours;

    uint256 public dayCursor;
    uint256 public livePool;
    uint256 public liveCount;
    uint256 public lastFrozenDay;
    mapping(uint256 => uint256) public frozenPool;
    mapping(uint256 => uint256) public frozenCount;
    mapping(uint256 => uint256) public claimedPaid;
    mapping(uint256 => bool) public recycled;
    mapping(address => uint256) public markedDay;
    mapping(address => uint256) public owedDay;
    mapping(address => mapping(uint256 => bool)) public claimed;

    event Funded(address indexed from, uint256 amount);
    event Marked(address indexed player, uint256 day);
    event Claimed(address indexed player, uint256 day, uint256 amount);
    event Rolled(uint256 indexed day, uint256 pool, uint256 players);
    event Recycled(uint256 indexed day, uint256 leftover);
    event Withdrawn(address indexed to, uint256 amount);

    constructor() {
        dayCursor = currentDay();
    }

    modifier onlyOwner() {
        require(msg.sender == OWNER, "not owner");
        _;
    }

    function currentDay() public view returns (uint256) {
        return (block.timestamp + BJ_OFFSET) / DAY;
    }

    function pool() public view returns (uint256) {
        return IERC20(LIM).balanceOf(address(this));
    }

    function fund(uint256 amount) external {
        require(amount > 0, "amt");
        _rollDay();
        _pull(msg.sender, amount);
        livePool += amount;
        emit Funded(msg.sender, amount);
    }

    function withdrawLive(uint256 amount) external onlyOwner {
        _rollDay();
        require(amount > 0 && amount <= livePool, "pool");
        livePool -= amount;
        _push(OWNER, amount);
        emit Withdrawn(OWNER, amount);
    }

    /// Player records a settled V5 (paidLane=false) or V6 (paidLane=true) run.
    function record(uint256 runId, bool paidLane) external {
        address player;
        bool settled;
        if (paidLane) {
            (player, , , settled, ) = IPaidGame(V6).runs(runId);
        } else {
            (player, , , settled) = IFreeGame(V5).runs(runId);
        }
        require(player == msg.sender, "player");
        require(settled, "open");
        _mark(player);
    }

    /// Owner backfill for addresses that already played today.
    function mark(address[] calldata users) external onlyOwner {
        uint256 n = users.length;
        for (uint256 i = 0; i < n; i++) {
            address u = users[i];
            if (u != address(0)) _mark(u);
        }
    }

    /// Anyone can poke after the claim window so leftover moves into today's pool.
    function recycle() external {
        _rollDay();
    }

    function pending(address user) public view returns (uint256) {
        uint256 today = currentDay();
        uint256 d = _claimDay(user, today);
        if (d == 0 || today <= d || recycled[d]) return 0;
        uint256 n;
        uint256 p;
        if (d == dayCursor && today > dayCursor) {
            n = liveCount;
            p = livePool;
        } else {
            n = frozenCount[d];
            p = frozenPool[d];
        }
        if (n == 0) return 0;
        return p / n;
    }

    function claim() external {
        _rollDay();
        uint256 today = currentDay();
        uint256 d = _claimDay(msg.sender, today);
        require(d != 0 && d < today && !recycled[d], "none");
        uint256 n = frozenCount[d];
        require(n > 0, "none");
        uint256 share = frozenPool[d] / n;
        require(share > 0, "none");
        claimed[msg.sender][d] = true;
        if (owedDay[msg.sender] == d) owedDay[msg.sender] = 0;
        claimedPaid[d] += share;
        _push(msg.sender, share);
        emit Claimed(msg.sender, d, share);
    }

    function _claimDay(address user, uint256 today) internal view returns (uint256) {
        uint256 o = owedDay[user];
        if (o != 0 && o < today && !claimed[user][o] && !recycled[o]) return o;
        uint256 d = markedDay[user];
        if (d != 0 && d < today && !claimed[user][d] && !recycled[d]) return d;
        return 0;
    }

    function _mark(address user) internal {
        _rollDay();
        uint256 today = currentDay();
        uint256 prev = markedDay[user];
        if (prev == today) return;
        if (
            prev != 0 &&
            prev < today &&
            !claimed[user][prev] &&
            owedDay[user] == 0 &&
            !recycled[prev]
        ) {
            owedDay[user] = prev;
        }
        liveCount += 1;
        markedDay[user] = today;
        emit Marked(user, today);
    }

    function _dayStart(uint256 day) internal pure returns (uint256) {
        return day * DAY - BJ_OFFSET;
    }

    function _maybeRecycle() internal {
        uint256 d = lastFrozenDay;
        if (d == 0 || recycled[d]) return;
        uint256 open = _dayStart(d + 1);
        if (block.timestamp < open + CLAIM_WINDOW) return;
        uint256 paid = claimedPaid[d];
        uint256 frozen = frozenPool[d];
        uint256 leftover = frozen > paid ? frozen - paid : 0;
        recycled[d] = true;
        if (leftover > 0) livePool += leftover;
        emit Recycled(d, leftover);
    }

    function _rollDay() internal {
        _maybeRecycle();
        uint256 d = currentDay();
        if (dayCursor == 0) {
            dayCursor = d;
            return;
        }
        if (d <= dayCursor) return;
        if (liveCount > 0) {
            frozenPool[dayCursor] = livePool;
            frozenCount[dayCursor] = liveCount;
            lastFrozenDay = dayCursor;
            emit Rolled(dayCursor, livePool, liveCount);
            livePool = 0;
        }
        liveCount = 0;
        dayCursor = d;
        _maybeRecycle();
    }

    function _push(address to, uint256 value) internal {
        (bool ok, bytes memory data) = LIM.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, value)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "push");
    }

    function _pull(address from, uint256 value) internal {
        (bool ok, bytes memory data) = LIM.call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, address(this), value)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "pull");
    }
}
