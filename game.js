const TIERS = [
  { id: 0, name: "SCOUT", cost: 1, mult: 1, speed: 2.55, speedMax: 4.6, peakAt: 96 },
  { id: 1, name: "RUNNER", cost: 3, mult: 1.5, speed: 2.55, speedMax: 4.6, peakAt: 96 },
  { id: 2, name: "PHANTOM", cost: 6, mult: 2, speed: 2.55, speedMax: 4.6, peakAt: 96 },
  { id: 3, name: "VAULT", cost: 10, mult: 3, speed: 2.55, speedMax: 4.6, peakAt: 96 },
];

function payoutCap(ticket) {
  const n = Number(ticket) || 0;
  return n <= 1 ? +(n * 2).toFixed(6) : +(n * 1.5).toFixed(6);
}

function displayPayout(got, ticket, bps) {
  const cap = payoutCap(ticket);
  return Math.min(Number(got) * (Number(bps || 10500) / 10000), cap);
}

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

function rowPts(r) {
  if (!r) return 0;
  const v = r.score != null ? r.score : r.pts;
  const n = typeof v === "bigint" ? Number(v) : Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

const BOARD_PREVIEW = 20;
const boardOpen = { weekList: false, inviteList: false };

function renderList(id, rows, emptyKey) {
  const el = $(id);
  if (!el) return;
  if (!rows || !rows.length) {
    el.innerHTML = `<li class="empty">${t(emptyKey || "emptyBoard")}</li>`;
    return;
  }
  const explorer = window.CatboxChain?.cfg?.explorer || "https://bscscan.com";
  const open = Boolean(boardOpen[id]);
  const shown = open || rows.length <= BOARD_PREVIEW ? rows : rows.slice(0, BOARD_PREVIEW);
  const items = shown.map((r, i) => {
    const tag = r.addr
      ? `<a href="${explorer}/address/${r.addr}" target="_blank" rel="noopener">${r.tag}</a>`
      : r.tag;
    const name = r.you ? `${tag} · ${t("you")}` : tag;
    return `<li class="${r.you ? "you" : ""}"><span class="tag">${i + 1}. ${name}</span><span>${rowPts(r)}</span></li>`;
  });
  if (rows.length > BOARD_PREVIEW) {
    const label = open ? t("boardCollapse") : t("boardExpand", { n: String(rows.length) });
    items.push(
      `<li class="board-more"><button type="button" data-board-more="${id}">${label}</button></li>`,
    );
  }
  el.innerHTML = items.join("");
}

function bootBoardMore() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-board-more]");
    if (!btn) return;
    const id = btn.getAttribute("data-board-more");
    if (!id) return;
    boardOpen[id] = !boardOpen[id];
    renderBoards();
  });
}

function renderBurns(rows) {
  const el = $("burnList");
  if (!el) return;
  if (!rows || !rows.length) {
    el.innerHTML = `<li class="empty">${t("emptyBurn")}</li>`;
    return;
  }
  const explorer = window.CatboxChain?.cfg?.explorer || "https://bscscan.com";
  el.innerHTML = rows
    .slice(0, 30)
    .map((r) => {
      const amt = window.CatboxChain ? CatboxChain.formatLim(r.amount) : r.amount;
      const who = r.player
        ? `<a href="${explorer}/address/${r.player}" target="_blank" rel="noopener">${r.tag}</a>`
        : r.tag;
      const runBit = r.runId != null ? ` · #${r.runId}` : "";
      const label = `<span class="tag">${who}${runBit} · ${amt} LIM</span>`;
      if (r.hash) {
        const href = CatboxChain.txUrl(r.hash);
        const shortHash = `${r.hash.slice(0, 10)}…${r.hash.slice(-6)}`;
        return `<li>${label}<a href="${href}" target="_blank" rel="noopener">${shortHash}</a></li>`;
      }
      return `<li>${label}</li>`;
    })
    .join("");
}

function mergeWeekBoard(liveWeek) {
  const live = liveWeek || [];
  const localYou = loadBoard().find((r) => r.you);
  if (!localYou) return live;
  const liveYou = live.find((r) => r.you);
  if (liveYou && rowPts(liveYou) >= rowPts(localYou)) return live;
  const others = live.filter((r) => !r.you);
  return [...others, { tag: localYou.tag, score: rowPts(localYou), you: true }]
    .sort((a, b) => rowPts(b) - rowPts(a));
}

function renderBoards() {
  if (window._liveBoards) {
    renderList("weekList", mergeWeekBoard(window._liveBoards.week));
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
    const boards = await CatboxChain.fetchLeaderboards();
    window._liveBoards = boards;
    renderList("weekList", mergeWeekBoard(boards.week));
    renderList("inviteList", boards.invite);
  } catch (_) {}
  try {
    const burns = await CatboxChain.fetchBurns();
    window._liveBurns = burns;
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
      if ($("daySplitLive")) {
        $("daySplitLive").classList.add("hidden");
        $("daySplitLive").textContent = "";
      }
      if ($("inviteTopLive")) {
        $("inviteTopLive").classList.add("hidden");
        $("inviteTopLive").textContent = "";
      }
      return;
    }
    const pool = await CatboxChain.poolBalance();
    if ($("weekPoolAmt")) $("weekPoolAmt").textContent = `${CatboxChain.formatLim(pool.week)} LIM`;
    if ($("invitePoolAmt")) $("invitePoolAmt").textContent = `${CatboxChain.formatLim(pool.invite)} LIM`;
    if ($("burnedAmt")) $("burnedAmt").textContent = `${CatboxChain.formatLim(pool.burned)} LIM`;
    const dayLive = $("daySplitLive");
    const inviteLive = $("inviteTopLive");
    if (dayLive) {
      if (pool.v6 && pool.dayEq != null) {
        dayLive.classList.remove("hidden");
        dayLive.textContent = t("daySplitLive", {
          eq: CatboxChain.formatLim(pool.dayEq ?? pool.day ?? 0n),
          n: String(pool.dayPlayers ?? 0n),
        });
      } else {
        dayLive.classList.add("hidden");
        dayLive.textContent = "";
      }
    }
    if (inviteLive) {
      if (pool.v6 && pool.topLen != null) {
        inviteLive.classList.remove("hidden");
        inviteLive.textContent = t("inviteTopLive", { n: String(pool.topLen) });
      } else {
        inviteLive.classList.add("hidden");
        inviteLive.textContent = "";
      }
    }
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
    dead.textContent = CatboxChain.cfg.dead;
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
  await refreshFreeUi();
  paintShareCtas();
}

