const TIERS = [
  { id: 0, name: "SCOUT", cost: 1, mult: 1, speed: 3.6, speedMax: 5.6, peakAt: 90 },
  { id: 1, name: "RUNNER", cost: 3, mult: 1.5, speed: 3.8, speedMax: 6.6, peakAt: 75 },
  { id: 2, name: "PHANTOM", cost: 6, mult: 2, speed: 4.0, speedMax: 7.6, peakAt: 60 },
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
    const st = window._freeStatus;
    const freeShown = st?.pool != null ? st.pool : pool.free;
    if ($("freePoolAmt") && freeShown != null) {
      $("freePoolAmt").textContent = `${CatboxChain.formatLim(freeShown)} LIM`;
    }
    const prices = await Promise.all(TIERS.map((tier) => CatboxChain.ticketPrice(tier.id)));
    let changed = false;
    TIERS.forEach((tier, i) => {
      const n = Number(ethers.formatUnits(prices[i], 18));
      if (n > 0 && tier.cost !== n) {
        tier.cost = n;
        changed = true;
      }
    });
    if (changed && typeof renderTickets === "function") renderTickets();
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
  if ($("fundAddr") && window.CatboxChain) $("fundAddr").value = CatboxChain.cfg.address;
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
  await refreshFreeUi();
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

async function refreshFreeUi() {
  const el = $("freeLeft");
  const acc = window.CatboxChain?.account;
  if (!el) return;
  if (!acc || !chainReady) {
    window._freeStatus = null;
    el.textContent = "";
    return;
  }
  try {
    const st = await CatboxChain.freeStatus(acc);
    const prev = window._freeStatus;
    window._freeStatus = st;
    if (st.used > 0) {
      try { localStorage.setItem(TUTORIAL_KEY, "1"); } catch (_) {}
    }
    if (st.left <= 0) el.textContent = "";
    else if (st.eligible) el.textContent = t("freeLeft", { n: st.left });
    else el.textContent = t("freeWait", { n: st.left });
    const changed = !prev || prev.left !== st.left || prev.eligible !== st.eligible;
    if (changed && typeof renderTickets === "function") renderTickets();
  } catch (_) {
    window._freeStatus = null;
    el.textContent = "";
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
  await refreshFreeUi();
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
      const tierId = Number($("ticketTier")?.value || 0);
      const n = Number($("ticketInput").value);
      if (!n || n <= 0) return;
      await CatboxChain.setTicketPrice(tierId, n);
      await syncOnchainPool();
      renderTickets();
    } catch (_) {
      alert(t("txFail"));
    }
  };
  if ($("fundAddr") && window.CatboxChain) {
    $("fundAddr").value = CatboxChain.cfg.address;
  }
  if ($("copyFund")) {
    $("copyFund").onclick = async () => {
      const val = $("fundAddr")?.value || CatboxChain.cfg.address;
      try {
        await navigator.clipboard.writeText(val);
        $("copyFund").textContent = t("copied");
        setTimeout(() => { $("copyFund").textContent = t("copyAddr"); }, 1200);
      } catch (_) {}
    };
  }
  if ($("fundBtn")) {
    $("fundBtn").onclick = async () => {
      const status = $("fundStatus");
      const n = Number($("fundInput")?.value);
      if (!n || n <= 0) return;
      try {
        if (status) status.textContent = t("approve");
        const hash = await CatboxChain.fundFreePool(n);
        if (status) {
          status.innerHTML = `<a href="${CatboxChain.txUrl(hash)}" target="_blank" rel="noopener">${hash.slice(0, 10)}…</a>`;
        }
        await refreshFreeUi();
        await syncOnchainPool();
        renderTickets();
      } catch (e) {
        if (status) status.textContent = e?.message === "NO_LIM" ? t("noLim") : t("txFail");
      }
    };
  }
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

const BASE_GROUND = 400;
const PLAYER_SX = 160;

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
  requestAnimationFrame(syncRotate);
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
  const vv = window.visualViewport;
  const vw = vv?.width || iw;
  const vh = vv?.height || ih;
  const w = Math.min(iw || vw, vw || iw);
  const h = Math.max(ih || vh, vh || ih);
  return {
    w,
    h,
    vw: vw || w,
    vh: vh || h,
    ox: vv?.offsetLeft || 0,
    oy: vv?.offsetTop || 0,
  };
}

function isPortraitPhone() {
  const { w, h } = viewportBox();
  return Math.min(w, h) < 900 && h > w;
}

let sawLandscape = false;

function clearFakeLandscape(stage) {
  if (!stage) return;
  stage.style.position = "";
  stage.style.width = "";
  stage.style.height = "";
  stage.style.left = "";
  stage.style.top = "";
  stage.style.right = "";
  stage.style.bottom = "";
  stage.style.margin = "";
  stage.style.transform = "";
  stage.style.transformOrigin = "";
  stage.style.zIndex = "";
  stage.style.maxWidth = "";
}

