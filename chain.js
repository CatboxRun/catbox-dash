/* global ethers, CATBOX_CHAIN */

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
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

  function gameContract(s) {
    return new ethers.Contract(cfg.address, cfg.abi, s);
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

  async function ticketPrice() {
    const c = gameContract(await readProvider());
    return c.ticketPrice();
  }

  async function poolBalance() {
    const c = gameContract(await readProvider());
    const [w, i, burned] = await Promise.all([c.weekPool(), c.invitePool(), c.burnedTotal()]);
    return { week: w, invite: i, burned, total: w + i };
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

  async function approveAndEnter() {
    await connect();
    const s = await signer();
    const game = gameContract(s);
    const lim = limContract(s);
    const price = await game.ticketPrice();
    const bal = await lim.balanceOf(account);
    if (bal < price) throw new Error("NO_LIM");
    const allow = await lim.allowance(account, cfg.address);
    if (allow < price) {
      const txA = await lim.approve(cfg.address, ethers.MaxUint256);
      await txA.wait();
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
    const tx = await game.enter(ref);
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
    for (const log of rec.logs || []) {
      try {
        const parsed = game.interface.parseLog(log);
        if (parsed?.name === "Burned") burned = parsed.args.amount;
      } catch (_) {}
    }
    return { hash: rec.hash, burned };
  }

  async function withdrawWeekly(amountWei) {
    await connect();
    if (!isOwner()) throw new Error("NOT_OWNER");
    const s = await signer();
    const tx = await gameContract(s).withdrawWeekly(amountWei);
    return (await tx.wait()).hash;
  }

  async function setTicketPrice(limAmount) {
    await connect();
    if (!isOwner()) throw new Error("NOT_OWNER");
    const s = await signer();
    const tx = await gameContract(s).setTicketPrice(ethers.parseUnits(String(limAmount), 18));
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
  const BIN_PM = "0xC697d2898e0D09264376196696c51D7aBbbAA4a9";
  const CL_QUOTER = "0xd0737C9762912dD34c3271197E362Aa736Df0926";
  const BIN_QUOTER = "0xC631f4B0Fc2Dd68AD45f74B2942628db117dD359";
  const PERMIT2 = "0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615C768";
  const CMD = { PERMIT2_TRANSFER_FROM: 0x02, WRAP_ETH: 0x0b, INFI_SWAP: 0x10 };
  const ACT = { CL_SWAP_EXACT_IN_SINGLE: 0x06, SETTLE_ALL: 0x0c, TAKE_ALL: 0x0f, BIN_SWAP_EXACT_IN_SINGLE: 0x1c };
  const POOL_TUPLE =
    "tuple(address currency0,address currency1,address hooks,address poolManager,uint24 fee,bytes32 parameters)";
  const QUOTE_ABI = [
    `function quoteExactInputSingle(tuple(${POOL_TUPLE} poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)`,
  ];
  const UR_ABI = ["function execute(bytes commands,bytes[] inputs,uint256 deadline) payable"];
  const PERMIT2_ABI = [
    "function approve(address token,address spender,uint160 amount,uint48 expiration)",
    "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
  ];
  const CL_SLOT = ["function getSlot0(bytes32) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)"];
  const BIN_SLOT = ["function getSlot0(bytes32) view returns (uint24 activeId,uint24 protocolFee,uint24 lpFee)"];
  const U128 = (1n << 128n) - 1n;
  let infiPoolCache = { BNB: null, USDT: null };

  function sortPair(a, b) {
    return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
  }

  function sameAddr(a, b) {
    return String(a).toLowerCase() === String(b).toLowerCase();
  }

  function tickParams(tickSpacing) {
    return ethers.zeroPadValue(ethers.toBeHex(BigInt(tickSpacing) << 16n), 32);
  }

  function binParams(binStep) {
    return ethers.zeroPadValue(ethers.toBeHex(BigInt(binStep) << 16n), 32);
  }

  function cmds(...xs) {
    return "0x" + xs.map((c) => c.toString(16).padStart(2, "0")).join("");
  }

  function payToken(fromSym) {
    return fromSym === "BNB" ? NATIVE : USDT;
  }

  function poolIdOf(key) {
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        [POOL_TUPLE],
        [[key.currency0, key.currency1, key.hooks, key.poolManager, key.fee, key.parameters]],
      ),
    );
  }

  function encodePlan(steps) {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const actions = "0x" + steps.map((s) => s.act.toString(16).padStart(2, "0")).join("");
    return coder.encode(["bytes", "bytes[]"], [actions, steps.map((s) => s.data)]);
  }

  function encodeInfiSwap(kind, poolKey, amountIn, minOut, zeroForOne) {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const key = [poolKey.currency0, poolKey.currency1, poolKey.hooks, poolKey.poolManager, poolKey.fee, poolKey.parameters];
    const swapData =
      kind === "CL"
        ? coder.encode(
            [`tuple(${POOL_TUPLE} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`],
            [[key, zeroForOne, amountIn, minOut, "0x"]],
          )
        : coder.encode(
            [`tuple(${POOL_TUPLE} poolKey,bool swapForY,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`],
            [[key, zeroForOne, amountIn, minOut, "0x"]],
          );
    const inputCur = zeroForOne ? poolKey.currency0 : poolKey.currency1;
    const outputCur = zeroForOne ? poolKey.currency1 : poolKey.currency0;
    return encodePlan([
      { act: kind === "CL" ? ACT.CL_SWAP_EXACT_IN_SINGLE : ACT.BIN_SWAP_EXACT_IN_SINGLE, data: swapData },
      { act: ACT.SETTLE_ALL, data: coder.encode(["address", "uint256"], [inputCur, ethers.MaxUint256]) },
      { act: ACT.TAKE_ALL, data: coder.encode(["address", "uint256"], [outputCur, 0]) },
    ]);
  }

  function basesFor(fromSym) {
    return fromSym === "BNB" ? [NATIVE, WBNB] : [USDT];
  }

  function candidates(fromSym) {
    const list = [];
    const extra = cfg.infinity;
    if (extra?.currency0) {
      const inTok = extra.payToken || (sameAddr(extra.currency0, WBNB) || sameAddr(extra.currency1, WBNB) ? WBNB : payToken(fromSym));
      list.push({
        kind: extra.kind === "Bin" ? "Bin" : "CL",
        currency0: extra.currency0,
        currency1: extra.currency1,
        hooks: extra.hooks || NATIVE,
        poolManager: extra.poolManager || (extra.kind === "Bin" ? BIN_PM : CL_PM),
        fee: extra.fee,
        parameters: extra.parameters || (extra.kind === "Bin" ? binParams(extra.binStep || 10) : tickParams(extra.tickSpacing || 10)),
        payToken: inTok,
        zeroForOne: sameAddr(inTok, extra.currency0),
      });
    }
    const hooks = NATIVE;
    const fees = [100, 500, 2500, 3000, 10000, 8388608];
    const ticks = [10, 50, 1, 100, 200];
    const bins = [10, 1, 5, 20, 25];
    for (const base of basesFor(fromSym)) {
      const [c0, c1] = sortPair(base, cfg.lim);
      const zeroForOne = sameAddr(base, c0);
      for (const fee of fees) {
        for (const ts of ticks) {
          list.push({
            kind: "CL",
            currency0: c0,
            currency1: c1,
            hooks,
            poolManager: CL_PM,
            fee,
            parameters: tickParams(ts),
            payToken: base,
            zeroForOne,
          });
        }
        for (const step of bins) {
          list.push({
            kind: "Bin",
            currency0: c0,
            currency1: c1,
            hooks,
            poolManager: BIN_PM,
            fee,
            parameters: binParams(step),
            payToken: base,
            zeroForOne,
          });
        }
      }
    }
    return list;
  }

  function parseOut(raw) {
    if (raw == null) return 0n;
    if (typeof raw === "bigint") return raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return BigInt(Math.floor(raw));
    if (typeof raw === "string") {
      if (/^\d+$/.test(raw)) return BigInt(raw);
      if (/^0x[0-9a-fA-F]+$/.test(raw)) return BigInt(raw);
    }
    if (typeof raw === "object") {
      if (raw.quotient != null) return parseOut(raw.quotient);
      if (raw.value != null) return parseOut(raw.value);
      if (raw.numerator != null && raw.denominator != null) {
        try {
          return BigInt(raw.numerator) / BigInt(raw.denominator);
        } catch (_) {}
      }
      if (raw.numerator != null) return parseOut(raw.numerator);
    }
    return 0n;
  }

  function addrOf(v) {
    if (!v) return null;
    if (typeof v === "string") {
      if (v === "BNB" || v === "ETH") return NATIVE;
      if (/^0x[a-fA-F0-9]{40}$/.test(v)) return ethers.getAddress(v);
      return null;
    }
    return addrOf(v.address || v.wrapped?.address);
  }

  function poolFromApi(raw) {
    if (!raw || typeof raw !== "object") return null;
    const type = String(raw.type || raw.protocol || raw.poolType || "").toLowerCase();
    if (!type.includes("infinity") && !type.includes("infi") && !type.includes("cl") && !type.includes("bin")) {
      if (!raw.tickSpacing && !raw.binStep && !raw.parameters) return null;
    }
    const kind = type.includes("bin") ? "Bin" : "CL";
    const c0 = addrOf(raw.currency0) || addrOf(raw.token0);
    const c1 = addrOf(raw.currency1) || addrOf(raw.token1);
    if (!c0 || !c1) return null;
    const [currency0, currency1] = sortPair(c0, c1);
    const hooks = addrOf(raw.hooks) || addrOf(raw.hooksAddress) || NATIVE;
    const fee = Number(raw.fee ?? raw.feeAmount ?? 0);
    const tickSpacing = Number(raw.tickSpacing || 0);
    const binStep = Number(raw.binStep || 0);
    const parameters =
      raw.parameters || (kind === "Bin" ? binParams(binStep || 10) : tickParams(tickSpacing || 10));
    const payGuess = sameAddr(currency0, WBNB) || sameAddr(currency1, WBNB) ? WBNB : sameAddr(currency0, NATIVE) || sameAddr(currency1, NATIVE) ? NATIVE : USDT;
    return {
      kind,
      currency0,
      currency1,
      hooks,
      poolManager: kind === "Bin" ? BIN_PM : CL_PM,
      fee,
      parameters,
      payToken: payGuess,
      zeroForOne: sameAddr(payGuess, currency0),
    };
  }

  function poolFits(parsed, fromSym) {
    if (!parsed) return false;
    const hasLim = sameAddr(parsed.currency0, cfg.lim) || sameAddr(parsed.currency1, cfg.lim);
    const want = fromSym === "BNB" ? [NATIVE, WBNB] : [USDT];
    return hasLim && want.some((t) => sameAddr(parsed.currency0, t) || sameAddr(parsed.currency1, t));
  }

  function firstApiPool(j, fromSym) {
    const bags = [j?.trade?.routes, j?.routes, j?.route, j?.data?.trade?.routes, j?.data?.routes].filter(Boolean);
    for (const bag of bags) {
      const routes = Array.isArray(bag) ? bag : [bag];
      for (const r of routes) {
        const pools = r?.pools || r?.path || r?.route || [];
        for (const p of Array.isArray(pools) ? pools : []) {
          const parsed = poolFromApi(p);
          if (poolFits(parsed, fromSym)) {
            parsed.payToken =
              fromSym === "BNB"
                ? sameAddr(parsed.currency0, WBNB) || sameAddr(parsed.currency1, WBNB)
                  ? WBNB
                  : NATIVE
                : USDT;
            parsed.zeroForOne = sameAddr(parsed.payToken, parsed.currency0);
            return parsed;
          }
        }
      }
    }
    const fallback = poolFromApi(j?.pool || null);
    return poolFits(fallback, fromSym) ? fallback : null;
  }

  async function quoteViaRouterApi(fromSym, amountIn) {
    const tokenInAddr = fromSym === "BNB" ? "BNB" : USDT;
    const url = new URL("https://router.pancakeswap.finance/v0/quote");
    url.searchParams.set("tokenInAddress", tokenInAddr);
    url.searchParams.set("tokenInChainId", "56");
    url.searchParams.set("tokenOutAddress", cfg.lim);
    url.searchParams.set("tokenOutChainId", "56");
    url.searchParams.set("amount", String(amountIn));
    url.searchParams.set("type", "exactIn");
    url.searchParams.set("maxHops", "3");
    url.searchParams.set("maxSplits", "4");
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("quote http");
    const j = await res.json();
    const out =
      parseOut(j?.trade?.outputAmount) ||
      parseOut(j?.outputAmount) ||
      parseOut(j?.quote) ||
      parseOut(j?.dstAmount) ||
      parseOut(j?.data?.outputAmount) ||
      parseOut(j?.data?.trade?.outputAmount);
    if (out === 0n) throw new Error("quote empty");
    return { out, api: j, pool: firstApiPool(j, fromSym) };
  }

  async function quoteOne(key, amountIn, p) {
    const q = new ethers.Contract(key.kind === "Bin" ? BIN_QUOTER : CL_QUOTER, QUOTE_ABI, p);
    const r = await q.quoteExactInputSingle.staticCall({
      poolKey: key,
      zeroForOne: key.zeroForOne,
      exactAmount: amountIn,
      hookData: "0x",
    });
    return r[0];
  }

  async function quoteOnchain(fromSym, amountIn) {
    const cached = infiPoolCache[fromSym];
    const p = await readProvider();
    if (cached) {
      try {
        const out = await quoteOne(cached, amountIn, p);
        if (out > 0n) return { out, pool: cached, kind: cached.kind, zeroForOne: cached.zeroForOne };
      } catch (_) {
        infiPoolCache[fromSym] = null;
      }
    }
    const clPm = new ethers.Contract(CL_PM, CL_SLOT, p);
    const binPm = new ethers.Contract(BIN_PM, BIN_SLOT, p);
    const keys = candidates(fromSym);
    const chunk = 10;
    for (let i = 0; i < keys.length; i += chunk) {
      const part = keys.slice(i, i + chunk);
      const hits = await Promise.all(
        part.map(async (key) => {
          try {
            const id = poolIdOf(key);
            if (key.kind === "Bin") {
              const slot = await binPm.getSlot0(id);
              if (!slot[0]) return null;
            } else {
              const slot = await clPm.getSlot0(id);
              if (!slot[0]) return null;
            }
            const out = await quoteOne(key, amountIn, p);
            if (out > 0n) return { out, pool: key, kind: key.kind, zeroForOne: key.zeroForOne };
          } catch (_) {}
          return null;
        }),
      );
      const found = hits.find(Boolean);
      if (found) {
        infiPoolCache[fromSym] = found.pool;
        return found;
      }
    }
    return { out: 0n, pool: null };
  }

  async function quoteLim(fromSym, amountIn) {
    if (!amountIn || amountIn === 0n) return { out: 0n, path: null };
    if (amountIn > U128) return { out: 0n, path: null };
    try {
      const api = await quoteViaRouterApi(fromSym, amountIn);
      if (api.out > 0n) {
        if (api.pool?.currency0) infiPoolCache[fromSym] = api.pool;
        return { out: api.out, path: "infinity", via: "api", ...api };
      }
    } catch (_) {}
    const on = await quoteOnchain(fromSym, amountIn);
    if (on.out > 0n) return { out: on.out, path: "infinity", via: "chain", ...on };
    return { out: 0n, path: null };
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

  async function swapToLim(fromSym, amountIn) {
    await connect();
    const quoted = await quoteLim(fromSym, amountIn);
    if (!quoted.path || quoted.out === 0n) throw new Error("NO_LIQ");
    let pool = quoted.pool?.currency0 ? quoted.pool : infiPoolCache[fromSym];
    let kind = quoted.kind || pool?.kind;
    let zeroForOne = quoted.zeroForOne;
    if (!pool?.currency0) {
      const on = await quoteOnchain(fromSym, amountIn);
      if (on.out === 0n || !on.pool) throw new Error("NO_LIQ");
      pool = on.pool;
      kind = on.kind;
      zeroForOne = on.zeroForOne;
    }
    kind = kind === "Bin" ? "Bin" : "CL";
    const pay = pool.payToken || payToken(fromSym);
    zeroForOne = zeroForOne ?? sameAddr(pay, pool.currency0);
    const minOut = (quoted.out * 99n) / 100n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 180);
    const s = await signer();
    const ur = new ethers.Contract(UR, UR_ABI, s);
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const payload = encodeInfiSwap(kind, pool, amountIn, minOut, zeroForOne);
    const wrapWbnb = fromSym === "BNB" && sameAddr(pay, WBNB);
    let commands;
    let inputs;
    if (fromSym !== "BNB") {
      await ensurePermit2(USDT, amountIn, s);
      commands = cmds(CMD.PERMIT2_TRANSFER_FROM, CMD.INFI_SWAP);
      inputs = [coder.encode(["address", "address", "uint160"], [USDT, UR, amountIn]), payload];
    } else if (wrapWbnb) {
      commands = cmds(CMD.WRAP_ETH, CMD.INFI_SWAP);
      inputs = [coder.encode(["address", "uint256"], [UR, amountIn]), payload];
    } else {
      commands = cmds(CMD.INFI_SWAP);
      inputs = [payload];
    }
    const tx = await ur.execute(commands, inputs, deadline, {
      value: fromSym === "BNB" ? amountIn : 0n,
    });
    return (await tx.wait()).hash;
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
    const [started, settled] = await Promise.all([
      queryLogs(c, c.filters.RunStarted(), latest),
      queryLogs(c, c.filters.RunSettled(), latest),
    ]);
    const week = {};
    const invite = {};
    for (const e of settled) {
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
    claim,
    referrer,
    limBalance,
    bnbBalance,
    activeRun,
    approveAndEnter,
    settleRun,
    withdrawWeekly,
    setTicketPrice,
    txUrl,
    addrUrl,
    quoteLim,
    swapToLim,
    tokenBalance,
    fetchLeaderboards,
    fetchBurns,
    formatLim(v) {
      return Number(ethers.formatUnits(v, 18)).toFixed(4);
    },
  };
})();

window.CatboxChain = CatboxChain;