async function refreshClaimUi() {
  const amt = $("claimAmt");
  const when = $("claimWhen");
  const btn = $("claimBtn");
  const dailyBtn = $("claimDailyBtn");
  const inviteBtn = $("claimInviteBtn");
  const acc = window.CatboxChain?.account;
  const nextLabel = (ts) => {
    const ms = Math.max(0, Number(ts) * 1000 - Date.now());
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return t("claimWait", { t: `${h}h ${m}m` });
  };
  const paintWait = (whenText) => {
    if (amt) amt.textContent = t("claimNone");
    if (when) when.textContent = whenText || t("claimWhen");
    if (btn) btn.disabled = true;
    if (dailyBtn) {
      dailyBtn.disabled = true;
      dailyBtn.hidden = true;
    }
    if (inviteBtn) {
      inviteBtn.disabled = true;
      inviteBtn.hidden = true;
    }
  };
  if (!acc || !chainReady) {
    const win = window.CatboxChain?.claimWindow?.();
    if (win?.open) paintWait(t("claimOpen"));
    else paintWait(win ? nextLabel(win.nextOpen) : t("claimWhen"));
    return;
  }
  try {
    const win = CatboxChain.claimWindow();
    if (!win.open) {
      paintWait(nextLabel(win.nextOpen));
      return;
    }
    const p = await CatboxChain.pendingOf(acc);
    const dailySettled = p.wk || 0n;
    const inviteSettled = p.inv || 0n;
    const settled = (p.total != null ? p.total : dailySettled + inviteSettled);
    const text = `${CatboxChain.formatLim(settled)} LIM`;
    if (amt) amt.textContent = settled > 0n ? `${t("claimPending")} ${text}` : t("claimNone");
    if (when) when.textContent = settled > 0n ? t("claimReady") : t("claimOpen");
    if (btn) btn.disabled = settled === 0n;
    if (dailyBtn) {
      dailyBtn.disabled = dailySettled === 0n;
      dailyBtn.hidden = dailySettled === 0n;
    }
    if (inviteBtn) {
      inviteBtn.disabled = inviteSettled === 0n;
      inviteBtn.hidden = inviteSettled === 0n;
    }
  } catch (_) {
    paintWait();
  }
}

function assumedFreeUi() {
  return { used: 0, left: 2, pool: 0n, eligible: true, scoutFree: true };
}

function paintFreeUi(st) {
  const el = $("freeLeft");
  const prev = window._freeStatus;
  window._freeStatus = st;
  if (!el) return;
  if (st.left <= 0) el.textContent = "";
  else el.textContent = t("freeLeft", { n: st.left });
  const changed = !prev || prev.left !== st.left || prev.eligible !== st.eligible;
  if (changed && typeof renderTickets === "function") renderTickets();
}

async function refreshFreeUi() {
  const el = $("freeLeft");
  const acc = window.CatboxChain?.account;
  if (!el) return;
  if (!acc || !chainReady) {
    paintFreeUi(assumedFreeUi());
    return;
  }
  try {
    const st = await CatboxChain.freeStatus(acc);
    if (st.used > 0) {
      try { localStorage.setItem(TUTORIAL_KEY, "1"); } catch (_) {}
    }
    try {
      if (await CatboxChain.hasTgBonus(acc)) markTgLocal(acc);
    } catch (_) {}
    paintFreeUi(st);
  } catch (_) {
    paintFreeUi(assumedFreeUi());
  }
}

async function doClaim() {
  const btn = $("claimBtn");
  const dailyBtn = $("claimDailyBtn");
  const inviteBtn = $("claimInviteBtn");
  const amt = $("claimAmt");
  try {
    if (btn) btn.disabled = true;
    if (dailyBtn) dailyBtn.disabled = true;
    if (inviteBtn) inviteBtn.disabled = true;
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
    await refreshClaimUi();
  }
}

let lastInviteSeen = null;

async function refreshInviteUi() {
  const link = $("inviteLink");
  const ptsEl = $("myInvitePts");
  const acc = window.CatboxChain?.account;
  if (link) {
    if (acc) {
      link.value = inviteLinkValue();
    } else {
      link.value = t("connectFirst");
    }
  }
  let bps = 10500;
  let crew = 0;
  let pts = 0;
  if (acc && window.CatboxChain && chainReady) {
    try {
      if (ptsEl) {
        pts = Number(await CatboxChain.invitePoints(acc));
        ptsEl.textContent = String(pts);
      }
      try {
        crew = Number(await CatboxChain.inviteCountOf(acc));
      } catch (_) {
        crew = 0;
      }
      if (!Number.isFinite(crew) || crew < 0) crew = 0;
      bps = Number(await CatboxChain.rewardBpsOf(acc));
      if (!bps || bps < 10500) bps = 10500;
    } catch (_) {
      if (ptsEl) ptsEl.textContent = "0";
    }
  } else if (ptsEl) {
    ptsEl.textContent = "0";
  }
  window._rewardBps = bps;
  window._crewCount = crew;
  const pct = fmtRewardPct(bps);
  if ($("rewardPct")) $("rewardPct").textContent = `${t("rewardCap")} ${pct}`;
  if ($("myRewardPct")) $("myRewardPct").textContent = pct;
  if ($("hudBonus")) $("hudBonus").textContent = pct;
  paintCrew();
  if (acc && chainReady && lastInviteSeen?.ready) {
    if (crew > lastInviteSeen.crew || pts > lastInviteSeen.pts) {
      showToast(t("friendJoined", { pct }));
    }
  }
  if (acc && chainReady) lastInviteSeen = { crew, pts, ready: true };
}

function inviteLinkValue() {
  const acc = window.CatboxChain?.account;
  if (!acc) return "";
  const u = new URL(location.href.split("#")[0]);
  u.searchParams.set("ref", acc);
  return u.toString();
}

function nextInviteSettlePct(crew) {
  const n = Math.max(0, Math.floor(Number(crew) || 0));
  return Math.min(200, 105 + (n + 1) * 5);
}

function paintCrew() {
  const n = Math.max(0, Math.floor(Number(window._crewCount) || 0));
  const filled = Math.min(4, n);
  document.querySelectorAll("[data-crew-slots]").forEach((el) => {
    el.innerHTML = [0, 1, 2, 3]
      .map((i) => `<i class="crew-slot${i < filled ? " on" : ""}"></i>`)
      .join("");
  });
  const need = Math.max(0, 4 - n);
  let line = t("crewFull");
  if (n < 4) {
    line = need === 1
      ? t("crewNeed1", { pct: 125 })
      : t("crewNeedN", { n: need, next: nextInviteSettlePct(n), pct: 125 });
  }
  document.querySelectorAll("[data-crew-cta]").forEach((el) => {
    el.textContent = line;
  });
  document.querySelectorAll("[data-crew-btn]").forEach((el) => {
    el.textContent = need === 1 ? t("crewCopy1") : t("crewCopy");
  });
}

async function copyInviteLink(btn) {
  const acc = window.CatboxChain?.account;
  if (!acc) {
    try {
      await CatboxChain.connect();
    } catch (_) {
      showToast(t("connectFirst"));
      return;
    }
  }
  await refreshInviteUi();
  const val = inviteLinkValue();
  if (!val) {
    showToast(t("connectFirst"));
    return;
  }
  try {
    await navigator.clipboard.writeText(val);
    const label = btn && btn.tagName === "BUTTON" ? btn : $("copyInvite");
    if (label) {
      label.textContent = t("copied");
      setTimeout(() => {
        if (label.hasAttribute("data-crew-btn")) {
          const need = Math.max(0, 4 - Math.floor(Number(window._crewCount) || 0));
          label.textContent = need === 1 ? t("crewCopy1") : t("crewCopy");
        } else if (label.id === "overShareCopy") {
          label.textContent = t("shareCopy");
        } else {
          label.textContent = t("copyInvite");
        }
      }, 1200);
    }
    showToast(t("copied"));
  } catch (_) {}
}

