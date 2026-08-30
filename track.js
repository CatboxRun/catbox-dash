/* global ethers, CATBOX_CHAIN, CATBOX_TRACK, CatboxChain */
(function () {
  const LIM_ADDR = "0x1D6430FDFC63ea481fE157017B47530663C96001";
  const UNIT = 10n ** 18n;
  const MIN_STAKE = 1;
  const MAX_STAKE = 5;
  const COLS = 5;
  const KIND = ["coin", "gap", "light", "pipe", "box"];
  const KIND_KEY = ["dailyCoin", "dailyGap", "dailyLight", "dailyPipe", "dailyBox"];
  const PIECE_SRC = [
    "./assets/coin.png?v=4",
    "./assets/piece-gap.png?v=1",
    "./assets/piece-light.png?v=1",
    "./assets/piece-pipe.png?v=1",
    "./assets/catbox.png?v=3",
  ];
  const LOCK_SRC = "./assets/lock-seal.png?v=1";
  const HIST = "catbox-track-hist-v1";
  const COPY = {
    zh: {
      kicker: "赛道揭图",
      lead: "摆好五格，点锁图。练手马上揭。带 LIM 等两个块，再点揭图。只计对位，上一局不带提示。",
      stake: "本局额度",
      practice: "练手",
      lock: "锁图",
      open: "揭图",
      next: "再来一局",
      opening: "揭图中，请在钱包确认…",
      flipping: "揭开…",
      wait: "已锁。再等 {n} 个块，再点揭图。",
      waitReady: "可以揭图了。点揭图，在钱包确认。",
      hist: "近局 · 不带进下一局",
      r1: "1–5 LIM 开一局。零注练手：不进池、不派奖。",
      r2: "对位 3 格 8 倍，4 格 40 倍，5 格 200 倍（不超过桌池一半）。0–2 格不派。",
      r3: "只认位置全对。块对位错，不派。",
      r4: "独立桌池。带 LIM 锁图后等两个块，再点揭图。未揭的注，回来还能继续。",
      r5: "不进日池、底池、邀请。不是门票。",
      r6: "桌池每周按比例销毁。未揭的注不烧。",
      win: "对位 {h} 格。{n} LIM 已到钱包。",
      lose: "未到派奖线。本金留在桌池。",
      practiceWin: "练手对位 {h} 格。不派 LIM。",
      practiceLose: "练手未到派奖线。不进池。",
      needWallet: "请先连接钱包。",
      needBsc: "请切换到 BSC。",
      noPool: "桌池不够覆盖这一局，稍后再开。",
      noTable: "真图桌还没上线。现在只开放练手，不进池。",
      needLim: "钱包 LIM 不够这一局。",
      paying: "锁图 {n} LIM，请在钱包确认…",
      approve: "请先授权 LIM。",
      refund: "超时，本金已退回。",
      bal: "LIM {lim} · 桌池 {pool}",
      filling: "请摆满五格再锁。",
      locked: "已锁。等待揭图。",
      rejected: "已取消。未揭的注点「揭图」继续。",
      hasOpen: "这一局还没揭。请点揭图。",
      paused: "桌子暂停中。",
      resume: "你有一局尚未揭图。",
      guess: "你的五格",
      truth: "真图",
      pay3: "对位 3",
      pay4: "对位 4",
      pay5: "对位 5",
      ok: "好",
    },
    en: {
      kicker: "REVEAL",
      lead: "Set five, then lock. Practice opens at once. With LIM, wait two blocks and tap REVEAL. Exact place only — no carry-over hints.",
      stake: "STAKE",
      practice: "PRACTICE",
      lock: "LOCK",
      open: "REVEAL",
      next: "NEXT",
      opening: "Revealing — confirm in wallet…",
      flipping: "Opening…",
      wait: "Locked. {n} blocks, then tap REVEAL.",
      waitReady: "Ready. Tap REVEAL and confirm in the wallet.",
      hist: "Recent · not used next round",
      r1: "1–5 LIM per round. Zero is practice — no pool, no payout.",
      r2: "3 exact 8× · 4 exact 40× · 5 exact 200× (capped at half the table). 0–2 pay nothing.",
      r3: "Exact place only. Right piece, wrong place does not pay.",
      r4: "Own table pool. With LIM, wait two blocks, then tap REVEAL. An open round can be finished later.",
      r5: "Not the daily pool, floor, or invite. Not a ticket.",
      r6: "The table pool is burned in proportion each week. Open rounds are not burned.",
      win: "{h} exact. {n} LIM is in the wallet.",
      lose: "Below the pay line. Stake stays in the table.",
      practiceWin: "Practice: {h} exact. No LIM.",
      practiceLose: "Practice: below the pay line. No pool.",
      needWallet: "Connect wallet first.",
      needBsc: "Switch to BSC.",
      noPool: "The table cannot cover this round. Try later.",
      noTable: "The reveal table is not live. Practice only — no pool.",
      needLim: "Not enough LIM for this round.",
      paying: "Locking {n} LIM — confirm in wallet…",
      approve: "Approve LIM in wallet…",
      refund: "Timed out. Stake returned.",
      bal: "LIM {lim} · TABLE {pool}",
      filling: "Fill five cells first.",
      locked: "Locked. Wait to reveal.",
      rejected: "Cancelled. Tap REVEAL if a round is still waiting.",
      hasOpen: "This round is still open. Reveal it.",
      paused: "Table is paused.",
      resume: "You have an open round.",
      guess: "YOUR FIVE",
      truth: "THE TRACK",
      pay3: "3 EXACT",
      pay4: "4 EXACT",
      pay5: "5 EXACT",
      ok: "OK",
    },
  };

  const root = () => document.getElementById("trRoot");
  const $ = (id) => document.getElementById(id);

  let lang = "zh";
  let account = null;
  let busy = false;
  let stakeLim = 0;
  let draft = [];
  let pendingLock = 0;
  let pendingGuess = 0;
  let pendingStake = 0;
  let liveOk = false;
  let phase = "edit";
  let shownTrack = null;

  function dashMode() {
    return Boolean(window.CatboxChain && $("lobby") && $("trRoot"));
  }
  function syncLang() {
    lang = document.body.dataset.lang === "zh" ? "zh" : "en";
  }
  const tt = (k, vars = {}) => {
    if (typeof t === "function" && (k.startsWith("daily") || k === "playTag")) return t(k, vars);
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
    setTxt("trStatus", msg || "");
  }
  function toast(msg) {
    if (typeof showToast === "function") showToast(msg);
    else {
      const el = $("toast");
      if (!el || !msg) return;
      el.textContent = msg;
      el.classList.remove("hidden");
      clearTimeout(toast._t);
      toast._t = setTimeout(() => el.classList.add("hidden"), 2800);
    }
  }
  function cfg() {
    return window.CATBOX_CHAIN || {};
  }
  function trackCfg() {
    return window.CATBOX_TRACK || {};
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
    const c = trackCfg();
    if (!c.address || !c.abi) throw new Error("NO_TRACK");
    return new ethers.Contract(c.address, c.abi, s);
  }
  function pack(cells) {
    return cells[0] + 5 * cells[1] + 25 * cells[2] + 125 * cells[3] + 625 * cells[4];
  }
  function unpack(n) {
    const c = [];
    let x = Number(n) || 0;
    for (let i = 0; i < COLS; i++) {
      c.push(x % 5);
      x = Math.floor(x / 5);
    }
    return c;
  }
  function hitsOf(guess, track) {
    const a = unpack(guess);
    const b = unpack(track);
    let n = 0;
    for (let i = 0; i < COLS; i++) if (a[i] === b[i]) n++;
    return n;
  }
  function icoHtml(kind) {
    const src = PIECE_SRC[kind];
    if (!src) return "";
    const extra = kind === 4 ? " dy-ico-box" : "";
    return `<img class="dy-ico${extra}" src="${src}" alt="">`;
  }
  function cellHtml(kind, mark) {
    const filled = kind !== undefined && kind !== null;
    return `<div class="dy-cell${filled ? " has" : ""}${mark ? " mark-" + mark : ""}">${filled ? icoHtml(kind) : ""}</div>`;
  }
  function parseBet(b) {
    return {
      guess: Number(b.guess ?? b[0] ?? 0),
      lockBlock: Number(b.lockBlock ?? b[1] ?? 0),
      open: Boolean(b.open ?? b[2]),
      amount: b.amount ?? b[3] ?? 0n,
    };
  }
  function fmtLim(v) {
    const n = Number(ethers.formatEther(v || 0n));
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  function loadHist() {
    try {
      return JSON.parse(localStorage.getItem(HIST) || "[]");
    } catch (_) {
      return [];
    }
  }
  function saveHist(row) {
    const all = [row, ...loadHist()].slice(0, 8);
    try {
      localStorage.setItem(HIST, JSON.stringify(all));
    } catch (_) {}
    paintHist();
  }
  function paintGuess() {
    const row = $("trGuess");
    if (!row) return;
    const cells = phase === "edit" ? draft : unpack(pendingGuess);
    const truth = phase === "result" && shownTrack != null ? unpack(shownTrack) : null;
    let html = "";
    for (let i = 0; i < COLS; i++) {
      const mark = truth ? (cells[i] === truth[i] ? "hit" : "miss") : "";
      html += cellHtml(cells[i], mark);
    }
    row.innerHTML = html;
  }
  function paintKeys() {
    const wrap = $("trKeys");
    if (!wrap) return;
    wrap.innerHTML = KIND.map(
      (name, i) =>
        `<button type="button" class="dy-key" data-kind="${i}" aria-label="${tt(KIND_KEY[i])}">${icoHtml(i)}<span>${tt(KIND_KEY[i])}</span></button>`,
    ).join("");
  }
  function paintHist() {
    const wrap = $("trHist");
    const label = $("trHistLabel");
    if (!wrap) return;
    const rows = loadHist();
    if (label) {
      label.textContent = tt("hist");
      label.classList.toggle("hidden", !rows.length);
    }
    if (!rows.length) {
      wrap.innerHTML = "";
      return;
    }
    wrap.innerHTML = rows
      .map((r) => {
        const g = unpack(r.guess);
        const tr = unpack(r.track);
        const cells = g
          .map((k, i) => cellHtml(tr[i], g[i] === tr[i] ? "hit" : "miss"))
          .join("");
        return `<div class="track-hist-row">${cells}</div>`;
      })
      .join("");
  }
  function paintChips() {
    const wrap = root()?.querySelector(".track-chips");
    wrap?.classList.toggle("practice-only", !liveOk);
    wrap?.querySelectorAll(".track-chip").forEach((el) => {
      el.classList.toggle("on", Number(el.dataset.lim) === stakeLim);
    });
  }
  function paintLiveHint() {
    if (busy || pendingLock || phase !== "edit") return;
    if (!liveOk) {
      setStatus(tt("noTable"));
      return;
    }
    const cur = ($("trStatus")?.textContent || "").trim();
    if (!cur || cur === COPY.zh.noTable || cur === COPY.en.noTable) setStatus("");
  }
  function paintPhase() {
    const el = root();
    if (!el) return;
    el.classList.toggle("is-wait", phase === "wait");
    el.classList.toggle("is-result", phase === "result");
  }
  function paintGo() {
    const waiting = phase === "wait" || pendingLock > 0;
    const label = phase === "result" ? "next" : waiting ? (busy ? "opening" : "open") : "lock";
    setTxt("trGo", tt(label));
    $("trDel")?.toggleAttribute("disabled", phase !== "edit" || busy);
    paintPhase();
  }
  function applyCopy() {
    syncLang();
    setTxt("trKicker", tt("kicker"));
    setTxt("trLead", tt("lead"));
    setTxt("trStake", tt("stake"));
    setTxt("trGuessLabel", tt("guess"));
    setTxt("trTruthLabel", tt("truth"));
    setTxt("trR1", tt("r1"));
    setTxt("trR2", tt("r2"));
    setTxt("trR3", tt("r3"));
    setTxt("trR4", tt("r4"));
    setTxt("trR5", tt("r5"));
    setTxt("trR6", tt("r6"));
    setTxt("trPay3k", tt("pay3"));
    setTxt("trPay4k", tt("pay4"));
    setTxt("trPay5k", tt("pay5"));
    setTxt("trHistLabel", tt("hist"));
    setTxt("trDel", typeof t === "function" ? t("dailyDel") : lang === "zh" ? "删除" : "DEL");
    paintKeys();
    paintChips();
    const z = root()?.querySelector('.track-chip[data-lim="0"]');
    if (z) z.textContent = tt("practice");
    paintGo();
    paintLiveHint();
  }
  function friendly(e) {
    const code = e?.code;
    const raw = String(e?.shortMessage || e?.reason || e?.message || e || "");
    const low = raw.toLowerCase();
    if (code === 4001 || code === "ACTION_REJECTED" || /reject|denied|user denied/.test(low)) return tt("rejected");
    if (/paused/.test(low)) return tt("paused");
    if (/\bopen\b/.test(low)) return tt("hasOpen");
    if (/\bwait\b/.test(low)) return tt("waitReady");
    if (/\bpool\b/.test(low)) return tt("noPool");
    if (/insufficient|transfer amount exceeds|exceeds balance/.test(low)) return tt("needLim");
    if (/no_wallet|ethereum/.test(low)) return tt("needWallet");
    if (/bsc|chain/.test(low) && /switch|4902/.test(low)) return tt("needBsc");
    return raw.slice(0, 120);
  }
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function hidePop() {
    $("trPop")?.classList.add("hidden");
  }
  function paintTruth(mode, guess) {
    const row = $("trTruth");
    if (!row) return;
    if (mode === "empty") {
      row.classList.remove("is-sealed");
      row.innerHTML = Array.from({ length: COLS }, () => cellHtml()).join("");
      return;
    }
    if (mode === "sealed" || mode == null) {
      row.classList.add("is-sealed");
      row.innerHTML = Array.from(
        { length: COLS },
        () => `<div class="dy-cell sealed"><img class="dy-ico" src="${LOCK_SRC}" alt=""></div>`,
      ).join("");
      return;
    }
    row.classList.remove("is-sealed");
    const g = unpack(guess);
    const tr = unpack(mode);
    row.innerHTML = tr.map((k, i) => cellHtml(k, g[i] === k ? "hit" : "miss")).join("");
  }
  function showResult(hits, line, track, guess) {
    phase = "result";
    pendingLock = 0;
    pendingGuess = guess;
    shownTrack = track === "empty" ? null : track;
    paintGuess();
    paintTruth(track, guess);
    setStatus(hits == null ? line : `${hits}/5 · ${line}`);
    $("trStatus")?.setAttribute("data-hit", hits != null && hits >= 3 ? "1" : "0");
    paintGo();
    hidePop();
  }
  function resetRound() {
    phase = "edit";
    pendingLock = 0;
    pendingGuess = 0;
    shownTrack = null;
    draft = [];
    $("trStatus")?.removeAttribute("data-hit");
    setStatus("");
    paintGuess();
    paintTruth("empty");
    paintGo();
    paintLiveHint();
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

  async function checkLive() {
    try {
      const p = await readProvider();
      const code = await p.getCode(trackCfg().address || "0x");
      liveOk = Boolean(code && code !== "0x");
    } catch (_) {
      liveOk = false;
    }
    return liveOk;
  }

  async function loadOpenBet() {
    if (!account || !liveOk) {
      if (phase === "wait") pendingLock = 0;
      return null;
    }
    const g = gameContract(await readProvider());
    const b = parseBet(await g.bets(account));
    if (!b.open) {
      pendingLock = 0;
      return null;
    }
    pendingLock = b.lockBlock;
    pendingGuess = b.guess;
    pendingStake = Math.max(MIN_STAKE, Math.min(MAX_STAKE, Number(ethers.formatEther(b.amount || 0n))));
    stakeLim = pendingStake || stakeLim;
    draft = unpack(pendingGuess);
    if (phase === "edit") phase = "wait";
    paintGuess();
    paintTruth("sealed");
    paintChips();
    paintGo();
    return b;
  }

  async function refreshStats() {
    syncAccount();
    let pool = 0n;
    let lim = 0n;
    await checkLive();
    try {
      if (liveOk) {
        const p = await readProvider();
        const g = gameContract(p);
        pool = await g.freePool();
        if (account) lim = await limContract(p).balanceOf(account);
        if (!busy) await loadOpenBet();
      }
    } catch (_) {}
    setTxt("trWallet", tt("bal", { lim: account ? fmtLim(lim) : "—", pool: liveOk ? fmtLim(pool) : "—" }));
    if (pendingLock && phase !== "result" && liveOk) {
      try {
        const n = Number(await (await readProvider()).getBlockNumber());
        const left = Math.max(0, pendingLock + 1 - n);
        setStatus(left ? tt("wait", { n: left }) : tt("waitReady"));
      } catch (_) {}
    } else {
      paintLiveHint();
    }
    paintGo();
  }

  function tapKind(i) {
    if (busy || phase !== "edit") return;
    if (draft.length >= COLS) return;
    draft.push(i);
    paintGuess();
  }
  function del() {
    if (busy || phase !== "edit") return;
    draft.pop();
    paintGuess();
  }

  function practiceTrack() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % 3125;
  }

  async function runPractice() {
    if (draft.length !== COLS) {
      $("trGuess")?.classList.remove("shake");
      void $("trGuess")?.offsetWidth;
      $("trGuess")?.classList.add("shake");
      setStatus(tt("filling"));
      return;
    }
    pendingGuess = pack(draft);
    phase = "wait";
    paintGuess();
    paintTruth("sealed");
    paintGo();
    setStatus(tt("flipping"));
    await sleep(420);
    const track = practiceTrack();
    const h = hitsOf(pendingGuess, track);
    saveHist({ guess: pendingGuess, track, hits: h, practice: 1 });
    const line = h >= 3 ? tt("practiceWin", { h }) : tt("practiceLose");
    showResult(h, line, track, pendingGuess);
  }

  async function waitForLock(lockBlock) {
    const p = await readProvider();
    for (let i = 0; i < 48; i++) {
      const n = Number(await p.getBlockNumber());
      const left = Math.max(0, lockBlock + 1 - n);
      if (n > lockBlock) {
        setStatus(tt("waitReady"));
        return true;
      }
      setStatus(tt("wait", { n: left }));
      paintGo();
      await sleep(1500);
    }
    setStatus(tt("waitReady"));
    return false;
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

  async function openRound() {
    if (!pendingLock) {
      await loadOpenBet();
      if (!pendingLock) return;
    }
    if (!account) await connect();
    await ensureBsc();
    await waitForLock(pendingLock);
    setStatus(tt("opening"));
    paintGo();
    const g = gameContract(await signer());
    const tx = await g.settle();
    const rec = await tx.wait();
    const ev = parseSettled(g, rec);
    const guess = pendingGuess;
    if (ev?.name === "Refunded") {
      showResult(null, tt("refund"), "empty", guess);
    } else if (ev?.name === "Settled") {
      const trackN = Number(ev.args.track);
      const h = Number(ev.args.hits);
      const pay = Number(ethers.formatEther(ev.args.payout || 0n));
      saveHist({ guess, track: trackN, hits: h, practice: 0 });
      const line = h >= 3 ? tt("win", { h, n: String(pay) }) : tt("lose");
      showResult(h, line, trackN, guess);
    } else {
      setStatus(tt("refund"));
      phase = "edit";
      pendingLock = 0;
      paintGo();
    }
    await refreshStats();
  }

  async function liveBet() {
    if (draft.length !== COLS) {
      $("trGuess")?.classList.remove("shake");
      void $("trGuess")?.offsetWidth;
      $("trGuess")?.classList.add("shake");
      setStatus(tt("filling"));
      return;
    }
    syncAccount();
    if (!account) account = await connect();
    if (!account) throw new Error("NO_WALLET");
    await ensureBsc();
    await checkLive();
    if (!liveOk) {
      toast(tt("noTable"));
      setStatus(tt("noTable"));
      return;
    }
    const open = await loadOpenBet();
    if (open) {
      phase = "wait";
      paintTruth("sealed");
      paintGuess();
      paintGo();
      setStatus(tt("resume"));
      toast(tt("hasOpen"));
      return;
    }
    const s = await signer();
    const g = gameContract(s);
    const lim = limContract(s);
    const amount = UNIT * BigInt(stakeLim);
    const cover = amount * 7n;
    const [free, bal] = await Promise.all([g.freePool(), lim.balanceOf(account)]);
    if (free < cover) {
      toast(tt("noPool"));
      setStatus(tt("noPool"));
      return;
    }
    if (bal < amount) {
      toast(tt("needLim"));
      setStatus(tt("needLim"));
      return;
    }
    const allow = await lim.allowance(account, trackCfg().address);
    if (allow < amount) {
      setStatus(tt("approve"));
      toast(tt("approve"));
      const txA = await lim.approve(trackCfg().address, ethers.MaxUint256);
      await txA.wait();
    }
    const guess = pack(draft);
    setStatus(tt("paying", { n: stakeLim }));
    const tx = await g.placeBet(guess, amount);
    await tx.wait();
    const b = parseBet(await g.bets(account));
    pendingLock = b.lockBlock;
    pendingGuess = b.guess;
    pendingStake = stakeLim;
    phase = "wait";
    paintGuess();
    paintTruth("sealed");
    paintGo();
    setStatus(tt("wait", { n: 2 }));
  }

  async function onGo() {
    if (busy) return;
    if (phase === "result") {
      resetRound();
      return;
    }
    busy = true;
    paintGo();
    try {
      if (pendingLock || phase === "wait") await openRound();
      else if (stakeLim === 0) await runPractice();
      else await liveBet();
    } catch (e) {
      const msg = friendly(e);
      setStatus(msg);
      toast(msg);
    } finally {
      busy = false;
      paintGo();
      refreshStats().catch(() => {});
    }
  }

  async function resumeIfOpen() {
    if (busy || phase === "result") return;
    syncAccount();
    if (!account) return;
    await checkLive();
    const b = await loadOpenBet();
    if (b) setStatus(tt("resume"));
  }

  function bindUi() {
    const rootEl = root();
    if (!rootEl || rootEl.dataset.bound) return;
    rootEl.dataset.bound = "1";
    rootEl.addEventListener("click", (e) => {
      const key = e.target.closest("[data-kind]");
      if (key && key.closest("#trKeys")) {
        tapKind(Number(key.dataset.kind));
        return;
      }
      const chip = e.target.closest(".track-chip");
      if (chip && phase === "edit" && !busy) {
        const n = Number(chip.dataset.lim);
        if (!liveOk && n > 0) {
          stakeLim = 0;
          paintChips();
          setStatus(tt("noTable"));
          return;
        }
        stakeLim = n;
        paintChips();
        if (!pendingLock) setStatus(liveOk ? "" : tt("noTable"));
        return;
      }
      if (e.target.closest("#trDel")) {
        del();
        return;
      }
      if (e.target.closest("#trGo")) {
        onGo();
        return;
      }
      if (e.target.closest("#trPopOk") || e.target.id === "trPop") hidePop();
    });
  }

  function bootTrack() {
    if (!root() || bootTrack._on) return;
    bootTrack._on = true;
    syncAccount();
    bindUi();
    paintGuess();
    paintTruth("empty");
    paintHist();
    applyCopy();
    paintLiveHint();
    refreshStats().catch(() => {});
    window.addEventListener("catbox-wallet", () => {
      syncAccount();
      refreshStats().catch(() => {});
      resumeIfOpen().catch(() => {});
    });
    setInterval(() => {
      if (busy) return;
      refreshStats().catch(() => {});
    }, 2000);
  }

  window.bootTrack = bootTrack;
  window.refreshTrack = () => {
    applyCopy();
    return refreshStats();
  };
  window.refreshTrackCopy = applyCopy;
  bootTrack();
})();
