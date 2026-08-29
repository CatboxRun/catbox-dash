/* global ethers, CATBOX_CHAIN, CATBOX_SICBO, CatboxChain */
(function () {
const LIM_ADDR = "0x1D6430FDFC63ea481fE157017B47530663C96001";
const UNIT = 10n ** 18n;
const MIN_STAKE = 1;
const MAX_STAKE = 10;
const COPY = {
  zh: {
    sub: "提现桌 · 1–10 LIM 自选",
    connect: "连接钱包",
    connecting: "连接中…",
    modeLive: "链上开盅。押中双倍回钱包，注额 1–10 LIM 自选。",
    modeDemo: "开盅见分晓。押中双倍到账，先试手感，规则与上链后相同。",
    kicker: "提现桌",
    small: "小",
    big: "大",
    smallMeta: "4–8 · 开双倍",
    bigMeta: "13–17 · 开双倍",
    open: "开盅",
    opening: "开盅中…",
    wait: "等 2 个块再揭盅…",
    r1: "自选 1–10 LIM 开一盅。押中即双倍回钱包。",
    r2: "押小开 4–8，押大开 13–17。中门与围骰充实奖池，再来一盅。",
    r3: "216 种点数里，54 面开双倍。摇中即到账。",
    r4: "独立奖池。下注后等 2 个块揭盅。",
    r4demo: "点大小即开盅。上链后等 2 个块揭盅。",
    win: "开中了。{n} LIM 已到钱包。",
    loseMid: "中门入池，再来一盅。",
    loseTriple: "围骰入池，再来一盅。",
    lose: "这盅未开，再摇一把。",
    demoWin: "试玩开中，双倍 {n} LIM（不上链）。",
    demoLose: "这盅未开，再试一把。",
    needWallet: "先连接钱包。",
    needBsc: "请切到 BSC。",
    noPool: "奖池正在补仓，稍后再开。",
    paying: "下注 {n} LIM…",
    approve: "先在钱包授权 LIM…",
    refund: "超时，本金已退回。",
    total: "总和 {n}",
    bal: "LIM {lim} · 奖池 {pool}",
    demoTag: "试玩",
    shaking: "摇盅…",
    stakeLabel: "本盅注额",
  },
  en: {
    sub: "TABLE · 1–10 LIM",
    connect: "CONNECT",
    connecting: "CONNECTING…",
    modeLive: "On-chain table. Hit pays double. Pick 1–10 LIM.",
    modeDemo: "Open the cup. A hit pays double. Same rules once live.",
    kicker: "TABLE",
    small: "SMALL",
    big: "BIG",
    smallMeta: "4–8 · pays double",
    bigMeta: "13–17 · pays double",
    open: "OPEN",
    opening: "OPENING…",
    wait: "Wait 2 blocks…",
    r1: "Pick 1–10 LIM per cup. A hit returns double to your wallet.",
    r2: "Small opens 4–8. Big opens 13–17. Middle and triples refill the pool.",
    r3: "54 of 216 faces pay double. Hit, and it lands.",
    r4: "Own pool. Settle 2 blocks after the bet.",
    r4demo: "Preview opens on Small/Big. Live table waits 2 blocks.",
    win: "Hit. {n} LIM is in the wallet.",
    loseMid: "Middle refill. Open another cup.",
    loseTriple: "Triple refill. Open another cup.",
    lose: "This cup passed. Shake again.",
    demoWin: "Preview hit, double {n} LIM (off-chain).",
    demoLose: "This cup passed. Try another.",
    needWallet: "Connect wallet first.",
    needBsc: "Switch to BSC.",
    noPool: "Table is restocking. Try later.",
    paying: "Placing {n} LIM…",
    approve: "Approve LIM in wallet…",
    refund: "Timed out. Stake returned.",
    total: "TOTAL {n}",
    bal: "LIM {lim} · POOL {pool}",
    demoTag: "PREVIEW",
    shaking: "SHAKING…",
    stakeLabel: "STAKE",
  },
};

let lang = "zh";
let account = null;
let live = Boolean(typeof CATBOX_SICBO !== "undefined" && CATBOX_SICBO.address);
let busy = false;
let pendingLock = 0;
let lastShow = null;
let stakeLim = 1;
let pendingStake = 0;

const $ = (id) => document.getElementById(id);
function dashMode() {
  return Boolean(window.CatboxChain && $("lobby") && $("feltBoard"));
}
function syncLang() {
  if (!dashMode()) return;
  lang = document.body.dataset.lang === "zh" ? "zh" : "en";
}
function setTxt(id, v) {
  const el = $(id);
  if (el) el.textContent = v;
}
const t = (k, vars = {}) => {
  let s = (COPY[lang] || COPY.zh)[k] || COPY.en[k] || k;
  Object.entries(vars).forEach(([a, v]) => {
    s = s.replaceAll(`{${a}}`, String(v));
  });
  return s;
};

function applyCopy() {
  syncLang();
  if (!dashMode()) document.body.dataset.lang = lang;
  setTxt("sicboSub", t("sub"));
  if ($("langBtn")) $("langBtn").textContent = lang === "zh" ? "中" : "EN";
  setTxt("feltKicker", t("kicker"));
  setTxt("smallTitle", t("small"));
  setTxt("bigTitle", t("big"));
  setTxt("smallMeta", t("smallMeta"));
  setTxt("bigMeta", t("bigMeta"));
  setTxt("settleBtn", t("open"));
  setTxt("r1", t("r1"));
  setTxt("r2", t("r2"));
  setTxt("r3", t("r3"));
  setTxt("r4", live ? t("r4") : t("r4demo"));
  setTxt("modeLine", live ? t("modeLive") : t("modeDemo"));
  setTxt("stakeLabel", t("stakeLabel"));
  document.querySelector(".sicbo-page")?.setAttribute("data-mode", live ? "live" : "demo");
  if (!dashMode() && !account && $("walletBtn")) $("walletBtn").textContent = t("connect");
  if (lastShow) {
    const s = lastShow;
    lastShow = null;
    showOutcome(s.side, s.d1, s.d2, s.d3, s.onChain, s.stake);
  }
}

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2400);
}