function friendRunKey(addr) {
  return `catbox-friend-run-${String(addr || "anon").toLowerCase()}`;
}

function hasFriendRef() {
  try {
    const ref = window.CatboxChain?.referrer?.() || "";
    if (!ref || ref === ethers.ZeroAddress) return false;
    const acc = window.CatboxChain?.account;
    if (acc && String(ref).toLowerCase() === String(acc).toLowerCase()) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function friendRunPending() {
  if (!hasFriendRef()) return false;
  try {
    return localStorage.getItem(friendRunKey(window.CatboxChain?.account)) !== "1";
  } catch (_) {
    return true;
  }
}

function consumeFriendRun() {
  try {
    localStorage.setItem(friendRunKey(window.CatboxChain?.account), "1");
  } catch (_) {}
}

function shareTweetUrl() {
  const link = inviteLinkValue() || SITE_URL;
  const grab = lastFinish
    ? lastFinish.cap
      ? "100%"
      : `${Math.round((lastFinish.got / Math.max(lastFinish.ticket, 1e-9)) * 100)}%`
    : "";
  const text = t("shareTweet", {
    grab,
    pct: nextInviteSettlePct(window._crewCount || 0),
  });
  const u = new URL("https://twitter.com/intent/tweet");
  u.searchParams.set("text", text);
  u.searchParams.set("url", link);
  return u.toString();
}

function paintOverShare() {
  const box = $("overShare");
  if (!box) return;
  const acc = window.CatboxChain?.account;
  const ratio = lastFinish && lastFinish.ticket > 0 ? lastFinish.got / lastFinish.ticket : 0;
  const hot = Boolean(lastFinish && (lastFinish.cap || ratio >= 0.8));
  if (!hot && !acc) {
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");
  const hook = $("overShareHook");
  if (hook) {
    if (lastFinish?.cap) hook.textContent = t("shareHookFull");
    else if (hot) hook.textContent = t("shareHookHot", { grab: Math.round(ratio * 100) });
    else hook.textContent = t("shareHookSoft");
  }
  const next = $("overShareNext");
  if (next) next.textContent = t("shareNext", { pct: nextInviteSettlePct(window._crewCount || 0) });
  const x = $("overShareX");
  if (x) x.href = shareTweetUrl();
}

function bootLobbyTabs() {
  const tabs = document.querySelectorAll(".lobby-tab");
  if (!tabs.length) return;
  const setTab = (id) => {
    if (!id) id = "play";
    tabs.forEach((b) => b.classList.toggle("on", b.dataset.tab === id));
    document.querySelectorAll(".lobby-pane").forEach((p) => {
      p.classList.toggle("hidden", p.dataset.pane !== id);
    });
  };
  tabs.forEach((btn) => {
    btn.onclick = () => setTab(btn.dataset.tab);
  });
  const open = $("openRules");
  if (open) open.onclick = () => setTab("rules");
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
  $("swapFrom").onchange = () => {
    $("swapStatus")?.classList.remove("ok");
    syncSwapPair("from");
    refreshSwap();
  };
  $("swapTo").onchange = () => {
    $("swapStatus")?.classList.remove("ok");
    syncSwapPair("to");
    refreshSwap();
  };
  $("swapFlip").onclick = () => {
    $("swapStatus")?.classList.remove("ok");
    const from = $("swapFrom").value;
    const to = $("swapTo").value;
    $("swapFrom").value = to;
    $("swapTo").value = from;
    syncSwapPair("from");
    refreshSwap();
  };
  $("swapAmt").oninput = () => {
    $("swapStatus")?.classList.remove("ok");
    clearTimeout(quoteTimer);
    quoteTimer = setTimeout(refreshSwap, 280);
  };
  $("swapGo").onclick = doSwap;
}

function syncSwapPair(changed) {
  const fromEl = $("swapFrom");
  const toEl = $("swapTo");
  if (!fromEl || !toEl) return;
  if (changed === "from") {
    if (fromEl.value === "LIM") {
      if (toEl.value === "LIM") toEl.value = "USDT";
    } else {
      toEl.value = "LIM";
    }
  } else if (toEl.value === "LIM") {
    if (fromEl.value === "LIM") fromEl.value = "USDT";
  } else {
    fromEl.value = "LIM";
  }
}

async function refreshSwap() {
  const modal = $("swapModal");
  if (!modal || modal.classList.contains("hidden")) return;
  const from = $("swapFrom").value;
  const to = $("swapTo")?.value || "LIM";
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
    const q = await CatboxChain.quoteSwap(from, to, ethers.parseUnits(String(raw), 18));
    if (!q.path || q.out === 0n) {
      $("swapOut").value = "0";
      if (status && !status.classList.contains("ok")) status.textContent = t("swapNoLiq");
      return;
    }
    if (status && !status.classList.contains("ok")) status.textContent = "";
    $("swapOut").value = CatboxChain.formatLim(q.out);
  } catch (_) {
    $("swapOut").value = "0";
    if (status && !status.classList.contains("ok")) status.textContent = t("swapNoLiq");
  }
}

let toastTimer = 0;
function showToast(msg) {
  const el = $("toast");
  if (!el || !msg) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 6000);
}

const TG_URL = "https://t.me/Liminal_Official";
const SITE_URL = "https://catboxrun.github.io/catbox-dash/";
const X_TWEET = [
  "🐱 CATBOX DASH · 100,000 LIM AIRDROP",
  "🎮 Jump for LIM coins. Keep what you catch.",
  "",
  "✨ New wallets play two SCOUT runs free.",
  "🔒 Every transfer, private by default.",
  "",
  "@LiminalFi",
].join("\n");

function xIntentUrl() {
  const u = new URL("https://twitter.com/intent/tweet");
  u.searchParams.set("text", X_TWEET);
  u.searchParams.set("url", SITE_URL);
  return u.toString();
}

function bonusKey(kind, addr) {
  return `catbox-${kind}-free-${String(addr).toLowerCase()}`;
}

function bonusClaimedLocal(kind, addr) {
  if (!addr) return false;
  try {
    return localStorage.getItem(bonusKey(kind, addr)) === "1";
  } catch (_) {
    return false;
  }
}

function markBonusLocal(kind, addr) {
  if (!addr) return;
  try {
    localStorage.setItem(bonusKey(kind, addr), "1");
  } catch (_) {}
}

function paintShareCtas() {
  const acc = window.CatboxChain?.account;
  const tgOn = Boolean(acc && bonusClaimedLocal("tg", acc));
  const xOn = Boolean(acc && bonusClaimedLocal("x", acc));
  document.querySelectorAll("a.cta.tg").forEach((a) => {
    const title = a.querySelector(".cta-t");
    const body = a.querySelector(".cta-s");
    if (title) title.textContent = tgOn ? t("tgClaimedBtn") : t("tgBtn");
    if (body) body.textContent = t(tgOn ? "tgClaimedBody" : "tgBody");
  });
  document.querySelectorAll("a.cta.x").forEach((a) => {
    const title = a.querySelector(".cta-t");
    const body = a.querySelector(".cta-s");
    if (title) title.textContent = xOn ? t("xClaimedBtn") : t("xBtn");
    if (body) body.textContent = t(xOn ? "xClaimedBody" : "xBody");
  });
}

async function claimShareBonus(kind) {
  const chain = window.CatboxChain;
  if (!chain) throw new Error("NO_WALLET");
  if (!window.ethereum) throw new Error("NO_WALLET");
  if (!chain.account) await chain.connect();
  const addr = chain.account;
  if (!addr) throw new Error("NO_WALLET");
  let onchain = false;
  try {
    onchain = kind === "x" ? await chain.claimXBonus() : await chain.claimTgBonus();
  } catch (_) {
    onchain = false;
  }
  markBonusLocal(kind, addr);
  paintShareCtas();
  try {
    await refreshFreeUi();
  } catch (_) {}
  if (onchain) showToast(t(kind === "x" ? "xClaimedOn" : "tgClaimedOn"));
  else showToast(t(kind === "x" ? "xClaimedSaved" : "tgClaimedSaved"));
}

function bootShare() {
  document.querySelectorAll("a.cta.tg").forEach((a) => {
    a.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await claimShareBonus("tg");
      } catch (_) {
        showToast(t("connectFirst"));
      }
      window.open(TG_URL, "_blank", "noopener,noreferrer");
    });
  });
  document.querySelectorAll("a.cta.x").forEach((a) => {
    a.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await claimShareBonus("x");
      } catch (_) {
        showToast(t("connectFirst"));
      }
      window.open(xIntentUrl(), "_blank", "noopener,noreferrer");
    });
  });
}

