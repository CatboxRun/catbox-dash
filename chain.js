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
    "function withdrawWeekly(uint256)",
    "function fundBoards(uint256,uint256)",
    "function migratePlayers(address[],uint256[],uint256[],uint256[],address[],uint256[])",
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
    "function weekPts(address) view returns (uint256)",
    "function weekPtsTotal() view returns (uint256)",
  ];

  function freeAddr() {
    return cfg.freeAddress || cfg.address;
  }

  function paidAddr() {
    return cfg.v6?.address || cfg.address;
  }

  function freeAbi() {
    return cfg.abi;
  }

  function paidAbi() {
    return cfg.v6?.abi || cfg.abi;
  }

  function hasPaidLane() {
    return Boolean(cfg.v6?.address);
  }

  function freeGameContract(s) {
    return new ethers.Contract(freeAddr(), freeAbi(), s);
  }

  function paidGameContract(s) {
    return new ethers.Contract(paidAddr(), [...paidAbi(), ...V6_READ_ABI], s);
  }

  /** Boards / claim / paid reads. Fall back to V5 until V6 code is live. */
  function gameContract(s) {
    if (hasPaidLane() && v6Cached === true) return paidGameContract(s);
    return freeGameContract(s);
  }

  function limContract(s) {
    return new ethers.Contract(cfg.lim, ERC20_ABI, s);
  }

  async function isPaidDeployed() {
    if (!hasPaidLane()) {
      v6Cached = false;
      return false;
    }
    try {
      const p = await publicReadProvider();
      const code = await withTimeout(p.getCode(paidAddr()), 4000);
      const ok = Boolean(code && code !== "0x");
      v6Cached = ok;
      return ok;
    } catch (_) {
      return v6Cached === true;
    }
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

  let deployedCached = null;

  async function isDeployed() {
    if (deployedCached === true) return true;
    const p = await publicReadProvider();
    const code = await p.getCode(freeAddr());
    deployedCached = Boolean(code && code !== "0x");
    return deployedCached;
  }

  async function deploy() {
    await connect();
    const s = await signer();
    const data = cfg.salt + cfg.bytecode.slice(2);
    const tx = await s.sendTransaction({ to: cfg.factory, data });
    await tx.wait();
    return tx.hash;
  }

  function extraCfg() {
    return cfg.extra || null;
  }

  function extraContract(s) {
    const e = extraCfg();
    if (!e?.address || !e?.abi) throw new Error("NO_EXTRA");
    return new ethers.Contract(e.address, e.abi, s);
  }

  async function isExtraDeployed() {
    const e = extraCfg();
    if (!e?.address) return false;
    try {
      const p = await publicReadProvider();
      const code = await withTimeout(p.getCode(e.address), 4000);
      return Boolean(code && code !== "0x");
    } catch (_) {
      return false;
    }
  }

  async function deployExtra() {
    await connect();
    if (!isOwner()) throw new Error("NOT_OWNER");
    const e = extraCfg();
    if (!e?.salt || !e?.bytecode) throw new Error("NO_EXTRA");
    const s = await signer();
    const data = e.salt + e.bytecode.slice(2);
    const tx = await s.sendTransaction({ to: cfg.factory, data });
    await tx.wait();
    return tx.hash;
  }

  async function extraPoolAmt() {
    try {
      if (!(await isExtraDeployed())) return 0n;
      return await extraContract(await publicReadProvider()).pool();
    } catch (_) {
      return 0n;
    }
  }

  async function fundExtra(limAmount) {
    await connect();
    const s = await signer();
    const extra = extraContract(s);
    const extraAddr = extraCfg().address;
    const lim = limContract(s);
    const amt = ethers.parseUnits(String(limAmount), 18);
    if (amt <= 0n) throw new Error("NO_LIM");
    const bal = await lim.balanceOf(account);
    if (bal < amt) throw new Error("NO_LIM");
    const allow = await lim.allowance(account, extraAddr);
    if (allow < amt) {
      const txA = await lim.approve(extraAddr, ethers.MaxUint256);
      await txA.wait();
    }
    const tx = await extra.fund(amt);
    return (await tx.wait()).hash;
  }

  async function withdrawExtra(amountWei) {
    await connect();
    if (!isOwner()) throw new Error("NOT_OWNER");
    const extra = extraContract(await signer());
    const tx = await extra.withdraw(amountWei);
    return (await tx.wait()).hash;
  }

  async function airdropFromExtra(to, limAmount) {
    await connect();
    if (!isOwner()) throw new Error("NOT_OWNER");
    const toAddr = ethers.getAddress(to);
    const amt = ethers.parseUnits(String(limAmount), 18);
    if (amt <= 0n) throw new Error("NO_LIM");
    const extra = extraContract(await signer());
    const lim = limContract(await signer());
    const pool = await extra.pool();
    if (pool < amt) throw new Error("NO_LIM");
    const txW = await extra.withdraw(amt);
    await txW.wait();
    const txT = await lim.transfer(toAddr, amt);
    return (await txT.wait()).hash;
  }

  async function payRunExtra(runId, extraWei) {
    if (!runId || extraWei <= 0n) return null;
    if (!(await isExtraDeployed())) return null;
    const extra = extraContract(await signer());
    const [pool, already] = await Promise.all([extra.pool(), extra.paidExtra(runId)]);
    if (already > 0n || pool < extraWei) return null;
    const tx = await extra.pay(runId, extraWei);
    return (await tx.wait()).hash;
  }

  function floorCfg() {
    return cfg.floor || null;
  }

  function floorContract(s) {
    const f = floorCfg();
    if (!f?.address || !f?.abi) throw new Error("NO_FLOOR");
    return new ethers.Contract(f.address, f.abi, s);
  }

  async function isFloorDeployed() {
    const f = floorCfg();
    if (!f?.address) return false;
    try {
      const p = await publicReadProvider();
      const code = await withTimeout(p.getCode(f.address), 4000);
      return Boolean(code && code !== "0x");
    } catch (_) {
      return false;
    }
  }

  async function floorPendingOf(addr = account) {
    if (!addr) return 0n;
    try {
      if (!(await isFloorDeployed())) return 0n;
      return await floorContract(await publicReadProvider()).pending(addr);
    } catch (_) {
      return 0n;
    }
  }

  async function recordFloor(runId, paidLane) {
    if (!runId) return null;
    if (!(await isFloorDeployed())) return null;
    const floor = floorContract(await signer());
    const tx = await floor.record(runId, Boolean(paidLane));
    return (await tx.wait()).hash;
  }

  function floorDueKey(addr = account) {
    return `catbox-floor-due-${String(addr || "").toLowerCase()}`;
  }

  function readFloorOverage(addr = account) {
    if (!addr) return null;
    try {
      const raw = localStorage.getItem(floorDueKey(addr));
      if (!raw) return null;
      const o = JSON.parse(raw);
      const extra = BigInt(o?.extra || "0");
      if (extra <= 0n) return null;
      return { runId: String(o.runId || ""), extra };
    } catch (_) {
      return null;
    }
  }

  function writeFloorOverage(addr, runId, extra) {
    if (!addr || extra == null || extra <= 0n) return;
    try {
      localStorage.setItem(floorDueKey(addr), JSON.stringify({ runId: String(runId || ""), extra: extra.toString() }));
    } catch (_) {}
  }

  function clearFloorOverageMark(addr = account) {
    if (!addr) return;
    try {
      localStorage.removeItem(floorDueKey(addr));
    } catch (_) {}
  }

  function hasFloorOverage(addr = account) {
    const due = readFloorOverage(addr);
    return Boolean(due && due.extra > 0n);
  }

  async function fundFloorAmount(extraWei) {
    if (!extraWei || extraWei <= 0n) return null;
    if (!(await isFloorDeployed())) throw new Error("NO_FLOOR");
    await connect();
    const s = await signer();
    const dest = floorCfg().address;
    const lim = limContract(s);
    const floor = floorContract(s);
    const bal = await lim.balanceOf(account);
    if (bal < extraWei) throw new Error("FLOOR_DUE");
    const allow = await lim.allowance(account, dest);
    if (allow < extraWei) {
      const txA = await lim.approve(dest, ethers.MaxUint256);
      await txA.wait();
    }
    const tx = await floor.fund(extraWei);
    return (await tx.wait()).hash;
  }

  async function fundFloor(limAmount) {
    await connect();
    if (!isOwner()) throw new Error("NOT_OWNER");
    const amt = ethers.parseUnits(String(limAmount), 18);
    if (amt <= 0n) throw new Error("NO_LIM");
    try {
      return await fundFloorAmount(amt);
    } catch (e) {
      if (e?.message === "FLOOR_DUE") throw new Error("NO_LIM");
      throw e;
    }
  }

  async function clearFloorOverage() {
    const due = readFloorOverage(account);
    if (!due || due.extra <= 0n) return null;
    const hash = await fundFloorAmount(due.extra);
    const runId = due.runId;
    clearFloorOverageMark(account);
    if (runId) {
      try {
        await recordFloor(runId, true);
      } catch (_) {}
    }
    return hash;
  }

  function limPayoutFromReceipt(rec) {
    let payout = 0n;
    const limI = new ethers.Interface(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
    for (const log of rec.logs || []) {
      try {
        if (String(log.address).toLowerCase() !== String(cfg.lim).toLowerCase()) continue;
        const ev = limI.parseLog(log);
        if (
          ev?.name === "Transfer" &&
          account &&
          ev.args.to &&
          String(ev.args.to).toLowerCase() === String(account).toLowerCase()
        ) {
          payout += ev.args.value;
        }
      } catch (_) {}
    }
    return payout;
  }

  async function claimFloor() {
    await connect();
    if (!(await isFloorDeployed())) throw new Error("NONE");
    const floor = floorContract(await signer());
    const pend = await floor.pending(account);
    if (pend <= 0n) throw new Error("NONE");
    const tx = await floor.claim();
    return (await tx.wait()).hash;
  }

  async function floorPoolBalance() {
    if (!(await isFloorDeployed())) return { livePool: 0n, liveCount: 0 };
    const f = floorContract(await publicReadProvider());
    const [livePool, liveCount] = await Promise.all([f.livePool(), f.liveCount()]);
    return { livePool, liveCount: Number(liveCount) };
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
    "https://bsc-rpc.publicnode.com",
    "https://bsc.publicnode.com",
    "https://1rpc.io/bnb",
    "https://bsc.rpc.blxrbdn.com",
  ];
  const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
  const multiIface = new ethers.Interface([
    "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
  ]);
  let logsProvider = null;
  let logsOkAt = 0;

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function logsReadProvider() {
    if (logsProvider && Date.now() - logsOkAt < 120000) return logsProvider;
    const p = await new Promise((resolve, reject) => {
      let left = LOG_RPCS.length;
      let done = false;
      LOG_RPCS.forEach((url) => {
        const prov = makePublic(url);
        (async () => {
          const n = await withTimeout(prov.getBlockNumber(), 2500);
          await withTimeout(prov.getLogs({ address: cfg.address, fromBlock: n, toBlock: n }), 2500);
          return prov;
        })()
          .then((ok) => {
            if (done) return;
            done = true;
            resolve(ok);
          })
          .catch(() => {
            left -= 1;
            if (!done && left <= 0) reject(new Error("NO_LOGS_RPC"));
          });
      });
    });
    logsProvider = p;
    logsOkAt = Date.now();
    return p;
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
    if (publicProvider && Date.now() - publicOkAt < 60000) return publicProvider;
    const urls = publicRpc ? [publicRpc, ...RPCS.filter((u) => u !== publicRpc)] : RPCS;
    const picked = await new Promise((resolve, reject) => {
      let left = urls.length;
      let done = false;
      urls.forEach((url) => {
        const p = makePublic(url);
        withTimeout(p.getBlockNumber(), 2500)
          .then(() => {
            if (done) return;
            done = true;
            resolve({ p, url });
          })
          .catch(() => {
            left -= 1;
            if (!done && left <= 0) reject(new Error("NO_RPC"));
          });
      });
    }).catch(() => null);
    if (picked) {
      publicProvider = picked.p;
      publicRpc = picked.url;
      publicOkAt = Date.now();
      return publicProvider;
    }
    publicProvider = makePublic(cfg.rpc);
    publicRpc = cfg.rpc;
    publicOkAt = Date.now();
    return publicProvider;
  }

  async function boardReadProvider() {
    const urls = [LOG_RPCS[0], LOG_RPCS[1], "https://1rpc.io/bnb", cfg.rpc];
    for (const url of urls) {
      try {
        const p = makePublic(url);
        await withTimeout(p.getBlockNumber(), 2500);
        return p;
      } catch (_) {}
    }
    return publicReadProvider();
  }

  async function readProvider() {
    return publicReadProvider();
  }

  async function ticketPrice(tierId = 0) {
    const c = gameContract(await readProvider());
    return c.ticketPrice(tierId);
  }

  async function legacyBurnedTotal(p) {
    const addrs = cfg.legacyBurn || [];
    if (!addrs.length) return 0n;
    const abi = ["function burnedTotal() view returns (uint256)"];
    const parts = await Promise.all(
      addrs.map((addr) => new ethers.Contract(addr, abi, p).burnedTotal().catch(() => 0n)),
    );
    return parts.reduce((sum, v) => sum + (v || 0n), 0n);
  }

  async function poolBalance() {
    const p = await readProvider();
    let free = 0n;
    try {
      free = await freeGameContract(p).freePool();
    } catch (_) {}
    if (hasPaidLane() && (await isPaidDeployed())) {
      const c = paidGameContract(p);
      const freeGame = freeGameContract(p);
      try {
        const [d, eq, i, burnedPaid, burnedFree, players, topN, v5Bal, v5Week, v5Invite, ticketFloat] =
          await Promise.all([
            c.dayPool(),
            c.dayEqPool(),
            c.invitePool(),
            c.burnedTotal(),
            freeGame.burnedTotal().catch(() => 0n),
            c.dayPlayerCount().catch(() => 0n),
            c.topLen().catch(() => 0n),
            limContract(p).balanceOf(freeAddr()).catch(() => 0n),
            freeGame.weekPool().catch(() => 0n),
            freeGame.invitePool().catch(() => 0n),
            freeGame.ticketFloat().catch(() => 0n),
          ]);
        const daily = d + (eq || 0n);
        const weekShown = daily + (v5Week || 0n);
        const inviteShown = i + (v5Invite || 0n);
        const accounted = free + (v5Week || 0n) + (v5Invite || 0n) + (ticketFloat || 0n);
        const dust = v5Bal > accounted ? v5Bal - accounted : 0n;
        const burned = (burnedPaid || 0n) + (burnedFree || 0n) + dust + (await legacyBurnedTotal(p));
        return {
          week: weekShown,
          day: weekShown,
          dayScore: d,
          dayEq: eq,
          dayPlayers: players,
          topLen: topN,
          v6: true,
          invite: inviteShown,
          burned,
          strandedBurn: dust,
          free,
          total: weekShown + inviteShown,
        };
      } catch (_) {}
    }
    const c = freeGameContract(p);
    const [week, invite, burnedCore, legacyBurn] = await Promise.all([
      c.weekPool(),
      c.invitePool(),
      c.burnedTotal(),
      legacyBurnedTotal(p),
    ]);
    const burned = (burnedCore || 0n) + (legacyBurn || 0n);
    return {
      week,
      day: week,
      dayScore: week,
      dayEq: null,
      dayPlayers: null,
      topLen: null,
      v6: false,
      invite,
      burned,
      strandedBurn: 0n,
      free,
      total: week + invite,
    };
  }

  async function isV6() {
    return isPaidDeployed();
  }

  async function activeLane(addr = account) {
    if (!addr) return null;
    const p = await readProvider();
    if (hasPaidLane() && (await isPaidDeployed())) {
      try {
        const id = await paidGameContract(p).activeRun(addr);
        if (id && id !== 0n) return { lane: "paid", runId: id, game: paidGameContract };
      } catch (_) {}
    }
    try {
      const id = await freeGameContract(p).activeRun(addr);
      if (id && id !== 0n) return { lane: "free", runId: id, game: freeGameContract };
    } catch (_) {}
    return null;
  }

  async function readPending(game, addr) {
    const pend = await game.pending(addr);
    return {
      inv: pend[0] ?? 0n,
      wk: pend[1] ?? 0n,
      total: pend[2] ?? 0n,
    };
  }

  async function pendingOf(addr = account) {
    if (!addr) return { inv: 0n, wk: 0n, total: 0n, v5: 0n, v6: 0n, floor: 0n };
    const p = await readProvider();
    let v5 = 0n;
    let v6 = 0n;
    let inv = 0n;
    let wk = 0n;
    try {
      const p5 = await readPending(freeGameContract(p), addr);
      v5 = p5.total;
    } catch (_) {}
    const v6Live = hasPaidLane() && (await isPaidDeployed());
    if (v6Live) {
      try {
        const p6 = await readPending(paidGameContract(p), addr);
        v6 = p6.total;
        inv = p6.inv;
        wk = p6.wk;
      } catch (_) {}
    } else {
      try {
        const p5 = await readPending(freeGameContract(p), addr);
        inv = p5.inv;
        wk = p5.wk;
      } catch (_) {}
    }
    const floorPend = await floorPendingOf(addr);
    const total = v5 + v6 + floorPend;
    if (v6Live && v5 > 0n && inv === 0n && wk === 0n) {
      try {
        const p5 = await readPending(freeGameContract(p), addr);
        inv = (inv || 0n) + p5.inv;
        wk = (wk || 0n) + p5.wk;
      } catch (_) {}
    }
    return { inv, wk, total, v5, v6, floor: floorPend };
  }

  async function invitePoints(addr = account) {
    if (!addr) return 0n;
    const c = gameContract(await readProvider());
    return c.invitePts(addr);
  }

  async function weekPoints(addr = account) {
    if (!addr) return 0n;
    const c = gameContract(await readProvider());
    return c.weekPts(addr);
  }

  async function boardPointsOf(addr) {
    if (!addr) return { week: 0n, invite: 0n };
    const c = gameContract(await readProvider());
    const [week, invite] = await Promise.all([c.weekPts(addr), c.invitePts(addr)]);
    return { week, invite };
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
    let paidPlays = 0;
    let freePlays = 0;
    try {
      const p = await publicReadProvider();
      if (await isPaidDeployed()) {
        try {
          paidPlays = Number(await paidGameContract(p).playCount(addr));
        } catch (_) {}
      }
      try {
        freePlays = Number(await freeGameContract(p).freeUsed(addr));
        if (!Number.isFinite(freePlays) || freePlays < 0) freePlays = 0;
        if (freePlays > 2) freePlays = 2;
      } catch (_) {
        freePlays = 0;
      }
      if (!paidPlays && !(await isPaidDeployed())) {
        paidPlays = await scanPlayCount(addr);
        freePlays = 0;
      }
    } catch (_) {}
    const n = Math.max((paidPlays || 0) + (freePlays || 0), local);
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
    const hashes = [];
    const tryClaim = async (game) => {
      const pend = await readPending(game, account);
      if (pend.total <= 0n) return;
      const tx = await game.claim();
      hashes.push((await tx.wait()).hash);
    };
    try {
      await tryClaim(freeGameContract(s));
    } catch (e) {
      if (!hasPaidLane() || !(await isPaidDeployed())) throw e;
    }
    if (hasPaidLane() && (await isPaidDeployed())) {
      await tryClaim(paidGameContract(s));
    }
    if (!hashes.length) throw new Error("NONE");
    return hashes.length === 1 ? hashes[0] : hashes.join(",");
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
    const lane = await activeLane(addr);
    return lane?.runId || 0n;
  }

  async function deployPaid() {
    await connect();
    if (!isOwner()) throw new Error("NOT_OWNER");
    const v = cfg.v6;
    if (!v?.salt || !v?.bytecode) throw new Error("NO_V6");
    if (await isPaidDeployed()) return null;
    const s = await signer();
    const data = v.salt + v.bytecode.slice(2);
    const tx = await s.sendTransaction({ to: cfg.factory, data });
    await tx.wait();
    v6Cached = true;
    return tx.hash;
  }

  async function fundBoards(toDayLim, toInviteLim) {
    await connect();
    if (!isOwner()) throw new Error("NOT_OWNER");
    if (!(await isPaidDeployed())) throw new Error("PAID_NOT_READY");
    const s = await signer();
    const game = paidGameContract(s);
    const lim = limContract(s);
    const toDay = ethers.parseUnits(String(toDayLim || 0), 18);
    const toInvite = ethers.parseUnits(String(toInviteLim || 0), 18);
    const amt = toDay + toInvite;
    if (amt <= 0n) throw new Error("NO_LIM");
    const bal = await lim.balanceOf(account);
    if (bal < amt) throw new Error("NO_LIM");
    const allow = await lim.allowance(account, paidAddr());
    if (allow < amt) {
      const txA = await lim.approve(paidAddr(), ethers.MaxUint256);
      await txA.wait();
    }
    const tx = await game.fundBoards(toDay, toInvite);
    return (await tx.wait()).hash;
  }

  async function v6ReserveLim() {
    if (!(await isPaidDeployed())) return 0n;
    const p = await readProvider();
    const addr = paidAddr();
    const game = paidGameContract(p);
    const [bal, tf, free, day, eq, inv, owed] = await Promise.all([
      limContract(p).balanceOf(addr),
      game.ticketFloat().catch(() => 0n),
      game.freePool().catch(() => 0n),
      game.dayPool().catch(() => 0n),
      game.dayEqPool().catch(() => 0n),
      game.invitePool().catch(() => 0n),
      game.owed().catch(() => 0n),
    ]);
    const booked = (tf || 0n) + (free || 0n) + (day || 0n) + (eq || 0n) + (inv || 0n) + (owed || 0n);
    return bal > booked ? bal - booked : 0n;
  }

  async function fundBoardsFromReserve(toDayLim, toInviteLim) {
    await connect();
    if (!isOwner()) throw new Error("NOT_OWNER");
    if (!(await isPaidDeployed())) throw new Error("PAID_NOT_READY");
    const s = await signer();
    const game = new ethers.Contract(paidAddr(), [...(cfg.v6?.abi || []), "function fundBoardsFromBalance(uint256,uint256)"], s);
    const toDay = ethers.parseUnits(String(toDayLim || 0), 18);
    const toInvite = ethers.parseUnits(String(toInviteLim || 0), 18);
    const amt = toDay + toInvite;
    if (amt <= 0n) throw new Error("NO_LIM");
    const reserve = await v6ReserveLim();
    if (reserve < amt) throw new Error("RESERVE_LOW");
    try {
      await game.fundBoardsFromBalance.staticCall(toDay, toInvite);
    } catch (e) {
      throw new Error("NO_RESERVE_FN");
    }
    const tx = await game.fundBoardsFromBalance(toDay, toInvite);
    return (await tx.wait()).hash;
  }

  function assumedFree() {
    return { used: 0, left: 2, pool: 0n, eligible: true, scoutFree: true };
  }

  async function freeStatus(addr = account) {
    if (!addr) return assumedFree();
    try {
      const c = freeGameContract(await readProvider());
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

  function socialCfg() {
    return cfg.social || null;
  }

  function socialContract(s) {
    const sc = socialCfg();
    if (!sc?.address || !sc?.abi) throw new Error("NO_SOCIAL");
    return new ethers.Contract(sc.address, sc.abi, s);
  }

  async function isSocialDeployed() {
    const sc = socialCfg();
    if (!sc?.address) return false;
    try {
      const p = await publicReadProvider();
      const code = await withTimeout(p.getCode(sc.address), 4000);
      return Boolean(code && code !== "0x");
    } catch (_) {
      return false;
    }
  }

  async function deploySocial() {
    await connect();
    if (!isOwner()) throw new Error("NOT_OWNER");
    const sc = socialCfg();
    if (!sc?.salt || !sc?.bytecode) throw new Error("NO_SOCIAL");
    const s = await signer();
    const data = sc.salt + sc.bytecode.slice(2);
    const tx = await s.sendTransaction({ to: cfg.factory, data });
    await tx.wait();
    return tx.hash;
  }

  async function socialClaimed(kind, addr = account) {
    if (!addr || !(await isSocialDeployed())) return false;
    try {
      const c = socialContract(await publicReadProvider());
      return kind === "x" ? Boolean(await c.xClaimed(addr)) : Boolean(await c.tgClaimed(addr));
    } catch (_) {
      return false;
    }
  }

  async function hasTgBonus(addr = account) {
    if (!addr) return false;
    if (await socialClaimed("tg", addr)) return true;
    try {
      const c = freeGameContract(await readProvider());
      return Boolean(await c.tgClaimed(addr));
    } catch (_) {
      return false;
    }
  }

  async function hasXBonus(addr = account) {
    if (!addr) return false;
    if (await socialClaimed("x", addr)) return true;
    try {
      const c = freeGameContract(await readProvider());
      return Boolean(await c.xClaimed(addr));
    } catch (_) {
      return false;
    }
  }

  async function claimSocialBonus(kind) {
    await connect();
    if (!(await isSocialDeployed())) return false;
    const s = await signer();
    const social = socialContract(s);
    try {
      const already = kind === "x" ? await social.xClaimed(account) : await social.tgClaimed(account);
      if (already) return true;
    } catch (_) {
      return false;
    }
    try {
      const tx = kind === "x" ? await social.claimXBonus() : await social.claimTgBonus();
      await tx.wait();
      return true;
    } catch (_) {
      return false;
    }
  }

  async function claimTgBonus() {
    if (await claimSocialBonus("tg")) return true;
    await connect();
    const s = await signer();
    // Free-scout bonuses live on V5 free lane, not V6 paid.
    const game = freeGameContract(s);
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
    if (await claimSocialBonus("x")) return true;
    await connect();
    const s = await signer();
    const game = freeGameContract(s);
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

  /** V6 freePool — pays overtime / settle boost above the ticket on paid runs. */
  async function bonusPoolAmt() {
    if (!hasPaidLane() || !(await isPaidDeployed())) return 0n;
    try {
      return await paidGameContract(await publicReadProvider()).freePool();
    } catch (_) {
      return 0n;
    }
  }

  async function fundFreePool(limAmount) {
    await connect();
    const s = await signer();
    const game = freeGameContract(s);
    const lim = limContract(s);
    const amt = ethers.parseUnits(String(limAmount), 18);
    if (amt <= 0n) throw new Error("NO_LIM");
    const bal = await lim.balanceOf(account);
    if (bal < amt) throw new Error("NO_LIM");
    const allow = await lim.allowance(account, freeAddr());
    if (allow < amt) {
      const txA = await lim.approve(freeAddr(), ethers.MaxUint256);
      await txA.wait();
    }
    const tx = await game.fund(amt);
    return (await tx.wait()).hash;
  }

  function isBanned(addr = account) {
    if (!addr) return false;
    const list = cfg.banned || [];
    const want = String(addr).toLowerCase();
    return list.some((a) => String(a).toLowerCase() === want);
  }

  function assertNotBanned(addr = account) {
    if (isBanned(addr)) throw new Error("BANNED");
  }

  async function approveAndEnter(tierId = 0) {
    await connect();
    assertNotBanned();
    clearFloorOverageMark();
    const s = await signer();
    const lim = limContract(s);
    const id = Number(tierId);
    let useFree = false;
    try {
      const st = await freeStatus(account);
      if (id === 0) {
        // Must be actually eligible (left + freePool), not merely left > 0.
        useFree = Boolean(st.eligible);
      }
    } catch (_) {
      useFree = false;
    }

    const busy = await activeLane(account);
    if (busy) throw new Error("ACTIVE_RUN");

    if (useFree) {
      const game = freeGameContract(s);
      let ref = referrer();
      if (!ref || ref.toLowerCase() === account.toLowerCase()) ref = ethers.ZeroAddress;
      const tx = await game.enter(ref, tierId);
      const rec = await tx.wait();
      notePlay(account);
      await markEnteredRun();
      return rec.hash;
    }

    // Paid enter: V6 when live, otherwise keep V5 until cutover deploy.
    const usePaid = hasPaidLane() && (await isPaidDeployed());
    const game = usePaid ? paidGameContract(s) : freeGameContract(s);
    const spender = usePaid ? paidAddr() : freeAddr();
    const price = await game.ticketPrice(tierId);
    const bal = await lim.balanceOf(account);
    if (bal < price) throw new Error("NO_LIM");
    const allow = await lim.allowance(account, spender);
    if (allow < price) {
      const txA = await lim.approve(spender, ethers.MaxUint256);
      await txA.wait();
    }
    let ref = referrer();
    if (!ref || ref.toLowerCase() === account.toLowerCase()) ref = ethers.ZeroAddress;
    const tx = await game.enter(ref, tierId);
    const rec = await tx.wait();
    notePlay(account);
    await markEnteredRun();
    return rec.hash;
  }

  const SCORE_PER_LIM = 250000n;

  function capBoardScore(score, ticketLim) {
    let s = 0n;
    try {
      s = BigInt(Math.max(0, Math.floor(Number(score) || 0)));
    } catch (_) {
      s = 0n;
    }
    let lim = 1n;
    try {
      lim = BigInt(Math.max(1, Math.floor(Number(ticketLim) || 1)));
    } catch (_) {
      lim = 1n;
    }
    const max = lim * SCORE_PER_LIM;
    return s > max ? max : s;
  }

  function collectedWei(got, ticket, capAtTicket) {
    const paid = ethers.parseUnits(String(ticket), 18);
    const wei = ethers.parseUnits(Number(Math.max(0, got)).toFixed(6), 18);
    const cap = capAtTicket ? paid : paid <= 10n ** 18n ? paid * 2n : (paid * 15n) / 10n;
    if (wei > cap) return cap;
    return wei;
  }

  function extraWeiFromGot(got, ticket) {
    const paid = ethers.parseUnits(String(ticket), 18);
    const wei = ethers.parseUnits(Number(Math.max(0, got)).toFixed(6), 18);
    if (wei <= paid) return 0n;
    const cap = paid <= 10n ** 18n ? paid : paid / 2n;
    const extra = wei - paid;
    return extra > cap ? cap : extra;
  }

  async function settleRun(got, ticket, score, onExtra) {
    await connect();
    const s = await signer();
    const lane = await activeLane(account);
    if (!lane) return null;
    const freeLane = lane.lane === "free";
    const game = freeLane ? freeGameContract(s) : paidGameContract(s);
    const runId = lane.runId;
    let paidWei = ethers.parseUnits(String(ticket), 18);
    try {
      const raw = await game.runs(runId);
      const paid = raw?.paid != null ? raw.paid : raw?.[1];
      if (paid && paid > 0n) paidWei = paid;
    } catch (_) {}
    const capAtTicket = freeLane;
    const extraAmt = capAtTicket ? extraWeiFromGot(got, ticket) : 0n;
    const safeScore = capBoardScore(score, ticket);
    const tx = await game.settle(collectedWei(got, ticket, capAtTicket), safeScore);
    const rec = await tx.wait();
    clearRunProgress(account);
    let burned = 0n;
    let settledPayout = 0n;
    let payout = 0n;
    const limI = new ethers.Interface(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
    for (const log of rec.logs || []) {
      try {
        const parsed = game.interface.parseLog(log);
        if (parsed?.name === "Burned") burned = parsed.args.amount;
        if (parsed?.name === "RunSettled" && parsed.args.payout != null) settledPayout = parsed.args.payout;
      } catch (_) {}
      try {
        if (String(log.address).toLowerCase() !== String(cfg.lim).toLowerCase()) continue;
        const ev = limI.parseLog(log);
        if (
          ev?.name === "Transfer" &&
          account &&
          ev.args.to &&
          String(ev.args.to).toLowerCase() === String(account).toLowerCase()
        ) {
          payout += ev.args.value;
        }
      } catch (_) {}
    }
    if (payout === 0n) payout = settledPayout;
    let extraHash = "";
    let extraPaid = 0n;
    if (extraAmt > 0n && freeLane) {
      try {
        if (typeof onExtra === "function") onExtra();
        extraHash = (await payRunExtra(runId, extraAmt)) || "";
        if (extraHash) extraPaid = extraAmt;
      } catch (_) {}
    }
    let floorHash = "";
    let floorExtra = 0n;
    try {
      await recordFloor(runId, !freeLane);
    } catch (e1) {
      try {
        await new Promise((r) => setTimeout(r, 1200));
        await recordFloor(runId, !freeLane);
      } catch (_) {}
    }
    return {
      hash: rec.hash,
      burned,
      payout: payout + extraPaid,
      extraHash,
      extraPaid,
      lane: lane.lane,
      floorHash,
      floorExtra,
    };
  }

  function runProgressKey(addr = account) {
    return `catbox-run-progress-${String(addr || "").toLowerCase()}`;
  }

  function readRunProgress(addr = account) {
    if (!addr) return null;
    try {
      const raw = JSON.parse(localStorage.getItem(runProgressKey(addr)) || "null");
      if (!raw || raw.runId == null) return null;
      return {
        runId: String(raw.runId),
        phase: String(raw.phase || ""),
        collected: Math.max(0, Number(raw.collected) || 0),
        score: Math.max(0, Math.floor(Number(raw.score) || 0)),
        ticket: Math.max(0, Number(raw.ticket) || 0),
      };
    } catch (_) {
      return null;
    }
  }

  function writeRunProgress(patch, addr = account) {
    if (!addr) return;
    try {
      const prev = readRunProgress(addr) || {};
      const next = { ...prev, ...patch, at: Date.now() };
      if (next.runId == null) return;
      localStorage.setItem(runProgressKey(addr), JSON.stringify(next));
    } catch (_) {}
  }

  function clearRunProgress(addr = account) {
    if (!addr) return;
    try {
      localStorage.removeItem(runProgressKey(addr));
    } catch (_) {}
  }

  async function markEnteredRun() {
    try {
      const lane = await activeLane(account);
      if (!lane?.runId) return;
      writeRunProgress({ runId: String(lane.runId), phase: "entered", collected: 0, score: 0 });
    } catch (_) {}
  }

  function noteRunPlaying(collected, score, ticket) {
    const prev = readRunProgress(account);
    if (!prev?.runId) return;
    writeRunProgress({
      runId: prev.runId,
      phase: "playing",
      collected: collected != null ? collected : prev.collected,
      score: score != null ? score : prev.score,
      ticket: ticket != null ? ticket : prev.ticket,
    });
  }

  function noteRunProgress(collected, score) {
    const prev = readRunProgress(account);
    if (!prev?.runId) return;
    writeRunProgress({
      runId: prev.runId,
      phase: prev.phase === "finished" ? "finished" : "playing",
      collected: collected != null ? collected : prev.collected,
      score: score != null ? score : prev.score,
    });
  }

  function noteRunFinished(collected, score) {
    const prev = readRunProgress(account);
    if (!prev?.runId) return;
    writeRunProgress({
      runId: prev.runId,
      phase: "finished",
      collected: collected != null ? collected : prev.collected,
      score: score != null ? score : prev.score,
    });
  }

  /** Close a stuck on-chain run after refresh. Uses saved collected from this run — never gifts a full ticket after play. */
  async function clearActiveRun() {
    await connect();
    const s = await signer();
    const lane = await activeLane(account);
    if (!lane) return null;
    const freeLane = lane.lane === "free";
    const game = freeLane ? freeGameContract(s) : paidGameContract(s);
    let ticket = 0n;
    try {
      const raw = await game.runs(lane.runId);
      const paid = raw?.paid != null ? raw.paid : raw?.[1];
      if (paid && paid > 0n) ticket = paid;
    } catch (_) {
      ticket = 0n;
    }
    const progress = readRunProgress(account);
    const sameRun = Boolean(progress && String(progress.runId) === String(lane.runId));
    let collected = 0n;
    let score = 0n;
    if (sameRun && progress.phase === "entered") {
      collected = ticket;
      score = 0n;
    } else if (sameRun) {
      const ticketLim =
        progress.ticket > 0 ? progress.ticket : Number(ethers.formatUnits(ticket || 0n, 18));
      collected = collectedWei(progress.collected, ticketLim, freeLane);
      score = capBoardScore(progress.score, ticketLim);
    }
    const tx = await game.settle(collected, score);
    const rec = await tx.wait();
    clearRunProgress(account);
    if (!freeLane && ticket > 0n && rec) {
      try {
        await recordFloor(lane.runId, true);
      } catch (_) {}
    }
    return rec.hash;
  }

  function assertBoardWithdrawAllowed() {
    const win = sgtClaimWindow();
    const now = Math.floor(Date.now() / 1000);
    if (win.open) throw new Error("CLAIM_WINDOW_OPEN");
    if (now < win.nextOpen) throw new Error("CLAIM_NOT_OPEN");
  }

  async function withdrawWeekly(amountWei) {
    await connect();
    if (!isOwner()) throw new Error("NOT_OWNER");
    assertBoardWithdrawAllowed();
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
  const PERMIT2 = "0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768";
  const MSG_SENDER = "0x0000000000000000000000000000000000000001";
  const ADDRESS_THIS = "0x0000000000000000000000000000000000000002";
  const CONTRACT_BALANCE = 1n << 255n;
  const CMD = { PERMIT2_TRANSFER_FROM: 0x02, V2_SWAP_EXACT_IN: 0x08, WRAP_ETH: 0x0b, UNWRAP_WETH: 0x0c, INFI_SWAP: 0x10 };
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

  function encodeInfiFromRouterToken(pool, tokenIn, tokenOut, amountIn, minOut) {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const zeroForOne = sameAddr(tokenIn, pool.currency0);
    return encodePlan([
      { act: ACT.SETTLE, data: coder.encode(["address", "uint256", "bool"], [tokenIn, amountIn, false]) },
      { act: ACT.CL_SWAP_EXACT_IN_SINGLE, data: clSwapData(pool, 0, minOut, zeroForOne) },
      { act: ACT.TAKE_ALL, data: coder.encode(["address", "uint256"], [tokenOut, minOut]) },
    ]);
  }

  function encodeInfiTakeToRouterFromBalance(pool, tokenIn, tokenOut, amountIn, minOut) {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const zeroForOne = sameAddr(tokenIn, pool.currency0);
    return encodePlan([
      { act: ACT.SETTLE, data: coder.encode(["address", "uint256", "bool"], [tokenIn, amountIn, false]) },
      { act: ACT.CL_SWAP_EXACT_IN_SINGLE, data: clSwapData(pool, 0, minOut, zeroForOne) },
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

  function permit2Pull(token, amountIn) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint160"],
      [token, ADDRESS_THIS, amountIn],
    );
  }

  function isUserReject(e) {
    const code = e?.code;
    const msg = String(e?.shortMessage || e?.reason || e?.info?.error?.message || e?.message || "");
    return code === 4001 || code === "ACTION_REJECTED" || /user rejected|user denied|rejected the request|denied transaction|cancelled|用户取消|拒绝签名|取消交易/i.test(msg);
  }

  function swapError(code, cause) {
    const err = new Error(code);
    err.cause = cause;
    return err;
  }

  function revertSelector(e) {
    const data = e?.data || e?.info?.error?.data;
    if (typeof data !== "string" || !data.startsWith("0x") || data.length < 10) return null;
    return data.slice(0, 10).toLowerCase();
  }

  function decorateSwapRevert(e) {
    if (isUserReject(e)) return swapError("REJECTED", e);
    const sel = revertSelector(e);
    if (sel === "0xd81b2f2e" || sel === "0xf96fb071") return swapError("ALLOW", e);
    if (sel === "0x4704aaf8") return swapError("SLIP", e);
    const msg = String(e?.shortMessage || e?.reason || e?.info?.error?.message || e?.message || "");
    if (/TooLittleReceived|too little received|INSUFFICIENT_OUTPUT|slippage/i.test(msg)) return swapError("SLIP", e);
    if (/AllowanceExpired|InsufficientAllowance|allowance|insufficient.*allow|TRANSFER_FROM_FAILED|STF|Permit2|TRANSFER_FROM/i.test(msg)) {
      return swapError("ALLOW", e);
    }
    if (/insufficient funds|insufficient balance for gas|gas required exceeds|not enough bnb|余额不足/i.test(msg)) {
      return swapError("GAS", e);
    }
    return swapError("TX", e);
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

  async function permit2SellReady(token, amountIn, addr = account) {
    if (!addr || !amountIn) return { ok: false, erc: false, router: false };
    const p = await readProvider();
    const erc = new ethers.Contract(token, ERC20_ABI, p);
    const allow = await erc.allowance(addr, PERMIT2);
    const p2 = new ethers.Contract(PERMIT2, PERMIT2_ABI, p);
    const cur = await p2.allowance(addr, token, UR);
    const now = Math.floor(Date.now() / 1000);
    const ercOk = allow >= amountIn;
    const routerOk = cur[0] >= amountIn && Number(cur[1]) > now + 60;
    return { ok: ercOk && routerOk, erc: ercOk, router: routerOk };
  }

  async function assertPermit2Ready(token, amountIn) {
    const st = await permit2SellReady(token, amountIn);
    if (!st.ok) throw swapError("ALLOW");
  }

  async function ensurePermit2(token, amountIn, s, onStatus) {
    const erc = new ethers.Contract(token, ERC20_ABI, s);
    const allow = await erc.allowance(account, PERMIT2);
    if (allow < amountIn) {
      if (onStatus) onStatus("swapApprove");
      const txA = await erc.approve(PERMIT2, ethers.MaxUint256);
      await txA.wait();
    }
    const p2 = new ethers.Contract(PERMIT2, PERMIT2_ABI, s);
    const cur = await p2.allowance(account, token, UR);
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 30 * 24 * 3600;
    if (cur[0] < amountIn || Number(cur[1]) < now + 600) {
      if (onStatus) onStatus("swapPermit");
      const cap160 = (1n << 160n) - 1n;
      const txB = await p2.approve(token, UR, cap160, exp);
      await txB.wait();
    }
    await assertPermit2Ready(token, amountIn);
  }

  async function swapExact(fromSym, toSym, amountIn, onStatus) {
    await connect();
    const quoted = await quoteSwap(fromSym, toSym, amountIn);
    if (!quoted.path || quoted.out === 0n) throw new Error("NO_LIQ");
    const pool = quoted.pool || limPool();
    if (!pool?.currency0) throw new Error("NO_LIQ");
    if (fromSym !== "BNB") {
      const gasBal = await bnbBalance(account);
      const gasFloor = ethers.parseUnits("0.00012", 18);
      if (gasBal < gasFloor) throw swapError("GAS");
    }
    const selling = fromSym === "LIM";
    const minOut = selling ? (quoted.out * 95n) / 100n : (quoted.out * 99n) / 100n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 180);
    const s = await signer();
    const p = s.provider;
    const ur = new ethers.Contract(UR, UR_ABI, s);
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const value = fromSym === "BNB" ? amountIn : 0n;
    let commands;
    let inputs;
    try {
      if (fromSym === "USDT" && toSym === "LIM") {
        await ensurePermit2(USDT, amountIn, s, onStatus);
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
        await ensurePermit2(cfg.lim, amountIn, s, onStatus);
        commands = cmds(CMD.PERMIT2_TRANSFER_FROM, CMD.INFI_SWAP);
        inputs = [
          permit2Pull(cfg.lim, amountIn),
          encodeInfiFromRouterToken(pool, cfg.lim, USDT, amountIn, minOut),
        ];
      } else if (fromSym === "LIM" && toSym === "BNB") {
        const usdtOut = await quoteInfi(cfg.lim, amountIn, p);
        if (usdtOut === 0n) throw new Error("NO_LIQ");
        // Slippage only on final BNB; stacking 5% on both hops often reverts sells.
        const minUsdt = 1n;
        await ensurePermit2(cfg.lim, amountIn, s, onStatus);
        commands = cmds(CMD.PERMIT2_TRANSFER_FROM, CMD.INFI_SWAP, CMD.V2_SWAP_EXACT_IN, CMD.UNWRAP_WETH);
        inputs = [
          permit2Pull(cfg.lim, amountIn),
          encodeInfiTakeToRouterFromBalance(pool, cfg.lim, USDT, amountIn, minUsdt),
          coder.encode(["address", "uint256", "uint256", "address[]", "bool"], [ADDRESS_THIS, CONTRACT_BALANCE, minOut, [USDT, WBNB], false]),
          coder.encode(["address", "uint256"], [MSG_SENDER, 0]),
        ];
      } else {
        throw new Error("NO_LIQ");
      }
      if (onStatus) onStatus("swapping");
      try {
        await ur.execute.staticCall(commands, inputs, deadline, { value });
      } catch (e) {
        const decorated = decorateSwapRevert(e);
        if (["SLIP", "ALLOW", "REJECTED", "GAS"].includes(decorated.message)) throw decorated;
      }
      const tx = await ur.execute(commands, inputs, deadline, { value });
      return (await tx.wait()).hash;
    } catch (e) {
      if (e?.message === "NO_LIQ" || e?.message === "REJECTED" || e?.message === "SLIP" || e?.message === "ALLOW" || e?.message === "GAS" || e?.message === "TX") {
        throw e;
      }
      throw decorateSwapRevert(e);
    }
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

  async function fetchEventLogs(eventNames, maxChunks = 8, onPartial) {
    const names = Array.isArray(eventNames) ? eventNames : [eventNames];
    const p = await logsReadProvider();
    const iface = gameContract(p).interface;
    const hashes = names.map((n) => iface.getEvent(n).topicHash);
    const latest = await withTimeout(p.getBlockNumber(), 4000);
    const span = 1000;
    const ranges = [];
    for (let i = 0; i < maxChunks; i++) {
      const toBlock = latest - i * span;
      if (toBlock < 0) break;
      ranges.push({ fromBlock: Math.max(0, toBlock - span + 1), toBlock });
    }
    const topic0 = hashes.length === 1 ? hashes[0] : hashes;
    const targets = [freeAddr()];
    try {
      if (hasPaidLane() && (await isPaidDeployed()) && paidAddr().toLowerCase() !== freeAddr().toLowerCase()) {
        targets.push(paidAddr());
      }
    } catch (_) {}
    const out = [];
    const PARALLEL = 2;
    let fails = 0;
    let quiet = 0;
    for (let i = 0; i < ranges.length; i += PARALLEL) {
      const slice = ranges.slice(i, i + PARALLEL);
      const results = await Promise.all(
        slice.flatMap((r) =>
          targets.map(async (address) => {
            try {
              return await withTimeout(
                p.getLogs({
                  address,
                  topics: [topic0],
                  fromBlock: r.fromBlock,
                  toBlock: r.toBlock,
                }),
                8000,
              );
            } catch (_) {
              return null;
            }
          }),
        ),
      );
      let parsed = 0;
      let emptyOk = 0;
      let failed = 0;
      for (const got of results) {
        if (!got) {
          failed += 1;
          continue;
        }
        if (!got.length) emptyOk += 1;
        for (const log of got) {
          try {
            const parsedLog = iface.parseLog(log);
            out.push({
              name: parsedLog.name,
              args: parsedLog.args,
              address: log.address,
              blockNumber: log.blockNumber,
              transactionHash: log.transactionHash,
            });
            parsed += 1;
          } catch (_) {}
        }
      }
      if (failed === results.length) {
        fails += 1;
        if (fails >= 2) {
          logsProvider = null;
          logsOkAt = 0;
          break;
        }
      } else {
        fails = 0;
      }
      if (parsed === 0 && emptyOk === results.length && out.length) {
        quiet += 1;
        if (quiet >= 2) break;
      } else if (parsed) {
        quiet = 0;
      }
      if (typeof onPartial === "function" && out.length) {
        try {
          onPartial(out);
        } catch (_) {}
      }
    }
    return out;
  }

  async function fetchContractLogs(address, abi, eventNames, maxChunks = 12) {
    const names = Array.isArray(eventNames) ? eventNames : [eventNames];
    const p = await logsReadProvider();
    const contract = new ethers.Contract(address, abi, p);
    const iface = contract.interface;
    const hashes = names.map((n) => iface.getEvent(n).topicHash);
    const latest = await withTimeout(p.getBlockNumber(), 4000);
    const span = 1000;
    const ranges = [];
    for (let i = 0; i < maxChunks; i++) {
      const toBlock = latest - i * span;
      if (toBlock < 0) break;
      ranges.push({ fromBlock: Math.max(0, toBlock - span + 1), toBlock });
    }
    const topic0 = hashes.length === 1 ? hashes[0] : hashes;
    const out = [];
    const PARALLEL = 2;
    for (let i = 0; i < ranges.length; i += PARALLEL) {
      const slice = ranges.slice(i, i + PARALLEL);
      const results = await Promise.all(
        slice.map(async (r) => {
          try {
            return await withTimeout(
              p.getLogs({
                address,
                topics: [topic0],
                fromBlock: r.fromBlock,
                toBlock: r.toBlock,
              }),
              8000,
            );
          } catch (_) {
            return null;
          }
        }),
      );
      for (const got of results) {
        if (!got) continue;
        for (const log of got) {
          try {
            const parsedLog = iface.parseLog(log);
            out.push({
              name: parsedLog.name,
              args: parsedLog.args,
              blockNumber: log.blockNumber,
              transactionHash: log.transactionHash,
            });
          } catch (_) {}
        }
      }
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

  async function aggregate3(p, calls) {
    const data = multiIface.encodeFunctionData("aggregate3", [calls]);
    const raw = await withTimeout(p.call({ to: MULTICALL3, data }), 6000);
    return multiIface.decodeFunctionResult("aggregate3", raw)[0];
  }

  async function multicallFn(p, iface, fn, items, target) {
    const dest = target || (hasPaidLane() && v6Cached === true ? paidAddr() : freeAddr());
    const out = [];
    const batch = 40;
    for (let i = 0; i < items.length; i += batch) {
      const chunk = items.slice(i, i + batch);
      const calls = chunk.map((item) => ({
        target: dest,
        allowFailure: true,
        callData: iface.encodeFunctionData(fn, [item]),
      }));
      let rows = null;
      for (let attempt = 0; attempt < 3 && !rows; attempt++) {
        if (attempt) await sleep(160 * attempt);
        try {
          rows = await aggregate3(p, calls);
        } catch (_) {
          rows = null;
        }
      }
      chunk.forEach((_, j) => {
        const row = rows && rows[j];
        const ok = row && (row.success === true || row[0] === true);
        const bytes = row ? row.returnData || row[1] : "0x";
        if (!ok || !bytes || bytes === "0x") {
          out.push(null);
          return;
        }
        try {
          out.push(iface.decodeFunctionResult(fn, bytes));
        } catch (_) {
          out.push(null);
        }
      });
    }
    const missed = [];
    out.forEach((row, i) => {
      if (!row) missed.push(i);
    });
    if (missed.length && missed.length <= 80) {
      const retryItems = missed.map((i) => items[i]);
      const retryCalls = retryItems.map((item) => ({
        target: dest,
        allowFailure: true,
        callData: iface.encodeFunctionData(fn, [item]),
      }));
      try {
        const retryRows = await aggregate3(p, retryCalls);
        missed.forEach((orig, j) => {
          const row = retryRows && retryRows[j];
          const ok = row && (row.success === true || row[0] === true);
          const bytes = row ? row.returnData || row[1] : "0x";
          if (!ok || !bytes || bytes === "0x") return;
          try {
            out[orig] = iface.decodeFunctionResult(fn, bytes);
          } catch (_) {}
        });
      } catch (_) {}
    }
    return out;
  }

  let boardCache = { lastId: 0, seen: [], week: {}, invite: {} };

  function ptsSum(map) {
    return Object.values(map).reduce((a, b) => a + (b || 0n), 0n);
  }

  async function fetchLeaderboards(onPartial) {
    const opts = onPartial && typeof onPartial === "object" ? onPartial : { onPartial };
    const p = await boardReadProvider();
    const c = gameContract(p);
    const n = Number(await withTimeout(c.nextRunId(), 5000));
    if (!Number.isFinite(n) || n < 2) {
      return { week: [], invite: [] };
    }
    const last = n - 1;
    const seen = new Set(opts.incremental && boardCache.lastId ? boardCache.seen : []);
    let fromId = 1;
    if (opts.incremental && boardCache.lastId && last >= boardCache.lastId) {
      fromId = boardCache.lastId + 1;
    }

    async function playersFrom(startId, toId) {
      if (startId > toId) return [];
      const ids = [];
      for (let i = toId; i >= startId; i--) ids.push(i);
      let decodedRuns = await multicallFn(p, c.interface, "runs", ids);
      const retry = ids.filter((_, j) => !decodedRuns[j]);
      if (retry.length) {
        const extra = await multicallFn(p, c.interface, "runs", retry);
        const byId = new Map(retry.map((id, j) => [id, extra[j]]));
        decodedRuns = decodedRuns.map((row, j) => row || byId.get(ids[j]) || null);
      }
      const fresh = [];
      for (const decoded of decodedRuns) {
        if (!decoded) continue;
        const player = decoded.player || decoded[0];
        if (!player || player === ethers.ZeroAddress) continue;
        const addr = ethers.getAddress(player);
        if (seen.has(addr)) continue;
        seen.add(addr);
        fresh.push(addr);
      }
      return fresh;
    }

    async function inviteFrom(addrs, seed = {}) {
      const invite = { ...seed };
      if (!addrs.length) return invite;
      const [ptsRows, refRows] = await Promise.all([
        multicallFn(p, c.interface, "invitePts", addrs),
        multicallFn(p, c.interface, "refOf", addrs),
      ]);
      const refs = new Set();
      addrs.forEach((a, j) => {
        if (ptsRows[j]) {
          const pts = ptsRows[j][0] || 0n;
          if (pts > 0n) invite[a] = pts;
          else delete invite[a];
        }
        const refDec = refRows[j];
        const ref = refDec ? refDec[0] : ethers.ZeroAddress;
        if (ref && ref !== ethers.ZeroAddress) refs.add(ethers.getAddress(ref));
      });
      const missing = [...refs].filter((a) => invite[a] == null);
      if (missing.length) {
        const extra = await multicallFn(p, c.interface, "invitePts", missing);
        missing.forEach((a, j) => {
          const pts = extra[j] ? extra[j][0] || 0n : 0n;
          if (pts > 0n) invite[a] = pts;
        });
      }
      return invite;
    }

    async function ptsFrom(fn, addrs, seed = {}) {
      const map = { ...seed };
      if (!addrs.length) return map;
      const rows = await multicallFn(p, c.interface, fn, addrs);
      addrs.forEach((a, j) => {
        if (!rows[j]) return;
        const v = rows[j][0] || 0n;
        if (v > 0n) map[a] = v;
        else delete map[a];
      });
      return map;
    }

    function pack(weekMap, inviteMap) {
      boardCache = { lastId: last, seen: [...seen], week: weekMap, invite: inviteMap };
      return {
        week: toRows(weekMap, account).filter((r) => r.pts > 0),
        invite: toRows(inviteMap, account).filter((r) => r.pts > 0),
      };
    }

    await playersFrom(fromId, last);
    const addrs = [...seen];
    const week = await ptsFrom("weekPts", addrs, opts.incremental ? boardCache.week : {});
    const invite = await inviteFrom(addrs, opts.incremental ? boardCache.invite : {});
    try {
      const [weekTotal, inviteTotal] = await Promise.all([c.weekPtsTotal(), c.invitePtsTotal()]);
      const weekGap = weekTotal > 0n && ptsSum(week) * 100n < weekTotal * 90n;
      const inviteGap = inviteTotal > 0n && ptsSum(invite) * 100n < inviteTotal * 90n;
      if ((weekGap || inviteGap) && opts.incremental) {
        return fetchLeaderboards({ incremental: false });
      }
    } catch (_) {}
    return pack(week, invite);
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

  let logsRpc = "";

  async function getLogsChunk(filter) {
    const urls = logsRpc ? [logsRpc, ...LOG_RPCS.filter((u) => u !== logsRpc)] : LOG_RPCS.slice();
    for (const url of urls) {
      try {
        const p = makePublic(url);
        const logs = await withTimeout(p.getLogs(filter), 8000);
        logsRpc = url;
        return logs || [];
      } catch (_) {}
    }
    return null;
  }

  async function fetchBurns(onPartial) {
    const byHash = new Map();
    function ingest(logs) {
      for (const log of logs) {
        if (log.name === "Burned") {
          const amt = asAmt(log.args.amount);
          if (amt <= 0n) continue;
          const player = log.args.player;
          if (!player || player === ethers.ZeroAddress) continue;
          const hash = log.transactionHash || "";
          const key = hash || `${log.blockNumber}-${player}-${amt.toString()}`;
          const prev = byHash.get(key) || {};
          byHash.set(key, {
            ...prev,
            player: ethers.getAddress(player),
            tag: short(player),
            amount: amt,
            hash,
            blockNumber: Number(log.blockNumber) || prev.blockNumber || 0,
          });
          continue;
        }
        if (log.name !== "RunSettled") continue;
        const row = burnRowFromSettled(
          Number(log.args.runId),
          log.args.player,
          log.args.burned,
          log.transactionHash,
        );
        if (!row) continue;
        const key = log.transactionHash || `run-${row.runId}`;
        const prev = byHash.get(key) || {};
        byHash.set(key, {
          ...prev,
          ...row,
          blockNumber: Number(log.blockNumber) || prev.blockNumber || 0,
        });
      }
    }
    function snapshot() {
      return [...byHash.values()].sort(
        (a, b) => (b.blockNumber || 0) - (a.blockNumber || 0) || (b.runId || 0) - (a.runId || 0),
      );
    }
    function ingestRaw(rawLogs, iface) {
      const parsed = [];
      for (const log of rawLogs || []) {
        try {
          const ev = iface.parseLog(log);
          parsed.push({
            name: ev.name,
            args: ev.args,
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
          });
        } catch (_) {}
      }
      ingest(parsed);
    }
    try {
      const p = await publicReadProvider();
      const iface = gameContract(p).interface;
      const topic = iface.getEvent("Burned").topicHash;
      const latest = await withTimeout(p.getBlockNumber(), 4000);
      const span = 1000;
      const ranges = [];
      for (let i = 0; i < 60; i++) {
        const toBlock = latest - i * span;
        if (toBlock < 0) break;
        ranges.push({ fromBlock: Math.max(0, toBlock - span + 1), toBlock });
      }
      let anyOk = false;
      const burnTargets = [freeAddr()];
      try {
        if (hasPaidLane() && (await isPaidDeployed()) && paidAddr().toLowerCase() !== freeAddr().toLowerCase()) {
          burnTargets.push(paidAddr());
        }
      } catch (_) {}
      for (let i = 0; i < ranges.length; i += 2) {
        const slice = ranges.slice(i, i + 2);
        const results = await Promise.all(
          slice.flatMap((r) =>
            burnTargets.map((address) =>
              getLogsChunk({
                address,
                topics: [topic],
                fromBlock: r.fromBlock,
                toBlock: r.toBlock,
              }),
            ),
          ),
        );
        for (const got of results) {
          if (!got) continue;
          anyOk = true;
          ingestRaw(got, iface);
        }
        if (byHash.size >= 1000) break;
      }
      if (!anyOk) throw new Error("NO_BURN_LOGS");
    } catch (e) {
      logsProvider = null;
      logsOkAt = 0;
      if (!byHash.size) throw e;
    }

    return snapshot().slice(0, 1000);
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

  function reviveRunFromSnap(r) {
    const lane = r.lane === "paid" ? "v6" : r.lane === "free" ? "v5" : r.lane || "v5";
    let player = r.player;
    try {
      player = ethers.getAddress(player);
    } catch (_) {
      return null;
    }
    let referrer = ethers.ZeroAddress;
    if (r.referrer && r.referrer !== ethers.ZeroAddress) {
      try {
        referrer = ethers.getAddress(r.referrer);
      } catch (_) {}
    }
    return {
      id: r.id,
      lane,
      key: `${lane}-${r.id}`,
      player,
      paid: reviveWei(r.paid) ?? 0n,
      ticketLim: r.ticketLim,
      tierId: r.tierId,
      tierName: r.tierName || TIER_NAMES[Number(r.tierId)] || null,
      startedAt: Number(r.startedAt || 0),
      settled: Boolean(r.settled),
      free: r.free == null ? null : Boolean(r.free),
      collected: reviveWei(r.collected),
      leftover: reviveWei(r.leftover),
      burned: reviveWei(r.burned),
      score: r.score == null ? null : Number(r.score),
      payout: reviveWei(r.payout),
      rewardBps: r.rewardBps ?? 10500,
      invites: r.invites ?? 0,
      plays: r.plays ?? 0,
      weekPts: reviveWei(r.weekPts) ?? 0n,
      invitePts: reviveWei(r.invitePts) ?? 0n,
      extraPaid: reviveWei(r.extraPaid) ?? 0n,
      extraTx: r.extraTx || null,
      xClaimed: Boolean(r.xClaimed),
      tgClaimed: Boolean(r.tgClaimed),
      referrer,
      tx: r.tx || null,
    };
  }

  function mergeRunRows(...lists) {
    const byKey = new Map();
    for (const list of lists) {
      for (const r of list) {
        if (!r) continue;
        const key = r.key || `${r.lane}-${r.id}`;
        const prev = byKey.get(key);
        if (!prev) {
          byKey.set(key, { ...r, key });
          continue;
        }
        const merged = { ...prev, ...r, key };
        if (prev.tx && !r.tx) merged.tx = prev.tx;
        if (prev.collected != null && r.collected == null) merged.collected = prev.collected;
        if (prev.leftover != null && r.leftover == null) merged.leftover = prev.leftover;
        if (prev.burned != null && r.burned == null) merged.burned = prev.burned;
        if (prev.score != null && r.score == null) merged.score = prev.score;
        if (prev.payout != null && r.payout == null) merged.payout = prev.payout;
        if (prev.extraPaid > 0n && r.extraPaid <= 0n) merged.extraPaid = prev.extraPaid;
        if (prev.extraTx && !r.extraTx) merged.extraTx = prev.extraTx;
        if (prev.xClaimed && !r.xClaimed) merged.xClaimed = prev.xClaimed;
        if (prev.tgClaimed && !r.tgClaimed) merged.tgClaimed = prev.tgClaimed;
        if (
          prev.referrer &&
          prev.referrer !== ethers.ZeroAddress &&
          (!r.referrer || r.referrer === ethers.ZeroAddress)
        ) {
          merged.referrer = prev.referrer;
        }
        byKey.set(key, merged);
      }
    }
    return [...byKey.values()];
  }

  let ownerHistoryCache = null;

  function reviveOwnerHistory(raw) {
    if (!raw) return null;
    const runs = (raw.runs || [])
      .map((r) => reviveRunFromSnap(r))
      .filter(Boolean);
    return {
      at: raw.at || null,
      block: raw.block || 0,
      v5NextRunId: Number(raw.v5NextRunId || 0),
      v5RunScanBefore: Number(raw.v5RunScanBefore || 0),
      v5Runs: Number(raw.v5Runs || 0),
      runs,
      social: raw.social || [],
      xClaimCount: Number(raw.xClaimCount || 0),
      tgClaimCount: Number(raw.tgClaimCount || 0),
      burnCount: Number(raw.burnCount || 0),
      v5BurnCount: Number(raw.v5BurnCount || 0),
      v6BurnCount: Number(raw.v6BurnCount || 0),
    };
  }

  async function loadOwnerHistory(force) {
    if (!force && ownerHistoryCache) return ownerHistoryCache;
    const paths = ["./data/v5-history.json", "./data/admin-snapshot.json"];
    for (const path of paths) {
      try {
        const res = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) continue;
        ownerHistoryCache = reviveOwnerHistory(await res.json());
        return ownerHistoryCache;
      } catch (_) {}
    }
    ownerHistoryCache = null;
    return null;
  }

  function effectiveBurnAmt(row) {
    const burned = asAmt(row.burned);
    if (burned > 0n) return burned;
    let leftover = asAmt(row.leftover);
    if (leftover <= 0n && row.settled && row.collected != null && row.paid != null) {
      const ticket = asAmt(row.paid);
      const got = asAmt(row.collected);
      if (got < ticket) leftover = ticket - got;
    }
    if (leftover > 0n) return (leftover * 30n) / 100n;
    return 0n;
  }

  function isExtraRun(row) {
    const paid = asAmt(row.extraPaid);
    return paid > 0n || Boolean(row.extraTx);
  }

  function tallyBurnStatsFromRows(rows) {
    let v5BurnCount = 0;
    let v6BurnCount = 0;
    for (const row of rows || []) {
      if (isExtraRun(row)) continue;
      if (row.lane === "v6") v6BurnCount += 1;
      else v5BurnCount += 1;
    }
    return { burnCount: v5BurnCount + v6BurnCount, v5BurnCount, v6BurnCount };
  }

  function burnStatsFromList(burns) {
    const list = burns || [];
    const v5BurnCount = list.filter((b) => (b.lane || "v5") === "v5").length;
    const v6BurnCount = list.filter((b) => b.lane === "v6").length;
    return { burnCount: list.length, v5BurnCount, v6BurnCount };
  }

  function mergeAdminBurns(rowList, snapBurns, snapCounts) {
    const byHash = new Map();
    for (const b of snapBurns || []) {
      const key = b.hash || `${b.blockNumber || 0}-${b.player || ""}-${b.amount || ""}`;
      if (!key) continue;
      byHash.set(key, {
        hash: b.hash || "",
        lane: b.lane || "v5",
        runId: b.runId ?? null,
        player: b.player || "",
        amount: reviveWei(b.amount) ?? 0n,
        blockNumber: Number(b.blockNumber || 0),
      });
    }
    for (const r of rowList || []) {
      if (isExtraRun(r)) continue;
      const amt = effectiveBurnAmt(r);
      if (amt <= 0n) continue;
      const lane = r.lane === "v6" ? "v6" : "v5";
      const key = r.tx || `run-${lane}-${r.id}`;
      if (byHash.has(key)) continue;
      byHash.set(key, {
        hash: r.tx || "",
        lane,
        runId: r.id,
        player: r.player,
        amount: amt,
        blockNumber: 0,
      });
    }
    const burns = [...byHash.values()];
    const runCounts = tallyBurnStatsFromRows(rowList);
    return {
      burns,
      burnCount: runCounts.burnCount,
      v5BurnCount: runCounts.v5BurnCount,
      v6BurnCount: runCounts.v6BurnCount,
    };
  }

  async function fetchOwnerRuns(onProgress) {
    await isPaidDeployed();
    const p = await publicReadProvider();
    const v6Live = hasPaidLane() && v6Cached === true;
    const freeC = freeGameContract(p);
    const paidC = v6Live ? paidGameContract(p) : freeC;

    let prices = [
      ethers.parseUnits("1", 18),
      ethers.parseUnits("3", 18),
      ethers.parseUnits("6", 18),
      ethers.parseUnits("10", 18),
    ];
    try {
      prices = await Promise.all([0, 1, 2, 3].map((i) => paidC.ticketPrice(i)));
    } catch (_) {}

    async function scanLaneMulticall(lane, contract, fromId, toExclusive) {
      if (fromId >= toExclusive) return [];
      const out = [];
      const ids = [];
      for (let i = fromId; i < toExclusive; i++) ids.push(i);
      const iface = contract.interface;
      const target = await contract.getAddress();
      const batch = 40;
      for (let i = 0; i < ids.length; i += batch) {
        const chunk = ids.slice(i, i + batch);
        const runRows = await multicallFn(p, iface, "runs", chunk, target);
        chunk.forEach((id, j) => {
          const decoded = runRows[j];
          if (!decoded) return;
          const parsed = parseStoredRun(id, decoded);
          if (!parsed.player || parsed.player === ethers.ZeroAddress) return;
          const player = ethers.getAddress(parsed.player);
          const tier = tierOfPaid(parsed.paid, prices);
          out.push({
            id,
            lane,
            key: `${lane}-${id}`,
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
            extraPaid: 0n,
            extraTx: null,
            xClaimed: false,
            tgClaimed: false,
            referrer: ethers.ZeroAddress,
            tx: null,
          });
        });
        if (onProgress) {
          onProgress({ phase: "runs", done: Math.min(i + batch, ids.length), total: ids.length, lane });
        }
      }
      return out;
    }

    const history = await loadOwnerHistory(true);
    const histV5 = (history?.runs || []).filter((r) => r.lane === "v5");
    if (onProgress) {
      onProgress({
        phase: "history",
        at: history?.at || null,
        runs: histV5.length,
        complete: Number(history?.v5RunScanBefore ?? 1) <= 1,
      });
    }
    await loadSnapshot(true);

    const liveFlat = [];
    let n5 = 0;
    let n6 = 0;

    if (v6Live) {
      n6 = Number(await withTimeout(paidC.nextRunId(), 8000));
      if (Number.isFinite(n6) && n6 > 1) {
        liveFlat.push(...(await scanLaneMulticall("v6", paidC, 1, n6)));
      }
      n5 = Number(await withTimeout(freeC.nextRunId(), 8000));
      if (Number.isFinite(n5) && n5 > 1) {
        const histNext = Math.max(1, Number(history?.v5NextRunId || snapshotCache?.v5NextRunId || 1));
        if (n5 > histNext) {
          liveFlat.push(...(await scanLaneMulticall("v5", freeC, histNext, n5)));
        }
        const scanBefore = Number(history?.v5RunScanBefore ?? snapshotCache?.v5RunScanBefore ?? 0);
        if (scanBefore > 1) {
          if (onProgress) onProgress({ phase: "v5gap", from: 1, to: scanBefore - 1 });
          liveFlat.push(...(await scanLaneMulticall("v5", freeC, 1, scanBefore)));
        } else if (!histV5.length) {
          if (onProgress) onProgress({ phase: "v5full", total: n5 - 1 });
          liveFlat.push(...(await scanLaneMulticall("v5", freeC, 1, n5)));
        }
      }
    } else {
      n5 = Number(await withTimeout(freeC.nextRunId(), 8000));
      if (Number.isFinite(n5) && n5 >= 2) {
        liveFlat.push(...(await scanLaneMulticall("v5", freeC, 1, n5)));
      }
    }

    let rows = mergeRunRows(history?.runs || [], liveFlat);
    const n = v6Live ? n6 : n5;

    if (!rows.length) {
      const empty = {
        nextRunId: n,
        runs: [],
        social: [],
        totalRuns: 0,
        uniqueWallets: 0,
        freeCount: 0,
        paidCount: 0,
        unknownPay: 0,
        burnedTotal: 0n,
        weekPool: 0n,
        invitePool: 0n,
        freePool: 0n,
        v5Runs: 0,
        v6Runs: 0,
        xClaimCount: 0,
        tgClaimCount: 0,
        historyAt: history?.at || null,
      };
      if (onProgress) onProgress({ phase: "partial", data: empty });
      return empty;
    }

    const players = [...new Set(rows.map((r) => r.player))];
    const week = {};
    const refs = {};
    const invPts = {};
    const boardC = v6Live ? paidC : freeC;
    const boardIface = boardC.interface;
    const boardTarget = await boardC.getAddress();
    const mcBatch = 40;
    for (let i = 0; i < players.length; i += mcBatch) {
      const chunk = players.slice(i, i + mcBatch);
      const [ptsRows, refRows, invRows] = await Promise.all([
        multicallFn(p, boardIface, "weekPts", chunk, boardTarget),
        multicallFn(p, boardIface, "refOf", chunk, boardTarget),
        multicallFn(p, boardIface, "invitePts", chunk, boardTarget),
      ]);
      chunk.forEach((a, j) => {
        week[a] = ptsRows[j] ? ptsRows[j][0] || 0n : 0n;
        invPts[a] = invRows[j] ? invRows[j][0] || 0n : 0n;
        const refRaw = refRows[j] ? refRows[j][0] : ethers.ZeroAddress;
        refs[a] =
          refRaw && refRaw !== ethers.ZeroAddress ? ethers.getAddress(refRaw) : ethers.ZeroAddress;
      });
      if (onProgress && players.length > mcBatch) {
        onProgress({
          phase: "players",
          done: Math.min(i + mcBatch, players.length),
          total: players.length,
        });
      }
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
      const v5Runs = rows.filter((r) => r.lane === "v5").length;
      const v6Runs = rows.filter((r) => r.lane === "v6").length;
      return {
        nextRunId: n,
        runs: rows,
        social: extra.social || [],
        burnedTotal: extra.burnedTotal ?? 0n,
        weekPool: extra.weekPool ?? 0n,
        invitePool: extra.invitePool ?? 0n,
        freePool: extra.freePool ?? 0n,
        extraPool: extra.extraPool ?? 0n,
        extraPaused: extra.extraPaused ?? false,
        extraSinceRunId: extra.extraSinceRunId ?? 0,
        extraPaidTotal: extra.extraPaidTotal ?? 0n,
        extraPaidCount: extra.extraPaidCount ?? 0,
        extraFundedTotal: extra.extraFundedTotal ?? 0n,
        extraWithdrawnTotal: extra.extraWithdrawnTotal ?? 0n,
        totalRuns: rows.length,
        uniqueWallets: unique.size,
        freeCount: rows.filter((r) => r.free === true).length,
        paidCount: rows.filter((r) => r.free === false).length,
        unknownPay: rows.filter((r) => r.free == null).length,
        v5Runs,
        v6Runs,
        xClaimCount: extra.xClaimCount ?? 0,
        tgClaimCount: extra.tgClaimCount ?? 0,
        burnCount: extra.burnCount ?? 0,
        v5BurnCount: extra.v5BurnCount ?? 0,
        v6BurnCount: extra.v6BurnCount ?? 0,
        historyAt: history?.at || null,
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
        burnedTotal = await paidC.burnedTotal();
      } catch (_) {}
    }

    if (onProgress) {
      onProgress({
        phase: "partial",
        data: pack({ burnedTotal, weekPool, invitePool, freePool }),
      });
    }

    const byKey = new Map(rows.map((r) => [r.key || `${r.lane || "v5"}-${r.id}`, r]));
    if (onProgress) onProgress({ phase: "logs", done: 0, total: rows.length });
    try {
      await Promise.race([
        (async () => {
          const logChunks = v6Live ? 28 : 40;
          const ev = await fetchEventLogs(["RunStarted", "RunSettled", "FreeEnter"], logChunks);
          for (const log of ev) {
            const lane =
              log.address && paidAddr() && String(log.address).toLowerCase() === paidAddr().toLowerCase()
                ? "v6"
                : "v5";
            const key = `${lane}-${Number(log.args.runId)}`;
            if (log.name === "RunStarted") {
              const row = byKey.get(key);
              if (!row) continue;
              const ref = log.args.referrer;
              if (ref && ref !== ethers.ZeroAddress) row.referrer = ethers.getAddress(ref);
              if (log.args.paid != null) row.paid = log.args.paid;
            } else if (log.name === "RunSettled") {
              const row = byKey.get(key);
              if (!row) continue;
              row.collected = asAmt(log.args.collected);
              row.leftover = asAmt(log.args.leftover);
              row.score = log.args.score;
              row.burned = asAmt(log.args.burned);
              row.tx = log.transactionHash;
              row.settled = true;
            } else if (log.name === "FreeEnter") {
              const row = byKey.get(key);
              if (row) row.free = true;
            }
          }
        })(),
        sleep(30000),
      ]);
    } catch (_) {
      logsProvider = null;
      logsOkAt = 0;
    }

    let extraPool = reviveWei(snapshotCache?.extraPool) ?? 0n;
    let extraPaused = Boolean(snapshotCache?.extraPaused);
    let extraSinceRunId = Number(snapshotCache?.extraSinceRunId || 0);
    let extraFundedTotal = reviveWei(snapshotCache?.extraFundedTotal) ?? 0n;
    let extraWithdrawnTotal = reviveWei(snapshotCache?.extraWithdrawnTotal) ?? 0n;
    let extraPaidTotal = reviveWei(snapshotCache?.extraPaidTotal) ?? 0n;
    let extraPaidCount = Number(snapshotCache?.extraPaidCount || 0);

    const ex = cfg.extra;
    if (ex?.address && ex?.abi) {
      try {
        const extraC = new ethers.Contract(ex.address, ex.abi, p);
        const extraIface = extraC.interface;
        try {
          extraPool = await extraC.pool();
          extraPaused = Boolean(await extraC.paused());
          extraSinceRunId = Number(await extraC.sinceRunId());
        } catch (_) {}
        if (onProgress) onProgress({ phase: "extra" });
        const extraLogs = await fetchContractLogs(
          ex.address,
          ex.abi,
          ["ExtraPaid", "Funded", "Withdrawn"],
          v6Live ? 80 : 120,
        );
        let fundedFromLogs = 0n;
        let withdrawnFromLogs = 0n;
        let paidFromLogs = 0n;
        let paidCountFromLogs = 0;
        for (const log of extraLogs) {
          if (log.name === "ExtraPaid") {
            const id = Number(log.args.runId);
            const amt = asAmt(log.args.amount);
            const row = byKey.get(`v5-${id}`);
            if (row) {
              row.extraPaid = amt;
              row.extraTx = log.transactionHash;
            }
            paidFromLogs += amt;
            paidCountFromLogs += 1;
          } else if (log.name === "Funded") {
            fundedFromLogs += asAmt(log.args.amount);
          } else if (log.name === "Withdrawn") {
            withdrawnFromLogs += asAmt(log.args.amount);
          }
        }
        if (fundedFromLogs > extraFundedTotal) extraFundedTotal = fundedFromLogs;
        if (withdrawnFromLogs > extraWithdrawnTotal) extraWithdrawnTotal = withdrawnFromLogs;
        const freeIds = [];
        const freeNext = Number(
          snapshotCache?.v5NextRunId || history?.v5NextRunId || rows.reduce((m, r) => (r.lane === "v5" && r.id > m ? r.id : m), 0) + 1,
        );
        for (let id = Math.max(1, extraSinceRunId); id < freeNext; id++) freeIds.push(id);
        if (freeIds.length) {
          const paidRows = await multicallFn(p, extraIface, "paidExtra", freeIds, ex.address);
          let paidFromStorage = 0n;
          let paidCountFromStorage = 0;
          freeIds.forEach((id, j) => {
            const v = paidRows[j] ? paidRows[j][0] || 0n : 0n;
            if (v <= 0n) return;
            const row = byKey.get(`v5-${id}`);
            if (row) row.extraPaid = v;
            paidFromStorage += v;
            paidCountFromStorage += 1;
          });
          if (paidFromStorage > 0n) {
            extraPaidTotal = paidFromStorage;
            extraPaidCount = paidCountFromStorage;
          } else if (paidFromLogs > extraPaidTotal) {
            extraPaidTotal = paidFromLogs;
            extraPaidCount = paidCountFromLogs;
          }
        } else if (paidFromLogs > extraPaidTotal) {
          extraPaidTotal = paidFromLogs;
          extraPaidCount = paidCountFromLogs;
        }
        const extraIn = extraPool + extraPaidTotal + extraWithdrawnTotal;
        if (extraFundedTotal < extraIn) extraFundedTotal = extraIn;
      } catch (_) {}
    }

    const socialByAddr = {};
    for (const row of history?.social || []) {
      if (!row?.addr) continue;
      try {
        const addr = ethers.getAddress(row.addr);
        socialByAddr[addr] = {
          addr,
          x: Boolean(row.x),
          tg: Boolean(row.tg),
          xTx: row.xTx || "",
          tgTx: row.tgTx || "",
        };
      } catch (_) {}
    }
    let xClaimCount = 0;
    let tgClaimCount = 0;
    const sc = cfg.social;
    if (sc?.address && sc?.abi) {
      try {
        const code = await withTimeout(p.getCode(sc.address), 4000);
        if (code && code !== "0x") {
          if (onProgress) onProgress({ phase: "social" });
          const socialLogs = await fetchContractLogs(sc.address, sc.abi, ["XBonus", "TgBonus"], v6Live ? 16 : 24);
          for (const log of socialLogs) {
            const addr = ethers.getAddress(log.args.player);
            if (!socialByAddr[addr]) {
              socialByAddr[addr] = { addr, x: false, tg: false, xTx: "", tgTx: "" };
            }
            if (log.name === "XBonus") {
              socialByAddr[addr].x = true;
              socialByAddr[addr].xTx = log.transactionHash;
            } else if (log.name === "TgBonus") {
              socialByAddr[addr].tg = true;
              socialByAddr[addr].tgTx = log.transactionHash;
            }
          }
        }
      } catch (_) {}
    }
    for (const row of rows) {
      const s = socialByAddr[row.player];
      if (s) {
        row.xClaimed = Boolean(s.x);
        row.tgClaimed = Boolean(s.tg);
      }
    }
    for (const s of Object.values(socialByAddr)) {
      if (s.x) xClaimCount += 1;
      if (s.tg) tgClaimCount += 1;
    }
    const social = Object.values(socialByAddr).sort(
      (a, b) => Number(b.x) + Number(b.tg) - (Number(a.x) + Number(a.tg)) || a.addr.localeCompare(b.addr),
    );

    decorate();
    const burnStats = mergeAdminBurns(rows, snapshotCache?.burns || [], {
      burnCount: snapshotCache?.burnCount,
      v5BurnCount: snapshotCache?.v5BurnCount,
      v6BurnCount: snapshotCache?.v6BurnCount,
    });
    return pack({
      burnedTotal,
      weekPool,
      invitePool,
      freePool,
      social,
      xClaimCount,
      tgClaimCount,
      burnCount: burnStats.burnCount,
      v5BurnCount: burnStats.v5BurnCount,
      v6BurnCount: burnStats.v6BurnCount,
      extraPool,
      extraPaused,
      extraSinceRunId,
      extraPaidTotal,
      extraPaidCount,
      extraFundedTotal,
      extraWithdrawnTotal,
    });
  }

  let snapshotCache = null;
  let snapshotTried = false;

  function reviveWei(v) {
    if (v == null || v === "") return null;
    try {
      return typeof v === "bigint" ? v : BigInt(v);
    } catch (_) {
      return null;
    }
  }

  function reviveSnapshot(raw) {
    if (!raw) return null;
    return {
      ...raw,
      weekPool: reviveWei(raw.weekPool) ?? 0n,
      invitePool: reviveWei(raw.invitePool) ?? 0n,
      freePool: reviveWei(raw.freePool) ?? 0n,
      burnedTotal: reviveWei(raw.burnedTotal) ?? 0n,
      extraPool: reviveWei(raw.extraPool) ?? 0n,
      extraPaidTotal: reviveWei(raw.extraPaidTotal) ?? 0n,
      extraFundedTotal: reviveWei(raw.extraFundedTotal) ?? 0n,
      extraWithdrawnTotal: reviveWei(raw.extraWithdrawnTotal) ?? 0n,
      week: raw.week || [],
      invite: raw.invite || [],
      burns: (raw.burns || []).map((b) => ({
        ...b,
        amount: reviveWei(b.amount) ?? 0n,
        lane: b.lane || "v5",
      })),
      social: raw.social || [],
      xClaimCount: Number(raw.xClaimCount || 0),
      tgClaimCount: Number(raw.tgClaimCount || 0),
      burnCount:
        Number(raw.burnCount ?? 0) ||
        Math.max(0, Number(raw.totalRuns || 0) - Number(raw.extraPaidCount || 0)),
      v5BurnCount:
        Number(raw.v5BurnCount ?? 0) ||
        Math.max(0, Number(raw.v5Runs || 0) - Number(raw.extraPaidCount || 0)),
      v6BurnCount: Number(raw.v6BurnCount ?? raw.v6Runs ?? 0),
      runs: (raw.runs || []).map((r) => ({
        ...r,
        paid: reviveWei(r.paid) ?? 0n,
        collected: reviveWei(r.collected),
        leftover: reviveWei(r.leftover),
        burned: reviveWei(r.burned),
        payout: reviveWei(r.payout),
        weekPts: reviveWei(r.weekPts) ?? 0n,
        invitePts: reviveWei(r.invitePts) ?? 0n,
        extraPaid: reviveWei(r.extraPaid) ?? 0n,
        xClaimed: Boolean(r.xClaimed),
        tgClaimed: Boolean(r.tgClaimed),
      })),
    };
  }

  async function loadSnapshot(force) {
    if (force) snapshotCache = null;
    else if (snapshotCache) return snapshotCache;
    snapshotTried = true;
    try {
      const res = await fetch(`./data/snapshot.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return snapshotCache;
      snapshotCache = reviveSnapshot(await res.json());
      return snapshotCache;
    } catch (_) {
      return snapshotCache;
    }
  }

  let adminBoardCache = null;

  function reviveAdminBoard(raw) {
    if (!raw) return null;
    const runs = (raw.runs || []).map((r) => reviveRunFromSnap(r)).filter(Boolean);
    const totalRuns = Number(raw.totalRuns || runs.length);
    const v5Runs = Number(raw.v5Runs || runs.filter((r) => r.lane === "v5").length);
    const v6Runs = Number(raw.v6Runs || runs.filter((r) => r.lane === "v6").length);
    const burnStats = tallyBurnStatsFromRows(runs);
    return {
      ...raw,
      at: raw.at || null,
      weekPool: reviveWei(raw.weekPool) ?? 0n,
      invitePool: reviveWei(raw.invitePool) ?? 0n,
      freePool: reviveWei(raw.freePool) ?? 0n,
      burnedTotal: reviveWei(raw.burnedTotal) ?? 0n,
      extraPool: reviveWei(raw.extraPool) ?? 0n,
      extraPaidTotal: reviveWei(raw.extraPaidTotal) ?? 0n,
      extraFundedTotal: reviveWei(raw.extraFundedTotal) ?? 0n,
      extraWithdrawnTotal: reviveWei(raw.extraWithdrawnTotal) ?? 0n,
      settleOverTotal: reviveWei(raw.settleOverTotal) ?? 0n,
      settleOverCount: Number(raw.settleOverCount || 0),
      settleOverV6: reviveWei(raw.settleOverV6) ?? 0n,
      settleOverV6Count: Number(raw.settleOverV6Count || 0),
      runs,
      social: raw.social || [],
      xClaimCount: Number(raw.xClaimCount || 0),
      tgClaimCount: Number(raw.tgClaimCount || 0),
      burnCount: runs.length ? burnStats.burnCount : Number(raw.burnCount || 0),
      v5BurnCount: runs.length ? burnStats.v5BurnCount : Number(raw.v5BurnCount || 0),
      v6BurnCount: runs.length ? burnStats.v6BurnCount : Number(raw.v6BurnCount || 0),
      totalRuns,
      v5Runs,
      v6Runs,
      uniqueWallets: Number(raw.uniqueWallets || 0),
      freeCount: Number(raw.freeCount || 0),
      paidCount: Number(raw.paidCount || 0),
      unknownPay: Number(raw.unknownPay || 0),
    };
  }

  async function fetchAdminJson(path) {
    const res = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function boardFromHead(head, revivedRuns, totalHint) {
    const board = reviveAdminBoard({ ...head, runs: [] });
    board.runs = revivedRuns;
    const total = Number(totalHint || revivedRuns.length);
    board.totalRuns = total;
    board.v5Runs = revivedRuns.filter((r) => r.lane === "v5" || r.lane === "free").length;
    board.v6Runs = revivedRuns.filter((r) => r.lane === "v6" || r.lane === "paid").length;
    return board;
  }

  async function loadAdminBoard(force, onProgress) {
    if (force) adminBoardCache = null;
    else if (adminBoardCache) return adminBoardCache;

    const emit = (board, total) => {
      if (onProgress) {
        onProgress({
          done: board.runs.length,
          total: Number(total || board.runs.length),
          snap: board,
        });
      }
      return board;
    };

    try {
      const index = await fetchAdminJson("./data/admin-index.json");
      const headName = index.head || "admin-head.json";
      if (!/^admin[-a-z0-9.]+$/i.test(headName)) throw new Error("BAD_HEAD");
      const head = await fetchAdminJson(`./data/${headName}`);
      let revived = (head.runs || []).map((r) => reviveRunFromSnap(r)).filter(Boolean);
      const total = Number(index.totalRuns || revived.length);
      let board = emit(boardFromHead(head, revived, total), total);
      for (const name of index.parts || []) {
        if (!/^admin-part-\d+\.json$/.test(name)) continue;
        const part = await fetchAdminJson(`./data/${name}`);
        revived = mergeRunRows(
          revived,
          (part.runs || []).map((r) => reviveRunFromSnap(r)).filter(Boolean),
        );
        board = emit(boardFromHead(head, revived, total), total);
      }
      adminBoardCache = board;
      return adminBoardCache;
    } catch (_) {}

    const fallbacks = ["./data/admin-head.json", "./data/admin-board.json"];
    for (const path of fallbacks) {
      try {
        const raw = await fetchAdminJson(path);
        adminBoardCache = reviveAdminBoard(raw);
        if (adminBoardCache?.runs?.length) return adminBoardCache;
      } catch (_) {}
    }
    adminBoardCache = null;
    return null;
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
    isPaidDeployed,
    deployPaid,
    fundBoards,
    fundBoardsFromReserve,
    v6ReserveLim,
    freeAddr,
    paidAddr,
    activeLane,
    invitePoints,
    weekPoints,
    boardPointsOf,
    inviteCountOf,
    uniqueInviteesOf,
    countPlaysOf,
    notePlay,
    rewardBpsFromParts,
    rewardBpsOf,
    nextClaimAt,
    claimWindow: sgtClaimWindow,
    claim,
    capBoardScore,
    referrer,
    limBalance,
    bnbBalance,
    activeRun,
    isBanned,
    approveAndEnter,
    freeStatus,
    hasTgBonus,
    hasXBonus,
    claimTgBonus,
    claimXBonus,
    isSocialDeployed,
    deploySocial,
    fundFreePool,
    bonusPoolAmt,
    settleRun,
    clearActiveRun,
    noteRunPlaying,
    noteRunProgress,
    noteRunFinished,
    isExtraDeployed,
    deployExtra,
    extraPoolAmt,
    fundExtra,
    withdrawExtra,
    airdropFromExtra,
    isFloorDeployed,
    floorPendingOf,
    recordFloor,
    fundFloor,
    hasFloorOverage,
    clearFloorOverage,
    claimFloor,
    floorPoolBalance,
    withdrawWeekly,
    setTicketPrice,
    txUrl,
    addrUrl,
    quoteLim,
    quoteSwap,
    swapToLim,
    swapExact,
    permit2SellReady,
    tokenBalance,
    fetchLeaderboards,
    fetchBurns,
    fetchOwnerRuns,
    loadSnapshot,
    loadAdminBoard,
    loadOwnerHistory,
    mergeRunRows,
    formatLim(v) {
      return Number(ethers.formatUnits(v, 18)).toFixed(4);
    },
  };
})();

window.CatboxChain = CatboxChain;
