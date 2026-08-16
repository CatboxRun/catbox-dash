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

  let deployedCached = null;

  async function isDeployed() {
    if (deployedCached === true) return true;
    const p = await publicReadProvider();
    const code = await p.getCode(cfg.address);
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

  async function payRunExtra(runId, extraWei) {
    if (!runId || extraWei <= 0n) return null;
    if (!(await isExtraDeployed())) return null;
    const extra = extraContract(await signer());
    const [pool, already] = await Promise.all([extra.pool(), extra.paidExtra(runId)]);
    if (already > 0n || pool < extraWei) return null;
    const tx = await extra.pay(runId, extraWei);
    return (await tx.wait()).hash;
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

  async function readProvider() {
    return publicReadProvider();
  }

  async function ticketPrice(tierId = 0) {
    const c = gameContract(await readProvider());
    return c.ticketPrice(tierId);
  }

  async function poolBalance() {
    const c = gameContract(await readProvider());
    const v6 = await isV6();
    if (!v6) {
      const [week, invite, burned, free] = await Promise.all([
        c.weekPool(),
        c.invitePool(),
        c.burnedTotal(),
        c.freePool(),
      ]);
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
        free,
        total: week + invite,
      };
    }
    const [d, eq, i, burned, free, players, topN] = await Promise.all([
      c.dayPool(),
      c.dayEqPool(),
      c.invitePool(),
      c.burnedTotal(),
      c.freePool(),
      c.dayPlayerCount().catch(() => 0n),
      c.topLen().catch(() => 0n),
    ]);
    const daily = d + (eq || 0n);
    return {
      week: daily,
      day: daily,
      dayScore: d,
      dayEq: eq,
      dayPlayers: players,
      topLen: topN,
      v6: true,
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
    const game = gameContract(s);
    const pending = await game.activeRun(account);
    if (pending === 0n) return null;
    const runId = pending;
    const capAtTicket = !(await isV6());
    const extraAmt = capAtTicket ? extraWeiFromGot(got, ticket) : 0n;
    const tx = await game.settle(collectedWei(got, ticket, capAtTicket), BigInt(score || 0));
    const rec = await tx.wait();
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
    if (extraAmt > 0n) {
      try {
        if (typeof onExtra === "function") onExtra();
        extraHash = (await payRunExtra(runId, extraAmt)) || "";
        if (extraHash) extraPaid = extraAmt;
      } catch (_) {}
    }
    return { hash: rec.hash, burned, payout: payout + extraPaid, extraHash, extraPaid };
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
    const out = [];
    const PARALLEL = 2;
    let fails = 0;
    let quiet = 0;
    for (let i = 0; i < ranges.length; i += PARALLEL) {
      const slice = ranges.slice(i, i + PARALLEL);
      const results = await Promise.all(
        slice.map(async (r) => {
          try {
            return await withTimeout(
              p.getLogs({
                address: cfg.address,
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
              blockNumber: log.blockNumber,
              transactionHash: log.transactionHash,
            });
            parsed += 1;
          } catch (_) {}
        }
      }
      if (failed === slice.length) {
        fails += 1;
        if (fails >= 2) {
          logsProvider = null;
          logsOkAt = 0;
          break;
        }
      } else {
        fails = 0;
      }
      if (parsed === 0 && emptyOk === slice.length && out.length) {
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
    const raw = await withTimeout(p.call({ to: MULTICALL3, data }), 10000);
    return multiIface.decodeFunctionResult("aggregate3", raw)[0];
  }

  async function multicallFn(p, iface, fn, items) {
    const out = [];
    const batch = 40;
    for (let i = 0; i < items.length; i += batch) {
      const chunk = items.slice(i, i + batch);
      const calls = chunk.map((item) => ({
        target: cfg.address,
        allowFailure: true,
        callData: iface.encodeFunctionData(fn, [item]),
      }));
      let rows = null;
      try {
        rows = await aggregate3(p, calls);
      } catch (_) {
        await sleep(180);
        try {
          rows = await aggregate3(p, calls);
        } catch (_) {}
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
    return out;
  }

  async function fetchLeaderboards(onPartial) {
    const p = await publicReadProvider();
    const c = gameContract(p);
    const n = Number(await withTimeout(c.nextRunId(), 5000));
    if (!Number.isFinite(n) || n < 2) {
      return { week: [], invite: [] };
    }
    const last = n - 1;
    const recentFrom = Math.max(1, n - 500);

    async function playersFrom(fromId, toId) {
      const ids = [];
      for (let i = toId; i >= fromId; i--) ids.push(i);
      const decodedRuns = await multicallFn(p, c.interface, "runs", ids);
      const set = new Set();
      for (const decoded of decodedRuns) {
        if (!decoded) continue;
        const player = decoded.player || decoded[0];
        if (player && player !== ethers.ZeroAddress) set.add(ethers.getAddress(player));
      }
      return [...set];
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
        const pts = ptsRows[j] ? ptsRows[j][0] || 0n : 0n;
        if (pts > 0n) invite[a] = pts;
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
        const v = rows[j] ? rows[j][0] || 0n : 0n;
        if (v > 0n) map[a] = v;
      });
      return map;
    }

    function pack(weekMap, inviteMap) {
      return {
        week: toRows(weekMap, account).filter((r) => r.pts > 0),
        invite: toRows(inviteMap, account).filter((r) => r.pts > 0),
      };
    }

    const recentAddrs = await playersFrom(recentFrom, last);
    let week = await ptsFrom("weekPts", recentAddrs);
    let invite = await inviteFrom(recentAddrs);
    const first = pack(week, invite);
    if (typeof onPartial === "function") {
      try {
        onPartial(first);
      } catch (_) {}
    }

    if (recentFrom > 1) {
      const olderAddrs = await playersFrom(1, recentFrom - 1);
      const seen = new Set(recentAddrs);
      const extra = olderAddrs.filter((a) => !seen.has(a));
      if (extra.length) {
        week = await ptsFrom("weekPts", extra, week);
        invite = await inviteFrom(extra, invite);
      }
    }
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
      for (let i = 0; i < ranges.length; i += 2) {
        const slice = ranges.slice(i, i + 2);
        const results = await Promise.all(
          slice.map((r) =>
            getLogsChunk({
              address: cfg.address,
              topics: [topic],
              fromBlock: r.fromBlock,
              toBlock: r.toBlock,
            }),
          ),
        );
        for (const got of results) {
          if (!got) continue;
          anyOk = true;
          ingestRaw(got, iface);
        }
        if (typeof onPartial === "function" && byHash.size) {
          try {
            onPartial(snapshot());
          } catch (_) {}
        }
      }
      if (!anyOk) throw new Error("NO_BURN_LOGS");
    } catch (e) {
      logsProvider = null;
      logsOkAt = 0;
      if (!byHash.size) throw e;
    }

    return snapshot();
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
    isExtraDeployed,
    deployExtra,
    extraPoolAmt,
    fundExtra,
    withdrawExtra,
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