async function doSwap() {
  const status = $("swapStatus");
  const raw = $("swapAmt").value;
  if (!raw || Number(raw) <= 0) return;
  const from = $("swapFrom").value;
  const to = $("swapTo")?.value || "LIM";
  const expect = $("swapOut")?.value;
  status.classList.remove("ok");
  try {
    status.textContent = t("swapping");
    const hash = await CatboxChain.swapExact(from, to, ethers.parseUnits(String(raw), 18));
    const n = expect && expect !== "0" ? expect : "";
    const selling = from === "LIM";
    const msg = selling
      ? n
        ? t("swapSellOkAmt", { n, sym: to })
        : t("swapSellOk", { sym: to })
      : n
        ? t("swapOkAmt", { n })
        : t("swapOk");
    try {
      await refreshWalletUi();
      await refreshSwap();
    } catch (_) {}
    status.classList.add("ok");
    status.innerHTML = `${msg}<br><a href="${CatboxChain.txUrl(hash)}" target="_blank" rel="noopener">${hash.slice(0, 10)}…</a>`;
    showToast(msg);
  } catch (e) {
    status.classList.remove("ok");
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

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

async function bootWallet() {
  if (!window.CatboxChain) return;
  startLiveClock();
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
      const accs = await withTimeout(window.ethereum.request({ method: "eth_accounts" }), 2500);
      if (accs[0]) await withTimeout(CatboxChain.connect(), 8000);
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
  $("copyInvite").onclick = () => copyInviteLink($("copyInvite"));
  document.querySelectorAll(".js-copy-invite").forEach((btn) => {
    if (btn.id === "copyInvite") return;
    btn.onclick = () => copyInviteLink(btn);
  });
  bootSwap();
  bootShare();
  $("claimBtn") && ($("claimBtn").onclick = doClaim);
  $("claimDailyBtn") && ($("claimDailyBtn").onclick = doClaim);
  $("claimInviteBtn") && ($("claimInviteBtn").onclick = doClaim);
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
imgCoin.src = "./assets/coin.png?v=4";
const imgCat = new Image();
imgCat.src = "./assets/catbox.png?v=3";
let coinMark = null;
function punchCoinMark() {
  if (!imgCoin.naturalWidth) return;
  const w = imgCoin.naturalWidth;
  const h = imgCoin.naturalHeight;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.drawImage(imgCoin, 0, 0);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const isBg = (i) => {
    const r = d[i];
    const gv = d[i + 1];
    const b = d[i + 2];
    const mx = r > gv ? (r > b ? r : b) : gv > b ? gv : b;
    const mn = r < gv ? (r < b ? r : b) : gv < b ? gv : b;
    return mx < 28 || (mn > 232 && mx - mn < 18);
  };
  const seen = new Uint8Array(w * h);
  const q = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (seen[idx]) return;
    seen[idx] = 1;
    q.push(idx);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (q.length) {
    const idx = q.pop();
    const i = idx * 4;
    if (!isBg(i)) continue;
    d[i + 3] = 0;
    const x = idx % w;
    const y = (idx / w) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  g.putImageData(img, 0, 0);
  coinMark = c;
}
imgCoin.addEventListener("load", punchCoinMark);
if (imgCoin.complete) punchCoinMark();

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
  if (!tier || tier.id !== 0) return false;
  const st = window._freeStatus;
  if (!st) return true;
  return Number(st.left) > 0;
}

function freeForTier(tier) {
  return scoutIsFree(tier);
}

function renderTickets() {
  const glyphs = [
    "./assets/coin.png?v=4",
    "./assets/icon-ticket.png?v=2",
    "./assets/icon-trophy.png?v=2",
    "./assets/icon-burn.png?v=2",
  ];
  $("tickets").innerHTML = TIERS.map((tier) => {
    const copy = tierText(tier.id);
    const free = freeForTier(tier);
    return `
    <button class="ticket t${tier.id}" data-id="${tier.id}">
      <img class="ticket-mascot" src="./assets/hero-cat.png?v=3" alt="" />
      <img class="ticket-coin" src="${glyphs[tier.id]}" alt="" />
      ${free ? `<span class="free-badge">${t("freeScout")} · ${tier.cost} LIM</span>` : ""}
      <div class="cost"><img src="./assets/icon-ticket.png?v=2" alt="" />${free ? t("freeScout") + " · " : ""}${tier.cost} LIM</div>
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
  const free = freeForTier(tier);
  $("payTitle").textContent = free ? `${t("freeScout")} · ${tier.cost} LIM` : `${tier.cost} LIM`;
  $("payCopy").textContent = free
    ? t("freePay")
    : t("payCopy", { name: copy.name, cost: tier.cost, cap: payoutCap(tier.cost) });
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

function fmtRewardPct(bps) {
  const n = Number(bps || 10500);
  const pct = n / 100;
  if (Math.abs(pct - Math.round(pct)) < 1e-9) return `${Math.round(pct)}%`;
  return `${pct.toFixed(1)}%`;
}

function refreshOver() {
  if (!lastFinish || over.classList.contains("hidden")) return;
  const { cap, ticket, got, leftover, score, coins, whyKey, rank, burned, burnHash, payout, bps, free } = lastFinish;
  const fail = String(whyKey || "").startsWith("die");
  over.classList.toggle("cap", Boolean(cap));
  const whyEl = $("overWhy");
  if (whyEl) {
    if (cap && fail) {
      whyEl.textContent = t(`${whyKey}Cap`);
      whyEl.className = `over-why encore ${whyKey}`;
    } else {
      whyEl.textContent = t(whyKey);
      whyEl.className = `over-why ${whyKey}`;
    }
  }
  if (cap) {
    $("overKicker").textContent = t("overFullK");
    $("overTitle").textContent = t("overFullT");
  } else if (fail) {
    $("overKicker").textContent = t("overFailK");
    $("overTitle").textContent = t(`${whyKey}Title`);
  } else {
    $("overKicker").textContent = t("overPartK");
    $("overTitle").textContent = t("overPartT");
  }
  const burnAmt = leftover * 0.3;
  const weekAmt = leftover * 0.5;
  const invAmt = leftover * 0.2;
  const burnShown = typeof burned === "number" ? burned : burnAmt;
  const pct = fmtRewardPct(bps || window._rewardBps || 10500).replace("%", "");
  const paid = payout != null ? payout : displayPayout(got, ticket, bps || window._rewardBps || 10500);
  $("overResult").innerHTML = t(cap ? "resultFull" : "resultPart", {
    coins,
    got: got.toFixed(4),
    paid: Number(paid).toFixed(4),
    pct,
    ticket,
    cap: payoutCap(ticket),
    score,
    left: leftover.toFixed(4),
    burn: Number(burnShown).toFixed(4),
    week: weekAmt.toFixed(4),
    invite: invAmt.toFixed(4),
  });
  const posted = $("overPosted");
  if (posted) {
    posted.textContent = free ? t("overPostedSkip") : t("overPosted", { rank: rank || "—" });
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
  paintOverShare();
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
    const free = freeForTier(selected);
    const teach = shouldTeach(selected);
    status.textContent = free ? t("paying") : t("approve");
    const hash = await CatboxChain.approveAndEnter(selected.id);
    status.innerHTML = `<a href="${CatboxChain.txUrl(hash)}" target="_blank" rel="noopener">${hash.slice(0, 10)}…</a>`;
    await refreshInviteUi();
    enterPlay();
    startRun(selected, teach, free);
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
  const min = Math.max(0.012, cost * 0.015);
  const maxP = cost * 0.055;
  let guard = 0;
  while (remain > min && guard++ < 40) {
    const r = Math.random();
    let pct;
    if (r < 0.18) pct = 0.04 + Math.random() * 0.015;
    else if (r < 0.55) pct = 0.025 + Math.random() * 0.012;
    else pct = 0.016 + Math.random() * 0.01;
    let v = Math.min(cost * pct, maxP, remain);
    v = +v.toFixed(4);
    if (v <= 0) break;
    pieces.push(v);
    remain = +(remain - v).toFixed(4);
  }
  if (remain > 0) {
    if (pieces.length) pieces[pieces.length - 1] = +(pieces[pieces.length - 1] + remain).toFixed(4);
    else pieces.push(+remain.toFixed(4));
  }
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
  if (st && st.scoutFree === false) return false;
  if (st && Number(st.left) <= 0 && st.scoutFree == null) return false;
  if (Number(st?.used) > 0) return false;
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
  spawnCoinW(state, 640, g - 48);
  spawnCoinW(state, 920, g - 40);
  state.objects.push({ kind: "light", x: 1080, w: 74, phase: 0, slow: 0.022, armed: false });
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

function startRun(tier, teach, freeRun) {
  run = {
    tier,
    free: Boolean(freeRun),
    t: 0,
    dist: 0,
    coins: 0,
    raw: 0,
    combo: 0,
    collected: 0,
    bag: splitTicket(tier.cost),
    bagI: 0,
    extraBag: splitTicket(Math.max(0, payoutCap(tier.cost) - tier.cost)),
    extraI: 0,
    dead: false,
    invuln: 80,
    jumps: 0,
    coyote: 0,
    y: 340,
    vy: 0,
    ground: BASE_GROUND,
    scroll: 0,
    terrain: [{ kind: "flat", x0: -480, x1: 680, y: BASE_GROUND }],
    nextTerrain: 680,
    objects: [],
    lastHazard: -999,
    lastJumpT: 0,
    lastLightWx: -9999,
    lastGapWx: -9999,
    lastCoinWx: -9999,
    ledges: [],
    sawLight: false,
    night: false,
    popped: [],
    flash: 0,
    clearWait: 0,
    coinsOut: false,
    overtime: false,
    overtimeT: 0,
    grabMarks: 0,
    speedMarks: 0,
    notePri: 0,
    noteT: 0,
    startedMs: Date.now(),
    magnet: 56,
    magnetPull: 0.16,
    friend: false,
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
  if (friendRunPending()) {
    run.friend = true;
    run.invuln = Math.max(run.invuln, 150);
    run.magnet = 92;
    run.magnetPull = 0.28;
    consumeFriendRun();
  }
  $("hudTier").textContent = `${tierText(tier.id).name} · ${tier.cost} LIM`;
  $("rebateBar").style.width = "0%";
  $("hudRebate").textContent = `0.00/${payoutCap(tier.cost)} LIM`;
  if ($("hudBonus")) $("hudBonus").textContent = fmtRewardPct(window._rewardBps || 10500);
  const friendChip = $("hudFriend");
  if (friendChip) friendChip.classList.toggle("hidden", !run.friend);
  $("runNote")?.classList.add("hidden");
  $("hudScore")?.parentElement?.classList.remove("x2");
  show(game);
  if (run.friend) showRunNote("friendNote", { flash: true });
  cancelAnimationFrame(raf);
  accMs = 0;
  lastTs = 0;
  raf = requestAnimationFrame(loop);
}

function progress(run) {
  const sec = run.t / 60;
  if (sec < 8) return 0;
  return Math.min(1, (sec - 8) / run.tier.peakAt);
}

function currentSpeed(run) {
  const p = progress(run);
  const grab = run.tier.cost > 0 ? run.collected / run.tier.cost : 0;
  let haste = Math.pow(p, 1.4) * 0.72;
  if (grab > 0.7) haste += (grab - 0.7) * 0.25;
  if (run.overtime) {
    let u = Math.min(1, (run.overtimeT || 0) / 150);
    u = u * u * (3 - 2 * u);
    haste += 0.18 * u;
  }
  haste = Math.min(0.82, haste);
  return run.tier.speed + (run.tier.speedMax - run.tier.speed) * haste;
}

function addRaw(n) {
  run.raw += run.overtime ? n * 2 : n;
}

function reachableCoinY(run, wx) {
  const gy = groundAt(run, wx);
  const maxLift = isGapAt(run, wx) ? 72 : 78;
  const minLift = 22;
  return gy - (minLift + Math.random() * (maxLift - minLift));
}

function placeCoin(run, x, y, amount, extra) {
  const gold = extra || amount >= run.tier.cost * 0.02;
  run.objects.push({
    kind: "coin",
    x,
    y,
    baseY: y,
    hit: false,
    amount,
    gold,
    extra: Boolean(extra),
    bob: Math.random() * Math.PI * 2,
  });
}

function limCap(run) {
  return payoutCap(run.tier.cost);
}

function canSpawnLim(run) {
  if (run.collected + 1e-9 >= limCap(run)) return false;
  if (!run.overtime) return run.bagI < run.bag.length;
  return (run.extraI || 0) < (run.extraBag || []).length;
}

function spawnCoin(run, x, y) {
  if (!canSpawnLim(run)) return;
  let amount;
  let extra = false;
  if (!run.overtime) {
    amount = run.bag[run.bagI++];
  } else {
    amount = run.extraBag[run.extraI++];
    extra = true;
  }
  placeCoin(run, x, y, amount, extra);
}

function recycleMissedCoin(run, amount) {
  if (run.collected + 1e-9 >= limCap(run)) return;
  const x = canvas.width * 0.78 + Math.random() * 90;
  const wx = run.scroll + x;
  placeCoin(run, x, reachableCoinY(run, wx), amount, Boolean(run.overtime));
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

function landingLedge(run, wx, py, vy) {
  if (!run.ledges || !run.ledges.length || vy < -0.2) return null;
  let best = null;
  for (let i = 0; i < run.ledges.length; i++) {
    const L = run.ledges[i];
    if (wx < L.x0 + 2 || wx >= L.x1 - 2) continue;
    if (py <= L.y + 12 && py >= L.y - 44) {
      if (best == null || L.y < best) best = L.y;
    }
  }
  return best;
}

function bonkCeiling(run, wx, py, prevY, vy) {
  if (!run.ledges || !run.ledges.length || vy >= 0) return null;
  const head = 28;
  const slab = 16;
  let hit = null;
  for (let i = 0; i < run.ledges.length; i++) {
    const L = run.ledges[i];
    if (wx < L.x0 + 2 || wx >= L.x1 - 2) continue;
    if (py <= L.y + 4) continue;
    const under = L.y + slab;
    if (py - head <= under && prevY - head > under - 8) {
      const feet = under + head;
      if (hit == null || feet > hit) hit = feet;
    }
  }
  return hit;
}

function pushLedge(run, x0, x1, y) {
  if (!run.ledges) run.ledges = [];
  run.ledges.push({ x0, x1, y });
}

function spawnShelfAt(run, x) {
  const w = 188 + Math.floor(Math.random() * 72);
  const pad = 32;
  pushFlat(run, x, x + pad + w + pad);
  const x0 = x + pad;
  const x1 = x + pad + w;
  const ly = BASE_GROUND - 72;
  pushLedge(run, x0, x1, ly);
  spawnCoinW(run, x0 + w * 0.48, ly - 38);
  return x + pad + w + pad;
}

function spawnCoinW(run, wx, wy) {
  if (run.lastCoinWx != null && wx - run.lastCoinWx < 240) return;
  spawnCoin(run, wx - run.scroll, wy);
  run.lastCoinWx = wx;
}

function coinArc(run, x0, x1) {
  spawnCoinW(run, x0 + (x1 - x0) * 0.5, reachableCoinY(run, x0 + (x1 - x0) * 0.5));
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
    if (run.ledges) run.ledges = run.ledges.filter((L) => L.x1 > cut);
  }
}

function addTerrainChunk(run) {
  const p = progress(run);
  let x = run.nextTerrain;
  const bag = canSpawnLim(run);
  if (!bag) {
    addHazardChunk(run, x, Math.min(1, progress(run) + 0.08 + (run.overtime ? 0.08 : 0)), false);
    return;
  }

  const sinceHazard = run.t - run.lastHazard;
  const grab = run.collected / run.tier.cost;
  const idle = run.t - (run.lastJumpT || 0) > 240;
  const minGap = Math.max(48, 108 - p * 18 - grab * 8);
  const roll = Math.random();
  const pad = 36 + Math.floor(Math.random() * 28);
  pushFlat(run, x, x + pad);
  x += pad;

  if (!run.tutorial && !run.sawLight && run.t > 168 && bag) {
    addHazardChunk(run, x, Math.max(p, 0.06), true, "light");
    return;
  }

  const safeChance = Math.max(0.18, 0.52 - p * 0.16 - grab * 0.06);
  const wantSafe = !idle && (p < 0.08 || roll < safeChance || sinceHazard < minGap);

  if (wantSafe) {
    const flavor = Math.random();
    if (flavor < 0.28 && p > 0.02) {
      const w = 340 + Math.floor(Math.random() * 180);
      const peak = 22 + Math.floor(Math.random() * 28);
      run.terrain.push({ kind: "hill", x0: x, x1: x + w, y: BASE_GROUND, peak });
      coinArc(run, x, x + w);
      x += w;
    } else if (flavor < 0.42 && p > 0.18) {
      const w = 120 + Math.floor(Math.random() * 40);
      const peak = 16 + Math.floor(Math.random() * 10);
      run.terrain.push({ kind: "bump", x0: x, x1: x + w, y: BASE_GROUND, peak });
      spawnCoinW(run, x + w * 0.5, BASE_GROUND - peak - 42);
      x += w;
    } else if (flavor < 0.72) {
      x = spawnShelfAt(run, x);
    } else {
      const w = 240 + Math.floor(Math.random() * 100);
      pushFlat(run, x, x + w);
      const mid = BASE_GROUND - 28 + Math.random() * 22;
      spawnCoinW(run, x + w * 0.55, mid);
      x += w;
    }
    run.nextTerrain = x;
    return;
  }

  addHazardChunk(run, x, p, true);
}

function addHazardChunk(run, x, p, withCoins, forceKind) {
  const roll = Math.random();
  const pad = 40 + Math.floor(Math.random() * 36);
  pushFlat(run, x, x + pad);
  x += pad;

  const nearLight = Math.abs(x - (run.lastLightWx || -99999)) < 360;
  const nearGap = Math.abs(x - (run.lastGapWx || -99999)) < 380;
  const idle = run.t - (run.lastJumpT || 0) > 240;

  let kind = forceKind;
  if (!kind) {
    if (idle && !nearLight && p > 0.08) kind = "gap";
    else if (nearGap) kind = roll < 0.62 ? "pipe" : "light";
    else if (nearLight) kind = roll < 0.55 ? "pipe" : "gap";
    else if (p < 0.16) kind = roll < 0.55 ? "light" : "pipe";
    else if (roll < 0.28) kind = "light";
    else if (roll < 0.72) kind = "pipe";
    else kind = "gap";
  }

  if (!forceKind) {
    if (kind === "light" && nearGap) kind = "pipe";
    if (kind === "gap" && nearLight) kind = "pipe";
  }

  if (kind === "light") {
    const w = 148 + Math.floor(p * 16);
    pushFlat(run, x, x + w);
    run.objects.push({
      kind: "light",
      x: x + 24 - run.scroll,
      w: 58 + p * 16,
      phase: 0,
      slow: 0.012 + p * 0.006,
      armed: false,
    });
    if (withCoins) spawnCoinW(run, x + 58, BASE_GROUND - 26);
    run.lastHazard = run.t;
    run.lastLightWx = x + 24 + (70 + p * 24) / 2;
    run.sawLight = true;
    x += w;
    if (withCoins && Math.random() < 0.62) x = spawnShelfAt(run, x);
  } else if (kind === "pipe") {
    const duo = Math.random() < 0.12 && p > 0.45;
    const w = duo ? 196 : 124;
    pushFlat(run, x, x + w);
    const style = Math.random() < 0.42 ? "brick" : "pipe";
    const h = style === "brick" ? 22 : 32 + Math.floor(Math.random() * 12);
    const bw = style === "brick" ? 32 : 28;
    const spots = duo ? [x + 36, x + 108] : [x + 40];
    for (const wx of spots) {
      run.objects.push({
        kind: "beam",
        x: wx - run.scroll,
        y: BASE_GROUND - h,
        w: bw,
        h,
        style,
      });
    }
    if (withCoins) {
      spawnCoinW(run, x + (duo ? 88 : 70), BASE_GROUND - h - 56);
    }
    run.lastHazard = run.t;
    x += w;
  } else {
    const gw = 42 + p * 10;
    const ap = 88;
    pushFlat(run, x, x + ap);
    run.terrain.push({ kind: "gap", x0: x + ap, x1: x + ap + gw, y: BASE_GROUND });
    pushFlat(run, x + ap + gw, x + ap + gw + ap);
    if (withCoins) spawnCoinW(run, x + ap + gw * 0.5, BASE_GROUND - 96);
    run.lastHazard = run.t;
    run.lastGapWx = x + ap + gw / 2;
    x += ap + gw + ap;
  }
  run.nextTerrain = x;
}

function jump() {
  if (!run || run.dead) return;
  const onFloor = run.y >= run.ground - 2 || run.coyote > 0;
  if (onFloor && run.jumps === 0) {
    run.vy = -13.2;
    run.jumps = 1;
    run.coyote = 0;
    run.lastJumpT = run.t;
    spawnDust(PLAYER_SX, run.ground);
  } else if (run.jumps < 2) {
    run.vy = -11.8;
    run.jumps = 2;
    run.lastJumpT = run.t;
    if (run.fx) {
      for (let i = 0; i < 4; i++) {
        run.fx.push({
          kind: "dust",
          x: PLAYER_SX + (Math.random() - 0.5) * 10,
          y: run.y,
          vx: (Math.random() - 0.5) * 2,
          vy: 1.2 + Math.random(),
          t: 8 + Math.floor(Math.random() * 6),
          s: 2,
        });
      }
    }
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
  run.t += 1;
  run.dist += spd * 0.35;
  run.scroll += spd;
  ensureTerrain(run);

  const px = PLAYER_SX;
  const pwx = run.scroll + px;
  const gy = groundAt(run, pwx);
  const prevY = run.y;
  const wasAir = run.wasAir;

  const stick =
    run.jumps === 0 &&
    run.vy >= 0 &&
    run.y >= run.ground - 8 &&
    run.y <= run.ground + 16 &&
    !(isGapAt(run, pwx) && landingLedge(run, pwx, run.y, run.vy) == null);

  if (stick) {
    run.y = run.ground;
    run.vy = 0;
    run.coyote = 12;
  } else {
    if (!isGapAt(run, pwx) && run.y >= run.ground - 1) run.coyote = 12;
    else if (run.coyote > 0) run.coyote -= 1;
    run.vy += 0.42;
    run.y += run.vy;
  }

  const ceiling = bonkCeiling(run, pwx, run.y, prevY, run.vy);
  if (ceiling != null) {
    run.y = ceiling;
    run.vy = 0.8;
  }

  const ledgeY = landingLedge(run, pwx, run.y, run.vy);
  const overGap = isGapAt(run, pwx) && ledgeY == null;
  const floor = ledgeY != null ? ledgeY : gy;
  run.ground = floor;

  if (!overGap && run.y > floor) {
    run.y = floor;
    run.vy = 0;
    run.jumps = 0;
  }
  if (wasAir && run.jumps === 0 && !overGap && run.y >= floor - 2) spawnDust(px, floor);
  run.wasAir = run.jumps > 0 || run.y < floor - 4;
  if (run.invuln > 0) run.invuln -= 1;

  const py = run.y;
  const hb = { x: px - 14, y: py - 20, w: 28, h: 32 };

  if (overGap && py >= gy - 2) {
    finish("dieGap");
    return;
  }

  for (const o of run.objects) {
    o.x -= spd;
    if (o.kind === "light") {
      if (!o.armed && o.x < 480) {
        o.armed = true;
        o.phase = 0.18;
      }
      if (o.armed) o.phase += o.slow || 0.02;
      if (!o.hinted && o.x < 400 && o.x > 70) {
        o.hinted = true;
        showRunNote("stayLow", { flash: true });
      }
    }
    if (o.kind === "beam") {
      o.y = groundAt(run, run.scroll + o.x + o.w / 2) - o.h;
    }

    if (o.kind === "coin" && !o.hit) {
      o.bob = (o.bob || 0) + 0.14;
      const mag = dist(px, py, o.x, o.y);
      const reach = run.magnet || 56;
      const pull = run.magnetPull || 0.16;
      if (mag < reach && mag > 2) {
        o.x += (px - o.x) * pull;
        o.y += (py - o.y) * pull;
        o.baseY = o.y;
      } else if (o.baseY != null) {
        o.y = o.baseY + Math.sin(o.bob) * 4;
      }
    }

    if (o.kind === "coin" && !o.hit && dist(px, py, o.x, o.y) < (o.gold ? 48 : 40)) {
      o.hit = true;
      run.coins += 1;
      run.combo += 1;
      run.collected = Math.min(limCap(run), +(run.collected + o.amount).toFixed(6));
      addRaw(36 + Math.round((o.amount / run.tier.cost) * 900) + Math.min(run.combo, 12) * 10);
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
    if (o.kind === "coin" && !o.hit && o.x < -36) {
      recycleMissedCoin(run, o.amount);
      o.hit = true;
    }

    if (run.invuln > 0) continue;
    if (o.kind === "beam") {
      const hit = aabb(hb.x, hb.y, hb.w, hb.h, o.x, o.y, o.w, o.h);
      const near = aabb(hb.x - 10, hb.y - 8, hb.w + 20, hb.h + 16, o.x, o.y, o.w, o.h);
      if (hit) {
        finish("dieBlock");
        return;
      }
      if (near && !o.missed) {
        o.missed = true;
        addRaw(48);
        spawnDust(o.x + o.w / 2, o.y);
      }
    }
    if (o.kind === "light") {
      const on = Math.sin(o.phase) > 0.72;
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
  if (run.overtime) run.overtimeT = (run.overtimeT || 0) + 1;
  if (run.flash > 0) run.flash -= 1;
  if (run.t - (run.lastJumpT || 0) < 96) addRaw(0.22);
  const cap = limCap(run);
  const pct = (run.collected / cap) * 100;
  $("hudRebate").textContent = `${run.collected.toFixed(3)}/${cap} LIM`;
  $("rebateBar").style.width = `${Math.min(100, pct)}%`;
  $("hudScore").textContent = String(boardScore());
  if (!run.tutorial) {
    const grab = run.tier.cost > 0 ? run.collected / run.tier.cost : 0;
    const grabKeys = [
      [0.25, "grab25", 1],
      [0.5, "grab50", 2],
      [0.75, "grab75", 4],
    ];
    let grabNote = "";
    for (const [th, key, bit] of grabKeys) {
      if (grab >= th && !(run.grabMarks & bit)) {
        run.grabMarks |= bit;
        grabNote = key;
      }
    }
    if (grabNote) showRunNote(grabNote, { flash: true });
    const curve = Math.pow(progress(run), 1.4);
    const speedKeys = [
      [0.25, 1],
      [0.5, 2],
      [0.75, 4],
    ];
    for (const [th, bit] of speedKeys) {
      if (curve >= th && !(run.speedMarks & bit)) {
        run.speedMarks |= bit;
        showRunNote("trackHaste", { soft: true });
      }
    }
  }
  if (!run.overtime && run.collected + 1e-9 >= run.tier.cost) {
    run.overtime = true;
    run.overtimeT = 0;
    showRunNote("coinsOutFull", { flash: true });
    $("hudScore")?.parentElement?.classList.add("x2");
  } else if (run.overtime && !run.coinsOut && !canSpawnLim(run)) {
    run.coinsOut = true;
    showRunNote("coinsOut", { soft: true });
  }
  if (run.noteT > 0) {
    run.noteT -= 1;
    if (run.noteT <= 0) {
      run.notePri = 0;
      $("runNote")?.classList.add("hidden");
    }
  }
  if (run.tutorial) tickTutorial();
}

function showRunNote(key, opts = {}) {
  if (opts.soft && run.notePri > 0) return;
  run.noteT = opts.soft ? 140 : 200;
  run.notePri = opts.soft ? 0 : 1;
  if (opts.flash) run.flash = Math.max(run.flash || 0, 14);
  const note = $("runNote");
  if (!note) return;
  note.textContent = t(key);
  note.classList.remove("hidden");
}

function boardScore() {
  return Math.floor(run.raw * run.tier.mult);
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}
function aabb(x, y, w, h, x2, y2, w2, h2) {
  return x < x2 + w2 && x + w > x2 && y < y2 + h2 && y + h > y2;
}

function worldPal(night, veil) {
  return {
    skyTop: veil ? "#c5d2e4" : "#cfe0f2",
    skyMid: veil ? "#d7e2ee" : "#dde8f4",
    skyHor: veil ? "#efe3cf" : "#f6ead4",
    far: "#b7c6b4",
    farHi: "#d2ddd0",
    mid: "#9eb49a",
    midHi: "#c3d2be",
    near: "#88a384",
    bush: "#5f9a62",
    bushHi: "#d4b45a",
    cloud: "#fffef8",
    dirt: "#cbb392",
    dirtMid: "#b99a78",
    dirtDk: "#9e8060",
    grass: "#6fb86a",
    grassHi: "#a4dc86",
    lip: "#d4b45a",
    pit: "#c4b49c",
    pit2: "#a89478",
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
  g.addColorStop(1, night ? "#d8c4a8" : "#e8c48a");
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
      ctx.fillStyle = "#3a5070";
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
  const lethal = Math.sin(o.phase) > 0.72;
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
  const tunnel = 52;
  ctx.fillStyle = lethal ? "rgba(8, 14, 24, 0.55)" : "rgba(8, 14, 24, 0.28)";
  ctx.fillRect(o.x - 8, lgy - tunnel, o.w + 16, tunnel + 4);
  ctx.fillStyle = "#f0c14a";
  ctx.fillRect(o.x - 8, lgy - 6, o.w + 16, 3);
  ctx.fillStyle = "#ffe08a";
  const mid = Math.round(cx);
  ctx.fillRect(mid - 5, lgy - 18, 10, 3);
  ctx.fillRect(mid - 3, lgy - 14, 6, 3);
  ctx.fillRect(mid - 1, lgy - 10, 2, 4);
  ctx.font = lang === "en" ? "8px 'Press Start 2P'" : "12px 'Noto Sans SC', 'Noto Sans', sans-serif";
  ctx.fillStyle = "#000";
  ctx.fillText(t("stayLow"), mid - 31, lgy + 16);
  ctx.fillStyle = "#ffe08a";
  ctx.fillText(t("stayLow"), mid - 32, lgy + 15);
}

function drawLedges(pal) {
  if (!run.ledges) return;
  for (const L of run.ledges) {
    const x = Math.round(L.x0 - run.scroll);
    const w = Math.round(L.x1 - L.x0);
    const y = Math.round(L.y);
    if (x + w < -20 || x > canvas.width + 20) continue;
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(x + 4, y + 8, w, 6);
    ctx.fillStyle = pal.dirt || "#2a3a28";
    ctx.fillRect(x, y, w, 14);
    ctx.fillStyle = pal.grass || "#3d9a4a";
    ctx.fillRect(x, y - 5, w, 6);
    ctx.fillStyle = pal.grassHi || "#7ae08a";
    ctx.fillRect(x + 2, y - 7, w - 4, 3);
    ctx.fillStyle = pal.lip || "#c9a24a";
    ctx.fillRect(x, y - 1, w, 2);
  }
}

function drawLimMark(s) {
  const rings = [
    [-0.16, -0.16, "#e8a84a", -0.55],
    [0.16, -0.16, "#4ec4e8", 0.55],
    [-0.16, 0.16, "#c45ec8", 0.55],
    [0.16, 0.16, "#9ad84a", -0.55],
  ];
  ctx.lineWidth = Math.max(3, s * 0.11);
  ctx.lineCap = "round";
  for (const [dx, dy, col, rot] of rings) {
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.ellipse(dx * s, dy * s, s * 0.26, s * 0.16, rot, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawCoin(o) {
  const s = o.gold ? 48 : 36;
  const bob = Math.sin((o.bob || 0)) * 3;
  const spin = 0.86 + Math.abs(Math.sin(run.t * 0.08 + o.x * 0.02)) * 0.14;
  const x = Math.round(o.x);
  const y = Math.round(o.y + bob);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(spin, 1);
  ctx.imageSmoothingEnabled = true;
  if (coinMark) ctx.drawImage(coinMark, -s / 2, -s / 2, s, s);
  else drawLimMark(s);
  ctx.restore();
  ctx.imageSmoothingEnabled = false;
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
  drawLedges(pal);

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
  vg.addColorStop(0, "rgba(255, 248, 236, 0.18)");
  vg.addColorStop(0.12, "transparent");
  vg.addColorStop(0.88, "transparent");
  vg.addColorStop(1, "rgba(80, 56, 32, 0.12)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  drawPopped();
}

function finish(whyKey) {
  if (!run || run.dead) return;
  if (whyKey !== "dieBlock" && whyKey !== "dieLight" && whyKey !== "dieGap") return;
  if (run.tutorial) completeTutorial();
  run.dead = true;
  cancelAnimationFrame(raf);
  const ticket = run.tier.cost;
  const got = run.collected;
  const leftover = Math.max(0, +(ticket - Math.min(got, ticket)).toFixed(6));
  const cap = got + 1e-9 >= ticket;
  const score = boardScore();
  const dailyScore = run.free ? 0 : score;
  const rank = postBoard(dailyScore, run.tier.id);
  lastFinish = {
    cap,
    ticket,
    got,
    leftover,
    score,
    coins: run.coins,
    whyKey,
    rank,
    free: Boolean(run.free),
    burned: leftover > 0 ? +(leftover * 0.3).toFixed(6) : 0,
    burnHash: "",
    tx: "",
    bps: window._rewardBps || 10500,
    payout: displayPayout(got, ticket, window._rewardBps || 10500),
  };
  show(over);
  refreshOver();
  settleOnchain(got, ticket, dailyScore);
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
bootLobbyTabs();
bootBoardMore();
show(lobby);
bootWallet();
