/* global ethers, CATBOX_CHAIN */

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const CatboxChain = (() => {
  const cfg = window.CATBOX_CHAIN;
  if (!cfg) throw new Error("config.js missing");

  let account = null;
  let provider = null;
  let v6Cached = null;
  let playCountCache = { addr: "", n: 0, at: 0 };

  const BSC = {
    chainId: "0x38",
    chainName: "BNB Smart Chain",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    rpcUrls: [cfg.rpc],
    blockExplorerUrls: [cfg.explorer],
  };

  function eth() {
    if (!window.ethereum) throw new Error("NO_WALLET");
    return window.ethereum;
  }

  function browserProvider() {
    provider = new ethers.BrowserProvider(eth(), cfg.chainId);
    return provider;
  }

  async function signer() {
    return browserProvider().getSigner();
  }

  const V6_READ_ABI = [
    "function dayPool() view returns (uint256)",
    "function dayEqPool() view returns (uint256)",
    "function dayPlayerCount() view returns (uint256)",
    "function topLen() view returns (uint256)",
    "function nextClaimAt() view returns (uint256)",
    "function inviteCount(address) view returns (uint256)",
    "function rewardBps(address) view returns (uint256)",
    "function withdrawDaily(uint256)",
    "function currentDay() view returns (uint256)",
    "function playedDay(address) view returns (uint256)",
    "function inviteDay(address) view returns (uint256)",
    "function tgClaimed(address) view returns (bool)",
    "function claimTgBonus()",
    "function xClaimed(address) view returns (bool)",
    "function claimXBonus()",
    "function freeScoutUsed(address) view returns (uint8)",
    "function scoutIsFree(address) view returns (bool)",
    "function playCount(address) view returns (uint256)",
  ];

  function gameContract(s) {
    return new ethers.Contract(cfg.address, [...cfg.abi, ...V6_READ_ABI], s);
  }

  function limContract(s) {
    return new ethers.Contract(cfg.lim, ERC20_ABI, s);
  }

  async function ensureBsc() {
    const chainId = await eth().request({ method: "eth_chainId" });
    if (chainId === BSC.chainId) return;
    try {
      await eth().request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC.chainId }] });
    } catch (e) {
      if (e.code === 4902) {
        await eth().request({ method: "wallet_addEthereumChain", params: [BSC] });
      } else {
        throw e;
      }
    }
  }

  async function connect() {
    await ensureBsc();
    const accounts = await eth().request({ method: "eth_requestAccounts" });
    account = ethers.getAddress(accounts[0]);
    browserProvider();
    eth().removeAllListeners?.("accountsChanged");
    eth().on?.("accountsChanged", (accs) => {
      account = accs?.[0] ? ethers.getAddress(accs[0]) : null;
      window.dispatchEvent(new Event("catbox-wallet"));
    });
    eth().on?.("chainChanged", () => window.dispatchEvent(new Event("catbox-wallet")));
    window.dispatchEvent(new Event("catbox-wallet"));
    return account;
  }

  function short(addr) {
    if (!addr) return "";
    return addr.slice(0, 6) + "…" + addr.slice(-4);
  }

  function isOwner() {
    return account && account.toLowerCase() === cfg.owner.toLowerCase();
  }

  async function isDeployed() {
    const p = await publicReadProvider();
    const code = await p.getCode(cfg.address);
    return code && code !== "0x";
  }

  async function deploy() {
    await connect();
    const s = await signer();
    const data = cfg.salt + cfg.bytecode.slice(2);
    const tx = await s.sendTransaction({ to: cfg.factory, data });
    await tx.wait();
    return tx.hash;
  }

  const RPCS = [
    cfg.rpc,
    "https://bsc-dataseed1.binance.org",
    "https://bsc-dataseed2.binance.org",
    "https://bsc-rpc.publicnode.com",
    "https://1rpc.io/bnb",
  ];

  function withTimeout(promise, ms) {
    let t;
    return Promise.race([
      promise.finally(() => clearTimeout(t)),
      new Promise((_, rej) => {
        t = setTimeout(() => rej(new Error("TIMEOUT")), ms);
      }),
    ]);
  }

  const LOG_RPCS = [
    "https://bsc.rpc.blxrbdn.com",
    "https://bsc-rpc.publicnode.com",
    "https://bsc.publicnode.com",
    "https://1rpc.io/bnb",
  ];
  let logsProvider = null;
  let logsOkAt = 0;

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function logsReadProvider() {
    if (logsProvider && Date.now() - logsOkAt < 15000) return logsProvider;
    for (const url of LOG_RPCS) {
      try {
        const p = makePublic(url);
        const n = await withTimeout(p.getBlockNumber(), 5000);
        await withTimeout(p.getLogs({ address: cfg.address, fromBlock: n, toBlock: n }), 5000);
        logsProvider = p;
        logsOkAt = Date.now();
        return p;
      } catch (_) {}
    }
    throw new Error("NO_LOGS_RPC");
  }
  let publicProvider = null;
  let publicRpc = "";
  let publicOkAt = 0;

  function makePublic(url) {
    return new ethers.JsonRpcProvider(url, cfg.chainId, {
      staticNetwork: true,
      batchMaxCount: 1,
    });
  }

  async function publicReadProvider() {
    if (publicProvider && Date.now() - publicOkAt < 20000) return publicProvider;
    if (publicProvider) {
      try {
        await publicProvider.getBlockNumber();
        publicOkAt = Date.now();
        return publicProvider;
      } catch (_) {
        publicProvider = null;
      }
    }
    const urls = publicRpc ? [publicRpc, ...RPCS.filter((u) => u !== publicRpc)] : RPCS;
    for (const url of urls) {
      try {
        const p = makePublic(url);
        await p.getBlockNumber();
        publicProvider = p;
        publicRpc = url;
        publicOkAt = Date.now();
        return p;
      } catch (_) {}
    }
    publicProvider = makePublic(cfg.rpc);
    publicRpc = cfg.rpc;
    return publicProvider;
  }

  async function readProvider() {
    return publicReadProvider();
  }

  async function ticketPrice(tierId = 0) {
    const c = gameContract(await readProvider());
    return c.ticketPrice(tierId);
  }

  async function poolBalance() {
    const c = gameContract(await readProvider());
    const [i, burned, free] = await Promise.all([c.invitePool(), c.burnedTotal(), c.freePool()]);
    let d;
    try {
      d = await c.dayPool();
    } catch (_) {
      d = await c.weekPool();
    }
    let eq = null;
    let players = null;
    let topN = null;
    let v6 = false;
    try {
      eq = await c.dayEqPool();
      v6 = true;
    } catch (_) {
      eq = null;
    }
    if (v6) {
      try {
        players = await c.dayPlayerCount();
      } catch (_) {
        players = 0n;
      }
      try {
        topN = await c.topLen();
      } catch (_) {
        topN = 0n;
      }
    }
    const daily = d + (eq || 0n);
    v6Cached = v6;
    return {
      week: daily,
      day: daily,
      dayScore: v6 ? d : daily,
      dayEq: eq,
      dayPlayers: players,
      topLen: topN,
      v6,
      invite: i,
      burned,
      free,
      total: daily + i,
    };
  }

  async function isV6() {
    if (v6Cached != null) return v6Cached;
    try {
      const c = gameContract(await readProvider());
      await c.dayEqPool();
      v6Cached = true;
    } catch (_) {
      v6Cached = false;
    }
    return v6Cached;
  }

  async function pendingOf(addr = account) {
    if (!addr) return { inv: 0n, wk: 0n, total: 0n };
    const c = gameContract(await readProvider());
    const p = await c.pending(addr);
    return { inv: p[0], wk: p[1], total: p[2] };
  }

  async function invitePoints(addr = account) {
    if (!addr) return 0n;
    const c = gameContract(await readProvider());
    return c.invitePts(addr);
  }

  let inviteeCache = { addr: "", n: 0, at: 0 };

  async function uniqueInviteesOf(addr = account) {
    if (!addr) return 0;
    const key = String(addr).toLowerCase();
    if (inviteeCache.addr === key && Date.now() - inviteeCache.at < 60000) {
      return inviteeCache.n;
    }
    const me = ethers.getAddress(addr);
    const c = gameContract(await publicReadProvider());
    const n = Number(await c.nextRunId());
    const from = Math.max(1, n - 400);
    const players = new Set();
    const batch = 8;
    for (let i = n - 1; i >= from; i -= batch) {
      const ids = [];
      for (let id = i; id >= Math.max(from, i - batch + 1); id--) ids.push(id);
      const runs = await Promise.all(ids.map((id) => c.runs(id).catch(() => null)));
      for (const r of runs) {
        if (!r) continue;
        const player = r.player || r[0];
        if (player && player !== ethers.ZeroAddress) players.add(ethers.getAddress(player));
      }
    }
    const addrs = [...players].filter((a) => a !== me);
    let count = 0;
    for (let i = 0; i < addrs.length; i += batch) {
      const chunk = addrs.slice(i, i + batch);
      const refs = await Promise.all(chunk.map((a) => c.refOf(a).catch(() => ethers.ZeroAddress)));
      chunk.forEach((_, j) => {
        const ref = refs[j];
        if (ref && ref !== ethers.ZeroAddress && ethers.getAddress(ref) === me) count += 1;
      });
    }
    inviteeCache = { addr: key, n: count, at: Date.now() };
    return count;
  }

  async function inviteCountOf(addr = account) {
    if (!addr) return 0n;
    try {
      if (await isV6()) {
        const c = gameContract(await readProvider());
        const v = await c.inviteCount(addr);
        if (v != null) return v;
      }
    } catch (_) {}
    try {
      return BigInt(await uniqueInviteesOf(addr));
    } catch (_) {
      return 0n;
    }
  }

  function playStorageKey(addr) {
    return `catbox-plays-${String(addr || "").toLowerCase()}`;
  }

  function localPlayCount(addr) {
    if (!addr) return 0;
    try {
      const n = Number(localStorage.getItem(playStorageKey(addr)) || 0);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    } catch (_) {
      return 0;
    }
  }

  function rememberPlayCount(addr, n) {
    if (!addr) return;
    const v = Math.max(0, Math.floor(Number(n) || 0));
    if (v <= localPlayCount(addr)) return;
    try {
      localStorage.setItem(playStorageKey(addr), String(v));
    } catch (_) {}
  }

  function notePlay(addr = account) {
    if (!addr) return 0;
    const n = localPlayCount(addr) + 1;
    try {
      localStorage.setItem(playStorageKey(addr), String(n));
    } catch (_) {}
    playCountCache = { addr: String(addr).toLowerCase(), n, at: Date.now() };
    return n;
  }

  function rewardBpsFromParts(inviteN, playN) {
    const inv = Math.max(0, Math.floor(Number(inviteN) || 0)) * 500;
    const extra = Math.max(0, Math.floor(Number(playN) || 0) - 1) * 10;
    return Math.min(20000, 10500 + inv + extra);
  }

  function parseStoredRun(id, r) {
    const player = r.player || r[0];
    const paid = r.paid != null ? r.paid : r[1];
    const startedAt = r.startedAt != null ? r.startedAt : r[2];
    const settled = Boolean(r.settled != null ? r.settled : r[3]);
    let free = null;
    if (r.free != null) free = Boolean(r.free);
    else if (r.length > 4 && r[4] != null) free = Boolean(r[4]);
    return {
      id,
      player,
      paid: paid ?? 0n,
      startedAt: Number(startedAt || 0),
      settled,
      free,
    };
  }

  async function scanPlayCount(addr) {
    const want = ethers.getAddress(addr);
    const c = gameContract(await publicReadProvider());
    const n = Number(await c.nextRunId());
    const from = Math.max(1, n - 400);
    let count = 0;
    const batch = 8;
    for (let i = n - 1; i >= from; i -= batch) {
      const ids = [];
      for (let id = i; id >= Math.max(from, i - batch + 1); id--) ids.push(id);
      const runs = await Promise.all(ids.map((id) => c.runs(id).catch(() => null)));
      for (let j = 0; j < runs.length; j++) {
        if (!runs[j]) continue;
        const parsed = parseStoredRun(ids[j], runs[j]);
        if (!parsed.player || parsed.player === ethers.ZeroAddress) continue;
        if (ethers.getAddress(parsed.player) === want) count += 1;
      }
    }
    return count;
  }

  async function countPlaysOf(addr = account) {
    if (!addr) return 0;
    const key = String(addr).toLowerCase();
    const local = localPlayCount(addr);
    if (playCountCache.addr === key && Date.now() - playCountCache.at < 120000) {
      return Math.max(playCountCache.n, local);
    }
    let chain = 0;
    try {
      const c = gameContract(await publicReadProvider());
      let fromAbi = false;
      try {
        if (await isV6()) {
          const v = await c.playCount(addr);
          if (v != null) {
            chain = Number(v);
            fromAbi = true;
          }
        }
      } catch (_) {}
      if (!fromAbi) chain = await scanPlayCount(addr);
    } catch (_) {}
    const n = Math.max(chain || 0, local);
    rememberPlayCount(addr, n);
    playCountCache = { addr: key, n, at: Date.now() };
    return n;
  }

  async function rewardBpsOf(addr = account) {
    if (!addr) return 10500n;
    let invite = 0;
    try {
      invite = Number(await inviteCountOf(addr));
    } catch (_) {
      invite = 0;
    }
    const plays = await countPlaysOf(addr);
    return BigInt(rewardBpsFromParts(invite, plays));
  }

  function sgtClaimWindow() {
    const DAY = 86400;
    const BJ = 8 * 3600;
    const WINDOW = 3600;
    const now = Math.floor(Date.now() / 1000);
    const todayStart = Math.floor((now + BJ) / DAY) * DAY - BJ;
    const open = now >= todayStart && now < todayStart + WINDOW;
    const nextOpen = open || now < todayStart ? todayStart : todayStart + DAY;
    return { open, nextOpen, closesAt: todayStart + WINDOW };
  }

  function sgtNextMidnight() {
    return BigInt(sgtClaimWindow().nextOpen);
  }

  async function nextClaimAt() {
    try {
      const c = gameContract(await readProvider());
      const v = await c.nextClaimAt();
      if (v && v > 0n) return v;
    } catch (_) {}
    return sgtNextMidnight();
  }

  async function claim() {
    await connect();
    const s = await signer();
    const tx = await gameContract(s).claim();
    return (await tx.wait()).hash;
  }

  function referrer() {
    try {
      const q = new URLSearchParams(location.search).get("ref");
      if (q && /^0x[a-fA-F0-9]{40}$/.test(q)) {
        localStorage.setItem("catbox-ref", ethers.getAddress(q));
      }
    } catch (_) {}
    try {
      return localStorage.getItem("catbox-ref") || ethers.ZeroAddress;
    } catch (_) {
      return ethers.ZeroAddress;
    }
  }

  async function limBalance(addr = account) {
    if (!addr) return 0n;
    const t = limContract(await readProvider());
    return t.balanceOf(addr);
  }

  async function bnbBalance(addr = account) {
    if (!addr) return 0n;
    const p = await readProvider();
    return p.getBalance(addr);
  }

  async function activeRun(addr = account) {
    if (!addr) return 0n;
    const c = gameContract(await readProvider());
    return c.activeRun(addr);
  }

  function assumedFree() {
    return { used: 0, left: 2, pool: 0n, eligible: true, scoutFree: true };
  }

  async function freeStatus(addr = account) {
    if (!addr) return assumedFree();
    try {
      const c = gameContract(await readProvider());
      const s = await c.freeStatus(addr);
      const used = Number(s[0]);
      const left = Number(s[1]);
      const pool = s[2];
      const eligible = Boolean(s[3]) || (left > 0 && pool > 0n);
      return { used, left, pool, eligible, scoutFree: left > 0 };
    } catch (_) {
      return assumedFree();
    }
  }

  async function hasTgBonus(addr = account) {
    if (!addr) return false;
    try {
      const c = gameContract(await readProvider());
      return Boolean(await c.tgClaimed(addr));
    } catch (_) {
      return false;
    }
  }

  async function claimTgBonus() {
    await connect();
    const s = await signer();
    const game = gameContract(s);
    try {
      if (await game.tgClaimed.staticCall(account)) return true;
    } catch (_) {
      return false;
    }
    try {
      const tx = await game.claimTgBonus();
      await tx.wait();
      return true;
    } catch (_) {
      return false;
    }
  }

  async function claimXBonus() {
    await connect();
    const s = await signer();
    const game = gameContract(s);
    try {
      if (await game.xClaimed.staticCall(account)) return true;
    } catch (_) {
      return false;
    }
    try {
      const tx = await game.claimXBonus();
      await tx.wait();
      return true;
    } catch (_) {
      return false;
    }
  }

  async function fundFreePool(limAmount) {
    await connect();
    const s = await signer();
    const game = gameContract(s);
    const lim = limContract(s);
    const amt = ethers.parseUnits(String(limAmount), 18);
    if (amt <= 0n) throw new Error("NO_LIM");
    const bal = await lim.balanceOf(account);
    if (bal < amt) throw new Error("NO_LIM");
    const allow = await lim.allowance(account, cfg.address);
    if (allow < amt) {
      const txA = await lim.approve(cfg.address, ethers.MaxUint256);
      await txA.wait();
    }
    const tx = await game.fund(amt);
    return (await tx.wait()).hash;
  }

  async function approveAndEnter(tierId = 0) {
    await connect();
    const s = await signer();
    const game = gameContract(s);
    const lim = limContract(s);
    const price = await game.ticketPrice(tierId);
    let useFree = false;
    const id = Number(tierId);
    try {
      const st = await freeStatus(account);
      if (id === 0) {
        useFree = st.scoutFree != null ? Boolean(st.scoutFree) : Boolean(st.eligible) || Number(st.left) > 0;
      } else if (id === 3) {
        useFree = st.vaultFree === true;
      }
    } catch (_) {
      useFree = id === 0;
    }
    if (!useFree) {
      const bal = await lim.balanceOf(account);
      if (bal < price) throw new Error("NO_LIM");
      const allow = await lim.allowance(account, cfg.address);
      if (allow < price) {
        const txA = await lim.approve(cfg.address, ethers.MaxUint256);
        await txA.wait();
      }
    }
    const pending = await game.activeRun(account);
    if (pending !== 0n) {
      try {
        const txS = await game.settle(0, 0);
        await txS.wait();
      } catch (e) {
        throw new Error("ACTIVE_RUN");
      }
    }
    let ref = referrer();
    if (!ref || ref.toLowerCase() === account.toLowerCase()) ref = ethers.ZeroAddress;
    const tx = await game.enter(ref, tierId);
    const rec = await tx.wait();
    notePlay(account);
    return rec.hash;
  }

  function collectedWei(got, ticket) {
    const paid = ethers.parseUnits(String(ticket), 18);
    if (got + 1e-9 >= ticket) return paid;
    const wei = ethers.parseUnits(Number(got).toFixed(6), 18);
    return wei > paid ? paid : wei;
  }

  async function settleRun(got, ticket, score) {
    await connect();
    const s = await signer();
    const game = gameContract(s);
    const pending = await game.activeRun(account);
    if (pending === 0n) return null;
    const tx = await game.settle(collectedWei(got, ticket), BigInt(score || 0));
    const rec = await tx.wait();
    let burned = 0n;
    let payout = 0n;
    for (const log of rec.logs || []) {
      try {
        const parsed = game.interface.parseLog(log);
        if (parsed?.name === "Burned") burned = parsed.args.amount;
        if (parsed?.name === "RunSettled") payout = parsed.args.payout;
      } catch (_) {}
    }
    return { hash: rec.hash, burned, payout };
  }

  async function withdrawWeekly(amountWei) {
    await connect();
    if (!isOwner()) throw new Error("NOT_OWNER");
    const s = await signer();
    const game = gameContract(s);
    try {
      await game.withdrawDaily.staticCall(amountWei);
      const tx = await game.withdrawDaily(amountWei);
      return (await tx.wait()).hash;
    } catch (_) {
      const tx = await game.withdrawWeekly(amountWei);
      return (await tx.wait()).hash;
    }
  }

  async function setTicketPrice(tierId, limAmount) {
    await connect();
    if (!isOwner()) throw new Error("NOT_OWNER");
    const s = await signer();
    const tx = await gameContract(s).setTicketPrice(tierId, ethers.parseUnits(String(limAmount), 18));
    return (await tx.wait()).hash;
  }

  function txUrl(hash) {
    return `${cfg.explorer}/tx/${hash}`;
  }
  function addrUrl(addr) {
    return `${cfg.explorer}/address/${addr}`;
  }

  const NATIVE = ethers.ZeroAddress;
  const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
  const USDT = "0x55d398326f99059fF775485246999027B3197955";
  const UR = "0xd9C500DfF816a1Da21A48A732d3498Bf09dc9AEB";
  const CL_PM = "0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b";
  const CL_QUOTER = "0xd0737C9762912dD34c3271197E362Aa736Df0926";
  const MIXED_QUOTER = "0x2dCbF7B985c8C5C931818e4E107bAe8aaC8dAB7C";
  const PERMIT2 = "0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615C768";
  const MSG_SENDER = "0x0000000000000000000000000000000000000001";
  const ADDRESS_THIS = "0x0000000000000000000000000000000000000002";
  const CONTRACT_BALANCE = 1n << 255n;
  const CMD = { V2_SWAP_EXACT_IN: 0x08, WRAP_ETH: 0x0b, UNWRAP_WETH: 0x0c, INFI_SWAP: 0x10 };
  const ACT = { CL_SWAP_EXACT_IN_SINGLE: 0x06, SETTLE: 0x0b, SETTLE_ALL: 0x0c, TAKE: 0x0e, TAKE_ALL: 0x0f };
  const POOL_TUPLE =
    "tuple(address currency0,address currency1,address hooks,address poolManager,uint24 fee,bytes32 parameters)";
  const QUOTE_ABI = [
    `function quoteExactInputSingle(tuple(${POOL_TUPLE} poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)`,
  ];
  const MIXED_ABI = [
    "function quoteMixedExactInput(address[] paths, bytes actions, bytes[] params, uint256 amountIn) returns (uint256 amountOut, uint256 gasEstimate)",
    "function quoteExactInputSingleV2(tuple(address tokenIn,address tokenOut,uint256 amountIn) params) returns (uint256 amountOut, uint256 gasEstimate)",
  ];
  const UR_ABI = ["function execute(bytes commands,bytes[] inputs,uint256 deadline) payable"];
  const PERMIT2_ABI = [
    "function approve(address token,address spender,uint160 amount,uint48 expiration)",
    "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
  ];
  const U128 = (1n << 128n) - 1n;

  function sameAddr(a, b) {
    return String(a).toLowerCase() === String(b).toLowerCase();
  }

  function cmds(...xs) {
    return "0x" + xs.map((c) => c.toString(16).padStart(2, "0")).join("");
  }

  function limPool() {
    const extra = cfg.infinity;
    if (!extra?.currency0) return null;
    return {
      kind: "CL",
      currency0: extra.currency0,
      currency1: extra.currency1,
      hooks: extra.hooks || NATIVE,
      poolManager: extra.poolManager || CL_PM,
      fee: extra.fee,
      parameters: extra.parameters,
      payToken: extra.payToken || USDT,
      zeroForOne: false,
    };
  }

  function poolKeyArr(pool) {
    return [pool.currency0, pool.currency1, pool.hooks, pool.poolManager, pool.fee, pool.parameters];
  }

  function encodePlan(steps) {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const actions = "0x" + steps.map((s) => s.act.toString(16).padStart(2, "0")).join("");
    return coder.encode(["bytes", "bytes[]"], [actions, steps.map((s) => s.data)]);
  }

  function clSwapData(pool, amountIn, minOut, zeroForOne) {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    return coder.encode(
      [`tuple(${POOL_TUPLE} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`],
      [[poolKeyArr(pool), zeroForOne, amountIn, minOut, "0x"]],
    );
  }

  function encodeInfiFromUser(pool, tokenIn, tokenOut, amountIn, minOut) {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const zeroForOne = sameAddr(tokenIn, pool.currency0);
    return encodePlan([
      { act: ACT.CL_SWAP_EXACT_IN_SINGLE, data: clSwapData(pool, amountIn, minOut, zeroForOne) },
      { act: ACT.SETTLE_ALL, data: coder.encode(["address", "uint256"], [tokenIn, ethers.MaxUint256]) },
      { act: ACT.TAKE_ALL, data: coder.encode(["address", "uint256"], [tokenOut, minOut]) },
    ]);
  }

  function encodeInfiTakeToRouter(pool, tokenIn, tokenOut, amountIn, minOut) {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const zeroForOne = sameAddr(tokenIn, pool.currency0);
    return encodePlan([
      { act: ACT.CL_SWAP_EXACT_IN_SINGLE, data: clSwapData(pool, amountIn, minOut, zeroForOne) },
      { act: ACT.SETTLE_ALL, data: coder.encode(["address", "uint256"], [tokenIn, ethers.MaxUint256]) },
      { act: ACT.TAKE, data: coder.encode(["address", "address", "uint256"], [tokenOut, ADDRESS_THIS, 0]) },
    ]);
  }

  function encodeInfiFromRouterCredit(pool, minOut) {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const zeroForOne = sameAddr(USDT, pool.currency0);
    return encodePlan([
      { act: ACT.SETTLE, data: coder.encode(["address", "uint256", "bool"], [USDT, CONTRACT_BALANCE, false]) },
      { act: ACT.CL_SWAP_EXACT_IN_SINGLE, data: clSwapData(pool, 0, minOut, zeroForOne) },
      { act: ACT.TAKE_ALL, data: coder.encode(["address", "uint256"], [cfg.lim, minOut]) },
    ]);
  }

  function mixedInfiParam(pool) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
      [`tuple(${POOL_TUPLE} poolKey,bytes hookData)`],
      [[poolKeyArr(pool), "0x"]],
    );
  }

  async function quoteInfi(tokenIn, amountIn, p) {
    const pool = limPool();
    if (!pool) return 0n;
    const q = new ethers.Contract(CL_QUOTER, QUOTE_ABI, p);
    const r = await q.quoteExactInputSingle.staticCall({
      poolKey: pool,
      zeroForOne: sameAddr(tokenIn, pool.currency0),
      exactAmount: amountIn,
      hookData: "0x",
    });
    return r[0];
  }

  async function quoteBnbToLim(amountIn, p) {
    const pool = limPool();
    if (!pool) return 0n;
    const q = new ethers.Contract(MIXED_QUOTER, MIXED_ABI, p);
    const r = await q.quoteMixedExactInput.staticCall(
      [WBNB, USDT, cfg.lim],
      "0x0204",
      ["0x", mixedInfiParam(pool)],
      amountIn,
    );
    return r[0];
  }

  async function quoteLimToBnb(amountIn, p) {
    const pool = limPool();
    if (!pool) return 0n;
    const q = new ethers.Contract(MIXED_QUOTER, MIXED_ABI, p);
    try {
      const r = await q.quoteMixedExactInput.staticCall(
        [cfg.lim, USDT, WBNB],
        "0x0402",
        [mixedInfiParam(pool), "0x"],
        amountIn,
      );
      if (r[0] > 0n) return r[0];
    } catch (_) {}
    const usdtOut = await quoteInfi(cfg.lim, amountIn, p);
    if (usdtOut === 0n) return 0n;
    return quoteV2(USDT, WBNB, usdtOut, p);
  }

  async function quoteV2(tokenIn, tokenOut, amountIn, p) {
    const q = new ethers.Contract(MIXED_QUOTER, MIXED_ABI, p);
    const r = await q.quoteExactInputSingleV2.staticCall({ tokenIn, tokenOut, amountIn });
    return r[0];
  }

  async function quoteSwap(fromSym, toSym, amountIn) {
    if (!amountIn || amountIn === 0n || amountIn > U128 || fromSym === toSym) return { out: 0n, path: null };
    const pool = limPool();
    if (!pool) return { out: 0n, path: null };
    const p = await readProvider();
    try {
      if (fromSym === "USDT" && toSym === "LIM") {
        const out = await quoteInfi(USDT, amountIn, p);
        if (out > 0n) return { out, path: "infinity", via: "usdt", pool, kind: "CL" };
      } else if (fromSym === "BNB" && toSym === "LIM") {
        const out = await quoteBnbToLim(amountIn, p);
        if (out > 0n) return { out, path: "infinity", via: "bnb-v2", pool, kind: "CL" };
      } else if (fromSym === "LIM" && toSym === "USDT") {
        const out = await quoteInfi(cfg.lim, amountIn, p);
        if (out > 0n) return { out, path: "infinity", via: "usdt", pool, kind: "CL" };
      } else if (fromSym === "LIM" && toSym === "BNB") {
        const out = await quoteLimToBnb(amountIn, p);
        if (out > 0n) return { out, path: "infinity", via: "bnb-v2", pool, kind: "CL" };
      }
    } catch (_) {}
    return { out: 0n, path: null };
  }

  async function quoteLim(fromSym, amountIn) {
    return quoteSwap(fromSym, "LIM", amountIn);
  }

  async function tokenBalance(sym, addr = account) {
    if (!addr) return 0n;
    if (sym === "BNB") return bnbBalance(addr);
    if (sym === "LIM") return limBalance(addr);
    const t = new ethers.Contract(USDT, ERC20_ABI, await readProvider());
    return t.balanceOf(addr);
  }

  async function ensurePermit2(token, amountIn, s) {
    const erc = new ethers.Contract(token, ERC20_ABI, s);
    const allow = await erc.allowance(account, PERMIT2);
    if (allow < amountIn) {
      const txA = await erc.approve(PERMIT2, ethers.MaxUint256);
      await txA.wait();
    }
    const p2 = new ethers.Contract(PERMIT2, PERMIT2_ABI, s);
    const cur = await p2.allowance(account, token, UR);
    const now = Math.floor(Date.now() / 1000);
    if (cur[0] < amountIn || Number(cur[1]) < now + 120) {
      const txB = await p2.approve(token, UR, (1n << 160n) - 1n, (1n << 48n) - 1n);
      await txB.wait();
    }
  }

  async function swapExact(fromSym, toSym, amountIn) {
    await connect();
    const quoted = await quoteSwap(fromSym, toSym, amountIn);
    if (!quoted.path || quoted.out === 0n) throw new Error("NO_LIQ");
    const pool = quoted.pool || limPool();
    if (!pool?.currency0) throw new Error("NO_LIQ");
    const minOut = (quoted.out * 99n) / 100n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 180);
    const s = await signer();
    const p = s.provider;
    const ur = new ethers.Contract(UR, UR_ABI, s);
    const coder = ethers.AbiCoder.defaultAbiCoder();
    let commands;
    let inputs;
    if (fromSym === "USDT" && toSym === "LIM") {
      await ensurePermit2(USDT, amountIn, s);
      commands = cmds(CMD.INFI_SWAP);
      inputs = [encodeInfiFromUser(pool, USDT, cfg.lim, amountIn, minOut)];
    } else if (fromSym === "BNB" && toSym === "LIM") {
      const usdtOut = await quoteV2(WBNB, USDT, amountIn, p);
      if (usdtOut === 0n) throw new Error("NO_LIQ");
      const minUsdt = (usdtOut * 99n) / 100n;
      commands = cmds(CMD.WRAP_ETH, CMD.V2_SWAP_EXACT_IN, CMD.INFI_SWAP);
      inputs = [
        coder.encode(["address", "uint256"], [ADDRESS_THIS, amountIn]),
        coder.encode(["address", "uint256", "uint256", "address[]", "bool"], [ADDRESS_THIS, amountIn, minUsdt, [WBNB, USDT], false]),
        encodeInfiFromRouterCredit(pool, minOut),
      ];
    } else if (fromSym === "LIM" && toSym === "USDT") {
      await ensurePermit2(cfg.lim, amountIn, s);
      commands = cmds(CMD.INFI_SWAP);
      inputs = [encodeInfiFromUser(pool, cfg.lim, USDT, amountIn, minOut)];
    } else if (fromSym === "LIM" && toSym === "BNB") {
      const usdtOut = await quoteInfi(cfg.lim, amountIn, p);
      if (usdtOut === 0n) throw new Error("NO_LIQ");
      const minUsdt = (usdtOut * 99n) / 100n;
      await ensurePermit2(cfg.lim, amountIn, s);
      commands = cmds(CMD.INFI_SWAP, CMD.V2_SWAP_EXACT_IN, CMD.UNWRAP_WETH);
      inputs = [
        encodeInfiTakeToRouter(pool, cfg.lim, USDT, amountIn, minUsdt),
        coder.encode(["address", "uint256", "uint256", "address[]", "bool"], [ADDRESS_THIS, CONTRACT_BALANCE, minOut, [USDT, WBNB], false]),
        coder.encode(["address", "uint256"], [MSG_SENDER, minOut]),
      ];
    } else {
      throw new Error("NO_LIQ");
    }
    const tx = await ur.execute(commands, inputs, deadline, {
      value: fromSym === "BNB" ? amountIn : 0n,
    });
    return (await tx.wait()).hash;
  }

  async function swapToLim(fromSym, amountIn) {
    return swapExact(fromSym, "LIM", amountIn);
  }

  function asPts(v) {
    if (v == null) return 0;
    try {
      const n = typeof v === "bigint" ? Number(v) : Number(v.toString ? v.toString() : v);
      return Number.isFinite(n) ? Math.floor(n) : 0;
    } catch (_) {
      return 0;
    }
  }

  function eventScore(e) {
    try {
      const raw = e?.args?.score;
      if (raw == null) return 0n;
      return typeof raw === "bigint" ? raw : BigInt(raw);
    } catch (_) {
      return 0n;
    }
  }

  async function fetchEventLogs(eventNames, maxChunks = 24) {
    const names = Array.isArray(eventNames) ? eventNames : [eventNames];
    const p = await logsReadProvider();
    const iface = gameContract(p).interface;
    const topic0 = names.map((n) => iface.getEvent(n).topicHash);
    const latest = await withTimeout(p.getBlockNumber(), 5000);
    const chunk = 3000;
    const out = [];
    let fails = 0;
    for (let i = 0; i < maxChunks; i++) {
      const toBlock = latest - i * chunk;
      if (toBlock < 0) break;
      const fromBlock = Math.max(0, toBlock - chunk + 1);
      let got = null;
      for (let attempt = 0; attempt < 2 && !got; attempt++) {
        try {
          got = await withTimeout(
            p.getLogs({
              address: cfg.address,
              topics: [topic0.length === 1 ? topic0[0] : topic0],
              fromBlock,
              toBlock,
            }),
            8000,
          );
        } catch (_) {
          await sleep(200 * (attempt + 1));
        }
      }
      if (got) {
        fails = 0;
        for (const log of got) {
          try {
            const parsed = iface.parseLog(log);
            out.push({
              name: parsed.name,
              args: parsed.args,
              blockNumber: log.blockNumber,
              transactionHash: log.transactionHash,
            });
          } catch (_) {}
        }
      } else {
        fails += 1;
        if (fails >= 3) {
          logsProvider = null;
          logsOkAt = 0;
          break;
        }
      }
      await sleep(80);
    }
    return out;
  }

  async function fetchRawLogs(eventName, maxChunks = 24) {
    return fetchEventLogs(eventName, maxChunks);
  }

  function toRows(map, youAddr) {
    return Object.entries(map)
      .map(([addr, pts]) => ({
        tag: short(addr),
        addr,
        pts: asPts(pts),
        you: youAddr && addr.toLowerCase() === youAddr.toLowerCase(),
      }))
      .sort((a, b) => b.pts - a.pts);
  }

  async function fetchLeaderboards() {
    const c = gameContract(await publicReadProvider());
    const n = Number(await c.nextRunId());
    const from = Math.max(1, n - 500);
    const ids = [];
    for (let i = n - 1; i >= from; i--) ids.push(i);
    const players = new Set();
    const batch = 8;
    for (let i = 0; i < ids.length; i += batch) {
      const chunk = ids.slice(i, i + batch);
      const runs = await Promise.all(chunk.map((id) => c.runs(id)));
      for (const r of runs) {
        const player = r.player || r[0];
        if (player && player !== ethers.ZeroAddress) players.add(ethers.getAddress(player));
      }
    }
    const addrs = [...players];
    const refs = new Set();
    const week = {};
    for (let i = 0; i < addrs.length; i += batch) {
      const chunk = addrs.slice(i, i + batch);
      const [pts, refList] = await Promise.all([
        Promise.all(chunk.map((a) => c.weekPts(a).catch(() => 0n))),
        Promise.all(chunk.map((a) => c.refOf(a).catch(() => ethers.ZeroAddress))),
      ]);
      chunk.forEach((a, j) => {
        week[a] = pts[j] || 0n;
        const ref = refList[j];
        if (ref && ref !== ethers.ZeroAddress) refs.add(ethers.getAddress(ref));
      });
    }
    const invite = {};
    const refAddrs = [...refs];
    for (let i = 0; i < refAddrs.length; i += batch) {
      const chunk = refAddrs.slice(i, i + batch);
      const pts = await Promise.all(chunk.map((a) => c.invitePts(a).catch(() => 0n)));
      chunk.forEach((a, j) => {
        invite[a] = pts[j] || 0n;
      });
    }
    return {
      week: toRows(week, account),
      invite: toRows(invite, account),
    };
  }

  function asAmt(v) {
    if (v == null) return 0n;
    try {
      return typeof v === "bigint" ? v : BigInt(v);
    } catch (_) {
      return 0n;
    }
  }

  async function fetchRunSettledById(p, iface, runId, latest) {
    const topic = iface.getEvent("RunSettled").topicHash;
    const idTopic = ethers.zeroPadValue(ethers.toBeHex(runId), 32);
    const spans = [4000, 25000, 120000];
    for (const span of spans) {
      try {
        const logs = await withTimeout(
          p.getLogs({
            address: cfg.address,
            topics: [topic, idTopic],
            fromBlock: Math.max(0, latest - span),
            toBlock: latest,
          }),
          8000,
        );
        if (logs && logs.length) {
          const log = logs[logs.length - 1];
          const parsed = iface.parseLog(log);
          return {
            burned: asAmt(parsed.args.burned),
            leftover: asAmt(parsed.args.leftover),
            collected: asAmt(parsed.args.collected),
            hash: log.transactionHash,
            player: parsed.args.player,
          };
        }
      } catch (_) {}
    }
    return null;
  }

  function burnRowFromSettled(runId, player, burned, hash) {
    if (!player || player === ethers.ZeroAddress) return null;
    const amt = asAmt(burned);
    if (amt <= 0n) return null;
    return {
      player: ethers.getAddress(player),
      tag: short(player),
      amount: amt,
      hash: hash || "",
      runId,
    };
  }

  async function fetchBurns() {
    const byHash = new Map();
    try {
      const burnedLogs = await fetchRawLogs("Burned", 24);
      for (const log of burnedLogs) {
        const amt = asAmt(log.args.amount);
        if (amt <= 0n) continue;
        const player = log.args.player;
        if (!player || player === ethers.ZeroAddress) continue;
        const hash = log.transactionHash || "";
        const key = hash || `${log.blockNumber}-${player}-${amt.toString()}`;
        if (byHash.has(key)) continue;
        byHash.set(key, {
          player: ethers.getAddress(player),
          tag: short(player),
          amount: amt,
          hash,
          blockNumber: Number(log.blockNumber) || 0,
        });
      }
    } catch (_) {
      logsProvider = null;
      logsOkAt = 0;
    }

    if (!byHash.size) {
      try {
        const settledLogs = await fetchRawLogs("RunSettled", 24);
        for (const log of settledLogs) {
          const row = burnRowFromSettled(
            Number(log.args.runId),
            log.args.player,
            log.args.burned,
            log.transactionHash,
          );
          if (!row) continue;
          row.blockNumber = Number(log.blockNumber) || 0;
          byHash.set(log.transactionHash || `run-${row.runId}`, row);
        }
      } catch (_) {}
    }

    if (byHash.size) {
      return [...byHash.values()]
        .sort((a, b) => (b.blockNumber || 0) - (a.blockNumber || 0) || (b.runId || 0) - (a.runId || 0))
        .slice(0, 30);
    }

    try {
      const c = gameContract(await publicReadProvider());
      const p = await logsReadProvider();
      const iface = gameContract(p).interface;
      const latest = await withTimeout(p.getBlockNumber(), 5000);
      const n = Number(await c.nextRunId());
      if (Number.isFinite(n) && n > 1) {
        const missing = [];
        const from = Math.max(1, n - 80);
        for (let id = n - 1; id >= from && missing.length < 24; id--) missing.push(id);
        const batch = 6;
        for (let i = 0; i < missing.length; i += batch) {
          const chunk = missing.slice(i, i + batch);
          const found = await Promise.all(
            chunk.map((id) => fetchRunSettledById(p, iface, id, latest).catch(() => null)),
          );
          chunk.forEach((id, j) => {
            const rec = found[j];
            if (!rec) return;
            const row = burnRowFromSettled(id, rec.player, rec.burned, rec.hash);
            if (row) byHash.set(row.hash || `run-${id}`, row);
          });
        }
      }
    } catch (_) {}

    return [...byHash.values()]
      .sort((a, b) => (b.runId || 0) - (a.runId || 0) || (b.blockNumber || 0) - (a.blockNumber || 0))
      .slice(0, 30);
  }

  const TIER_NAMES = ["SCOUT", "RUNNER", "PHANTOM", "VAULT"];

  function tierOfPaid(paid, prices) {
    const n = Number(ethers.formatUnits(paid || 0n, 18));
    let best = 0;
    let bestDiff = Infinity;
    (prices || []).forEach((p, i) => {
      const d = Math.abs(Number(ethers.formatUnits(p, 18)) - n);
      if (d < bestDiff) {
        bestDiff = d;
        best = i;
      }
    });
    return { id: best, name: TIER_NAMES[best] || `T${best}`, lim: n };
  }

  function payoutCapWei(ticket) {
    if (ticket <= 10n ** 18n) return ticket * 2n;
    return (ticket * 15n) / 10n;
  }

  function displayPayout(collected, paid, bps) {
    if (collected == null) return null;
    const got = asAmt(collected);
    const ticket = asAmt(paid);
    const raw = (got * BigInt(bps || 10500)) / 10000n;
    const cap = payoutCapWei(ticket);
    return raw > cap ? cap : raw;
  }

  async function fetchOwnerRuns(onProgress) {
    const c = gameContract(await publicReadProvider());
    const n = Number(await c.nextRunId());
    if (!Number.isFinite(n) || n < 2) {
      if (onProgress) onProgress({ phase: "partial", data: { nextRunId: n, runs: [], totalRuns: 0, uniqueWallets: 0, freeCount: 0, paidCount: 0, unknownPay: 0, burnedTotal: 0n, weekPool: 0n, invitePool: 0n, freePool: 0n } });
      return { nextRunId: n, runs: [], totalRuns: 0, uniqueWallets: 0, freeCount: 0, paidCount: 0, unknownPay: 0, burnedTotal: 0n, weekPool: 0n, invitePool: 0n, freePool: 0n };
    }
    const ids = [];
    for (let i = n - 1; i >= 1; i--) ids.push(i);
    if (onProgress) onProgress({ phase: "runs", done: 0, total: ids.length });

    let prices = [
      ethers.parseUnits("1", 18),
      ethers.parseUnits("3", 18),
      ethers.parseUnits("6", 18),
      ethers.parseUnits("10", 18),
    ];
    try {
      prices = await Promise.all([0, 1, 2, 3].map((i) => c.ticketPrice(i)));
    } catch (_) {}

    const batch = 8;
    const rows = [];
    const maxIds = Math.min(ids.length, 400);
    for (let i = 0; i < maxIds; i += batch) {
      const chunk = ids.slice(i, i + batch);
      const runs = await Promise.all(chunk.map((id) => c.runs(id)));
      chunk.forEach((id, j) => {
        const parsed = parseStoredRun(id, runs[j]);
        if (!parsed.player || parsed.player === ethers.ZeroAddress) return;
        const player = ethers.getAddress(parsed.player);
        const tier = tierOfPaid(parsed.paid, prices);
        rows.push({
          id,
          player,
          paid: parsed.paid,
          ticketLim: tier.lim,
          tierId: tier.id,
          tierName: tier.name,
          startedAt: parsed.startedAt,
          settled: parsed.settled,
          free: parsed.free,
          collected: null,
          leftover: null,
          burned: null,
          score: null,
          payout: null,
          rewardBps: 10500,
          invites: 0,
          plays: 0,
          weekPts: 0n,
          invitePts: 0n,
          referrer: ethers.ZeroAddress,
          tx: null,
        });
      });
      if (onProgress) onProgress({ phase: "runs", done: Math.min(i + batch, maxIds), total: maxIds });
    }

    const players = [...new Set(rows.map((r) => r.player))];
    const week = {};
    const refs = {};
    const invPts = {};
    for (let i = 0; i < players.length; i += batch) {
      const chunk = players.slice(i, i + batch);
      const [pts, refList, inv] = await Promise.all([
        Promise.all(chunk.map((a) => c.weekPts(a).catch(() => 0n))),
        Promise.all(chunk.map((a) => c.refOf(a).catch(() => ethers.ZeroAddress))),
        Promise.all(chunk.map((a) => c.invitePts(a).catch(() => 0n))),
      ]);
      chunk.forEach((a, j) => {
        week[a] = pts[j] || 0n;
        invPts[a] = inv[j] || 0n;
        const ref = refList[j];
        refs[a] = ref && ref !== ethers.ZeroAddress ? ethers.getAddress(ref) : ethers.ZeroAddress;
      });
    }

    function decorate() {
      const playN = {};
      const invitees = {};
      for (const row of rows) {
        playN[row.player] = (playN[row.player] || 0) + 1;
        if (!row.referrer || row.referrer === ethers.ZeroAddress) {
          row.referrer = refs[row.player] || ethers.ZeroAddress;
        }
        if (row.referrer && row.referrer !== ethers.ZeroAddress) {
          if (!invitees[row.referrer]) invitees[row.referrer] = new Set();
          invitees[row.referrer].add(row.player);
        }
      }
      for (const row of rows) {
        row.weekPts = week[row.player] || 0n;
        row.invitePts = invPts[row.player] || 0n;
        row.plays = playN[row.player] || 0;
        row.invites = invitees[row.player] ? invitees[row.player].size : 0;
        row.rewardBps = rewardBpsFromParts(row.invites, row.plays);
        row.payout = displayPayout(row.collected, row.paid, row.rewardBps);
      }
    }

    function pack(extra) {
      const unique = new Set(rows.map((r) => r.player.toLowerCase()));
      return {
        nextRunId: n,
        runs: rows,
        burnedTotal: extra.burnedTotal ?? 0n,
        weekPool: extra.weekPool ?? 0n,
        invitePool: extra.invitePool ?? 0n,
        freePool: extra.freePool ?? 0n,
        totalRuns: rows.length,
        uniqueWallets: unique.size,
        freeCount: rows.filter((r) => r.free === true).length,
        paidCount: rows.filter((r) => r.free === false).length,
        unknownPay: rows.filter((r) => r.free == null).length,
      };
    }

    decorate();
    let burnedTotal = 0n;
    let weekPool = 0n;
    let invitePool = 0n;
    let freePool = 0n;
    try {
      const pool = await poolBalance();
      burnedTotal = pool.burned;
      weekPool = pool.week;
      invitePool = pool.invite;
      freePool = pool.free;
    } catch (_) {
      try {
        burnedTotal = await c.burnedTotal();
      } catch (_) {}
    }

    if (onProgress) {
      onProgress({
        phase: "partial",
        data: pack({ burnedTotal, weekPool, invitePool, freePool }),
      });
    }

    const byId = new Map(rows.map((r) => [r.id, r]));
    if (onProgress) onProgress({ phase: "logs", done: 0, total: rows.length });
    try {
      await Promise.race([
        (async () => {
          const ev = await fetchEventLogs(["RunStarted", "RunSettled", "FreeEnter"], 12);
          for (const log of ev) {
            if (log.name === "RunStarted") {
              const row = byId.get(Number(log.args.runId));
              if (!row) continue;
              const ref = log.args.referrer;
              if (ref && ref !== ethers.ZeroAddress) row.referrer = ethers.getAddress(ref);
              if (log.args.paid != null) row.paid = log.args.paid;
            } else if (log.name === "RunSettled") {
              const row = byId.get(Number(log.args.runId));
              if (!row) continue;
              row.collected = asAmt(log.args.collected);
              row.leftover = asAmt(log.args.leftover);
              row.score = log.args.score;
              row.burned = asAmt(log.args.burned);
              row.tx = log.transactionHash;
              row.settled = true;
            } else if (log.name === "FreeEnter") {
              const row = byId.get(Number(log.args.runId));
              if (row) row.free = true;
            }
          }
        })(),
        sleep(20000),
      ]);
    } catch (_) {
      logsProvider = null;
      logsOkAt = 0;
    }

    decorate();
    return pack({ burnedTotal, weekPool, invitePool, freePool });
  }

  return {
    cfg,
    get account() {
      return account;
    },
    connect,
    short,
    isOwner,
    isDeployed,
    deploy,
    ticketPrice,
    poolBalance,
    pendingOf,
    isV6,
    invitePoints,
    inviteCountOf,
    uniqueInviteesOf,
    countPlaysOf,
    notePlay,
    rewardBpsFromParts,
    rewardBpsOf,
    nextClaimAt,
    claimWindow: sgtClaimWindow,
    claim,
    referrer,
    limBalance,
    bnbBalance,
    activeRun,
    approveAndEnter,
    freeStatus,
    hasTgBonus,
    claimTgBonus,
    claimXBonus,
    fundFreePool,
    settleRun,
    withdrawWeekly,
    setTicketPrice,
    txUrl,
    addrUrl,
    quoteLim,
    quoteSwap,
    swapToLim,
    swapExact,
    tokenBalance,
    fetchLeaderboards,
    fetchBurns,
    fetchOwnerRuns,
    formatLim(v) {
      return Number(ethers.formatUnits(v, 18)).toFixed(4);
    },
  };
})();

window.CatboxChain = CatboxChain;
