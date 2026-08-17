// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// Catbox Dash V6 (paid lane). Live V5 keeps free SCOUT only.
/// Ticket: SCOUT 1 / RUNNER 3 / PHANTOM 6 / VAULT 10 LIM.
/// Leftover: daily board 50% / invite board 20% / burn 30%.
/// Daily 50%: yesterday's pool by dayPts share. Claim clears that day's shards.
/// Invite 20%: top 200. Claim clears invitePts for that wallet.
/// Coin payout: collected * (105%+…), cap ×2 / ×1.5; over-ticket from freePool (bonus reserve).
/// No free runs here — free SCOUT stays on V5 in parallel.
contract CatboxDash {
    address public constant LIM = 0x1D6430FDFC63ea481fE157017B47530663C96001;
    address public constant OWNER = 0x252B70B928B0cEF1326305cB6eb065852d0F76Eb;
    address public constant VAULT = 0x252B70B928B0cEF1326305cB6eb065852d0F76Eb;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 private constant ACC = 1e18;
    uint256 public constant TIER_COUNT = 4;
    uint256 public constant DAY = 1 days;
    uint256 public constant BJ_OFFSET = 8 hours;
    uint256 public constant BASE_BPS = 10500;
    uint256 public constant INVITE_BPS = 500;
    uint256 public constant PLAY_BPS = 10;
    uint256 public constant MAX_BPS = 20000;
    uint256 public constant TOP_CAP = 200;
    /// Max board score per run: ~250k pts per 1 LIM ticket (matches client coin formula headroom).
    uint256 public constant SCORE_PER_LIM = 250000;

    uint256[4] private _ticketPrice;
    uint256 public nextRunId = 1;
    uint256 public burnedTotal;

    uint256 public dayCursor;
    uint256 public dayPool;
    uint256 public dayEqPool;
    uint256 public dayPlayerCount;
    uint256 public frozenDayTotal;
    uint256 public owed;
    uint256 public invitePool;

    uint256 public dayAcc;
    uint256 public inviteAcc;
    uint256 public frozenInviteAcc;

    uint256 public dayPtsTotal;
    uint256 public invitePtsTotal;

    uint256 public freePool;
    uint256 public ticketFloat;
    uint8 public constant FREE_CAP = 2;
    mapping(address => uint8) public freeScoutUsed;
    mapping(address => bool) public tgClaimed;
    mapping(address => bool) public xClaimed;

    mapping(address => uint256) public dayPts;
    mapping(address => uint256) public invitePts;
    mapping(address => uint256) public dayDebt;
    mapping(address => uint256) public inviteDebt;
    mapping(address => address) public refOf;
    mapping(address => uint256) public inviteCount;
    mapping(address => uint256) public playCount;
    mapping(address => uint256) public scoredDay;
    mapping(address => uint256) public playedDay;
    mapping(address => uint256) public inviteDay;
    mapping(address => uint256) public inviteLockDay;
    mapping(address => uint256) public inviteLocked;
    mapping(address => uint256) public claimable;
    mapping(uint256 => uint256) public frozenAcc;
    mapping(uint256 => uint256) public dayPoolOf;
    mapping(uint256 => uint256) public frozenEqShare;

    address[200] public topInviters;
    uint256 public topLen;
    mapping(address => uint256) public topIndex;

    struct Run {
        address player;
        uint256 paid;
        uint64 startedAt;
        bool settled;
        bool free;
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
        uint256 burned,
        uint256 payout
    );
    event Burned(address indexed player, uint256 amount);
    event Claimed(address indexed player, uint256 amount);
    event DailyWithdraw(address indexed to, uint256 amount);
    event Funded(address indexed from, uint256 amount);
    event FreeEnter(address indexed player, uint256 indexed runId, uint8 used);
    event TgBonus(address indexed player);
    event XBonus(address indexed player);
    event Migrated(address indexed player, uint256 dayPtsSet, uint256 invitePtsSet);
    event BoardsFunded(address indexed from, uint256 toDay, uint256 toInvite);

    constructor() {
        _ticketPrice[0] = 1 ether;
        _ticketPrice[1] = 3 ether;
        _ticketPrice[2] = 6 ether;
        _ticketPrice[3] = 10 ether;
        dayCursor = currentDay();
    }

    modifier onlyOwner() {
        require(msg.sender == OWNER, "not owner");
        _;
    }

    function currentDay() public view returns (uint256) {
        return (block.timestamp + BJ_OFFSET) / DAY;
    }

    function nextClaimAt() public view returns (uint256) {
        uint256 bj = block.timestamp + BJ_OFFSET;
        return (bj / DAY + 1) * DAY - BJ_OFFSET;
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

    function rewardBps(address player) public view returns (uint256) {
        uint256 plays = playCount[player];
        uint256 extra = plays > 0 ? (plays - 1) * PLAY_BPS : 0;
        uint256 bps = BASE_BPS + inviteCount[player] * INVITE_BPS + extra;
        if (bps > MAX_BPS) bps = MAX_BPS;
        return bps;
    }

    function dailyPool() external view returns (uint256) {
        return dayPool + dayEqPool;
    }

    function weekPool() external view returns (uint256) {
        return dayPool + dayEqPool;
    }

    /// Frontend / snapshot aliases (V5 names).
    function weekPts(address u) external view returns (uint256) {
        return dayPts[u];
    }

    function weekPtsTotal() external view returns (uint256) {
        return dayPtsTotal;
    }

    function weekAcc() external view returns (uint256) {
        return dayAcc;
    }

    function weekDebt(address u) external view returns (uint256) {
        return dayDebt[u];
    }

    function freeUsed(address u) external view returns (uint8) {
        return freeScoutUsed[u];
    }

    function fund(uint256 amount) external {
        require(amount > 0, "amount");
        _pull(msg.sender, amount);
        freePool += amount;
        emit Funded(msg.sender, amount);
    }

    /// Seed daily / invite pools after migrating LIM from V5.
    function fundBoards(uint256 toDay, uint256 toInvite) external {
        require(toDay > 0 || toInvite > 0, "amount");
        uint256 total = toDay + toInvite;
        _pull(msg.sender, total);
        if (toDay > 0) {
            if (dayPtsTotal > 0) dayAcc += toDay * ACC / dayPtsTotal;
            dayPool += toDay;
        }
        if (toInvite > 0) {
            if (topLen > 0) inviteAcc += toInvite * ACC / topLen;
            invitePool += toInvite;
        }
        emit BoardsFunded(msg.sender, toDay, toInvite);
    }

    /// Paid lane: no free SCOUT (free stays on V5).
    function extraFreeCap(address) public pure returns (uint8) {
        return 0;
    }

    function tgFreeCap(address player) public view returns (uint8) {
        return extraFreeCap(player);
    }

    function claimTgBonus() external {
        require(!tgClaimed[msg.sender], "claimed");
        tgClaimed[msg.sender] = true;
        emit TgBonus(msg.sender);
    }

    function claimXBonus() external {
        require(!xClaimed[msg.sender], "claimed");
        xClaimed[msg.sender] = true;
        emit XBonus(msg.sender);
    }

    function scoutIsFree(address) public pure returns (bool) {
        return false;
    }

    function vaultIsFree(address) public pure returns (bool) {
        return false;
    }

    function freeForTier(address, uint256) public pure returns (bool) {
        return false;
    }

    function freeStatus(address) external view returns (uint8 used, uint8 left, uint256 pool, bool eligible) {
        used = 0;
        left = 0;
        pool = freePool;
        eligible = false;
    }

    function enter(address referrer, uint256 tierId) external returns (uint256 runId) {
        require(activeRun[msg.sender] == 0, "active run");
        uint256 price = ticketPrice(tierId);
        _rollDay();
        _pull(msg.sender, price);

        if (refOf[msg.sender] == address(0) && referrer != address(0) && referrer != msg.sender) {
            refOf[msg.sender] = referrer;
            inviteCount[referrer] += 1;
        }
        address ref = refOf[msg.sender];
        if (ref != address(0)) _addInvite(ref, 10);

        runId = nextRunId++;
        runs[runId] = Run(msg.sender, price, uint64(block.timestamp), false, false);
        activeRun[msg.sender] = runId;
        playCount[msg.sender] += 1;
        ticketFloat += price;
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

    function pending(address user) public view returns (uint256 inv, uint256 dayAmt, uint256 total) {
        inv = _invitePending(user);
        uint256 today = currentDay();
        uint256 share;
        if (dayPts[user] > 0 && scoredDay[user] != 0 && scoredDay[user] < today) {
            bool liveCursor = scoredDay[user] == dayCursor;
            uint256 acc = liveCursor ? dayAcc : frozenAcc[scoredDay[user]];
            uint256 poolLeft = liveCursor ? dayPool : dayPoolOf[scoredDay[user]];
            share = dayPts[user] * acc / ACC - dayDebt[user];
            if (share > poolLeft) share = poolLeft;
        }
        uint256 eq;
        uint256 pd = playedDay[user];
        if (pd != 0 && pd < today) {
            if (pd == dayCursor) {
                eq = dayPlayerCount > 0 ? dayEqPool / dayPlayerCount : 0;
            } else {
                eq = frozenEqShare[pd];
            }
        }
        dayAmt = claimable[user] + share + eq;
        total = inv + dayAmt;
    }

    function claim() external {
        uint256 invBefore = _invitePending(msg.sender);
        _syncUser(msg.sender);
        _harvestInvite(msg.sender);
        uint256 tot = claimable[msg.sender];
        require(tot > 0, "none");
        claimable[msg.sender] = 0;
        if (owed >= tot) owed -= tot;
        else owed = 0;
        // Past-day shards cleared in _syncUser. Only clear invite pts if invite rewards were due.
        if (invBefore > 0) _clearInvitePts(msg.sender);
        _push(msg.sender, tot);
        emit Claimed(msg.sender, tot);
    }

    function withdrawDaily(uint256 amount) external onlyOwner {
        _withdrawBoards(amount);
    }

    function withdrawWeekly(uint256 amount) external onlyOwner {
        _withdrawBoards(amount);
    }

    function _withdrawBoards(uint256 amount) internal {
        uint256 avail = dayPool + dayEqPool + invitePool;
        require(amount > 0 && amount <= avail, "pool");
        uint256 left = amount;
        uint256 take = left > invitePool ? invitePool : left;
        invitePool -= take;
        left -= take;
        if (left > 0) {
            uint256 fromEq = left > dayEqPool ? dayEqPool : left;
            dayEqPool -= fromEq;
            left -= fromEq;
            dayPool -= left;
        }
        _push(VAULT, amount);
        emit DailyWithdraw(VAULT, amount);
    }

    /// One-shot migration from V5 snapshot. Sets refs / plays / invite board / today's dayPts.
    function migratePlayers(
        address[] calldata users,
        uint256[] calldata dayScores,
        uint256[] calldata inviteScores,
        uint256[] calldata plays,
        address[] calldata refs,
        uint256[] calldata invCounts
    ) external onlyOwner {
        uint256 n = users.length;
        require(
            dayScores.length == n &&
                inviteScores.length == n &&
                plays.length == n &&
                refs.length == n &&
                invCounts.length == n,
            "len"
        );
        _rollDay();
        for (uint256 i = 0; i < n; i++) {
            address u = users[i];
            if (u == address(0)) continue;
            if (refOf[u] == address(0) && refs[i] != address(0) && refs[i] != u) {
                refOf[u] = refs[i];
            }
            if (plays[i] > playCount[u]) playCount[u] = plays[i];
            if (invCounts[i] > inviteCount[u]) inviteCount[u] = invCounts[i];
            if (inviteScores[i] > invitePts[u]) {
                invitePtsTotal += inviteScores[i] - invitePts[u];
                invitePts[u] = inviteScores[i];
                _touchTop(u);
            }
            if (dayScores[i] > 0) {
                uint256 add = dayScores[i];
                if (dayPts[u] < add) {
                    uint256 delta = add - dayPts[u];
                    _addDay(u, delta);
                }
            }
            emit Migrated(u, dayPts[u], invitePts[u]);
        }
    }

    function maxScoreForTicket(uint256 ticketPaid) public pure returns (uint256) {
        uint256 lim = ticketPaid / 1 ether;
        if (lim == 0) lim = 1;
        return lim * SCORE_PER_LIM;
    }

    function _settle(uint256 runId, uint256 collected, uint256 score) internal {
        Run storage r = runs[runId];
        require(!r.settled, "settled");
        require(block.timestamp >= uint256(r.startedAt) + 5, "too soon");
        uint256 ticketPaid = r.paid;
        uint256 cap = ticketPaid <= 1 ether ? ticketPaid * 2 : ticketPaid * 15 / 10;
        if (collected > cap) collected = cap;
        uint256 scoreCap = maxScoreForTicket(ticketPaid);
        if (score > scoreCap) score = scoreCap;
        uint256 fromTicket = collected > ticketPaid ? ticketPaid : collected;
        r.settled = true;
        activeRun[r.player] = 0;
        ticketFloat -= r.paid;

        _rollDay();
        uint256 bps = rewardBps(r.player);
        uint256 payout = fromTicket * bps / BASE_BPS;
        if (collected > fromTicket) payout += collected - fromTicket;
        if (payout > cap) payout = cap;
        uint256 bonus = payout > fromTicket ? payout - fromTicket : 0;
        if (bonus > freePool) bonus = freePool;
        payout = fromTicket + bonus;
        if (bonus > 0) freePool -= bonus;

        uint256 leftover = ticketPaid - fromTicket;
        uint256 burned = 0;
        if (payout > 0) _push(r.player, payout);
        _markPlayed(r.player);
        if (score > 0) _addDay(r.player, score);
        if (leftover > 0) {
            uint256 toInvite = leftover * 20 / 100;
            uint256 toDay = leftover * 50 / 100;
            burned = leftover - toInvite - toDay;
            _fund(toInvite, toDay);
            if (burned > 0) {
                _push(DEAD, burned);
                burnedTotal += burned;
                emit Burned(r.player, burned);
            }
        }
        emit RunSettled(runId, r.player, collected, leftover, score, burned, payout);
    }

    function _rollDay() internal {
        uint256 d = currentDay();
        if (dayCursor == 0) {
            dayCursor = d;
            return;
        }
        if (d <= dayCursor) return;
        frozenAcc[dayCursor] = dayAcc;
        frozenInviteAcc = inviteAcc;
        dayPoolOf[dayCursor] = dayPool;
        frozenDayTotal += dayPool;
        uint256 n = dayPlayerCount;
        if (n > 0 && dayEqPool > 0) {
            uint256 per = dayEqPool / n;
            frozenEqShare[dayCursor] = per;
            uint256 used = per * n;
            frozenDayTotal += used;
            dayEqPool -= used;
        }
        dayPool = 0;
        dayAcc = 0;
        dayPtsTotal = 0;
        dayPlayerCount = 0;
        dayCursor = d;
    }

    function _syncUser(address u) internal {
        _rollDay();
        _harvestInvite(u);
        uint256 d = currentDay();
        if (scoredDay[u] != d) {
            if (dayPts[u] > 0 && scoredDay[u] != 0) {
                uint256 share = dayPts[u] * frozenAcc[scoredDay[u]] / ACC - dayDebt[u];
                uint256 poolLeft = dayPoolOf[scoredDay[u]];
                if (share > poolLeft) share = poolLeft;
                dayPoolOf[scoredDay[u]] = poolLeft - share;
                if (frozenDayTotal >= share) frozenDayTotal -= share;
                else frozenDayTotal = 0;
                claimable[u] += share;
                owed += share;
                dayPts[u] = 0;
                dayDebt[u] = 0;
            }
            scoredDay[u] = d;
        }
        uint256 pd = playedDay[u];
        if (pd != 0 && pd < d) {
            uint256 eq = frozenEqShare[pd];
            if (eq > frozenDayTotal) eq = frozenDayTotal;
            if (eq > 0) {
                frozenDayTotal -= eq;
                claimable[u] += eq;
                owed += eq;
            }
            playedDay[u] = 0;
        }
    }

    function _markPlayed(address u) internal {
        _syncUser(u);
        uint256 d = currentDay();
        if (playedDay[u] == d) return;
        playedDay[u] = d;
        dayPlayerCount += 1;
    }

    function _fund(uint256 i, uint256 w) internal {
        if (i > 0) {
            if (topLen > 0) {
                inviteAcc += i * ACC / topLen;
            }
            invitePool += i;
        }
        if (w > 0) {
            if (dayPtsTotal > 0) {
                dayAcc += w * ACC / dayPtsTotal;
            }
            dayPool += w;
        }
    }

    function _addDay(address u, uint256 pts) internal {
        _syncUser(u);
        if (pts == 0) return;
        if (dayPtsTotal == 0 && dayPool > 0) {
            dayAcc += dayPool * ACC / pts;
            dayPts[u] = pts;
            dayPtsTotal = pts;
            dayDebt[u] = 0;
            return;
        }
        dayDebt[u] += pts * dayAcc / ACC;
        dayPts[u] += pts;
        dayPtsTotal += pts;
    }

    function _clearInvitePts(address u) internal {
        uint256 pts = invitePts[u];
        if (pts == 0 && topIndex[u] == 0 && inviteLocked[u] == 0) return;
        if (pts > 0) {
            if (invitePtsTotal >= pts) invitePtsTotal -= pts;
            else invitePtsTotal = 0;
            invitePts[u] = 0;
        }
        inviteLocked[u] = 0;
        inviteLockDay[u] = 0;
        inviteDebt[u] = inviteAcc;
        if (topIndex[u] != 0) {
            uint256 slot = topIndex[u] - 1;
            topIndex[u] = 0;
            if (topLen > 0) {
                uint256 last = topLen - 1;
                if (slot != last) {
                    address moved = topInviters[last];
                    topInviters[slot] = moved;
                    topIndex[moved] = slot + 1;
                }
                topInviters[last] = address(0);
                topLen = last;
            }
        }
    }

    function _addInvite(address u, uint256 pts) internal {
        invitePts[u] += pts;
        invitePtsTotal += pts;
        _touchTop(u);
    }

    function _settledInviteAcc() internal view returns (uint256) {
        if (dayCursor < currentDay()) return inviteAcc;
        return frozenInviteAcc;
    }

    /// Yesterday's invite share only. Same clock as daily: inviteDay / today / nextClaimAt.
    function _invitePending(address u) internal view returns (uint256) {
        uint256 today = currentDay();
        uint256 locked;
        if (inviteLockDay[u] != 0 && inviteLockDay[u] < today) {
            locked = inviteLocked[u];
        }
        uint256 stream;
        if (topIndex[u] != 0 && (inviteDay[u] < today || dayCursor < today)) {
            uint256 acc = _settledInviteAcc();
            if (acc > inviteDebt[u]) stream = (acc - inviteDebt[u]) / ACC;
        }
        return locked + stream;
    }

    function _harvestInvite(address u) internal {
        uint256 today = currentDay();
        if (inviteLockDay[u] != 0 && inviteLockDay[u] < today) {
            uint256 locked = inviteLocked[u];
            inviteLocked[u] = 0;
            inviteLockDay[u] = 0;
            if (locked > invitePool) locked = invitePool;
            if (locked > 0) {
                invitePool -= locked;
                claimable[u] += locked;
                owed += locked;
            }
        }
        if (topIndex[u] == 0) return;
        uint256 acc = _settledInviteAcc();
        if (acc <= inviteDebt[u]) return;
        uint256 p = (acc - inviteDebt[u]) / ACC;
        inviteDebt[u] = acc;
        if (p == 0) return;
        if (p > invitePool) p = invitePool;
        invitePool -= p;
        claimable[u] += p;
        owed += p;
    }

    function _touchTop(address u) internal {
        uint256 pts = invitePts[u];
        if (pts == 0 || topIndex[u] != 0) return;
        if (topLen < TOP_CAP) {
            _enterTop(u, topLen);
            topLen += 1;
            return;
        }
        uint256 minI = 0;
        uint256 minPts = type(uint256).max;
        address minA;
        for (uint256 i = 0; i < TOP_CAP; i++) {
            address a = topInviters[i];
            uint256 p = invitePts[a];
            if (p < minPts) {
                minPts = p;
                minI = i;
                minA = a;
            }
        }
        if (pts > minPts) {
            _exitTop(minA);
            _enterTop(u, minI);
        }
    }

    function _enterTop(address u, uint256 slot) internal {
        if (topLen == 0 && invitePool > 0) {
            inviteAcc += invitePool * ACC;
            inviteDebt[u] = 0;
        } else {
            inviteDebt[u] = inviteAcc;
        }
        inviteDay[u] = currentDay();
        topInviters[slot] = u;
        topIndex[u] = slot + 1;
    }

    function _exitTop(address u) internal {
        _harvestInvite(u);
        uint256 liveP;
        if (inviteAcc > inviteDebt[u]) liveP = (inviteAcc - inviteDebt[u]) / ACC;
        inviteDebt[u] = inviteAcc;
        if (liveP > 0) {
            inviteLocked[u] += liveP;
            inviteLockDay[u] = currentDay();
        }
        topIndex[u] = 0;
    }

    function _freeAvailable() internal view returns (uint256) {
        return freePool;
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