function setStatus(msg) {
  $("statusLine").textContent = msg || "";
}

function setFaces(a, b, c) {
  const dice = [...document.querySelectorAll(".die")];
  [a, b, c].forEach((n, i) => {
    if (dice[i]) dice[i].dataset.face = String(n);
  });
}

function paintChips() {
  document.querySelectorAll(".sicbo-chip").forEach((el) => {
    el.classList.toggle("on", Number(el.dataset.lim) === stakeLim);
  });
}

function buildChips() {
  const row = $("stakeChips");
  if (!row || row.children.length) return;
  for (let n = MIN_STAKE; n <= MAX_STAKE; n++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sicbo-chip";
    btn.dataset.lim = String(n);
    btn.textContent = String(n);
    btn.onclick = () => {
      if (busy || (live && pendingLock > 0)) return;
      stakeLim = n;
      paintChips();
    };
    row.appendChild(btn);
  }
  paintChips();
}

function buildDice() {
  const row = $("diceRow");
  if (!row || row.children.length) return;
  const faces = {
    1: ["c"],
    2: ["tl", "br"],
    3: ["tl", "c", "br"],
    4: ["tl", "tr", "bl", "br"],
    5: ["tl", "tr", "c", "bl", "br"],
    6: ["tl", "ml", "bl", "tr", "mr", "br"],
  };
  for (let i = 0; i < 3; i++) {
    const slot = document.createElement("div");
    slot.className = "die-slot";
    const die = document.createElement("div");
    die.className = "die";
    die.dataset.face = "1";
    const cube = document.createElement("div");
    cube.className = "die-cube";
    for (let n = 1; n <= 6; n++) {
      const face = document.createElement("div");
      face.className = `die-face f${n}`;
      faces[n].forEach((pos) => {
        const pip = document.createElement("span");
        pip.className = `pip ${pos}`;
        face.appendChild(pip);
      });
      cube.appendChild(face);
    }
    die.appendChild(cube);
    slot.appendChild(die);
    row.appendChild(slot);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function won(side, d1, d2, d3) {
  if (d1 === d2 && d2 === d3) return { ok: false, why: "triple" };
  const sum = d1 + d2 + d3;
  if (sum >= 9 && sum <= 12) return { ok: false, why: "mid" };
  if (side === 0) return { ok: sum >= 4 && sum <= 8, why: "miss" };
  return { ok: sum >= 13 && sum <= 17, why: "miss" };
}

function fromSeed(seed) {
  const s = BigInt(seed);
  const d1 = Number(s % 6n) + 1;
  const d2 = Number((s / 6n) % 6n) + 1;
  const d3 = Number((s / 36n) % 6n) + 1;
  return [d1, d2, d3];
}

function cfg() {
  return window.CATBOX_CHAIN || {};
}

function sicboCfg() {
  return window.CATBOX_SICBO || {};
}

function eth() {
  if (!window.ethereum) throw new Error("NO_WALLET");
  return window.ethereum;
}

function provider() {
  return new ethers.BrowserProvider(eth(), "any");
}

async function signer() {
  return (await provider()).getSigner();
}

async function ensureBsc() {
  const id = await eth().request({ method: "eth_chainId" });
  if (id === "0x38") return;
  try {
    await eth().request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
  } catch (e) {
    if (e?.code === 4902) {
      await eth().request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0x38",
            chainName: "BNB Smart Chain",
            nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
            rpcUrls: [cfg().rpc || "https://bsc-dataseed.binance.org"],
            blockExplorerUrls: ["https://bscscan.com"],
          },
        ],
      });
    } else {
      throw e;
    }
  }
}

