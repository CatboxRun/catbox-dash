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
    "function tgClaimed(address) view returns (bool)",
    "function claimTgBonus()",
    "function xClaimed(address) view returns (bool)",
    "function claimXBonus()",
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
    const p = new ethers.JsonRpcProvider(cfg.rpc, cfg.chainId);
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

  async function readProvider() {
    if (window.ethereum) {
      try {
        await ensureBsc();
        return browserProvider();
      } catch (_) {}
    }
    return new ethers.JsonRpcProvider(cfg.rpc, cfg.chainId);
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

  async function inviteCountOf(addr = account) {
    if (!addr) return 0n;
    try {
      const c = gameContract(await readProvider());
      return await c.inviteCount(addr);
    } catch (_) {
      return 0n;
    }
  }

  async function rewardBpsOf(addr = account) {
    if (!addr) return 10000n;
    try {
      const c = gameContract(await readProvider());
      return await c.rewardBps(addr);
    } catch (_) {
      return 10000n;
    }
  }

  async function nextClaimAt() {
    try {
      const c = gameContract(await readProvider());
      return await c.nextClaimAt();
    } catch (_) {
      return 0n;
    }
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
    return { used: 0, left: 2, pool: 0n, eligible: true };
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
      return { used, left, pool, eligible };
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
    if (Number(tierId) === 0) {
      try {
        const st = await freeStatus(account);
        useFree = Boolean(st.eligible) || Number(st.left) > 0;
      } catch (_) {
        useFree = true;
      }
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

  function toRows(map, youAddr) {
    return Object.entries(map)
      .map(([addr, pts]) => ({
        tag: short(addr),
        addr,
        pts: Math.floor(Number(pts)),
        you: youAddr && addr.toLowerCase() === youAddr.toLowerCase(),
      }))
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 8);
  }

  async function queryLogs(c, filter, latest) {
    const spans = [50000, 8000, 2000];
    for (const span of spans) {
      try {
        return await c.queryFilter(filter, Math.max(0, latest - span));
      } catch (_) {}
    }
    return [];
  }

  async function fetchLeaderboards() {
    const p = await readProvider();
    const c = gameContract(p);
    const latest = await p.getBlockNumber();
    const dayBlocks = 30000;
    const [started, settled] = await Promise.all([
      queryLogs(c, c.filters.RunStarted(), latest),
      queryLogs(c, c.filters.RunSettled(), latest),
    ]);
    const week = {};
    const invite = {};
    const dayFrom = Math.max(0, latest - dayBlocks);
    for (const e of settled) {
      if (e.blockNumber < dayFrom) continue;
      const player = e.args.player;
      week[player] = (week[player] || 0n) + BigInt(e.args.score);
    }
    for (const e of started) {
      const ref = e.args.referrer;
      if (ref && ref !== ethers.ZeroAddress) invite[ref] = (invite[ref] || 0n) + 10n;
    }
    return {
      week: toRows(week, account),
      invite: toRows(invite, account),
    };
  }

  async function fetchBurns() {
    const p = await readProvider();
    const c = gameContract(p);
    const latest = await p.getBlockNumber();
    const logs = await queryLogs(c, c.filters.Burned(), latest);
    return logs
      .slice()
      .reverse()
      .slice(0, 8)
      .map((e) => ({
        player: e.args.player,
        tag: short(e.args.player),
        amount: e.args.amount,
        hash: e.transactionHash,
      }));
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
    invitePoints,
    inviteCountOf,
    rewardBpsOf,
    nextClaimAt,
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
    formatLim(v) {
      return Number(ethers.formatUnits(v, 18)).toFixed(4);
    },
  };
})();

window.CatboxChain = CatboxChain;
