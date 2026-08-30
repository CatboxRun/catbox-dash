/* global ethers, CATBOX_CHAIN, CATBOX_SICBO, CatboxChain */
(function () {
  const LIM_ADDR = "0x1D6430FDFC63ea481fE157017B47530663C96001";
  const UNIT = 10n ** 18n;
  const MIN_STAKE = 1;
  const MAX_STAKE = 10;
  const COPY = {
    zh: {
      sub: "提现桌 · 1–10 LIM 自选",
      mode: "先选注额，点小或大锁注。等两个块，再点揭盅。押中双倍回钱包。",
      kicker: "提现桌",
      small: "小",
      big: "大",
      smallMeta: "4–8 · 开双倍",
      bigMeta: "13–17 · 开双倍",
      open: "揭盅",
      next: "再来一盅",
      opening: "揭盅中，请在钱包确认…",
      wait: "已锁。再等 {n} 个块，再点揭盅。",
      waitReady: "可以揭盅了。点揭盅，在钱包确认。",
      r1: "自选 1–10 LIM 开一盅。押中即双倍回钱包。",
      r2: "押小开 4–8，押大开 13–17。中门与围骰充实奖池。",
      r3: "216 种点数里，54 面开双倍。",
      r4: "独立奖池。锁注后等两个块，再点揭盅。未揭的注，回来还能继续。",
      r5: "桌池每周销毁约两成。未揭的注不烧。",
      win: "开中了。{n} LIM 已到钱包。",
      loseMid: "中门入池，再来一盅。",
      loseTriple: "围骰入池，再来一盅。",
      lose: "这盅未开，再摇一把。",
      needWallet: "先连接钱包。",
      needBsc: "请切到 BSC。",
      noPool: "奖池正在补仓，稍后再开。",
      needLim: "钱包 LIM 不够这一注。",
      paying: "下注 {n} LIM，请在钱包确认…",
      approve: "先授权 LIM，请在钱包确认…",
      refund: "超时，本金已退回。",
      total: "总和 {n}",
      bal: "LIM {lim} · 奖池 {pool}",
      shaking: "摇盅…",
      stakeLabel: "本盅注额",
      rejected: "已取消。未揭的注点「揭盅」继续。",
      hasOpen: "这一盅还没揭。点揭盅。",
      paused: "桌子暂停中。",
      resume: "你有一盅未揭。",
      ok: "好",
    },
    en: {
      sub: "TABLE · 1–10 LIM",
      mode: "Pick a stake, then Small or Big to lock. Wait two blocks, then tap OPEN CUP. A hit pays double.",
      kicker: "TABLE",
      small: "SMALL",
      big: "BIG",
      smallMeta: "4–8 · pays double",
      bigMeta: "13–17 · pays double",
      open: "OPEN CUP",
      next: "AGAIN",
      opening: "Opening — confirm in wallet…",
      wait: "Locked. {n} blocks, then tap OPEN CUP.",
      waitReady: "Ready. Tap OPEN CUP and confirm in the wallet.",
      r1: "Pick 1–10 LIM per cup. A hit returns double to your wallet.",
      r2: "Small opens 4–8. Big opens 13–17. Middle and triples refill the pool.",
      r3: "54 of 216 faces pay double.",
      r4: "Own pool. After lock, wait two blocks, then tap OPEN CUP. An open cup can be finished later.",
      r5: "Each week about 20% of the table pool is burned. Open cups are not burned.",
      win: "Hit. {n} LIM is in the wallet.",
      loseMid: "Middle refill. Open another cup.",
      loseTriple: "Triple refill. Open another cup.",
      lose: "This cup passed. Shake again.",
      needWallet: "Connect wallet first.",
      needBsc: "Switch to BSC.",
      noPool: "Table is restocking. Try later.",
      needLim: "Not enough LIM for this stake.",
      paying: "Betting {n} LIM — confirm in wallet…",
      approve: "Approve LIM in wallet…",
      refund: "Timed out. Stake returned.",
      total: "TOTAL {n}",
      bal: "LIM {lim} · POOL {pool}",
      shaking: "SHAKING…",
      stakeLabel: "STAKE",
      rejected: "Cancelled. Tap OPEN CUP if a cup is still waiting.",
      hasOpen: "This cup is still open. Open it.",
      paused: "Table is paused.",
      resume: "You have an open cup.",
      ok: "OK",
    },
  };

  const root = () => document.getElementById("sbRoot");
  const $ = (id) => document.getElementById(id);
  const diceEls = () => [...( $("sbDice")?.querySelectorAll(".die") || [])];

  let lang = "zh";
  let account = null;
  let busy = false;
  let spinning = false;
  let pendingLock = 0;
  let pendingSide = 0;
  let pendingStake = 0;
  let stakeLim = 1;
  let phase = "edit";

  function dashMode() {
    return Boolean(window.CatboxChain && $("lobby") && $("sbFelt"));
  }
  function syncLang() {
    lang = document.body.dataset.lang === "zh" ? "zh" : "en";
  }
  const t = (k, vars = {}) => {
    let s = (COPY[lang] || COPY.zh)[k] || COPY.en[k] || k;
    Object.entries(vars).forEach(([a, v]) => {
      s = s.replaceAll(`{${a}}`, String(v));
    });
    return s;
  };
  function setTxt(id, v) {
    const el = $(id);
    if (el) el.textContent = v;
  }
  function setStatus(msg) {
    setTxt("sbStatus", msg || "");
  }
  function toast(msg) {
    const el = $("toast");
    if (!el || !msg) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), 2800);
  }
  function paintPhase() {
    const page = root();
    if (!page) return;
    const waiting = phase === "wait" || pendingLock > 0;
    page.setAttribute("data-pending", waiting ? "1" : "0");
    page.setAttribute("data-result", phase === "result" ? "1" : "0");
    page.setAttribute("data-locked", busy || waiting || phase === "result" ? "1" : "0");
    const label = phase === "result" ? "next" : busy && waiting ? "opening" : "open";
    setTxt("sbOpen", t(label));
  }
  function applyCopy() {
    syncLang();
    setTxt("sbSub", t("sub"));
    setTxt("sbKicker", t("kicker"));
    setTxt("sbSmallTitle", t("small"));
    setTxt("sbBigTitle", t("big"));
    setTxt("sbSmallMeta", t("smallMeta"));
    setTxt("sbBigMeta", t("bigMeta"));
    setTxt("sbOpen", t("open"));
    setTxt("sbR1", t("r1"));
    setTxt("sbR2", t("r2"));
    setTxt("sbR3", t("r3"));
    setTxt("sbR4", t("r4"));
    setTxt("sbR5", t("r5"));
    setTxt("sbMode", t("mode"));
    setTxt("sbStake", t("stakeLabel"));
    setTxt("sbPopOk", t("ok"));
    paintPhase();
  }
  function friendly(e) {
    const code = e?.code;
    const raw = String(e?.shortMessage || e?.reason || e?.message || e || "");
    const low = raw.toLowerCase();
    if (code === 4001 || code === "ACTION_REJECTED" || /reject|denied|user denied/.test(low)) return t("rejected");
    if (/paused/.test(low)) return t("paused");
    if (/\bopen\b/.test(low)) return t("hasOpen");
    if (/\bwait\b/.test(low)) return t("waitReady");
    if (/\bpool\b|\bpaused\b/.test(low)) return t("noPool");
    if (/insufficient|transfer amount exceeds|exceeds balance/.test(low)) return t("needLim");
    if (/no_wallet|ethereum/.test(low)) return t("needWallet");
    if (/bsc|chain/.test(low) && /switch|4902/.test(low)) return t("needBsc");
    return raw.slice(0, 120);
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
  async function readProvider() {
    return new ethers.JsonRpcProvider(cfg().rpc || "https://bsc-dataseed.binance.org", 56, {
      staticNetwork: true,
      batchMaxCount: 1,
    });
  }
  async function signer() {
    return (await new ethers.BrowserProvider(eth(), "any")).getSigner();
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
  function parseBet(b) {
    return {
      side: Number(b.side ?? b[0] ?? 0),
      lockBlock: Number(b.lockBlock ?? b[1] ?? 0),
      open: Boolean(b.open ?? b[2]),
      amount: b.amount ?? b[3] ?? 0n,
    };
  }
  function fmtLim(v) {
    const n = Number(ethers.formatEther(v || 0n));
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  function won(side, d1, d2, d3) {
    if (d1 === d2 && d2 === d3) return { ok: false, why: "triple" };
    const sum = d1 + d2 + d3;
    if (sum >= 9 && sum <= 12) return { ok: false, why: "mid" };
    if (side === 0) return { ok: sum >= 4 && sum <= 8, why: "miss" };
    return { ok: sum >= 13 && sum <= 17, why: "miss" };
  }
  function setFaces(a, b, c) {
    const dice = diceEls();
    [a, b, c].forEach((n, i) => {
      if (dice[i]) dice[i].dataset.face = String(n);
    });
  }
  function paintChips() {
    root()?.querySelectorAll(".sicbo-chip").forEach((el) => {
      el.classList.toggle("on", Number(el.dataset.lim) === stakeLim);
    });
  }
  function buildChips() {
    const row = $("sbChips");
    if (!row || row.children.length) return;
    for (let n = MIN_STAKE; n <= MAX_STAKE; n++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sicbo-chip" + (n === stakeLim ? " on" : "");
      btn.dataset.lim = String(n);
      btn.textContent = String(n);
      btn.onclick = () => {
        if (busy || pendingLock || phase !== "edit") return;
        stakeLim = n;
        paintChips();
      };
      row.appendChild(btn);
    }
  }
  function buildDice() {
    const row = $("sbDice");
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
      die.dataset.face = "5";
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
  function coverCup(on) {
    const cup = $("sbCup");
    if (!cup) return;
    cup.className = on ? "sicbo-cup cover" : "sicbo-cup idle";
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
    return account;
  }

  function syncAccount() {
    if (window.CatboxChain?.account) account = CatboxChain.account;
  }

  async function loadOpenBet() {
    if (!account) return pendingLock ? { open: true, lockBlock: pendingLock, side: pendingSide, amount: 0n } : null;
    const g = gameContract(await readProvider());
    const b = parseBet(await g.bets(account));
    if (!b.open) {
      pendingLock = 0;
      if (phase === "wait") {
        phase = "edit";
        coverCup(false);
        $("sbSmall")?.classList.remove("picked");
        $("sbBig")?.classList.remove("picked");
      }
      return null;
    }
    pendingLock = b.lockBlock;
    pendingSide = b.side;
    pendingStake = Math.max(MIN_STAKE, Math.min(MAX_STAKE, Number(ethers.formatEther(b.amount || 0n))));
    stakeLim = pendingStake || stakeLim;
    if (phase === "edit") phase = "wait";
    $("sbSmall")?.classList.toggle("picked", pendingSide === 0);
    $("sbBig")?.classList.toggle("picked", pendingSide === 1);
    coverCup(true);
    return b;
  }

  async function refreshStats() {
    if (spinning) return;
    syncAccount();
    let pool = 0n;
    let lim = 0n;
    try {
      const p = await readProvider();
      const g = gameContract(p);
      pool = await g.freePool();
      if (account) lim = await limContract(p).balanceOf(account);
      if (!busy && phase !== "result") await loadOpenBet();
      if (pendingLock && phase !== "result") {
        const n = Number(await p.getBlockNumber());
        const left = Math.max(0, pendingLock + 1 - n);
        setStatus(left ? t("wait", { n: left }) : t("waitReady"));
      }
    } catch (_) {}
    setTxt("sbWallet", t("bal", { lim: account ? fmtLim(lim) : "—", pool: fmtLim(pool) }));
    paintChips();
    paintPhase();
  }

  function hidePop() {
    $("sbPop")?.classList.add("hidden");
  }
  function resetRound() {
    phase = "edit";
    pendingLock = 0;
    hidePop();
    coverCup(false);
    setTxt("sbResult", "");
    $("sbResult")?.removeAttribute("data-hit");
    setTxt("sbTotal", "—");
    setStatus("");
    $("sbSmall")?.classList.remove("picked");
    $("sbBig")?.classList.remove("picked");
    paintPhase();
  }

  function showOutcome(side, d1, d2, d3, stake) {
    const sum = d1 + d2 + d3;
    setFaces(d1, d2, d3);
    setTxt("sbTotal", t("total", { n: sum }));
    const w = won(side, d1, d2, d3);
    const doubled = String(stake * 2);
    let line = t("lose");
    if (w.ok) line = t("win", { n: doubled });
    else if (w.why === "triple") line = t("loseTriple");
    else if (w.why === "mid") line = t("loseMid");
    setTxt("sbResult", line);
    $("sbResult")?.setAttribute("data-hit", w.ok ? "1" : "0");
    setStatus("");
    hidePop();
    phase = "result";
    pendingLock = 0;
    $("sbSmall")?.classList.toggle("picked", side === 0);
    $("sbBig")?.classList.toggle("picked", side === 1);
    paintPhase();
  }

  async function spinTo(d1, d2, d3) {
    const stage = $("sbStage");
    const cup = $("sbCup");
    const felt = $("sbFelt");
    spinning = true;
    hidePop();
    setTxt("sbTotal", "…");
    setTxt("sbResult", "");
    $("sbResult")?.removeAttribute("data-hit");
    setStatus(t("shaking"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFaces(d1, d2, d3);
      if (cup) cup.className = "sicbo-cup idle";
      spinning = false;
      return;
    }
    if (cup) cup.className = "sicbo-cup cover";
    await sleep(220);
    stage?.classList.add("shaking");
    felt?.classList.add("shaking");
    await sleep(900);
    stage?.classList.remove("shaking");
    felt?.classList.remove("shaking");
    setFaces(d1, d2, d3);
    diceEls().forEach((el) => {
      el.classList.remove("land");
      void el.offsetWidth;
      el.classList.add("land");
    });
    if (cup) cup.className = "sicbo-cup lift";
    await sleep(500);
    if (cup) cup.className = "sicbo-cup idle";
    diceEls().forEach((el) => el.classList.remove("land"));
    spinning = false;
  }

  function parseSettled(g, rec) {
    const logs = rec?.logs || [];
    for (const l of logs) {
      try {
        const ev = g.interface.parseLog(l);
        if (ev && (ev.name === "Settled" || ev.name === "Refunded")) return ev;
      } catch (_) {}
    }
    return null;
  }

  async function waitForLock(lockBlock) {
    coverCup(true);
    const p = await readProvider();
    for (let i = 0; i < 48; i++) {
      const n = Number(await p.getBlockNumber());
      const left = Math.max(0, lockBlock + 1 - n);
      if (n > lockBlock) {
        setStatus(t("waitReady"));
        return true;
      }
      setStatus(t("wait", { n: left }));
      paintPhase();
      await sleep(1500);
    }
    setStatus(t("waitReady"));
    return false;
  }

  async function openCup() {
    if (!pendingLock) {
      await loadOpenBet();
      if (!pendingLock) return;
    }
    if (!account) await connect();
    await ensureBsc();
    await waitForLock(pendingLock);
    setStatus(t("opening"));
    paintPhase();
    await sleep(350);
    const g = gameContract(await signer());
    const tx = await g.settle();
    const rec = await tx.wait();
    const ev = parseSettled(g, rec);
    if (ev?.name === "Refunded") {
      coverCup(false);
      phase = "result";
      pendingLock = 0;
      setTxt("sbTotal", "—");
      setTxt("sbResult", t("refund"));
      $("sbResult")?.setAttribute("data-hit", "0");
      setStatus("");
      hidePop();
      paintPhase();
    } else if (ev?.name === "Settled") {
      const d1 = Number(ev.args.d1);
      const d2 = Number(ev.args.d2);
      const d3 = Number(ev.args.d3);
      await spinTo(d1, d2, d3);
      showOutcome(Number(ev.args.side), d1, d2, d3, pendingStake || stakeLim);
    } else {
      setStatus(t("refund"));
      phase = "edit";
      pendingLock = 0;
      paintPhase();
    }
    await refreshStats();
  }

  async function liveBet(side) {
    syncAccount();
    if (!account) account = await connect();
    if (!account) throw new Error("NO_WALLET");
    await ensureBsc();
    const open = await loadOpenBet();
    if (open) {
      phase = "wait";
      coverCup(true);
      paintPhase();
      setStatus(t("resume"));
      toast(t("hasOpen"));
      return;
    }
    const s = await signer();
    const g = gameContract(s);
    const lim = limContract(s);
    const amount = UNIT * BigInt(stakeLim);
    const [free, bal] = await Promise.all([g.freePool(), lim.balanceOf(account)]);
    if (free < amount) {
      toast(t("noPool"));
      setStatus(t("noPool"));
      return;
    }
    if (bal < amount) {
      toast(t("needLim"));
      setStatus(t("needLim"));
      return;
    }
    const allow = await lim.allowance(account, sicboCfg().address);
    if (allow < amount) {
      setStatus(t("approve"));
      toast(t("approve"));
      const txA = await lim.approve(sicboCfg().address, ethers.MaxUint256);
      await txA.wait();
    }
    setStatus(t("paying", { n: stakeLim }));
    $("sbSmall")?.classList.toggle("picked", side === 0);
    $("sbBig")?.classList.toggle("picked", side === 1);
    coverCup(true);
    const tx = await g.placeBet(side, amount);
    await tx.wait();
    const b = parseBet(await g.bets(account));
    pendingLock = b.lockBlock;
    pendingSide = b.side;
    pendingStake = stakeLim;
    phase = "wait";
    paintPhase();
    setStatus(t("wait", { n: 2 }));
  }

  async function onSide(side) {
    if (busy || spinning) return;
    if (phase === "result") return;
    if (phase === "wait" || pendingLock) {
      toast(t("hasOpen"));
      setStatus(t("resume"));
      return;
    }
    hidePop();
    busy = true;
    paintPhase();
    try {
      await liveBet(side);
    } catch (e) {
      const msg = friendly(e);
      setStatus(msg);
      toast(msg);
      if (pendingLock) coverCup(true);
    } finally {
      busy = false;
      paintPhase();
      refreshStats().catch(() => {});
    }
  }

  async function onOpen() {
    if (busy || spinning) return;
    if (phase === "result") {
      resetRound();
      return;
    }
    busy = true;
    paintPhase();
    try {
      await openCup();
    } catch (e) {
      const msg = friendly(e);
      setStatus(msg);
      toast(msg);
    } finally {
      busy = false;
      paintPhase();
      refreshStats().catch(() => {});
    }
  }

  async function resumeIfOpen() {
    if (busy || spinning || phase === "result") return;
    syncAccount();
    if (!account) return;
    const b = await loadOpenBet();
    if (b) setStatus(t("resume"));
  }

  function bindUi() {
    $("sbSmall")?.addEventListener("click", () => onSide(0));
    $("sbBig")?.addEventListener("click", () => onSide(1));
    $("sbOpen")?.addEventListener("click", () => onOpen());
    $("sbPopOk")?.addEventListener("click", (e) => {
      e.stopPropagation();
      hidePop();
    });
    $("sbPop")?.addEventListener("click", (e) => {
      if (e.target === $("sbPop")) hidePop();
    });
    if (!dashMode() && $("walletBtn")) {
      $("walletBtn").onclick = async () => {
        try {
          $("walletBtn").textContent = lang === "zh" ? "连接中…" : "CONNECTING…";
          await connect();
          $("walletBtn").textContent = account ? account.slice(0, 6) + "…" + account.slice(-4) : t("needWallet");
          await refreshStats();
          resumeIfOpen().catch(() => {});
        } catch (e) {
          toast(friendly(e));
          $("walletBtn").textContent = lang === "zh" ? "连接钱包" : "CONNECT";
        }
      };
    }
  }

  function bootSicBo() {
    if (!$("sbFelt") || bootSicBo._on) return;
    bootSicBo._on = true;
    syncAccount();
    bindUi();
    buildChips();
    buildDice();
    setFaces(4, 5, 6);
    applyCopy();
    refreshStats().catch(() => {});
    window.addEventListener("catbox-wallet", () => {
      syncAccount();
      refreshStats().catch(() => {});
      resumeIfOpen().catch(() => {});
    });
    setInterval(() => {
      if (spinning || busy) return;
      refreshStats().catch(() => {});
    }, 2000);
  }

  window.bootSicBo = bootSicBo;
  window.refreshSicbo = () => {
    applyCopy();
    return refreshStats();
  };
  window.refreshSicboCopy = applyCopy;
  window.resumeSicbo = resumeIfOpen;
  bootSicBo();
})();