async function connect() {
  if (window.CatboxChain?.connect) {
    account = await CatboxChain.connect();
    return account;
  }
  await ensureBsc();
  const accounts = await eth().request({ method: "eth_requestAccounts" });
  account = ethers.getAddress(accounts[0]);
  eth().removeAllListeners?.("accountsChanged");
  eth().on?.("accountsChanged", (accs) => {
    account = accs?.[0] ? ethers.getAddress(accs[0]) : null;
    refresh();
  });
  if ($("walletBtn")) $("walletBtn").textContent = account.slice(0, 6) + "…" + account.slice(-4);
  return account;
}

function readProvider() {
  return new ethers.JsonRpcProvider(cfg().rpc || "https://bsc-dataseed.binance.org", 56, {
    staticNetwork: true,
  });
}

function limContract(s) {
  return new ethers.Contract(
    cfg().lim || LIM_ADDR,
    [
      "function balanceOf(address) view returns (uint256)",
      "function allowance(address,address) view returns (uint256)",
      "function approve(address,uint256) returns (bool)",
    ],
    s,
  );
}

function gameContract(s) {
  const c = sicboCfg();
  if (!c.address || !c.abi) throw new Error("NO_SICBO");
  return new ethers.Contract(c.address, c.abi, s);
}

async function isDeployed() {
  const c = sicboCfg();
  if (!c.address) return false;
  try {
    const code = await Promise.race([
      readProvider().getCode(c.address),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 2500)),
    ]);
    return Boolean(code && code !== "0x");
  } catch (_) {
    return Boolean(c.address);
  }
}

function setBetEnabled() {
  const locked = live && pendingLock > 0;
  const page = document.querySelector(".sicbo-page");
  $("betSmall").disabled = busy || locked;
  $("betBig").disabled = busy || locked;
  $("settleBtn").disabled = !live || !pendingLock || busy;
  page?.setAttribute("data-mode", live ? "live" : "demo");
  page?.setAttribute("data-pending", live && pendingLock > 0 ? "1" : "0");
  document.querySelectorAll(".sicbo-chip").forEach((el) => {
    el.disabled = busy || locked;
  });
}