function applyFakeLandscape() {
  const stage = $("playStage");
  const wallet = document.documentElement.classList.contains("wallet-dapp") ||
    document.body.classList.contains("wallet-dapp");
  const playing = document.body.classList.contains("playing");
  const { vw, vh, ox, oy } = viewportBox();
  const portrait = vh > vw;
  const on = wallet && playing && portrait;
  document.documentElement.classList.toggle("force-landscape", on);
  document.body.classList.toggle("force-landscape", on);
  if (!stage) return;
  if (!on) {
    clearFakeLandscape(stage);
    return;
  }
  /* Portrait-locked TP: layout a landscape stage (width=vh, height=vw), then
     rotate 90° clockwise around center so it fills the visual viewport.
     Home/USB-C on the right is the usual game hold; taps map through CSS. */
  stage.style.position = "fixed";
  stage.style.width = `${vh}px`;
  stage.style.height = `${vw}px`;
  stage.style.left = `${ox + vw / 2}px`;
  stage.style.top = `${oy + vh / 2}px`;
  stage.style.right = "auto";
  stage.style.bottom = "auto";
  stage.style.margin = "0";
  stage.style.maxWidth = "none";
  stage.style.zIndex = "6";
  stage.style.transformOrigin = "center center";
  stage.style.transform = "translate(-50%, -50%) rotate(90deg)";
}

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
  applyFakeLandscape();
  const soft = $("rotateSoft");
  if (soft) {
    const hint = wallet && playing && portrait && sawLandscape && !document.body.classList.contains("force-landscape");
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

function scoutIsFree(tier) {
  return tier && tier.id === 0 && window._freeStatus?.eligible;
}

function renderTickets() {
  const glyphs = [
    "./assets/coin.png?v=2",
    "./assets/icon-ticket.png?v=1",
    "./assets/icon-trophy.png?v=1",
    "./assets/icon-burn.png?v=1",
  ];
  $("tickets").innerHTML = TIERS.map((tier) => {
    const copy = tierText(tier.id);
    const free = scoutIsFree(tier);
    return `
    <button class="ticket t${tier.id}" data-id="${tier.id}">
      <img class="ticket-mascot" src="./assets/hero-cat.png?v=1" alt="" />
      <img class="ticket-coin" src="${glyphs[tier.id]}" alt="" />
      ${free ? `<span class="free-badge">${t("freeScout")} · ${window._freeStatus.left}</span>` : ""}
      <div class="cost"><img src="./assets/icon-ticket.png?v=1" alt="" />${free ? t("freeScout") + " · " : ""}${tier.cost} LIM</div>
      <h3>${copy.name}</h3>
      <p>${copy.blurb}</p>
      <div class="meta">${tier.mult}×</div>
      <span class="play-tag">${free ? t("payGoFree") : t("playTag")}</span>
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
  const free = scoutIsFree(tier);
  $("payTitle").textContent = free ? `${t("freeScout")} · ${tier.cost} LIM` : `${tier.cost} LIM`;
  $("payCopy").textContent = free ? t("freePay") : t("payCopy", { name: copy.name, cost: tier.cost });
  $("payGo").textContent = free ? t("payGoFree") : t("payGo");
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
    await refreshFreeUi();
    const free = scoutIsFree(selected);
    const teach = shouldTeach(selected);
    status.textContent = free ? t("paying") : t("approve");
    const hash = await CatboxChain.approveAndEnter(selected.id);
    status.innerHTML = `<a href="${CatboxChain.txUrl(hash)}" target="_blank" rel="noopener">${hash.slice(0, 10)}…</a>`;
    enterPlay();
    startRun(selected, teach);
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

const TUTORIAL_KEY = "catbox-tutorial-done";
const TUT_COPY = {
  jump: ["tutJump", "tutJumpSub"],
  coin: ["tutCoin", "tutCoinSub"],
  light: ["tutLight", "tutLightSub"],
  pipe: ["tutPipe", "tutPipeSub"],
  gap: ["tutGap", "tutGapSub"],
};

function isTutorialDone() {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === "1";
  } catch (_) {
    return false;
  }
}

function shouldTeach(tier) {
  if (!tier || tier.id !== 0) return false;
  if (isTutorialDone()) return false;
  const st = window._freeStatus;
  if (!st?.eligible) return false;
  if (Number(st.used) > 0) return false;
  return true;
}

function hideTutorial() {
  const layer = $("tutLayer");
  if (layer) layer.classList.add("hidden");
}

function completeTutorial() {
  try {
    localStorage.setItem(TUTORIAL_KEY, "1");
  } catch (_) {}
  hideTutorial();
  if (run) {
    run.tutorial = false;
    run.tutId = "";
    run.tutAnchor = null;
  }
}

function showTutorialStep(id) {
  const layer = $("tutLayer");
  if (!layer || !run) return;
  run.tutId = id;
  layer.classList.remove("hidden");
  layer.dataset.step = id;
}

function refreshTutorialCopy() {}

function seedTutorialCourse(state) {
  const g = BASE_GROUND;
  spawnCoinW(state, 380, g - 34);
  spawnCoinW(state, 460, g - 92);
  spawnCoinW(state, 540, g - 148);
  spawnCoinW(state, 640, g - 72);
  state.objects.push({ kind: "light", x: 1080, w: 74, phase: 0.15, slow: 0.024 });
  state.objects.push({ kind: "beam", x: 1520, y: g - 48, w: 28, h: 48, style: "pipe" });
  spawnCoinW(state, 1590, g - 104);
  state.objects.push({ kind: "beam", x: 1740, y: g - 26, w: 32, h: 26, style: "brick" });
  state.terrain = [
    { kind: "flat", x0: -480, x1: 1940, y: g },
    { kind: "gap", x0: 1940, x1: 2020, y: g },
    { kind: "flat", x0: 2020, x1: 2680, y: g },
  ];
  state.nextTerrain = 2680;
  state.lastHazard = 0;
}

function tickTutorial() {
  if (!run || !run.tutorial) return;
  const t = run.t;
  if (t >= 720) {
    completeTutorial();
    return;
  }
  let next = run.tutId || "jump";
  let ax = PLAYER_SX;
  let ay = run.y - 56;
  if (t < 110) {
    next = "jump";
    ax = PLAYER_SX + 8;
    ay = run.y - 58;
  } else if (t < 230) {
    next = "coin";
    const c = run.objects.find((o) => o.kind === "coin" && !o.hit && o.x > 40 && o.x < 720);
    if (c) {
      ax = c.x;
      ay = c.y - 36;
    }
  } else {
    const light = run.objects.find((o) => o.kind === "light" && o.x > 50 && o.x < 560);
    const beam = run.objects.find((o) => o.kind === "beam" && o.x > 50 && o.x < 560);
    const gapSoon = isGapAt(run, run.scroll + 220) || isGapAt(run, run.scroll + 300);
    if (gapSoon) {
      next = "gap";
      ax = 280;
      ay = BASE_GROUND - 70;
    } else if (beam) {
      next = "pipe";
      ax = beam.x + beam.w / 2;
      ay = beam.y - 28;
    } else if (light) {
      next = "light";
      ax = light.x + light.w / 2;
      ay = 92;
    } else if (t < 280) {
      next = "coin";
      const c = run.objects.find((o) => o.kind === "coin" && !o.hit && o.x > 40 && o.x < 720);
      if (c) {
        ax = c.x;
        ay = c.y - 36;
      }
    }
  }
  run.tutAnchor = { x: ax, y: ay };
  if (next !== run.tutId) showTutorialStep(next);
}

function bootTutorial() {
  const skip = $("tutSkip");
  if (!skip) return;
  skip.addEventListener("pointerdown", (e) => e.stopPropagation());
  skip.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    completeTutorial();
  };
}

function startRun(tier, teach) {
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
    ground: BASE_GROUND,
    scroll: 0,
    terrain: [{ kind: "flat", x0: -480, x1: 1000, y: BASE_GROUND }],
    nextTerrain: 1000,
    objects: [],
    lastHazard: -999,
    night: false,
    popped: [],
    flash: 0,
    clearWait: 0,
    startedMs: Date.now(),
    tutorial: false,
    tutId: "",
    tutAnchor: null,
    fx: [],
    wasAir: false,
  };
  if (teach) {
    run.tutorial = true;
    run.invuln = Math.max(run.invuln, 80);
    seedTutorialCourse(run);
    showTutorialStep("jump");
  } else {
    hideTutorial();
  }
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

function hash11(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function groundAt(run, wx) {
  let y = BASE_GROUND;
  for (let i = 0; i < run.terrain.length; i++) {
    const s = run.terrain[i];
    if (wx >= s.x0 && wx < s.x1) {
      if (s.kind === "hill" || s.kind === "bump") {
        const t = (wx - s.x0) / Math.max(1, s.x1 - s.x0);
        const h = (1 - Math.cos(t * Math.PI * 2)) * 0.5;
        y = s.y - s.peak * h;
      } else {
        y = s.y;
      }
      break;
    }
  }
  return Math.round(y * 0.5) * 2;
}

function isGapAt(run, wx) {
  for (let i = 0; i < run.terrain.length; i++) {
    const s = run.terrain[i];
    if (s.kind === "gap" && wx >= s.x0 + 12 && wx < s.x1 - 12) return true;
  }
  return false;
}

function spawnCoinW(run, wx, wy) {
  spawnCoin(run, wx - run.scroll, wy);
}

function coinArc(run, x0, x1) {
  const n = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const wx = x0 + t * (x1 - x0);
    const gy = groundAt(run, wx);
    const lift = Math.sin(t * Math.PI) * (46 + Math.random() * 30);
    spawnCoinW(run, wx, gy - 30 - lift);
  }
}

function pushFlat(run, x0, x1) {
  run.terrain.push({ kind: "flat", x0, x1, y: BASE_GROUND });
}

function ensureTerrain(run) {
  const need = run.scroll + canvas.width + 160;
  while (run.nextTerrain < need) addTerrainChunk(run);
  if (run.terrain.length > 20) {
    const cut = run.scroll - 240;
    run.terrain = run.terrain.filter((s) => s.x1 > cut);
  }
}

function addTerrainChunk(run) {
  const p = progress(run);
  let x = run.nextTerrain;
  const bag = run.bagI < run.bag.length;
  if (!bag) {
    pushFlat(run, x, x + 480);
    run.nextTerrain = x + 480;
    return;
  }

  const sinceHazard = run.t - run.lastHazard;
  const minGap = 108 - p * 22;
  const roll = Math.random();
  const pad = 32 + Math.floor(Math.random() * 28);
  pushFlat(run, x, x + pad);
  x += pad;

  const wantSafe = p < 0.1 || roll < 0.58 || sinceHazard < minGap;

  if (wantSafe) {
    const flavor = Math.random();
    if (flavor < 0.4 && p > 0.02) {
      const w = 260 + Math.floor(Math.random() * 150);
      const peak = 30 + Math.floor(Math.random() * 38);
      run.terrain.push({ kind: "hill", x0: x, x1: x + w, y: BASE_GROUND, peak });
      coinArc(run, x, x + w);
      x += w;
    } else if (flavor < 0.58 && p > 0.12) {
      const w = 84 + Math.floor(Math.random() * 32);
      const peak = 18 + Math.floor(Math.random() * 12);
      run.terrain.push({ kind: "bump", x0: x, x1: x + w, y: BASE_GROUND, peak });
      spawnCoinW(run, x + w * 0.5, BASE_GROUND - peak - 48);
      spawnCoinW(run, x + w * 0.26, BASE_GROUND - peak * 0.55 - 36);
      spawnCoinW(run, x + w * 0.74, BASE_GROUND - peak * 0.55 - 36);
      x += w;
    } else {
      const w = 140 + Math.floor(Math.random() * 80);
      pushFlat(run, x, x + w);
      const low = Math.random() < 0.32;
      const mid = low ? BASE_GROUND - 32 + Math.random() * 18 : BASE_GROUND - 148 + Math.random() * 52;
      spawnCoinW(run, x + 40, mid);
      if (Math.random() > 0.4) spawnCoinW(run, x + 90, low ? mid - 56 : mid - 40);
      if (Math.random() > 0.75) spawnCoinW(run, x + 136, low ? BASE_GROUND - 30 : mid + 18);
      x += w;
    }
    run.nextTerrain = x;
    return;
  }

  if (p < 0.3 || roll < 0.8) {
    const w = 128 + Math.floor(p * 24);
    pushFlat(run, x, x + w);
    run.objects.push({
      kind: "light",
      x: x + 24 - run.scroll,
      w: 70 + p * 24,
      phase: 0,
      slow: 0.02 + p * 0.016,
    });
    run.lastHazard = run.t;
    x += w;
  } else if (p < 0.5 || roll < 0.91) {
    const w = 108;
    pushFlat(run, x, x + w);
    const style = Math.random() < 0.42 ? "brick" : "pipe";
    const h = style === "brick" ? 26 : 46 + Math.floor(Math.random() * 22);
    const bw = style === "brick" ? 32 : 28;
    const wx = x + 40;
    run.objects.push({
      kind: "beam",
      x: wx - run.scroll,
      y: BASE_GROUND - h,
      w: bw,
      h,
      style,
    });
    if (Math.random() > 0.32) {
      spawnCoinW(run, wx + 54, BASE_GROUND - h - 52);
      spawnCoinW(run, wx + 94, BASE_GROUND - h - 28);
    }
    run.lastHazard = run.t;
    x += w;
  } else {
    const gw = 52 + p * 18;
    const ap = 72;
    pushFlat(run, x, x + ap);
    run.terrain.push({ kind: "gap", x0: x + ap, x1: x + ap + gw, y: BASE_GROUND });
    pushFlat(run, x + ap + gw, x + ap + gw + ap);
    run.lastHazard = run.t;
    x += ap + gw + ap;
  }
  run.nextTerrain = x;
}

function jump() {
  if (!run || run.dead) return;
  const onFloor = run.y >= run.ground - 2 || run.coyote > 0;
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
  if (e.target.closest("a, button, .langs, .lang-btn, .rotate-gate, .rotate-soft, .tut-skip")) return;
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
window.visualViewport?.addEventListener("scroll", syncRotate);
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

function spawnDust(x, y) {
  if (!run) return;
  for (let i = 0; i < 6; i++) {
    run.fx.push({
      kind: "dust",
      x: x + (Math.random() - 0.5) * 18,
      y: y + 2,
      vx: -1.2 - Math.random() * 1.8,
      vy: -0.6 - Math.random() * 1.4,
      t: 10 + Math.floor(Math.random() * 8),
      s: 2 + Math.floor(Math.random() * 3),
    });
  }
}

function tickFx() {
  if (!run?.fx) return;
  for (const p of run.fx) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.12;
    p.t -= 1;
  }
  run.fx = run.fx.filter((p) => p.t > 0);
}

function tick() {
  const tier = run.tier;
  const spd = currentSpeed(run);
  const p = progress(run);
  if (tier.id === 3 && p > 0.35) run.night = true;
  run.t += 1;
  run.dist += spd * 0.35;
  run.scroll += spd;
  ensureTerrain(run);

  const px = PLAYER_SX;
  const pwx = run.scroll + px;
  const gy = groundAt(run, pwx);
  const overGap = isGapAt(run, pwx);
  run.ground = gy;
  const wasAir = run.wasAir;

  const stick =
    !overGap &&
    run.jumps === 0 &&
    run.vy >= 0 &&
    run.y >= gy - 8 &&
    run.y <= gy + 16;

  if (stick) {
    run.y = gy;
    run.vy = 0;
    run.coyote = 8;
  } else {
    if (!overGap && run.y >= gy - 1) run.coyote = 8;
    else if (run.coyote > 0) run.coyote -= 1;
    run.vy += 0.48;
    run.y += run.vy;
    if (!overGap && run.y > gy) {
      run.y = gy;
      run.vy = 0;
      run.jumps = 0;
    }
  }
  if (wasAir && run.jumps === 0 && !overGap && run.y >= gy - 2) spawnDust(px, gy);
  run.wasAir = run.jumps > 0 || run.y < gy - 4;
  if (run.invuln > 0) run.invuln -= 1;

  const py = run.y;
  const hb = { x: px - 14, y: py - 20, w: 28, h: 32 };

  if (overGap && py >= gy - 2) {
    finish("dieGap");
    return;
  }

  for (const o of run.objects) {
    o.x -= spd;
    if (o.kind === "light") o.phase += o.slow || 0.02;
    if (o.kind === "beam") {
      o.y = groundAt(run, run.scroll + o.x + o.w / 2) - o.h;
    }

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
      const lgy = groundAt(run, run.scroll + o.x + o.w / 2);
      const lh = Math.max(90, lgy - 92);
      if (on && aabb(hb.x, hb.y, hb.w, hb.h, o.x, 40, o.w, lh)) {
        finish("dieLight");
        return;
      }
    }
  }
  run.objects = run.objects.filter((o) => o.x > -120 && !(o.kind === "coin" && o.hit));
  run.popped = run.popped.filter((n) => --n.t > 0);
  tickFx();
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
  if (run.tutorial) tickTutorial();
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

function worldPal(night, veil) {
  if (night) {
    return {
      skyTop: "#050814",
      skyMid: "#0a1424",
      skyHor: "#122038",
      far: "#081420",
      farHi: "#163048",
      mid: "#0e1c2c",
      midHi: "#1a3850",
      near: "#143044",
      bush: "#152838",
      bushHi: "#c4a04a",
      cloud: "#1a2838",
      dirt: "#121c28",
      dirtMid: "#182838",
      dirtDk: "#0b1218",
      grass: "#3a4a38",
      grassHi: "#6a8858",
      lip: "#c49a4a",
      pit: "#04060a",
      pit2: "#0a1018",
    };
  }
  return {
    skyTop: veil ? "#2a4a6c" : "#3d74a8",
    skyMid: veil ? "#1e3a58" : "#2c5a8c",
    skyHor: veil ? "#8a7048" : "#e0b45c",
    far: "#1a3e60",
    farHi: "#3a6a88",
    mid: "#246078",
    midHi: "#3c8898",
    near: "#2c6a80",
    bush: "#247048",
    bushHi: "#f0c14a",
    cloud: "#e8f2ff",
    dirt: "#2e5470",
    dirtMid: "#244860",
    dirtDk: "#1a3348",
    grass: "#3d8a58",
    grassHi: "#7ec86a",
    lip: "#f0c14a",
    pit: "#070b12",
    pit2: "#0c141c",
  };
}

function fillHill(x, baseY, w, h, color, hi) {
  ctx.fillStyle = color;
  for (let i = 0; i < h; i += 2) {
    const t = i / h;
    const half = (w / 2) * Math.sqrt(Math.max(0, 1 - t * t));
    ctx.fillRect(
      Math.round(x + w / 2 - half),
      Math.round(baseY - i - 2),
      Math.max(2, Math.round(half * 2)),
      3,
    );
  }
  if (hi) {
    ctx.fillStyle = hi;
    for (let i = Math.floor(h * 0.28); i < h * 0.82; i += 3) {
      const t = i / h;
      const half = (w / 2) * Math.sqrt(Math.max(0, 1 - t * t));
      ctx.fillRect(
        Math.round(x + w / 2 - half),
        Math.round(baseY - i),
        Math.max(2, Math.round(half * 0.22)),
        2,
      );
    }
  }
}

function drawPixelCloud(x, y, s, color) {
  ctx.fillStyle = "rgba(10, 20, 36, 0.18)";
  ctx.fillRect(x + 4 * s, y + 8 * s, 24 * s, 6 * s);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 26 * s, 10 * s);
  ctx.fillRect(x + 8 * s, y - 6 * s, 16 * s, 10 * s);
  ctx.fillRect(x + 18 * s, y - 2 * s, 12 * s, 8 * s);
  ctx.fillRect(x - 4 * s, y + 2 * s, 10 * s, 6 * s);
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.fillRect(x + 10 * s, y - 4 * s, 8 * s, 3 * s);
}

function drawBush(x, y, pal) {
  ctx.fillStyle = pal.bush;
  ctx.fillRect(x, y - 12, 28, 12);
  ctx.fillRect(x + 6, y - 22, 16, 12);
  ctx.fillRect(x + 14, y - 18, 18, 12);
  ctx.fillRect(x - 4, y - 10, 12, 10);
  ctx.fillStyle = pal.bushHi;
  ctx.fillRect(x + 8, y - 18, 4, 4);
  ctx.fillRect(x + 18, y - 12, 3, 3);
}

function drawTree(x, y, pal) {
  ctx.fillStyle = "#3a2418";
  ctx.fillRect(x + 7, y - 24, 6, 24);
  ctx.fillStyle = pal.bush;
  ctx.fillRect(x, y - 40, 20, 18);
  ctx.fillRect(x + 4, y - 50, 14, 14);
  ctx.fillStyle = pal.bushHi;
  ctx.fillRect(x + 6, y - 44, 4, 4);
}

function drawPipe(o, night) {
  const x = Math.round(o.x);
  const y = Math.round(o.y);
  const w = o.w;
  const h = o.h;
  const body = night ? "#1a3858" : "#2a6a9a";
  const bodyDk = night ? "#0c1c2c" : "#143048";
  const bodyHi = night ? "#3a6088" : "#5aa0d0";
  const capH = 12;
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(x + 4, y + h - 2, w, 6);
  ctx.fillStyle = body;
  ctx.fillRect(x, y + capH - 2, w, h - capH + 2);
  ctx.fillStyle = bodyDk;
  ctx.fillRect(x, y + capH - 2, 5, h - capH + 2);
  ctx.fillStyle = bodyHi;
  ctx.fillRect(x + w - 6, y + capH, 4, Math.max(4, h - capH - 2));
  ctx.fillStyle = "#d94b3a";
  ctx.fillRect(x + 3, y + capH + 5, w - 6, 6);
  ctx.fillStyle = "#ff7a62";
  ctx.fillRect(x + 3, y + capH + 5, w - 6, 2);
  ctx.fillStyle = "#f0c14a";
  ctx.fillRect(x - 5, y, w + 10, capH);
  ctx.fillStyle = "#ffe08a";
  ctx.fillRect(x - 5, y, w + 10, 3);
  ctx.fillStyle = "#c49a4a";
  ctx.fillRect(x - 5, y + capH - 3, w + 10, 3);
  ctx.fillStyle = "#152238";
  ctx.fillRect(x - 5, y, w + 10, 2);
  ctx.fillStyle = "#1a1204";
  ctx.fillRect(x - 1, y + 4, 3, 3);
  ctx.fillRect(x + w - 2, y + 4, 3, 3);
}

function drawBrick(o, night) {
  const x = Math.round(o.x);
  const y = Math.round(o.y);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(x + 3, y + o.h - 2, o.w, 5);
  ctx.fillStyle = night ? "#8a7038" : "#f0c14a";
  ctx.fillRect(x, y, o.w, o.h);
  ctx.fillStyle = night ? "#c4a04a" : "#ffe08a";
  ctx.fillRect(x + 2, y + 2, o.w - 8, 4);
  ctx.fillStyle = "#152238";
  ctx.fillRect(x, y, o.w, 2);
  ctx.fillRect(x, y, 2, o.h);
  ctx.fillRect(x + o.w - 2, y, 2, o.h);
  ctx.fillRect(x, y + o.h - 2, o.w, 2);
  ctx.fillStyle = night ? "#3a3018" : "#c49a4a";
  ctx.fillRect(x + 4, y + 12, o.w - 8, 2);
  ctx.fillRect(x + o.w / 2 - 1, y + 2, 2, o.h - 4);
  ctx.fillStyle = "#fff6c8";
  ctx.fillRect(x + 4, y + 4, 4, 4);
}

function drawSky(pal, night, W, H) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.skyTop);
  g.addColorStop(0.42, pal.skyMid);
  g.addColorStop(0.72, pal.skyHor);
  g.addColorStop(1, night ? "#1a1420" : "#c4783a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (night) {
    for (let i = 0; i < 56; i++) {
      const sx = (((i * 97 - run.scroll * 0.04) % W) + W) % W;
      const sy = 12 + (i * 37) % 176;
      const tw = (Math.sin(run.t * 0.08 + i) + 1) * 0.5;
      ctx.fillStyle = i % 6 === 0 ? "#ffe08a" : `rgba(214,230,255,${0.45 + tw * 0.5})`;
      const sz = i % 7 === 0 ? 2 : 1;
      ctx.fillRect(sx, sy, sz, sz);
    }
    ctx.fillStyle = "rgba(230, 184, 76, 0.18)";
    ctx.fillRect(724, 32, 48, 48);
    ctx.fillStyle = "#ffe08a";
    ctx.fillRect(736, 44, 28, 28);
    ctx.fillStyle = pal.skyTop;
    ctx.fillRect(746, 48, 20, 20);
  } else {
    const sunX = 780;
    const sunY = 48;
    ctx.fillStyle = "rgba(255, 210, 80, 0.16)";
    ctx.fillRect(sunX - 28, sunY - 28, 76, 76);
    ctx.fillStyle = "rgba(255, 210, 80, 0.28)";
    ctx.fillRect(sunX - 10, sunY - 10, 42, 42);
    ctx.fillStyle = "#f0c14a";
    ctx.fillRect(sunX, sunY, 24, 24);
    ctx.fillStyle = "#ffe08a";
    ctx.fillRect(sunX + 6, sunY + 6, 10, 10);
    ctx.fillStyle = "rgba(230, 184, 76, 0.45)";
    ctx.fillRect(sunX - 8, sunY + 8, 8, 2);
    ctx.fillRect(sunX + 24, sunY + 8, 8, 2);
    ctx.fillRect(sunX + 10, sunY - 10, 2, 8);
    for (let i = 0; i < 3; i++) {
      const bx = (((i * 280 - run.scroll * 0.05) % (W + 80)) + W + 80) % (W + 80) - 20;
      ctx.fillStyle = "#152238";
      ctx.fillRect(bx, 92 + i * 10, 10, 3);
      ctx.fillRect(bx + 8, 90 + i * 10, 10, 3);
    }
  }
}

function drawParallax(pal, night, W) {
  const farOff = ((run.scroll * 0.1) % 240 + 240) % 240;
  for (let x = -220; x < W + 240; x += 190) {
    fillHill(x - farOff, 300, 230, 96, pal.far, pal.farHi);
  }
  const ridgeOff = ((run.scroll * 0.18) % 200 + 200) % 200;
  for (let x = -180; x < W + 200; x += 160) {
    fillHill(x - ridgeOff + 40, 332, 170, 64, pal.mid, pal.midHi);
  }
  if (night) {
    const span = 64;
    const off = run.scroll * 0.2;
    const base = Math.floor(off / span);
    for (let i = -2; i < 18; i++) {
      const id = base + i;
      const sx = id * span - off;
      const hh = 22 + hash11(id * 13) * 40;
      ctx.fillStyle = "#0a1420";
      ctx.fillRect(sx, 300 - hh, 18, hh);
      ctx.fillStyle = "#1a2838";
      ctx.fillRect(sx + 18, 308 - hh * 0.7, 10, hh * 0.7);
      ctx.fillStyle = "#e6b84c";
      if (hash11(id + 3) > 0.38) ctx.fillRect(sx + 4, 300 - hh + 8, 3, 3);
      if (hash11(id + 7) > 0.5) ctx.fillRect(sx + 10, 300 - hh + 16, 3, 3);
      if (hash11(id + 11) > 0.55) ctx.fillRect(sx + 21, 308 - hh * 0.7 + 10, 3, 3);
    }
  }
  const midOff = ((run.scroll * 0.3) % 260 + 260) % 260;
  for (let x = -240; x < W + 260; x += 200) {
    fillHill(x - midOff, 372, 250, 78, pal.mid, pal.midHi);
    fillHill(x - midOff + 88, 362, 160, 58, pal.near, pal.midHi);
  }
  const cSpan = W + 180;
  const cOff = run.scroll * 0.07;
  for (let i = 0; i < 6; i++) {
    const cx = (((i * 200 - cOff) % cSpan) + cSpan) % cSpan - 50;
    drawPixelCloud(cx, 36 + (i % 3) * 26, i % 2 ? 2 : 1.45, pal.cloud);
  }
  const tOff = run.scroll * 0.42;
  const tSpan = 110;
  const tBase = Math.floor(tOff / tSpan);
  for (let i = -1; i < 12; i++) {
    const id = tBase + i;
    if (hash11(id + 9) < 0.62) continue;
    drawTree(id * tSpan - tOff, 404, pal);
  }
  const bOff = run.scroll * 0.55;
  const bSpan = 76;
  const bBase = Math.floor(bOff / bSpan);
  for (let i = -1; i < 15; i++) {
    const id = bBase + i;
    if (hash11(id) < 0.48) continue;
    drawBush(id * bSpan - bOff, 408, pal);
  }
}

function drawGround(pal, W, H) {
  const step = 4;
  const vis = (sx) => groundAt(run, run.scroll + sx) + 6;
  let sx = 0;
  while (sx <= W) {
    if (isGapAt(run, run.scroll + sx)) {
      const g0 = sx;
      while (sx <= W && isGapAt(run, run.scroll + sx)) sx += step;
      ctx.fillStyle = pal.pit;
      ctx.fillRect(g0, BASE_GROUND + 6, sx - g0, H - (BASE_GROUND + 6));
      ctx.fillStyle = pal.pit2;
      ctx.fillRect(g0 + 4, BASE_GROUND + 26, sx - g0 - 8, H - (BASE_GROUND + 26));
      ctx.fillStyle = "#1a1010";
      for (let y = BASE_GROUND + 36; y < H; y += 10) {
        ctx.fillRect(g0 + 8, y, sx - g0 - 16, 2);
      }
      ctx.fillStyle = pal.lip;
      ctx.fillRect(g0 - 2, BASE_GROUND, 6, 16);
      ctx.fillRect(sx - 4, BASE_GROUND, 6, 16);
      ctx.fillStyle = "#d94b3a";
      ctx.fillRect(g0, BASE_GROUND + 2, 4, 4);
      ctx.fillRect(sx - 4, BASE_GROUND + 2, 4, 4);
      continue;
    }
    let e = sx;
    while (e <= W && !isGapAt(run, run.scroll + e)) e += step;
    const x1 = Math.min(e, W);
    ctx.beginPath();
    ctx.moveTo(sx, H);
    for (let x = sx; x <= x1; x += step) ctx.lineTo(x, vis(x));
    ctx.lineTo(x1, H);
    ctx.closePath();
    ctx.fillStyle = pal.dirt;
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sx, H);
    for (let x = sx; x <= x1; x += step) ctx.lineTo(x, vis(x));
    ctx.lineTo(x1, H);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = pal.dirtMid || pal.dirtDk;
    for (let x = sx; x <= x1; x += step) {
      const y = vis(x);
      ctx.fillRect(x, y + 18, step + 1, H - y);
    }
    ctx.fillStyle = pal.dirtDk;
    const tOff = -((run.scroll) % 16);
    for (let tx = tOff; tx < W; tx += 16) ctx.fillRect(tx, 0, 1, H);
    for (let ty = 290; ty < H; ty += 16) ctx.fillRect(0, ty, W, 1);
    for (let x = sx + 12; x < x1; x += 36) {
      if (hash11(Math.floor((run.scroll + x) / 36)) < 0.55) continue;
      ctx.fillStyle = pal.dirtDk;
      ctx.fillRect(x, vis(x) + 14, 5, 3);
    }
    ctx.restore();
    ctx.strokeStyle = pal.grass;
    ctx.lineWidth = 8;
    ctx.beginPath();
    for (let x = sx; x <= x1; x += step) {
      const y = vis(x);
      if (x === sx) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = pal.grassHi || pal.grass;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = sx; x <= x1; x += step) {
      const y = vis(x) - 3;
      if (x === sx) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = pal.lip;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = sx; x <= x1; x += step) {
      const y = vis(x) - 6;
      if (x === sx) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (let x = sx + 8; x < x1; x += 28) {
      const wx = run.scroll + x;
      if (hash11(Math.floor(wx / 28)) < 0.42) continue;
      const gy = vis(x);
      ctx.fillStyle = pal.grassHi || pal.grass;
      ctx.fillRect(x, gy - 10, 3, 10);
      ctx.fillRect(x + 4, gy - 7, 2, 7);
      ctx.fillRect(x - 3, gy - 6, 2, 6);
    }
    sx = e;
  }
}

function drawLight(o, night) {
  const on = Math.sin(o.phase) > 0.62;
  const cx = o.x + o.w / 2;
  const lgy = groundAt(run, run.scroll + cx);
  ctx.fillStyle = "#1a2438";
  ctx.fillRect(cx - 14, 16, 28, 14);
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(cx - 16, 14, 32, 4);
  ctx.fillStyle = on ? "#ffe08a" : "#5d738c";
  ctx.fillRect(cx - 8, 24, 16, 8);
  if (on) {
    const grd = ctx.createLinearGradient(cx, 32, cx, lgy);
    grd.addColorStop(0, night ? "rgba(255, 220, 90, 0.55)" : "rgba(255, 220, 90, 0.42)");
    grd.addColorStop(1, "rgba(255, 210, 80, 0.04)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(cx - 7, 32);
    ctx.lineTo(cx + 7, 32);
    ctx.lineTo(o.x + o.w + 6, lgy - 30);
    ctx.lineTo(o.x - 6, lgy - 30);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 240, 160, 0.35)";
    ctx.fillRect(cx - 3, 32, 6, 10);
  } else {
    ctx.fillStyle = "rgba(93, 115, 140, 0.2)";
    ctx.fillRect(cx - 2, 32, 4, Math.max(40, lgy - 80));
  }
}

function drawCoin(o) {
  const s = o.gold ? 52 : 32;
  const bob = Math.sin(run.t * 0.14 + o.x * 0.03) * 3;
  const spin = 0.28 + Math.abs(Math.sin(run.t * 0.1 + o.x * 0.02)) * 0.72;
  ctx.save();
  ctx.translate(o.x, o.y + bob);
  ctx.fillStyle = o.gold ? "rgba(240, 193, 74, 0.32)" : "rgba(240, 193, 74, 0.16)";
  ctx.fillRect(-s * 0.42, -s * 0.42, s * 0.84, s * 0.84);
  ctx.scale(spin, 1);
  if (imgCoin.complete && imgCoin.naturalWidth) {
    ctx.drawImage(imgCoin, -s / 2, -s / 2, s, s);
  } else {
    ctx.fillStyle = "#f0c14a";
    ctx.fillRect(-10, -10, 20, 20);
  }
  ctx.restore();
  if ((run.t + Math.floor(o.x)) % 18 < 3) {
    ctx.fillStyle = "#fff6c8";
    ctx.fillRect(o.x + 8, o.y + bob - 12, 3, 3);
  }
}

function drawCat() {
  const onFloor = run.y >= run.ground - 1;
  const bob = onFloor ? Math.sin(run.t * 0.35) * 2 : 0;
  const air = Math.max(0, run.ground - run.y);
  const sh = Math.max(6, 18 - air * 0.08);
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.fillRect(PLAYER_SX - sh / 2, run.ground + 4, sh, 5);
  if (!onFloor && run.vy < -1) {
    ctx.fillStyle = "rgba(240, 193, 74, 0.12)";
    ctx.fillRect(PLAYER_SX - 18, run.y - 8, 10, 22);
  }
  const stretch = run.vy < -2 ? 1.1 : run.vy > 5 ? 0.9 : 1;
  ctx.save();
  ctx.translate(PLAYER_SX, run.y + bob);
  ctx.scale(2 - stretch, stretch);
  if (imgCat.complete && imgCat.naturalWidth) {
    ctx.drawImage(imgCat, -24, -30, 48, 48);
  } else {
    ctx.fillStyle = "#c49a4a";
    ctx.fillRect(-16, -10, 32, 24);
  }
  ctx.restore();
}

function drawFx() {
  if (!run.fx) return;
  for (const p of run.fx) {
    ctx.fillStyle = `rgba(196, 154, 74, ${Math.min(1, p.t / 12)})`;
    ctx.fillRect(p.x, p.y, p.s || 3, p.s || 3);
  }
}

function drawTutorialCallout() {
  if (!run.tutorial || !run.tutId) return;
  const pair = TUT_COPY[run.tutId];
  if (!pair) return;
  const title = t(pair[0]);
  const sub = t(pair[1]);
  const a = run.tutAnchor || { x: PLAYER_SX + 10, y: run.y - 58 };
  ctx.font = lang === "en" ? "10px 'Press Start 2P'" : "13px 'Noto Sans', 'Noto Sans SC', sans-serif";
  const pad = 10;
  const tw = Math.min(420, Math.max(ctx.measureText(title).width, ctx.measureText(sub).width) + pad * 2);
  const th = 44;
  let bx = Math.round(a.x - tw / 2);
  let by = Math.round(a.y - th - 10);
  bx = Math.max(8, Math.min(canvas.width - tw - 8, bx));
  by = Math.max(8, Math.min(canvas.height - th - 18, by));
  ctx.fillStyle = "#000";
  ctx.fillRect(bx - 3, by - 3, tw + 6, th + 6);
  ctx.fillStyle = "#f0c14a";
  ctx.fillRect(bx - 2, by - 2, tw + 4, th + 4);
  ctx.fillStyle = "rgba(8, 14, 28, 0.94)";
  ctx.fillRect(bx, by, tw, th);
  ctx.fillStyle = "#ffe08a";
  ctx.fillText(title, bx + pad, by + 18);
  ctx.fillStyle = "#d6e6ff";
  ctx.fillText(sub, bx + pad, by + 36);
  const px = Math.round(Math.max(bx + 12, Math.min(bx + tw - 16, a.x)));
  ctx.fillStyle = "#f0c14a";
  ctx.fillRect(px, by + th + 2, 8, 8);
  if (run.tutId === "jump" && (run.t % 24) < 12) {
    ctx.fillStyle = "#ffe08a";
    ctx.fillRect(PLAYER_SX + 22, run.y - 48, 10, 14);
    ctx.fillRect(PLAYER_SX + 24, run.y - 36, 6, 10);
  }
}

function drawPopped() {
  ctx.font = lang === "en" ? "10px 'Press Start 2P'" : "13px 'Noto Sans', 'Noto Sans SC', sans-serif";
  for (const n of run.popped) {
    ctx.fillStyle = "#000";
    ctx.fillText(n.text, n.x - 19, n.y - (21 - n.t));
    ctx.fillStyle = n.gold ? "#ffe08a" : "#d6e6ff";
    ctx.fillText(n.text, n.x - 20, n.y - (22 - n.t));
    if (n.combo) {
      ctx.fillStyle = "#7fb0ff";
      ctx.fillText(n.combo, n.x - 16, n.y - (36 - n.t));
    }
  }
}

function draw() {
  const W = canvas.width;
  const H = canvas.height;
  const night = run.night;
  const veil = run.invuln > 0;
  const pal = worldPal(night, veil);
  ctx.imageSmoothingEnabled = false;
  drawSky(pal, night, W, H);
  drawParallax(pal, night, W);
  drawGround(pal, W, H);

  for (const o of run.objects) {
    if (o.kind === "coin" && !o.hit) drawCoin(o);
    if (o.kind === "beam") {
      if (o.style === "brick") drawBrick(o, night);
      else drawPipe(o, night);
    }
    if (o.kind === "light") drawLight(o, night);
  }

  drawFx();
  drawCat();
  drawTutorialCallout();

  if (run.flash > 0) {
    ctx.fillStyle = `rgba(230, 184, 76, ${0.08 * run.flash})`;
    ctx.fillRect(0, 0, W, H);
  }

  const vg = ctx.createLinearGradient(0, 0, 0, H);
  vg.addColorStop(0, "rgba(0,0,0,0.18)");
  vg.addColorStop(0.12, "transparent");
  vg.addColorStop(0.88, "transparent");
  vg.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  drawPopped();
}

function finish(whyKey) {
  if (!run || run.dead) return;
  if (run.tutorial) completeTutorial();
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
    await refreshFreeUi();
    pullLiveBoards();
  } catch (e) {
    el.textContent = t("txFail");
  }
}

mountLangs();
applyI18n();
bootTutorial();
show(lobby);
bootWallet();
