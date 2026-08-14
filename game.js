const TIERS = [
  { id: 0, name: "SCOUT", cost: 10, mult: 1, speed: 3.6, speedMax: 5.6, peakAt: 90 },
  { id: 1, name: "RUNNER", cost: 10, mult: 1.5, speed: 3.8, speedMax: 6.6, peakAt: 75 },
  { id: 2, name: "PHANTOM", cost: 10, mult: 2, speed: 4.0, speedMax: 7.6, peakAt: 60 },
  { id: 3, name: "VAULT", cost: 10, mult: 3, speed: 4.2, speedMax: 8.4, peakAt: 50 },
];

function playerTag() {
  const acc = window.CatboxChain?.account;
  if (acc) return CatboxChain.short(acc);
  let tag = localStorage.getItem("catbox-tag");
  if (!tag) {
    tag = `CAT-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
    localStorage.setItem("catbox-tag", tag);
  }
  return tag;
}

function loadBoard() {
  try {
    const raw = JSON.parse(localStorage.getItem("catbox-board") || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}

function postBoard(score, tierId) {
  const tag = playerTag();
  const prev = loadBoard();
  const others = prev.filter((r) => !r.you);
  const mine = prev.find((r) => r.you);
  const keep = mine && mine.score > score ? mine : { tag, score, tier: tierId, you: true };
  const rows = [...others, keep].sort((a, b) => b.score - a.score).slice(0, 8);
  localStorage.setItem("catbox-board", JSON.stringify(rows));
  return rows.findIndex((r) => r.you) + 1;
}

function loadInviteBoard() {
  try {
    const raw = JSON.parse(localStorage.getItem("catbox-invite") || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}

function renderList(id, rows, emptyKey) {
  const el = $(id);
  if (!el) return;
  if (!rows || !rows.length) {
    el.innerHTML = `<li class="empty">${t(emptyKey || "emptyBoard")}</li>`;
    return;
  }
  el.innerHTML = rows
    .slice(0, 6)
    .map((r, i) => {
      const name = r.you ? `${r.tag} · ${t("you")}` : r.tag;
      const val = r.score != null ? r.score : r.pts;
      return `<li class="${r.you ? "you" : ""}"><span class="tag">${i + 1}. ${name}</span><span>${val}</span></li>`;
    })
    .join("");
}

function renderBurns(rows) {
  const el = $("burnList");
  if (!el) return;
  if (!rows || !rows.length) {
    el.innerHTML = `<li class="empty">${t("emptyBurn")}</li>`;
    return;
  }
  el.innerHTML = rows
    .slice(0, 6)
    .map((r) => {
      const amt = window.CatboxChain ? CatboxChain.formatLim(r.amount) : r.amount;
      const href = CatboxChain.txUrl(r.hash);
      const shortHash = `${r.hash.slice(0, 10)}…${r.hash.slice(-6)}`;
      return `<li><span class="tag">${r.tag} · ${amt} LIM</span><a href="${href}" target="_blank" rel="noopener">${shortHash}</a></li>`;
    })
    .join("");
}

function renderBoards() {
  if (window._liveBoards) {
    renderList("weekList", window._liveBoards.week);
    renderList("inviteList", window._liveBoards.invite);
  } else {
    renderList("weekList", loadBoard());
    renderList("inviteList", loadInviteBoard());
  }
  renderBurns(window._liveBurns || []);
  syncOnchainPool();
  refreshInviteUi();
}

async function pullLiveBoards() {
  if (!window.CatboxChain) return;
  try {
    if (!(await CatboxChain.isDeployed())) return;
    const [boards, burns] = await Promise.all([
      CatboxChain.fetchLeaderboards(),
      CatboxChain.fetchBurns(),
    ]);
    window._liveBoards = boards;
    window._liveBurns = burns;
    renderList("weekList", boards.week);
    renderList("inviteList", boards.invite);
    renderBurns(burns);
  } catch (_) {}
}

async function syncOnchainPool() {
  if (!window.CatboxChain) return;
  try {
    const deployed = await CatboxChain.isDeployed();
    if (!deployed) {
      if ($("weekPoolAmt")) $("weekPoolAmt").textContent = "—";
      if ($("invitePoolAmt")) $("invitePoolAmt").textContent = "—";
      if ($("burnedAmt")) $("burnedAmt").textContent = "—";
      return;
    }
    const pool = await CatboxChain.poolBalance();
    if ($("weekPoolAmt")) $("weekPoolAmt").textContent = `${CatboxChain.formatLim(pool.week)} LIM`;
    if ($("invitePoolAmt")) $("invitePoolAmt").textContent = `${CatboxChain.formatLim(pool.invite)} LIM`;
    if ($("burnedAmt")) $("burnedAmt").textContent = `${CatboxChain.formatLim(pool.burned)} LIM`;
    const price = await CatboxChain.ticketPrice();
    const n = Number(ethers.formatUnits(price, 18));
    if (n > 0) TIERS.forEach((tier) => { tier.cost = n; });
  } catch (_) {}
}

let chainReady = false;

async function refreshWalletUi() {
  const btn = $("walletBtn");
  const bal = $("limBal");
  const banner = $("chainBanner");
  const admin = $("admin");
  const link = $("contractLink");
  if (link && window.CatboxChain) {
    link.href = CatboxChain.addrUrl(CatboxChain.cfg.address);
    link.textContent = t("onBsc");
  }
  const dead = $("deadLink");
  if (dead && window.CatboxChain?.cfg?.dead) {
    dead.href = CatboxChain.addrUrl(CatboxChain.cfg.dead);
    dead.textContent = CatboxChain.short(CatboxChain.cfg.dead);
  }
  if (!btn) return;
  if (!window.ethereum) {
    btn.textContent = t("connect");
    if (bal) bal.textContent = t("noWallet");
    return;
  }
  const acc = CatboxChain.account;
  btn.textContent = acc ? CatboxChain.short(acc) : t("connect");
  if (bal) {
    if (!acc) bal.textContent = "LIM —";
    else {
      try {
        const v = await CatboxChain.limBalance(acc);
        bal.textContent = `${CatboxChain.formatLim(v)} LIM`;
      } catch (_) {
        bal.textContent = "LIM —";
      }
    }
  }
  if (admin) admin.classList.toggle("hidden", !(acc && CatboxChain.isOwner() && chainReady));
  if (!banner) return;
  try {
    const deployed = await CatboxChain.isDeployed();
    chainReady = deployed;
    if (!deployed) {
      banner.classList.remove("hidden");
      banner.innerHTML = `<div>${t("deployNeed")}</div><button class="primary" id="deployBtn" type="button">${t("deployBtn")}</button>`;
      $("deployBtn").onclick = deployContract;
    } else {
      banner.classList.add("hidden");
      banner.innerHTML = "";
    }
    if (admin) admin.classList.toggle("hidden", !(acc && CatboxChain.isOwner() && deployed));
  } catch (_) {}
  refreshInviteUi();
  refreshClaimUi();
}

async function refreshClaimUi() {
  const amt = $("claimAmt");
  const btn = $("claimBtn");
  const acc = window.CatboxChain?.account;
  if (!acc || !chainReady) {
    if (amt) amt.textContent = t("claimNone");
    if (btn) btn.disabled = true;
    return;
  }
  try {
    const p = await CatboxChain.pendingOf(acc);
    const text = `${CatboxChain.formatLim(p.total)} LIM`;
    if (amt) amt.textContent = p.total > 0n ? `${t("claimPending")} ${text}` : t("claimNone");
    if (btn) btn.disabled = p.total === 0n;
  } catch (_) {
    if (amt) amt.textContent = t("claimNone");
    if (btn) btn.disabled = true;
  }
}

async function doClaim() {
  const btn = $("claimBtn");
  const amt = $("claimAmt");
  try {
    if (btn) btn.disabled = true;
    if (amt) amt.textContent = t("claiming");
    const hash = await CatboxChain.claim();
    if (amt) {
      amt.innerHTML = `<a href="${CatboxChain.txUrl(hash)}" target="_blank" rel="noopener">${hash.slice(0, 10)}…</a>`;
    }
    await refreshWalletUi();
    await refreshClaimUi();
    await syncOnchainPool();
  } catch (e) {
    if (amt) amt.textContent = e?.shortMessage?.includes("none") || e?.message?.includes("none") ? t("claimNone") : t("txFail");
    if (btn) btn.disabled = false;
  }
}

async function refreshInviteUi() {
  const link = $("inviteLink");
  const ptsEl = $("myInvitePts");
  const acc = window.CatboxChain?.account;
  if (link) {
    if (acc) {
      const u = new URL(location.href.split("#")[0]);
      u.searchParams.set("ref", acc);
      link.value = u.toString();
    } else {
      link.value = t("connectFirst");
    }
  }
  if (!ptsEl) return;
  if (!acc || !window.CatboxChain || !chainReady) {
    ptsEl.textContent = "0";
    return;
  }
  try {
    const pts = await CatboxChain.invitePoints(acc);
    ptsEl.textContent = String(pts);
  } catch (_) {}
}

let quoteTimer = 0;

function bootSwap() {
  const modal = $("swapModal");
  if (!modal || !$("swapBtn")) return;
  $("swapBtn").onclick = () => {
    modal.classList.remove("hidden");
    refreshSwap();
  };
  $("swapClose").onclick = () => modal.classList.add("hidden");
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
  $("swapFrom").onchange = refreshSwap;
  $("swapAmt").oninput = () => {
    clearTimeout(quoteTimer);
    quoteTimer = setTimeout(refreshSwap, 280);
  };
  $("swapGo").onclick = doSwap;
}

async function refreshSwap() {
  const modal = $("swapModal");
  if (!modal || modal.classList.contains("hidden")) return;
  const from = $("swapFrom").value;
  const raw = $("swapAmt").value;
  const status = $("swapStatus");
  try {
    if (CatboxChain.account) {
      const bal = await CatboxChain.tokenBalance(from);
      $("swapBal").textContent = `${Number(ethers.formatUnits(bal, 18)).toFixed(4)} ${from}`;
    } else {
      $("swapBal").textContent = t("connectFirst");
    }
    if (!raw || Number(raw) <= 0) {
      $("swapOut").value = "0";
      return;
    }
    const q = await CatboxChain.quoteLim(from, ethers.parseUnits(String(raw), 18));
    if (!q.path || q.out === 0n) {
      $("swapOut").value = "0";
      status.textContent = t("swapNoLiq");
      return;
    }
    status.textContent = "";
    $("swapOut").value = CatboxChain.formatLim(q.out);
  } catch (_) {
    $("swapOut").value = "0";
    if (status) status.textContent = t("swapNoLiq");
  }
}

async function doSwap() {
  const status = $("swapStatus");
  const raw = $("swapAmt").value;
  if (!raw || Number(raw) <= 0) return;
  try {
    status.textContent = t("swapping");
    const hash = await CatboxChain.swapToLim($("swapFrom").value, ethers.parseUnits(String(raw), 18));
    status.innerHTML = `<a href="${CatboxChain.txUrl(hash)}" target="_blank" rel="noopener">${hash.slice(0, 10)}…</a>`;
    await refreshWalletUi();
    await refreshSwap();
  } catch (e) {
    status.textContent = e?.message === "NO_LIQ" ? t("swapNoLiq") : t("txFail");
  }
}

function startLiveClock() {
  setInterval(() => {
    if (document.body.classList.contains("playing")) return;
    liveRefresh();
  }, 6000);
  liveRefresh();
}

async function liveRefresh() {
  await syncOnchainPool();
  await refreshInviteUi();
  await refreshClaimUi();
  await pullLiveBoards();
  if ($("swapModal") && !$("swapModal").classList.contains("hidden")) await refreshSwap();
  const acc = window.CatboxChain?.account;
  if (acc && $("limBal")) {
    try {
      const v = await CatboxChain.limBalance(acc);
      $("limBal").textContent = `${CatboxChain.formatLim(v)} LIM`;
    } catch (_) {}
  }
}

async function deployContract() {
  const banner = $("chainBanner");
  try {
    if (banner) banner.innerHTML = `<div>${t("deploying")}</div>`;
    const hash = await CatboxChain.deploy();
    banner.innerHTML = `<div>OK · <a href="${CatboxChain.txUrl(hash)}" target="_blank" rel="noopener">${hash.slice(0, 10)}…</a></div>`;
    chainReady = true;
    await refreshWalletUi();
    await syncOnchainPool();
  } catch (e) {
    banner.innerHTML = `<div>${t("txFail")}</div><button class="primary" id="deployBtn" type="button">${t("deployBtn")}</button>`;
    $("deployBtn").onclick = deployContract;
  }
}

async function bootWallet() {
  if (!window.CatboxChain) return;
  $("walletBtn").onclick = async () => {
    try {
      $("walletBtn").textContent = t("connecting");
      await CatboxChain.connect();
      await refreshWalletUi();
    } catch (e) {
      $("walletBtn").textContent = e.message === "NO_WALLET" ? t("noWallet") : t("connect");
    }
  };
  window.addEventListener("catbox-wallet", () => refreshWalletUi());
  if (window.ethereum) {
    try {
      const accs = await window.ethereum.request({ method: "eth_accounts" });
      if (accs[0]) await CatboxChain.connect();
    } catch (_) {}
  }
  await refreshWalletUi();
  $("withdrawBtn").onclick = async () => {
    try {
      const pool = await CatboxChain.poolBalance();
      if (pool.total === 0n) return;
      await CatboxChain.withdrawWeekly(pool.total);
      await syncOnchainPool();
    } catch (_) {
      alert(t("txFail"));
    }
  };
  $("setTicketBtn").onclick = async () => {
    try {
      const n = Number($("ticketInput").value);
      if (!n || n <= 0) return;
      await CatboxChain.setTicketPrice(n);
      await syncOnchainPool();
      renderTickets();
    } catch (_) {
      alert(t("txFail"));
    }
  };
  $("copyInvite").onclick = async () => {
    const acc = CatboxChain.account;
    if (!acc) {
      try { await CatboxChain.connect(); } catch (_) { return; }
    }
    refreshInviteUi();
    const val = $("inviteLink")?.value;
    if (!val || val === t("connectFirst")) return;
    try {
      await navigator.clipboard.writeText(val);
      $("copyInvite").textContent = t("copied");
      setTimeout(() => { $("copyInvite").textContent = t("copyInvite"); }, 1200);
    } catch (_) {}
  };
  bootSwap();
  $("claimBtn") && ($("claimBtn").onclick = doClaim);
  startLiveClock();
  try { CatboxChain.referrer(); } catch (_) {}
}

const $ = (id) => document.getElementById(id);
const lobby = $("lobby");
const pay = $("pay");
const game = $("game");
const over = $("over");
const canvas = $("cv");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const imgCoin = new Image();
imgCoin.src = "./assets/coin.png?v=2";
const imgCat = new Image();
imgCat.src = "./assets/catbox.png?v=2";
const imgLogo = new Image();
imgLogo.src = "./assets/logo.png?v=2";

let selected = null;
let run = null;
let raf = 0;

function show(el) {
  [lobby, pay, game, over].forEach((p) => p.classList.add("hidden"));
  el.classList.remove("hidden");
  document.body.classList.toggle("playing", el === game);
  syncRotate();
}

function isWalletDappBrowser() {
  try {
    const eth = window.ethereum || {};
    const ua = navigator.userAgent || "";
    if (
      eth.isTokenPocket ||
      eth.isTrust ||
      eth.isTrustWallet ||
      eth.isImToken ||
      eth.isCoinbaseWallet ||
      eth.isCoinbaseBrowser ||
      eth.isOkxWallet ||
      eth.isOKExWallet ||
      eth.isBitKeep ||
      eth.isMathWallet ||
      eth.isSafePal ||
      eth.isRainbow ||
      eth.isBinance
    ) {
      return true;
    }
    if (window.tokenpocket || window.imToken || window.okxwallet || window.bitkeep || window.BinanceChain) {
      return true;
    }
    return /TokenPocket|TrustWallet|imToken|BitKeep|Bitget|OKApp|CoinbaseWallet|MetaMaskMobile|Rainbow|SafePal|MathWallet/i.test(
      ua,
    );
  } catch (_) {
    return false;
  }
}

function markWalletDapp() {
  const on = isWalletDappBrowser();
  document.documentElement.classList.toggle("wallet-dapp", on);
  if (document.body) document.body.classList.toggle("wallet-dapp", on);
  return on;
}

function viewportBox() {
  const iw = window.innerWidth || document.documentElement.clientWidth || 0;
  const ih = window.innerHeight || document.documentElement.clientHeight || 0;
  const vw = window.visualViewport?.width || iw;
  const vh = window.visualViewport?.height || ih;
  const w = Math.min(iw || vw, vw || iw);
  const h = Math.max(ih || vh, vh || ih);
  return { w, h };
}

function isPortraitPhone() {
  const { w, h } = viewportBox();
  return Math.min(w, h) < 900 && h > w;
}

let sawLandscape = false;

function syncRotate() {
  const wallet = markWalletDapp();
  const { w, h } = viewportBox();
  if (w > h) sawLandscape = true;
  const playing = !game.classList.contains("hidden");
  const portrait = isPortraitPhone();
  const gate = $("rotateGate");
  if (gate) {
    const need = playing && portrait && !wallet;
    gate.classList.toggle("hidden", !need);
  }
  const soft = $("rotateSoft");
  if (soft) {
    const hint = wallet && playing && portrait && sawLandscape;
    soft.classList.toggle("hidden", !hint);
  }
}

async function enterPlay() {
  if (markWalletDapp()) return;
  try {
    const root = document.documentElement;
    if (root.requestFullscreen) await root.requestFullscreen();
  } catch (_) {}
  try {
    if (screen.orientation?.lock) await screen.orientation.lock("landscape");
  } catch (_) {}
}

function renderTickets() {
  $("tickets").innerHTML = TIERS.map((tier) => {
    const copy = tierText(tier.id);
    return `
    <button class="ticket t${tier.id}" data-id="${tier.id}">
      <img class="ticket-mascot" src="./assets/hero-cat.png?v=1" alt="" />
      <img class="ticket-coin" src="./assets/coin.png?v=2" alt="" />
      <div class="cost"><img src="./assets/icon-ticket.png?v=1" alt="" />${tier.cost} LIM</div>
      <h3>${copy.name}</h3>
      <p>${copy.blurb}</p>
      <div class="meta">${tier.mult}×</div>
      <div class="chips">
        <span class="chip board">${t("chipBoard")}</span>
        <span class="chip pool">${t("chipPool")}</span>
      </div>
      <span class="play-tag">${t("playTag")}</span>
    </button>`;
  }).join("");
  $("tickets").onclick = (e) => {
    const btn = e.target.closest("[data-id]");
    if (!btn) return;
    openPay(TIERS[Number(btn.dataset.id)]);
  };
}

function openPay(tier) {
  selected = tier;
  const copy = tierText(tier.id);
  $("payTitle").textContent = `${tier.cost} LIM`;
  $("payCopy").textContent = t("payCopy", { name: copy.name, cost: tier.cost });
  $("payGo").disabled = false;
  if ($("payStatus")) $("payStatus").textContent = "";
  show(pay);
}

function refreshHud() {
  if (!run || game.classList.contains("hidden")) return;
  const copy = tierText(run.tier.id);
  $("hudTier").textContent = `${copy.name} · ${run.tier.cost} LIM`;
}

let lastFinish = null;

function refreshOver() {
  if (!lastFinish || over.classList.contains("hidden")) return;
  const { cap, ticket, got, leftover, score, coins, whyKey, rank, burned, burnHash } = lastFinish;
  $("overKicker").textContent = cap ? t("overFullK") : t("overPartK");
  $("overTitle").textContent = cap ? t("overFullT") : t("overPartT");
  $("overWhy").textContent = t(whyKey);
  const burnAmt = leftover * 0.3;
  const weekAmt = leftover * 0.5;
  const invAmt = leftover * 0.2;
  const burnShown = typeof burned === "number" ? burned : burnAmt;
  $("overResult").innerHTML = t(cap ? "resultFull" : "resultPart", {
    coins,
    got: got.toFixed(4),
    ticket,
    score,
    left: leftover.toFixed(4),
    burn: Number(burnShown).toFixed(4),
    week: weekAmt.toFixed(4),
    invite: invAmt.toFixed(4),
  });
  const posted = $("overPosted");
  if (posted) {
    posted.textContent = t("overPosted", { rank: rank || "—" });
  }
  const burnEl = $("overBurn");
  if (burnEl) {
    if (cap || leftover <= 0) {
      burnEl.textContent = t("overBurnSkip");
    } else if (burnHash) {
      const shown = typeof burned === "number" ? burned.toFixed(4) : leftover * 0.3;
      burnEl.innerHTML = `${t("overBurn", { n: Number(shown).toFixed(4) })} · <a href="${CatboxChain.txUrl(burnHash)}" target="_blank" rel="noopener">${burnHash.slice(0, 10)}…${burnHash.slice(-6)}</a>`;
    } else {
      burnEl.textContent = t("overBurnWait");
    }
  }
}

$("payBack").onclick = () => show(lobby);
$("payGo").onclick = () => payAndStart();
$("toLobby").onclick = () => {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
  } catch (_) {}
  show(lobby);
};
$("again").onclick = () => selected && openPay(selected);

async function payAndStart() {
  const status = $("payStatus");
  const go = $("payGo");
  if (!selected) return;
  go.disabled = true;
  try {
    if (!window.ethereum) throw new Error("NO_WALLET");
    status.textContent = t("connecting");
    await CatboxChain.connect();
    const deployed = await CatboxChain.isDeployed();
    if (!deployed) {
      status.textContent = t("deployNeed");
      go.disabled = false;
      return;
    }
    status.textContent = t("approve");
    const hash = await CatboxChain.approveAndEnter();
    status.innerHTML = `<a href="${CatboxChain.txUrl(hash)}" target="_blank" rel="noopener">${hash.slice(0, 10)}…</a>`;
    enterPlay();
    startRun(selected);
  } catch (e) {
    const msg = e?.message || "";
    if (msg === "NO_WALLET") status.textContent = t("noWallet");
    else if (msg === "NO_LIM") status.textContent = t("noLim");
    else if (msg.includes("user rejected") || e.code === 4001) status.textContent = t("txFail");
    else status.textContent = t("txFail");
    go.disabled = false;
  }
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function splitTicket(cost) {
  const pieces = [];
  let remain = cost;
  const min = cost * 0.0001;
  let guard = 0;
  while (remain > min && guard++ < 52) {
    const r = Math.random();
    let pct;
    if (r < 0.1) pct = 0.04 + Math.random() * 0.03;
    else if (r < 0.28) pct = 0.015 + Math.random() * 0.02;
    else if (r < 0.55) pct = 0.006 + Math.random() * 0.01;
    else pct = 0.0002 + Math.random() * 0.004;
    let v = cost * pct;
    if (v > remain) v = remain;
    v = +v.toFixed(6);
    if (v <= 0) break;
    pieces.push(v);
    remain = +(remain - v).toFixed(6);
  }
  if (remain > 0) pieces.push(+remain.toFixed(6));
  return shuffle(pieces);
}

function startRun(tier) {
  run = {
    tier,
    t: 0,
    dist: 0,
    coins: 0,
    raw: 0,
    combo: 0,
    collected: 0,
    bag: splitTicket(tier.cost),
    bagI: 0,
    dead: false,
    invuln: tier.id >= 2 ? 90 : 50,
    jumps: 0,
    coyote: 0,
    y: 340,
    vy: 0,
    ground: 400,
    objects: [],
    spawn: 28,
    lastHazard: -999,
    night: false,
    popped: [],
    flash: 0,
    clearWait: 0,
    startedMs: Date.now(),
  };
  $("hudTier").textContent = `${tierText(tier.id).name} · ${tier.cost} LIM`;
  $("rebateBar").style.width = "0%";
  $("hudRebate").textContent = `0.00/${tier.cost} LIM`;
  show(game);
  cancelAnimationFrame(raf);
  accMs = 0;
  lastTs = 0;
  raf = requestAnimationFrame(loop);
}

function progress(run) {
  const sec = run.t / 60;
  if (sec < 4) return 0;
  return Math.min(1, (sec - 4) / run.tier.peakAt);
}

function currentSpeed(run) {
  const p = progress(run);
  return run.tier.speed + (run.tier.speedMax - run.tier.speed) * p * p;
}

function spawnCoin(run, x, y) {
  if (run.bagI >= run.bag.length) return;
  const amount = run.bag[run.bagI++];
  const gold = amount >= run.tier.cost * 0.02;
  run.objects.push({ kind: "coin", x, y, hit: false, amount, gold });
}

function spawn(run) {
  const p = progress(run);
  const x = canvas.width + 40;
  const roll = Math.random();
  const sinceHazard = run.t - run.lastHazard;
  const minGap = 108 - p * 22;

  if (run.bagI < run.bag.length && (roll < 0.72 || p < 0.12 || sinceHazard < minGap)) {
    const low = Math.random() < 0.32;
    const mid = low ? 368 + Math.random() * 18 : 252 + Math.random() * 52;
    spawnCoin(run, x, mid);
    if (roll > 0.55) spawnCoin(run, x + 50, low ? mid - 56 : mid - 40);
    if (roll > 0.88) spawnCoin(run, x + 96, low ? 370 : mid + 18);
    return;
  }

  if (p < 0.3 || roll < 0.82) {
    run.objects.push({ kind: "light", x, w: 70 + p * 24, phase: 0, slow: 0.02 + p * 0.016 });
    run.lastHazard = run.t;
    return;
  }

  if (p < 0.5 || roll < 0.92) {
    run.objects.push({ kind: "beam", x, y: run.ground - 40, w: 20, h: 40 });
    run.lastHazard = run.t;
    return;
  }

  run.objects.push({ kind: "gap", x, w: 52 + p * 18 });
  run.lastHazard = run.t;
}

function jump() {
  if (!run || run.dead) return;
  const onFloor = run.y >= run.ground - 1 || run.coyote > 0;
  if (onFloor && run.jumps === 0) {
    run.vy = -12.4;
    run.jumps = 1;
    run.coyote = 0;
  } else if (run.jumps < 2) {
    run.vy = -11.2;
    run.jumps = 2;
  }
}

window.addEventListener("pointerdown", (e) => {
  if (game.classList.contains("hidden")) return;
  if (e.target.closest("a, button, .langs, .lang-btn, .rotate-gate, .rotate-soft")) return;
  e.preventDefault();
  jump();
});
window.addEventListener("keydown", (e) => {
  if (game.classList.contains("hidden")) return;
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    jump();
  }
});
window.addEventListener("orientationchange", syncRotate);
window.addEventListener("resize", syncRotate);
window.visualViewport?.addEventListener("resize", syncRotate);
window.addEventListener("ethereum#initialized", markWalletDapp, { once: true });
setTimeout(markWalletDapp, 0);
setTimeout(markWalletDapp, 400);
setTimeout(() => {
  markWalletDapp();
  syncRotate();
}, 1200);
document.addEventListener(
  "touchmove",
  (e) => {
    if (document.body.classList.contains("playing")) e.preventDefault();
  },
  { passive: false },
);

const STEP = 1000 / 60;
let accMs = 0;
let lastTs = 0;

function loop(ts) {
  raf = requestAnimationFrame(loop);
  if (!run || run.dead) return;
  if (!lastTs) lastTs = ts;
  accMs += Math.min(100, ts - lastTs);
  lastTs = ts;
  while (accMs >= STEP) {
    accMs -= STEP;
    tick();
    if (!run || run.dead) return;
  }
  draw();
}

function tick() {
  const tier = run.tier;
  const spd = currentSpeed(run);
  const p = progress(run);
  if (tier.id === 3 && p > 0.35) run.night = true;
  run.t += 1;
  run.dist += spd * 0.35;
  run.spawn -= 1;
  if (run.spawn <= 0) {
    if (run.bagI < run.bag.length) {
      spawn(run);
      run.spawn = 70 - p * 28 + Math.random() * 18;
    } else {
      run.spawn = 40;
    }
  }

  const onFloor = run.y >= run.ground - 1;
  if (onFloor) run.coyote = 8;
  else if (run.coyote > 0) run.coyote -= 1;

  run.vy += 0.48;
  run.y += run.vy;
  if (run.y > run.ground) {
    run.y = run.ground;
    run.vy = 0;
    run.jumps = 0;
  }
  if (run.invuln > 0) run.invuln -= 1;

  const px = 160;
  const py = run.y;
  const hb = { x: px - 14, y: py - 20, w: 28, h: 32 };

  for (const o of run.objects) {
    o.x -= spd;
    if (o.kind === "light") o.phase += o.slow || 0.02;

    if (o.kind === "coin" && !o.hit && dist(px, py, o.x, o.y) < (o.gold ? 42 : 34)) {
      o.hit = true;
      run.coins += 1;
      run.combo += 1;
      run.collected = Math.min(run.tier.cost, +(run.collected + o.amount).toFixed(6));
      run.raw += 36 + Math.round((o.amount / run.tier.cost) * 900) + Math.min(run.combo, 12) * 10;
      if (o.gold) run.flash = 10;
      const showLim = o.amount >= 0.01 ? `+${o.amount.toFixed(2)} LIM` : `+${o.amount.toFixed(4)} LIM`;
      run.popped.push({
        x: o.x,
        y: o.y,
        t: o.gold ? 30 : 20,
        text: showLim,
        combo: run.combo >= 3 ? t("hit", { n: run.combo }) : "",
        gold: o.gold,
      });
    }

    if (o.kind === "coin" && !o.hit && o.x < px - 50) run.combo = 0;

    if (run.invuln > 0) continue;
    if (o.kind === "beam" && aabb(hb.x, hb.y, hb.w, hb.h, o.x, o.y, o.w, o.h)) {
      finish("dieBlock");
      return;
    }
    if (o.kind === "light") {
      const on = Math.sin(o.phase) > 0.62;
      if (on && aabb(hb.x, hb.y, hb.w, hb.h, o.x, 40, o.w, 260)) {
        finish("dieLight");
        return;
      }
    }
    if (o.kind === "gap" && py >= run.ground - 2 && px > o.x + 10 && px < o.x + o.w - 10) {
      finish("dieGap");
      return;
    }
  }
  run.objects = run.objects.filter((o) => o.x > -120 && !(o.kind === "coin" && o.hit));
  run.popped = run.popped.filter((n) => --n.t > 0);
  if (run.flash > 0) run.flash -= 1;
  run.raw += 0.28;
  const pct = (run.collected / run.tier.cost) * 100;
  $("hudRebate").textContent = `${run.collected.toFixed(3)}/${run.tier.cost} LIM`;
  $("rebateBar").style.width = `${Math.min(100, pct)}%`;
  $("hudScore").textContent = String(boardScore());
  if (run.bagI >= run.bag.length && !run.objects.some((o) => o.kind === "coin")) {
    run.clearWait += 1;
    if (run.clearWait > 50) {
      finish(run.collected + 1e-9 >= run.tier.cost ? "clearFull" : "clearPart");
    }
  }
}

function boardScore() {
  const cap = run.collected + 1e-9 >= run.tier.cost;
  return Math.floor(run.raw * run.tier.mult * (cap ? 2 : 1));
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}
function aabb(x, y, w, h, x2, y2, w2, h2) {
  return x < x2 + w2 && x + w > x2 && y < y2 + h2 && y + h > y2;
}

function draw() {
  const W = canvas.width;
  const H = canvas.height;
  const night = run.night;
  const veil = run.invuln > 0;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = night ? "#0a1524" : veil ? "#1a334c" : "#152238";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = night ? "#0e1c2c" : "#1c3348";
  for (let i = 0; i < 24; i++) {
    const gx = ((i * 48 - (run.t * 2) % 48) );
    ctx.fillRect(gx, 0, 2, H);
  }

  const floorY = run.ground + 24;
  ctx.fillStyle = night ? "#0f2233" : "#2a4a63";
  ctx.fillRect(0, floorY, W, H - floorY);
  ctx.fillStyle = "#0b1520";
  for (let x = -((run.t * 3) % 16); x < W; x += 16) ctx.fillRect(x, floorY, 8, 4);

  for (const o of run.objects) {
    if (o.kind === "gap") {
      ctx.fillStyle = "#070b12";
      ctx.fillRect(o.x, floorY - 2, o.w, 90);
    }
    if (o.kind === "coin" && !o.hit && imgCoin.complete) {
      const s = o.gold ? 52 : 32;
      ctx.drawImage(imgCoin, o.x - s / 2, o.y - s / 2, s, s);
    }
    if (o.kind === "beam") {
      ctx.fillStyle = "#d94b3a";
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = "#7a1f16";
      ctx.fillRect(o.x, o.y + o.h - 6, o.w, 6);
    }
    if (o.kind === "light") {
      const on = Math.sin(o.phase) > 0.62;
      ctx.fillStyle = "#5d738c";
      ctx.fillRect(o.x + o.w / 2 - 8, 24, 16, 8);
      if (on) {
        ctx.fillStyle = "rgba(255, 210, 80, 0.38)";
        ctx.beginPath();
        ctx.moveTo(o.x + o.w / 2, 32);
        ctx.lineTo(o.x + o.w, 300);
        ctx.lineTo(o.x, 300);
        ctx.fill();
      } else {
        ctx.fillStyle = "rgba(93, 115, 140, 0.18)";
        ctx.fillRect(o.x + o.w / 2 - 2, 32, 4, 180);
      }
    }
  }

  ctx.save();
  ctx.translate(160, run.y + (run.y >= run.ground - 1 ? Math.sin(run.t * 0.35) * 2 : 0));
  if (imgCat.complete && imgCat.naturalWidth) {
    ctx.drawImage(imgCat, -24, -30, 48, 48);
  } else {
    ctx.fillStyle = "#c49a4a";
    ctx.fillRect(-16, -10, 32, 24);
  }
  ctx.restore();

  if (run.flash > 0) {
    ctx.fillStyle = `rgba(230, 184, 76, ${0.08 * run.flash})`;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.font = lang === "en" ? "10px 'Press Start 2P'" : "13px 'Noto Sans', 'Noto Sans SC', sans-serif";
  for (const n of run.popped) {
    ctx.fillStyle = n.gold ? "#ffe08a" : "#d6e6ff";
    ctx.fillText(n.text, n.x - 20, n.y - (22 - n.t));
    if (n.combo) {
      ctx.fillStyle = "#7fb0ff";
      ctx.fillText(n.combo, n.x - 16, n.y - (36 - n.t));
    }
  }
}

function finish(whyKey) {
  if (!run || run.dead) return;
  run.dead = true;
  cancelAnimationFrame(raf);
  const cap = run.collected + 1e-9 >= run.tier.cost;
  const ticket = run.tier.cost;
  const got = run.collected;
  const leftover = Math.max(0, +(ticket - got).toFixed(6));
  const score = boardScore();
  const rank = postBoard(score, run.tier.id);
  lastFinish = {
    cap,
    ticket,
    got,
    leftover,
    score,
    coins: run.coins,
    whyKey,
    rank,
    burned: leftover > 0 ? +(leftover * 0.3).toFixed(6) : 0,
    burnHash: "",
    tx: "",
  };
  show(over);
  refreshOver();
  settleOnchain(got, ticket, score);
}

async function settleOnchain(got, ticket, score) {
  const el = $("overTx");
  if (!el || !window.CatboxChain) return;
  try {
    el.textContent = t("settling");
    const wait = 5500 - (Date.now() - (run?.startedMs || Date.now()));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const rec = await CatboxChain.settleRun(got, ticket, score);
    if (rec?.hash) {
      lastFinish.tx = rec.hash;
      lastFinish.burnHash = rec.burned > 0n ? rec.hash : "";
      if (rec.burned > 0n) lastFinish.burned = Number(ethers.formatUnits(rec.burned, 18));
      el.innerHTML = `<a href="${CatboxChain.txUrl(rec.hash)}" target="_blank" rel="noopener">${rec.hash.slice(0, 10)}…</a>`;
      refreshOver();
    } else {
      el.textContent = "";
    }
    await syncOnchainPool();
    refreshInviteUi();
    refreshClaimUi();
    pullLiveBoards();
  } catch (e) {
    el.textContent = t("txFail");
  }
}

mountLangs();
applyI18n();
show(lobby);
bootWallet();