function fmtLim(v) {
  const n = Number(ethers.formatEther(v || 0n));
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

async function refresh() {
  live = await isDeployed();
  applyCopy();
  let pool = 0n;
  let lim = 0n;
  try {
    if (live) {
      const p = readProvider();
      const g = gameContract(p);
      pool = await g.freePool();
      if (account) lim = await limContract(p).balanceOf(account);
      if (account) {
        const b = await g.bets(account);
        const open = b.open ?? b[2];
        pendingLock = open ? Number(b.lockBlock ?? b[1]) : 0;
        if (open) {
          const amt = b.amount ?? b[3];
          if (amt) {
            pendingStake = Math.max(MIN_STAKE, Math.min(MAX_STAKE, Number(ethers.formatEther(amt))));
            stakeLim = pendingStake;
          }
        }
      } else {
        pendingLock = 0;
      }
    } else {
      pendingLock = 0;
    }
  } catch (_) {}
  $("walletLine").textContent = t("bal", { lim: account ? fmtLim(lim) : "—", pool: live ? fmtLim(pool) : t("demoTag") });
  paintChips();
  setBetEnabled();
}

function showOutcome(side, d1, d2, d3, onChain, stake = stakeLim) {
  lastShow = { side, d1, d2, d3, onChain, stake };
  const sum = d1 + d2 + d3;
  setFaces(d1, d2, d3);
  $("totalLine").textContent = t("total", { n: sum });
  const w = won(side, d1, d2, d3);
  const doubled = String(stake * 2);
  let line = t("lose");
  if (w.ok) line = onChain ? t("win", { n: doubled }) : t("demoWin", { n: doubled });
  else if (w.why === "triple") line = t("loseTriple");
  else if (w.why === "mid") line = t("loseMid");
  else if (!onChain) line = t("demoLose");
  $("resultLine").textContent = line;
  $("resultLine").dataset.hit = w.ok ? "1" : "0";
  setStatus(line);
  $("betSmall").classList.toggle("picked", side === 0);
  $("betBig").classList.toggle("picked", side === 1);
}

async function spinTo(d1, d2, d3) {
  const stage = $("diceStage");
  const cup = $("diceCup");
  const felt = $("feltBoard");
  const dice = [...document.querySelectorAll(".die")];
  $("totalLine").textContent = "…";
  $("resultLine").textContent = "";
  $("resultLine").removeAttribute("data-hit");
  setStatus(t("shaking"));
  if (reducedMotion()) {
    setFaces(d1, d2, d3);
    cup.className = "sicbo-cup idle";
    return;
  }
  cup.className = "sicbo-cup cover";
  await sleep(240);
  stage.classList.add("shaking");
  felt.classList.add("shaking");
  await sleep(980);
  stage.classList.remove("shaking");
  felt.classList.remove("shaking");
  setFaces(d1, d2, d3);
  dice.forEach((el) => {
    el.classList.remove("land");
    void el.offsetWidth;
    el.classList.add("land");
  });
  cup.className = "sicbo-cup lift";
  await sleep(520);
  cup.className = "sicbo-cup idle";
  dice.forEach((el) => el.classList.remove("land"));
}

async function demoBet(side) {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const seed = (BigInt(buf[0]) << 32n) ^ BigInt(buf[1]);
  const [d1, d2, d3] = fromSeed(seed);
  await spinTo(d1, d2, d3);
  showOutcome(side, d1, d2, d3, false);
}

async function liveBet(side) {
  if (!account && window.CatboxChain?.account) account = CatboxChain.account;
  if (!account) {
    await connect();
  }
  await ensureBsc();
  const s = await signer();
  const g = gameContract(s);
  const lim = limContract(s);
  const free = await g.freePool();
  const amount = UNIT * BigInt(stakeLim);
  if (free < amount) {
    toast(t("noPool"));
    return;
  }
  const allow = await lim.allowance(account, sicboCfg().address);
  if (allow < amount) {
    setStatus(t("approve"));
    const txA = await lim.approve(sicboCfg().address, UNIT * 200n);
    await txA.wait();
  }
  setStatus(t("paying", { n: stakeLim }));
  const tx = await g.placeBet(side, amount);
  await tx.wait();
  const b = await g.bets(account);
  pendingLock = Number(b.lockBlock ?? b[1]);
  pendingStake = stakeLim;
  setBetEnabled();
  setStatus(t("wait"));
  toast(t("wait"));
}

async function waitForLock(lockBlock) {
  const p = live ? readProvider() : null;
  for (let i = 0; i < 40; i++) {
    const n = p ? Number(await p.getBlockNumber()) : 0;
    if (!p || n > lockBlock) return;
    setStatus(t("wait"));
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function openCup() {
  if (!live) return;
  if (!account) await connect();
  await waitForLock(pendingLock);
  setStatus(t("opening"));
  $("settleBtn").disabled = true;
  const g = gameContract(await signer());
  const tx = await g.settle();
  const rec = await tx.wait();
  const ev = rec.logs
    .map((l) => {
      try {
        return g.interface.parseLog(l);
      } catch (_) {
        return null;
      }
    })
    .find((x) => x && (x.name === "Settled" || x.name === "Refunded"));
  if (ev?.name === "Refunded") {
    setStatus(t("refund"));
    toast(t("refund"));
  } else if (ev?.name === "Settled") {
    const d1 = Number(ev.args.d1);
    const d2 = Number(ev.args.d2);
    const d3 = Number(ev.args.d3);
    await spinTo(d1, d2, d3);
    showOutcome(Number(ev.args.side), d1, d2, d3, true, pendingStake || stakeLim);
  }
  pendingLock = 0;
  await refresh();
}

async function onSide(side) {
  if (busy) return;
  busy = true;
  setBetEnabled();
  try {
    if (live) await liveBet(side);
    else await demoBet(side);
  } catch (e) {
    const msg = e?.shortMessage || e?.reason || e?.message || String(e);
    setStatus(msg);
    toast(msg);
  } finally {
    busy = false;
    setBetEnabled();
    refresh().catch(() => {});
  }
}

function bindUi() {
  if ($("langBtn")) {
    $("langBtn").onclick = () => {
      lang = lang === "zh" ? "en" : "zh";
      applyCopy();
      refresh();
    };
  }
  if ($("walletBtn") && !dashMode()) {
    $("walletBtn").onclick = async () => {
      try {
        $("walletBtn").textContent = t("connecting");
        await connect();
        await refresh();
      } catch (e) {
        toast(e?.message || t("needWallet"));
        applyCopy();
      }
    };
  }
  if ($("betSmall")) $("betSmall").onclick = () => onSide(0);
  if ($("betBig")) $("betBig").onclick = () => onSide(1);
  if ($("settleBtn")) {
    $("settleBtn").onclick = async () => {
      if (busy) return;
      busy = true;
      try {
        await openCup();
      } catch (e) {
        const msg = e?.shortMessage || e?.reason || e?.message || String(e);
        setStatus(msg);
        toast(msg);
        $("settleBtn").disabled = false;
      } finally {
        busy = false;
        await refresh();
      }
    };
  }
}

function bootSicBo() {
  if (!$("feltBoard") || bootSicBo._on) return;
  bootSicBo._on = true;
  if (dashMode() && window.CatboxChain?.account) account = CatboxChain.account;
  bindUi();
  buildChips();
  buildDice();
  setFaces(4, 5, 6);
  applyCopy();
  refresh();
  window.addEventListener("catbox-wallet", () => {
    if (window.CatboxChain?.account) account = CatboxChain.account;
    else if (dashMode()) account = null;
    refresh();
  });
  setInterval(() => {
    if (live && pendingLock && !busy) refresh();
  }, 4000);
}

window.bootSicBo = bootSicBo;
window.refreshSicbo = refresh;
window.refreshSicboCopy = applyCopy;
bootSicBo();
})();
