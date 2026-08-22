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

function displayPayout(got, ticket, bps, free) {
  const cap = payoutCap(ticket);
  const raw = Math.min(Number(got) * (Number(bps || 10500) / 10000), cap);
  if (!free) return Math.min(raw, Number(ticket) || 0);
  return raw;
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
const BURN_PREVIEW = 8;
const boardOpen = { weekList: false, inviteList: false, burnList: false };

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
    return `<li class="${r.you ? "you" : ""}"><span class="tag">${i + 1}. ${name}</span><span class="board-pts">${rowPts(r)}</span></li>`;
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

function boardRankOf(list, addr) {
  if (!list || !addr) return 0;
  const i = list.findIndex((r) => r.addr && r.addr.toLowerCase() === addr.toLowerCase());
  return i >= 0 ? i + 1 : 0;
}

function parseLookupAddr(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  try {
    return ethers.getAddress(s);
  } catch (_) {
    return "";
  }
}

async function runBoardLookup(fromMine) {
  const input = $("boardLookup");
  const out = $("boardLookupOut");
  if (!input || !out || !window.CatboxChain) return;
  let raw = input.value.trim();
  if (fromMine || !raw) {
    const acc = window.CatboxChain.account;
    if (acc) {
      input.value = acc;
      raw = acc;
    }
  }
  if (!raw) {
    out.className = "board-lookup-out dim";
    out.textContent = t("boardLookupNeed");
    return;
  }
  const addr = parseLookupAddr(raw);
  if (!addr) {
    out.className = "board-lookup-out bad";
    out.textContent = t("boardLookupBad");
    return;
  }
  out.className = "board-lookup-out dim";
  out.textContent = t("loadingBoard");
  try {
    const pts = await CatboxChain.boardPointsOf(addr);
    const week = rowPts({ pts: pts.week });
    const invite = rowPts({ pts: pts.invite });
    const weekRank = boardRankOf(window._liveBoards?.week, addr);
    const inviteRank = boardRankOf(window._liveBoards?.invite, addr);
    const tag = CatboxChain.short(addr);
    out.className = "board-lookup-out";
    out.textContent = t("boardLookupHit", {
      addr: tag,
      week: String(week),
      invite: String(invite),
      shard: t("shardUnit"),
      pts: t("ptsUnit"),
      weekRank: weekRank ? t("boardLookupRank", { n: String(weekRank) }) : "",
      inviteRank: inviteRank ? t("boardLookupRank", { n: String(inviteRank) }) : "",
    });
  } catch (_) {
    out.className = "board-lookup-out bad";
    out.textContent = t("boardLoadFail");
  }
}

function bootBoardLookup() {
  const input = $("boardLookup");
  const go = $("boardLookupBtn");
  const mine = $("boardLookupMine");
  if (go) go.onclick = () => runBoardLookup(false);
  if (mine) mine.onclick = () => runBoardLookup(true);
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        runBoardLookup(false);
      }
    });
  }
}

function renderBurns(rows) {
  const el = $("burnList");
  if (!el) return;
  if (!rows || !rows.length) {
    el.innerHTML = `<li class="empty">${t("emptyBurn")}</li>`;
    return;
  }
  const explorer = window.CatboxChain?.cfg?.explorer || "https://bscscan.com";
  const open = Boolean(boardOpen.burnList);
  const shown = open || rows.length <= BURN_PREVIEW ? rows : rows.slice(0, BURN_PREVIEW);
  const items = shown.map((r) => {
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
  });
  if (rows.length > BURN_PREVIEW) {
    const label = open ? t("boardCollapse") : t("boardExpand", { n: String(rows.length) });
    items.push(
      `<li class="board-more"><button type="button" data-board-more="burnList">${label}</button></li>`,
    );
  }
  el.innerHTML = items.join("");
}

function mergeWeekBoard(liveWeek) {
  return liveWeek || [];
}

let pullingBoards = false;
let pullingBurns = false;

function renderBoards() {
  if (window._liveBoards) {
    renderList("weekList", mergeWeekBoard(markBoardYou(window._liveBoards.week)));
    renderList("inviteList", markBoardYou(window._liveBoards.invite));
  } else if (pullingBoards) {
    renderList("weekList", [], "loadingBoard");
    renderList("inviteList", [], "loadingBoard");
  } else {
    renderList("weekList", [], "emptyBoard");
    renderList("inviteList", [], "emptyBoard");
  }
  if (window._liveBurns && window._liveBurns.length) {
    renderBurns(window._liveBurns);
  } else if (!pullingBurns) {
    renderBurns([]);
  }
  syncOnchainPool();
  refreshInviteUi();
  paintSnapNote();
}

function formatSnapTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sgt = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(sgt.getUTCMonth() + 1)}-${p(sgt.getUTCDate())} ${p(sgt.getUTCHours())}:${p(sgt.getUTCMinutes())} SGT`;
}

function snapAgeMs() {
  if (!window._snapAt) return Infinity;
  const t = new Date(window._snapAt).getTime();
  return Number.isFinite(t) ? Date.now() - t : Infinity;
}

function snapStale(maxMin = 12) {
  return snapAgeMs() > maxMin * 60 * 1000;
}

function paintSnapNote() {
  const el = $("boardSnapNote");
  if (!el) return;
  const when = window._snapAt ? formatSnapTime(window._snapAt) : "";
  if (when && snapStale(45)) {
    el.textContent = t("boardSnapNoteStale", { t: when });
    return;
  }
  el.textContent = when ? t("boardSnapNoteAt", { t: when }) : t("boardSnapNote");
}

function markBoardYou(rows) {
  const acc = window.CatboxChain?.account;
  if (!rows) return [];
  if (!acc) return rows.map((r) => ({ ...r, you: false }));
  const me = acc.toLowerCase();
  return rows.map((r) => ({ ...r, you: Boolean(r.addr && r.addr.toLowerCase() === me) }));
}

function boardsFromSnapshot(snap) {
  if (!snap) return null;
  const invite = (snap.invite || []).filter((r) => rowPts(r) > 0);
  return {
    week: markBoardYou(snap.week || []),
    invite: markBoardYou(invite),
  };
}

async function pullLiveBoards(forceBoards) {
  if (!window.CatboxChain) return;
  if (!forceBoards && window._boardsReady && window._burnsReady) return;
  const weekEl = $("weekList");
  const inviteEl = $("inviteList");
  const burnEl = $("burnList");
  if (weekEl && !window._liveBoards) weekEl.innerHTML = `<li class="empty">${t("loadingBoard")}</li>`;
  if (inviteEl && !window._liveBoards) inviteEl.innerHTML = `<li class="empty">${t("loadingBoard")}</li>`;
  if (burnEl && !window._liveBurns) burnEl.innerHTML = `<li class="empty">${t("loadingBoard")}</li>`;

  if (!pullingBoards && (!window._boardsReady || forceBoards)) {
    pullingBoards = true;
    CatboxChain.loadSnapshot(true)
      .then((snap) => {
        const boards = boardsFromSnapshot(snap);
        if (!boards || (!boards.week.length && !boards.invite.length)) throw new Error("NO_BOARDS");
        window._liveBoards = boards;
        window._boardsReady = true;
        window._snapAt = snap.at || "";
        paintSnapNote();
        renderList("weekList", mergeWeekBoard(boards.week));
        renderList("inviteList", boards.invite);
        if (snap.burns && snap.burns.length) {
          window._liveBurns = snap.burns;
          window._burnsReady = true;
          renderBurns(snap.burns);
        }
      })
      .catch(() => {
        if (!window._liveBoards) {
          if (weekEl) weekEl.innerHTML = `<li class="empty">${t("boardLoadFail")}</li>`;
          if (inviteEl) inviteEl.innerHTML = `<li class="empty">${t("boardLoadFail")}</li>`;
        }
      })
      .finally(() => {
        pullingBoards = false;
      });
  }

  if (!pullingBurns && !window._burnsReady) {
    pullingBurns = true;
    CatboxChain.loadSnapshot(false)
      .then((snap) => {
        const burns = snap?.burns;
        if (burns && burns.length) {
          window._liveBurns = burns;
          window._burnsReady = true;
          renderBurns(burns);
        } else if (!window._liveBurns && burnEl) {
          burnEl.innerHTML = `<li class="empty">${t("emptyBurn")}</li>`;
        }
      })
      .catch(() => {
        if (!window._liveBurns && burnEl) burnEl.innerHTML = `<li class="empty">${t("burnLoadFail")}</li>`;
      })
      .finally(() => {
        pullingBurns = false;
      });
  }
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
    const weekShown = pool.week;
    if ($("weekPoolAmt")) $("weekPoolAmt").textContent = `${CatboxChain.formatLim(weekShown)} LIM`;
    if ($("invitePoolAmt")) $("invitePoolAmt").textContent = `${CatboxChain.formatLim(pool.invite)} LIM`;
    if ($("burnedAmt")) $("burnedAmt").textContent = `${CatboxChain.formatLim(pool.burned)} LIM`;
    try {
      const floor = await CatboxChain.floorPoolBalance();
      const el = $("floorPoolAmt");
      if (el && floor) {
        el.textContent = t("floorLive", {
          pool: CatboxChain.formatLim(floor.livePool),
          n: String(floor.liveCount),
        });
        el.classList.remove("hidden");
      }
    } catch (_) {}
    const dayLive = $("daySplitLive");
    const inviteLive = $("inviteTopLive");
    if (dayLive) {
      dayLive.classList.add("hidden");
      dayLive.textContent = "";
    }
    if (inviteLive) {
      inviteLive.classList.add("hidden");
      inviteLive.textContent = "";
    }
    const st = window._freeStatus;
    const freeShown = st?.pool != null ? st.pool : pool.free;
    if ($("freePoolAmt") && freeShown != null) {
      $("freePoolAmt").textContent = `${CatboxChain.formatLim(freeShown)} LIM`;
    }
    await refreshExtraUi();
    if (Date.now() - pricesAt > 60000) {
      pricesAt = Date.now();
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
    }
  } catch (_) {}
}

let chainReady = false;

async function refreshExtraUi() {
  const amt = $("extraPoolAmt");
  const need = $("extraNeedDeploy");
  const dep = $("extraDeployBtn");
  if (!amt && !need && !dep) return;
  if (!window.CatboxChain || !CatboxChain.isOwner()) return;
  try {
    const deployed = await CatboxChain.isExtraDeployed();
    if (need) need.classList.toggle("hidden", deployed);
    if (dep) dep.classList.toggle("hidden", deployed);
    if (amt) {
      if (!deployed) amt.textContent = "—";
      else amt.textContent = `${CatboxChain.formatLim(await CatboxChain.extraPoolAmt())} LIM`;
    }
  } catch (_) {}
}

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
  const lookup = $("boardLookup");
  if (lookup && acc && !lookup.value.trim()) lookup.value = acc;
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
      const owner = acc && CatboxChain.isOwner();
      if (owner) {
        banner.innerHTML = `<div>${t("deployNeed")}</div><button class="primary" id="deployBtn" type="button">${t("deployBtn")}</button>`;
        $("deployBtn").onclick = deployContract;
      } else {
        banner.innerHTML = `<div>${t("deployNeed")}</div>`;
      }
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
    const floorSettled = p.floor || 0n;
    const boardSettled = (p.v6 || 0n) + (p.v5 || 0n);
    const settled = (p.total != null ? p.total : dailySettled + inviteSettled + floorSettled);
    const text = `${CatboxChain.formatLim(settled)} LIM`;
    if (amt) amt.textContent = settled > 0n ? `${t("claimPending")} ${text}` : t("claimNone");
    if (when) when.textContent = settled > 0n ? t("claimReady") : t("claimOpen");
    if (btn) btn.disabled = boardSettled === 0n;
    if (dailyBtn) {
      dailyBtn.disabled = floorSettled === 0n;
      dailyBtn.hidden = floorSettled === 0n;
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
      if (await CatboxChain.hasTgBonus(acc)) markBonusLocal("tg", acc);
      if (await CatboxChain.hasXBonus?.(acc)) markBonusLocal("x", acc);
      paintShareCtas();
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
  if (window._claimBusy) return;
  window._claimBusy = true;
  try {
    const win = CatboxChain.claimWindow();
    if (!win.open) {
      await refreshClaimUi();
      return;
    }
    if (btn) btn.disabled = true;
    if (dailyBtn) dailyBtn.disabled = true;
    if (inviteBtn) inviteBtn.disabled = true;
    if (amt) amt.textContent = t("claiming");
    const p = await CatboxChain.pendingOf();
    const board = (p.v6 || 0n) + (p.v5 || 0n);
    if (board === 0n) throw new Error("NONE");
    const hash = await CatboxChain.claim();
    if (amt) {
      amt.innerHTML = `<a href="${CatboxChain.txUrl(hash)}" target="_blank" rel="noopener">${hash.slice(0, 10)}…</a>`;
    }
    await refreshWalletUi();
    await refreshClaimUi();
    await syncOnchainPool();
  } catch (e) {
    if (amt) amt.textContent = e?.shortMessage?.includes("none") || e?.message?.includes("none") || e?.message === "NONE" ? t("claimNone") : t("txFail");
    await refreshClaimUi();
  } finally {
    window._claimBusy = false;
  }
}

async function doClaimFloor() {
  const btn = $("claimBtn");
  const dailyBtn = $("claimDailyBtn");
  const inviteBtn = $("claimInviteBtn");
  const amt = $("claimAmt");
  if (window._claimBusy) return;
  window._claimBusy = true;
  try {
    const win = CatboxChain.claimWindow();
    if (!win.open) {
      await refreshClaimUi();
      return;
    }
    if (btn) btn.disabled = true;
    if (dailyBtn) dailyBtn.disabled = true;
    if (inviteBtn) inviteBtn.disabled = true;
    if (amt) amt.textContent = t("claiming");
    const p = await CatboxChain.pendingOf();
    if ((p.floor || 0n) === 0n) throw new Error("NONE");
    const hash = await CatboxChain.claimFloor();
    if (amt) {
      amt.innerHTML = `<a href="${CatboxChain.txUrl(hash)}" target="_blank" rel="noopener">${hash.slice(0, 10)}…</a>`;
    }
    await refreshWalletUi();
    await refreshClaimUi();
    await syncOnchainPool();
  } catch (e) {
    if (amt) amt.textContent = e?.shortMessage?.includes("none") || e?.message?.includes("none") || e?.message === "NONE" ? t("claimNone") : t("txFail");
    await refreshClaimUi();
  } finally {
    window._claimBusy = false;
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
      const jobs = [];
      if (ptsEl) jobs.push(CatboxChain.invitePoints(acc).then((v) => { pts = Number(v); }).catch(() => {}));
      jobs.push(CatboxChain.inviteCountOf(acc).then((v) => { crew = Number(v); }).catch(() => { crew = 0; }));
      jobs.push(CatboxChain.rewardBpsOf(acc).then((v) => { bps = Number(v); }).catch(() => {}));
      await Promise.all(jobs);
      if (ptsEl) ptsEl.textContent = String(Number.isFinite(pts) ? pts : 0);
      if (!Number.isFinite(crew) || crew < 0) crew = 0;
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

function writeClipboard(text) {
  let ok = false;
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    ok = document.execCommand("copy");
    ta.remove();
  } catch (_) {}
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
  const link = $("inviteLink");
  if (link && link.offsetParent) {
    link.value = text;
    try {
      link.focus();
      link.select();
    } catch (_) {}
  }
  return ok;
}

function markInviteCopied(btn) {
  const label = btn && btn.tagName === "BUTTON" ? btn : $("copyInvite");
  if (!label) return;
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

function copyInviteLink(btn) {
  const acc = window.CatboxChain?.account;
  if (!acc) {
    CatboxChain.connect()
      .then(() => copyInviteLink(btn))
      .catch(() => showToast(t("connectFirst")));
    return;
  }
  const val = inviteLinkValue();
  if (!val) {
    showToast(t("connectFirst"));
    return;
  }
  const ok = writeClipboard(val);
  markInviteCopied(btn);
  showToast(ok ? t("copied") : val);
  refreshInviteUi().catch(() => {});
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
    btn.onclick = () => {
      setTab(btn.dataset.tab);
      if (btn.dataset.tab === "pool") pullLiveBoards(true);
    };
  });
  const open = $("openRules");
  if (open) open.onclick = () => setTab("rules");
}

function bootNoticeCarousel() {
  const board = $("noticeBoard");
  const list = $("noticeList");
  const dots = $("noticeDots");
  if (!board || !list) return;
  const slides = [...list.children];
  const n = slides.length;
  if (n < 2) return;
  let i = 0;
  let timer = 0;
  let x0 = 0;
  if (dots) {
    dots.innerHTML = slides
      .map((_, k) => `<button type="button" data-notice="${k}" aria-label="${k + 1}"></button>`)
      .join("");
  }
  const paint = () => {
    list.style.transform = `translateX(-${i * 100}%)`;
    if (dots) {
      dots.querySelectorAll("button").forEach((b, k) => b.classList.toggle("on", k === i));
    }
  };
  const go = (k) => {
    i = ((k % n) + n) % n;
    paint();
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = 0;
  };
  const start = () => {
    stop();
    timer = setInterval(() => go(i + 1), 4500);
  };
  paint();
  start();
  board.addEventListener("mouseenter", stop);
  board.addEventListener("mouseleave", start);
  board.addEventListener("touchstart", (e) => {
    stop();
    x0 = e.changedTouches[0].clientX;
  }, { passive: true });
  board.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
    start();
  }, { passive: true });
  if (dots) {
    dots.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-notice]");
      if (!btn) return;
      go(Number(btn.dataset.notice));
      start();
    });
  }
}

let quoteTimer = 0;

function parseSwapAmt(raw) {
  const s = String(raw || "").trim().replace(",", ".");
  if (!s || Number(s) <= 0) return 0n;
  try {
    return ethers.parseUnits(s, 18);
  } catch (_) {
    return null;
  }
}

function paintSwapGo() {
  const btn = $("swapGo");
  if (!btn) return;
  const from = $("swapFrom")?.value;
  btn.textContent = from === "LIM" ? t("swapGoSell") : t("swapGoBuy");
}

function bootSwap() {
  const modal = $("swapModal");
  if (!modal || !$("swapBtn")) return;
  $("swapBtn").onclick = () => {
    modal.classList.remove("hidden");
    paintSwapGo();
    refreshSwap();
  };
  $("swapClose").onclick = () => modal.classList.add("hidden");
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
  $("swapFrom").onchange = () => {
    $("swapStatus")?.classList.remove("ok");
    syncSwapPair("from");
    paintSwapGo();
    refreshSwap();
  };
  $("swapTo").onchange = () => {
    $("swapStatus")?.classList.remove("ok");
    syncSwapPair("to");
    paintSwapGo();
    refreshSwap();
  };
  $("swapFlip").onclick = () => {
    $("swapStatus")?.classList.remove("ok");
    const from = $("swapFrom").value;
    const to = $("swapTo").value;
    $("swapFrom").value = to;
    $("swapTo").value = from;
    syncSwapPair("from");
    paintSwapGo();
    refreshSwap();
  };
  $("swapAmt").oninput = () => {
    $("swapStatus")?.classList.remove("ok");
    clearTimeout(quoteTimer);
    quoteTimer = setTimeout(refreshSwap, 280);
  };
  if ($("swapMax")) $("swapMax").onclick = fillSwapMax;
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

async function fillSwapMax() {
  if (!window.CatboxChain?.account) {
    const status = $("swapStatus");
    if (status) {
      status.classList.remove("ok");
      status.textContent = t("connectFirst");
    }
    return;
  }
  const from = $("swapFrom").value;
  try {
    let bal = await CatboxChain.tokenBalance(from);
    if (from === "BNB") {
      const gas = ethers.parseUnits("0.002", 18);
      if (bal > gas) bal -= gas;
      else bal = 0n;
    }
    $("swapAmt").value = ethers.formatUnits(bal, 18);
    $("swapStatus")?.classList.remove("ok");
    await refreshSwap();
  } catch (_) {}
}

async function refreshSwap() {
  const modal = $("swapModal");
  if (!modal || modal.classList.contains("hidden")) return;
  const from = $("swapFrom").value;
  const to = $("swapTo")?.value || "LIM";
  const raw = $("swapAmt").value;
  const status = $("swapStatus");
  const rateEl = $("swapRate");
  const go = $("swapGo");
  paintSwapGo();
  const flip = $("swapFlip");
  if (flip) flip.setAttribute("aria-label", t("swapFlip"));
  if (rateEl) rateEl.textContent = "";
  if (go) go.disabled = false;
  try {
    if (CatboxChain.account) {
      const bal = await CatboxChain.tokenBalance(from);
      $("swapBal").textContent = `${Number(ethers.formatUnits(bal, 18)).toFixed(4)} ${from}`;
    } else {
      $("swapBal").textContent = t("connectFirst");
    }
    const amt = parseSwapAmt(raw);
    if (amt === null) {
      $("swapOut").value = "0";
      if (status && !status.classList.contains("ok")) status.textContent = t("swapNeedAmt");
      return;
    }
    if (amt === 0n) {
      $("swapOut").value = "0";
      if (status && !status.classList.contains("ok")) status.textContent = "";
      return;
    }
    if (CatboxChain.account) {
      const bal = await CatboxChain.tokenBalance(from);
      if (bal < amt) {
        $("swapOut").value = "0";
        if (status && !status.classList.contains("ok")) status.textContent = t("swapLowBal", { sym: from });
        if (go) go.disabled = true;
        return;
      }
    }
    const q = await CatboxChain.quoteSwap(from, to, amt);
    if (!q.path || q.out === 0n) {
      $("swapOut").value = "0";
      if (status && !status.classList.contains("ok")) status.textContent = t("swapNoLiq");
      return;
    }
    if (status && !status.classList.contains("ok")) status.textContent = "";
    $("swapOut").value = CatboxChain.formatLim(q.out);
    if (rateEl && amt > 0n) {
      const rate = Number(ethers.formatUnits((q.out * 10n ** 18n) / amt, 18));
      const rateTxt = rate >= 1000 ? rate.toFixed(2) : rate >= 1 ? rate.toFixed(4) : rate.toFixed(6);
      rateEl.textContent = t("swapRate", { from, to, rate: rateTxt });
    }
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
  if (onchain) markBonusLocal(kind, addr);
  paintShareCtas();
  try {
    await refreshFreeUi();
  } catch (_) {}
  if (onchain) showToast(t(kind === "x" ? "xClaimedOn" : "tgClaimedOn"));
  else showToast(t(kind === "x" ? "xClaimFail" : "tgClaimFail"));
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
  const amt = parseSwapAmt(raw);
  if (amt === null || amt === 0n) {
    if (status) {
      status.classList.remove("ok");
      status.textContent = t("swapNeedAmt");
    }
    return;
  }
  if (window._swapBusy) return;
  window._swapBusy = true;
  const from = $("swapFrom").value;
  const to = $("swapTo")?.value || "LIM";
  const expect = $("swapOut")?.value;
  status.classList.remove("ok");
  try {
    if (!CatboxChain.account) await CatboxChain.connect();
    const bal = await CatboxChain.tokenBalance(from);
    if (bal < amt) {
      status.textContent = t("swapLowBal", { sym: from });
      return;
    }
    status.textContent = t("swapping");
    const hash = await CatboxChain.swapExact(from, to, amt, (step) => {
      status.textContent = t(step);
    });
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
    const m = e?.message;
    if (m === "ALLOW" && from === "LIM" && CatboxChain.permit2SellReady) {
      try {
        const st = await CatboxChain.permit2SellReady(window.CATBOX_CHAIN?.lim, amt);
        status.textContent = st.erc && !st.router ? t("swapPermitOnly") : t("swapApproveFail");
        return;
      } catch (_) {}
    }
    status.textContent =
      m === "NO_LIQ" ? t("swapNoLiq")
      : m === "REJECTED" ? t("swapRejected")
      : m === "SLIP" ? t("swapSlip")
      : m === "ALLOW" ? t("swapApproveFail")
      : m === "GAS" ? t("swapNeedGas")
      : m === "TX" ? t("swapTxFail")
      : t("txFail");
  } finally {
    window._swapBusy = false;
  }
}

function startLiveClock() {
  const intervalMs = lowPerfMode() ? 20000 : 12000;
  setInterval(() => {
    if (document.body.classList.contains("playing")) return;
    liveRefresh();
  }, intervalMs);
}

let liveTick = 0;
let pricesAt = 0;
let lastSnapPoll = 0;

async function liveRefresh() {
  liveTick += 1;
  const jobs = [syncOnchainPool()];
  if (!lowPerfMode() || liveTick % 2 === 0) jobs.push(refreshClaimUi());
  if (!lowPerfMode() || liveTick % 3 === 0) jobs.push(refreshFreeUi());
  const now = Date.now();
  const needBoards = !window._boardsReady || !window._burnsReady;
  const stale = snapStale(lowPerfMode() ? 12 : 8);
  if (needBoards) {
    pullLiveBoards(false);
  } else if (stale && now - lastSnapPoll > (lowPerfMode() ? 30000 : 20000)) {
    lastSnapPoll = now;
    pullLiveBoards(true);
  } else if (liveTick % (lowPerfMode() ? 15 : 10) === 0) {
    pullLiveBoards(true);
  }
  await Promise.all(jobs.map((p) => Promise.resolve(p).catch(() => {})));
  refreshInviteUi();
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
  refreshWalletUi();
  if (window.ethereum) {
    try {
      const accs = await withTimeout(window.ethereum.request({ method: "eth_accounts" }), 1500);
      if (accs[0]) await withTimeout(CatboxChain.connect(), 5000);
    } catch (_) {}
  }
  await refreshWalletUi();
  liveRefresh();
  $("withdrawBtn").onclick = async () => {
    try {
      const pool = await CatboxChain.poolBalance();
      if (pool.total === 0n) return;
      await CatboxChain.withdrawWeekly(pool.total);
      await syncOnchainPool();
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes("CLAIM_NOT_OPEN") || msg.includes("CLAIM_WINDOW_OPEN")) {
        alert(t("claimWhen"));
      } else {
        alert(t("txFail"));
      }
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
  if ($("extraDeployBtn")) {
    $("extraDeployBtn").onclick = async () => {
      const status = $("extraStatus");
      try {
        if (status) status.textContent = t("deploying");
        const hash = await CatboxChain.deployExtra();
        if (status) {
          status.innerHTML = `<a href="${CatboxChain.txUrl(hash)}" target="_blank" rel="noopener">${hash.slice(0, 10)}…</a>`;
        }
        await refreshExtraUi();
      } catch (_) {
        if (status) status.textContent = t("txFail");
      }
    };
  }
  if ($("extraFundBtn")) {
    $("extraFundBtn").onclick = async () => {
      const status = $("extraStatus");
      const n = Number($("extraFundInput")?.value);
      if (!n || n <= 0) return;
      try {
        if (status) status.textContent = t("approve");
        const hash = await CatboxChain.fundExtra(n);
        if (status) {
          status.innerHTML = `<a href="${CatboxChain.txUrl(hash)}" target="_blank" rel="noopener">${hash.slice(0, 10)}…</a>`;
        }
        await refreshExtraUi();
      } catch (e) {
        if (status) status.textContent = e?.message === "NO_LIM" ? t("noLim") : t("txFail");
      }
    };
  }
  if ($("extraWithdrawBtn")) {
    $("extraWithdrawBtn").onclick = async () => {
      const status = $("extraStatus");
      try {
        const pool = await CatboxChain.extraPoolAmt();
        if (pool <= 0n) return;
        const hash = await CatboxChain.withdrawExtra(pool);
        if (status) {
          status.innerHTML = `<a href="${CatboxChain.txUrl(hash)}" target="_blank" rel="noopener">${hash.slice(0, 10)}…</a>`;
        }
        await refreshExtraUi();
      } catch (_) {
        if (status) status.textContent = t("txFail");
      }
    };
  }
  if ($("extraGiftBtn")) {
    $("extraGiftBtn").onclick = async () => {
      if (window._giftBusy) return;
      const status = $("extraStatus");
      const to = $("extraGiftAddr")?.value?.trim();
      const n = Number($("extraGiftAmt")?.value);
      if (!to || !n || n <= 0) return;
      window._giftBusy = true;
      $("extraGiftBtn").disabled = true;
      try {
        if (status) status.textContent = t("extraGifting");
        const hash = await CatboxChain.airdropFromExtra(to, n);
        if (status) {
          status.innerHTML = `<a href="${CatboxChain.txUrl(hash)}" target="_blank" rel="noopener">${hash.slice(0, 10)}…</a>`;
        }
        await refreshExtraUi();
      } catch (e) {
        if (status) status.textContent = e?.message === "NO_LIM" ? t("noLim") : t("txFail");
      } finally {
        window._giftBusy = false;
        $("extraGiftBtn").disabled = false;
      }
    };
  }
  if ($("copyInvite")) $("copyInvite").onclick = () => copyInviteLink($("copyInvite"));
  document.querySelectorAll(".js-copy-invite").forEach((btn) => {
    if (btn.id === "copyInvite") return;
    btn.onclick = () => copyInviteLink(btn);
  });
  bootSwap();
  bootShare();
  $("claimBtn") && ($("claimBtn").onclick = doClaim);
  $("claimDailyBtn") && ($("claimDailyBtn").onclick = doClaimFloor);
  $("claimInviteBtn") && ($("claimInviteBtn").onclick = doClaim);
  try { CatboxChain.referrer(); } catch (_) {}
}

const $ = (id) => document.getElementById(id);
const lobby = $("lobby");
const pay = $("pay");
const game = $("game");
const over = $("over");
const canvas = $("cv");
const ctx = canvas.getContext("2d", {
  alpha: false,
  desynchronized: true,
  powerPreference: "high-performance",
}) || canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const BASE_GROUND = 400;
const PLAYER_SX = 160;

const imgCoin = new Image();
imgCoin.src = "./assets/coin.png?v=4";
const imgCat = new Image();
imgCat.src = "./assets/catbox.png?v=3";
let coinMark = null;
function punchCoinMark() {
  try {
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
  } catch (_) {
    coinMark = imgCoin;
  }
}
imgCoin.addEventListener("load", punchCoinMark);
imgCoin.addEventListener("error", () => {
  if (imgCoin.dataset.retried) return;
  imgCoin.dataset.retried = "1";
  imgCoin.src = `./assets/coin.png?v=4&r=${Date.now()}`;
});
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

let rotateQueued = 0;
function syncRotate() {
  if (rotateQueued) return;
  rotateQueued = requestAnimationFrame(() => {
    rotateQueued = 0;
    syncRotateNow();
  });
}

function syncRotateNow() {
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
  if (!st) return false;
  return Boolean(st.eligible);
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
  const paid = payout != null ? payout : displayPayout(got, ticket, bps || window._rewardBps || 10500, lastFinish?.free);
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

$("payBack").onclick = () => {
  if (enterBusy) return;
  show(lobby);
};
$("payGo").onclick = () => payAndStart();
$("toLobby").onclick = () => {
  if (window._settleBusy) return;
  try {
    if (document.fullscreenElement) document.exitFullscreen();
  } catch (_) {}
  show(lobby);
};
$("again").onclick = () => {
  if (window._settleBusy || enterBusy) return;
  selected && openPay(selected);
};

let enterBusy = false;
async function payAndStart() {
  const status = $("payStatus");
  const go = $("payGo");
  if (!selected || enterBusy || window._settleBusy) return;
  enterBusy = true;
  go.disabled = true;
  let free = false;
  let teach = false;
  let started = false;
  try {
    if (!window.ethereum) throw new Error("NO_WALLET");
    status.textContent = t("connecting");
    await CatboxChain.connect();
    if (CatboxChain.isBanned()) throw new Error("BANNED");
    if (!chainReady) {
      const deployed = await CatboxChain.isDeployed();
      if (!deployed) {
        status.textContent = t("deployNeed");
        return;
      }
      chainReady = true;
    }
    free = freeForTier(selected);
    teach = shouldTeach(selected);
    const me = CatboxChain.account;
    const stuck = me ? await CatboxChain.activeRun(me) : 0n;
    if (stuck && stuck !== 0n) {
      status.textContent = t("clearingRun");
      await CatboxChain.clearActiveRun();
    }
    status.textContent = free ? t("paying") : t("approve");
    const hash = await CatboxChain.approveAndEnter(selected.id);
    status.innerHTML = `<a href="${CatboxChain.txUrl(hash)}" target="_blank" rel="noopener">${hash.slice(0, 10)}…</a>`;
    enterPlay();
    startRun(selected, teach, free);
    refreshInviteUi();
    started = true;
  } catch (e) {
    const msg = e?.message || "";
    const rejected =
      e?.code === 4001 ||
      e?.code === "ACTION_REJECTED" ||
      /user rejected|user denied|rejected the request/i.test(msg) ||
      /user rejected|user denied|rejected the request/i.test(String(e?.shortMessage || ""));
    if (msg === "NO_WALLET") status.textContent = t("noWallet");
    else if (msg === "BANNED") status.textContent = t("banned");
    else if (msg === "FLOOR_DUE") status.textContent = t("floorDue");
    else if (msg === "NO_LIM") status.textContent = t("noLim");
    else if (msg === "ACTIVE_RUN") {
      status.textContent = t("clearingRun");
      try {
        await CatboxChain.clearActiveRun();
        status.textContent = t("approve");
        const hash = await CatboxChain.approveAndEnter(selected.id);
        status.innerHTML = `<a href="${CatboxChain.txUrl(hash)}" target="_blank" rel="noopener">${hash.slice(0, 10)}…</a>`;
        enterPlay();
        startRun(selected, teach, free);
        refreshInviteUi();
        return;
      } catch (err) {
        const em = err?.message || "";
        const rej2 =
          err?.code === 4001 ||
          err?.code === "ACTION_REJECTED" ||
          /user rejected|user denied|rejected the request/i.test(em);
        if (em === "NO_LIM") status.textContent = t("noLim");
        else if (em === "BANNED") status.textContent = t("banned");
        else if (em === "FLOOR_DUE") status.textContent = t("floorDue");
        else if (em === "ACTIVE_RUN") status.textContent = t("activeRun");
        else if (rej2) status.textContent = t("txRejected");
        else status.textContent = t("txFail");
      }
    }
    else if (msg === "PAID_NOT_READY") status.textContent = t("paidNotReady") || "Paid lane not ready yet";
    else if (rejected) status.textContent = t("txRejected");
    else status.textContent = t("txFail");
  } finally {
    enterBusy = false;
    if (!started && go) go.disabled = false;
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
  $("rebateBar")?.parentElement?.classList.remove("to-floor");
  paintHudLim();
  $("hudFloorChip")?.classList.add("hidden");
  if ($("hudBonus")) $("hudBonus").textContent = fmtRewardPct(window._rewardBps || 10500);
  const friendChip = $("hudFriend");
  if (friendChip) friendChip.classList.toggle("hidden", !run.friend);
  $("runNote")?.classList.add("hidden");
  $("hudScore")?.parentElement?.classList.remove("x2");
  try {
    CatboxChain.noteRunPlaying?.(0, 0, tier.cost);
  } catch (_) {}
  show(game);
  if (run.friend) showRunNote("friendNote", { flash: true });
  cancelAnimationFrame(raf);
  accMs = 0;
  lastTs = 0;
  hitchN = 0;
  liteAt = 0;
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
    // Encore ramps harder/faster than the ticket phase.
    let u = Math.min(1, (run.overtimeT || 0) / 55);
    u = u * u * (3 - 2 * u);
    haste += 0.48 * u;
  }
  haste = Math.min(run.overtime ? 0.99 : 0.82, haste);
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

function paintHudLim() {
  if (!run) return;
  const ticket = Number(run.tier.cost) || 0;
  const cap = limCap(run);
  const got = Number(run.collected) || 0;
  const keep = ticket > 0 ? Math.min(got, ticket) : got;
  const extra = ticket > 0 ? Math.max(0, got - ticket) : 0;
  const extraCap = Math.max(0, cap - ticket);
  const grab = $("hudRebate");
  const floorChip = $("hudFloorChip");
  const floorAmt = $("hudFloorAmt");
  const bar = $("rebateBar");
  const barWrap = bar?.parentElement;
  if (run.free) {
    if (grab) grab.textContent = `${got.toFixed(2)}/${cap}`;
    if (floorChip) floorChip.classList.add("hidden");
    if (bar) bar.style.width = `${Math.min(100, cap > 0 ? (got / cap) * 100 : 0)}%`;
    barWrap?.classList.remove("to-floor");
    return;
  }
  if (grab) grab.textContent = `${keep.toFixed(2)}/${ticket}`;
  if (floorChip && floorAmt) {
    const show = extra > 0 || Boolean(run.overtime);
    floorChip.classList.toggle("hidden", !show);
    floorAmt.textContent = `+${extra.toFixed(2)}`;
  }
  if (bar) {
    if (got <= ticket || extraCap <= 0) {
      bar.style.width = `${Math.min(100, ticket > 0 ? (keep / ticket) * 100 : 0)}%`;
      barWrap?.classList.remove("to-floor");
    } else {
      bar.style.width = `${Math.min(100, (extra / extraCap) * 100)}%`;
      barWrap?.classList.add("to-floor");
    }
  }
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

function terrainSeg(run, wx) {
  const segs = run.terrain;
  let lo = 0;
  let hi = segs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = segs[mid];
    if (wx < s.x0) hi = mid - 1;
    else if (wx >= s.x1) lo = mid + 1;
    else return s;
  }
  return null;
}

function groundAt(run, wx) {
  const s = terrainSeg(run, wx);
  let y = BASE_GROUND;
  if (s) {
    if (s.kind === "hill" || s.kind === "bump") {
      const t = (wx - s.x0) / Math.max(1, s.x1 - s.x0);
      const h = (1 - Math.cos(t * Math.PI * 2)) * 0.5;
      y = s.y - s.peak * h;
    } else {
      y = s.y;
    }
  }
  return Math.round(y * 0.5) * 2;
}

function isGapAt(run, wx) {
  const s = terrainSeg(run, wx);
  return Boolean(s && s.kind === "gap" && wx >= s.x0 + 12 && wx < s.x1 - 12);
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
  if (run.terrain.length > 24 && (run.t & 15) === 0) {
    const cut = run.scroll - 240;
    run.terrain = run.terrain.filter((s) => s.x1 > cut);
    if (run.ledges) run.ledges = run.ledges.filter((L) => L.x1 > cut);
  }
}

function addTerrainChunk(run) {
  const baseP = progress(run);
  const ot = Boolean(run.overtime);
  // Treat overtime as further into the difficulty curve.
  const p = ot ? Math.min(1, baseP * 0.45 + 0.55 + Math.min(0.42, (run.overtimeT || 0) / 140)) : baseP;
  let x = run.nextTerrain;
  const bag = canSpawnLim(run);
  if (!bag) {
    addHazardChunk(run, x, Math.min(1, p + (ot ? 0.32 : 0.08)), false);
    return;
  }

  const sinceHazard = run.t - run.lastHazard;
  const grab = run.collected / run.tier.cost;
  const idle = run.t - (run.lastJumpT || 0) > 240;
  const minGap = ot
    ? Math.max(20, 58 - p * 26)
    : Math.max(48, 108 - p * 18 - grab * 8);
  const roll = Math.random();
  const pad = ot
    ? 16 + Math.floor(Math.random() * 14)
    : 36 + Math.floor(Math.random() * 28);
  pushFlat(run, x, x + pad);
  x += pad;

  if (!run.tutorial && !run.sawLight && run.t > 168 && bag) {
    addHazardChunk(run, x, Math.max(p, 0.06), true, "light");
    return;
  }

  const safeChance = ot
    ? Math.max(0.02, 0.14 - p * 0.14)
    : Math.max(0.18, 0.52 - p * 0.16 - grab * 0.06);
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
  const ot = Boolean(run.overtime);
  const roll = Math.random();
  const pad = ot
    ? 14 + Math.floor(Math.random() * 14)
    : 40 + Math.floor(Math.random() * 36);
  pushFlat(run, x, x + pad);
  x += pad;

  const nearLight = Math.abs(x - (run.lastLightWx || -99999)) < (ot ? 220 : 360);
  const nearGap = Math.abs(x - (run.lastGapWx || -99999)) < (ot ? 230 : 380);
  const idle = run.t - (run.lastJumpT || 0) > (ot ? 110 : 240);

  let kind = forceKind;
  if (!kind) {
    if (idle && !nearLight && p > 0.08) kind = "gap";
    else if (nearGap) kind = roll < 0.62 ? "pipe" : "light";
    else if (nearLight) kind = roll < 0.55 ? "pipe" : "gap";
    else if (p < 0.16) kind = roll < 0.55 ? "light" : "pipe";
    else if (ot) {
      // Encore: more gaps + double pipes.
      if (roll < 0.14) kind = "light";
      else if (roll < 0.46) kind = "pipe";
      else kind = "gap";
    } else if (roll < 0.28) kind = "light";
    else if (roll < 0.72) kind = "pipe";
    else kind = "gap";
  }

  if (!forceKind) {
    if (kind === "light" && nearGap) kind = "pipe";
    if (kind === "gap" && nearLight) kind = "pipe";
  }

  if (kind === "light") {
    const w = (ot ? 118 : 148) + Math.floor(p * (ot ? 36 : 16));
    pushFlat(run, x, x + w);
    run.objects.push({
      kind: "light",
      x: x + 24 - run.scroll,
      w: 58 + p * (ot ? 28 : 16),
      phase: 0,
      slow: (ot ? 0.026 : 0.012) + p * (ot ? 0.014 : 0.006),
      armed: false,
    });
    if (withCoins) spawnCoinW(run, x + 58, BASE_GROUND - 26);
    run.lastHazard = run.t;
    run.lastLightWx = x + 24 + (70 + p * 24) / 2;
    run.sawLight = true;
    x += w;
    if (withCoins && Math.random() < (ot ? 0.22 : 0.62)) x = spawnShelfAt(run, x);
  } else if (kind === "pipe") {
    const duo = Math.random() < (ot ? 0.42 : 0.12) && p > (ot ? 0.18 : 0.45);
    const w = duo ? 196 : 124;
    pushFlat(run, x, x + w);
    const style = Math.random() < 0.42 ? "brick" : "pipe";
    const h = style === "brick"
      ? (ot ? 30 : 22)
      : (ot ? 42 : 32) + Math.floor(Math.random() * (ot ? 18 : 12));
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
      spawnCoinW(run, x + (duo ? 88 : 70), BASE_GROUND - h - (ot ? 62 : 56));
    }
    run.lastHazard = run.t;
    x += w;
  } else {
    const gw = (ot ? 58 : 42) + p * (ot ? 22 : 10);
    const ap = ot ? 62 : 88;
    pushFlat(run, x, x + ap);
    run.terrain.push({ kind: "gap", x0: x + ap, x1: x + ap + gw, y: BASE_GROUND });
    pushFlat(run, x + ap + gw, x + ap + gw + ap);
    if (withCoins) spawnCoinW(run, x + ap + gw * 0.5, BASE_GROUND - (ot ? 108 : 96));
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

let jumpLock = 0;
function jumpNow() {
  const now = performance.now();
  if (now - jumpLock < 20) return;
  jumpLock = now;
  jump();
}

window.addEventListener("pointerdown", (e) => {
  if (game.classList.contains("hidden")) return;
  if (e.target.closest("a, button, .langs, .lang-btn, .rotate-gate, .rotate-soft, .tut-skip")) return;
  e.preventDefault();
  jumpNow();
});
if (!window.PointerEvent) {
  window.addEventListener(
    "touchstart",
    (e) => {
      if (game.classList.contains("hidden")) return;
      if (e.target.closest("a, button, .langs, .lang-btn, .rotate-gate, .rotate-soft, .tut-skip")) return;
      e.preventDefault();
      jumpNow();
    },
    { passive: false },
  );
}
window.addEventListener("keydown", (e) => {
  if (game.classList.contains("hidden")) return;
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    jumpNow();
  }
});
window.addEventListener("orientationchange", syncRotate);
window.addEventListener("resize", syncRotate);
window.visualViewport?.addEventListener("resize", syncRotate);
window.visualViewport?.addEventListener("scroll", syncRotate, { passive: true });
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
let hitchN = 0;
let liteCached = false;
let liteAt = 0;

function lowPerfMode() {
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return true;
    if (window.matchMedia?.("(pointer: coarse)")?.matches) return true;
  } catch (_) {}
  return Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 900;
}

function liteDraw() {
  const now = performance.now();
  if (now - liteAt > 350) {
    liteAt = now;
    liteCached = hitchN >= 6 || lowPerfMode();
  }
  return liteCached;
}

function loop(ts) {
  raf = requestAnimationFrame(loop);
  if (!run || run.dead) return;
  if (!lastTs) lastTs = ts;
  const dt = ts - lastTs;
  lastTs = ts;
  if (dt > 28) hitchN = Math.min(24, hitchN + 2);
  else hitchN = Math.max(0, hitchN - 1);
  const lite = liteDraw();
  accMs += Math.min(lite ? 48 : 72, dt);
  const maxTicks = lite ? 2 : 3;
  let n = 0;
  while (accMs >= STEP && n < maxTicks) {
    accMs -= STEP;
    n += 1;
    tick();
    if (!run || run.dead) return;
  }
  if (accMs > STEP * 3) accMs = 0;
  draw();
}

function spawnDust(x, y) {
  if (!run) return;
  const burst = liteDraw() ? 2 : 5;
  for (let i = 0; i < burst; i++) {
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
  const cap = liteDraw() ? 14 : 28;
  if (run.fx.length > cap) run.fx = run.fx.slice(-cap);
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
        o.phase = -0.4;
      }
      if (o.armed) o.phase += o.slow || 0.02;
      if (!o.hinted && o.x < 400 && o.x > 70) {
        o.hinted = true;
        showRunNote("stayLow", { soft: true });
      }
    }
    if (o.kind === "beam") {
      o.y = groundAt(run, run.scroll + o.x + o.w / 2) - o.h;
    }

    if (o.kind === "coin" && !o.hit) {
      o.bob = (o.bob || 0) + 0.14;
      const mag = dist(px, py, o.x, o.y);
      const reach = o.gold ? Math.max(72, run.magnet || 56) : run.magnet || 56;
      const pull = run.magnetPull || 0.16;
      if (mag < reach && mag > 2) {
        o.x += (px - o.x) * pull;
        o.y += (py - o.y) * pull;
        o.baseY = o.y;
      } else if (o.baseY != null) {
        o.y = o.baseY + Math.sin(o.bob) * 4;
      }
    }

    if (o.kind === "coin" && !o.hit && dist(px, py, o.x, o.y) < (o.gold ? 56 : 40)) {
      o.hit = true;
      run.coins += 1;
      run.combo += 1;
      run.collected = Math.min(limCap(run), +(run.collected + o.amount).toFixed(6));
      try {
        CatboxChain.noteRunProgress?.(run.collected, run.free ? 0 : boardScore());
      } catch (_) {}
      addRaw(36 + Math.round((o.amount / run.tier.cost) * 900) + Math.min(run.combo, 12) * 10);
      if (o.gold) run.flash = 5;
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
      const on = (Math.sin(o.phase) + 1) / 2 > 0.86;
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
  if ((run.t & 3) === 0) {
    paintHudLim();
    $("hudScore").textContent = String(boardScore());
  }
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
  if (opts.flash) run.flash = Math.max(run.flash || 0, 6);
  const note = $("runNote");
  if (!note) return;
  note.textContent = t(key);
  note.classList.remove("hidden");
}

function boardScore() {
  return Math.floor(run.raw * run.tier.mult);
}

function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}
function aabb(x, y, w, h, x2, y2, w2, h2) {
  return x < x2 + w2 && x + w > x2 && y < y2 + h2 && y + h > y2;
}

function worldPal(dusk, veil) {
  if (dusk) {
    return {
      skyTop: veil ? "#e8b89a" : "#f0b478",
      skyMid: veil ? "#efc4a0" : "#f6c090",
      skyHor: veil ? "#f0c8a8" : "#f0a070",
      far: "#8a746c",
      farHi: "#b89888",
      mid: "#6e7a62",
      midHi: "#9aaa78",
      near: "#5a6e52",
      bush: "#3d7a48",
      bushHi: "#e0b45a",
      cloud: "#ffe8c8",
      dirt: "#c4a07a",
      dirtMid: "#a88060",
      dirtDk: "#8a6448",
      grass: "#4a9a52",
      grassHi: "#8ed46a",
      lip: "#e0b45a",
      pit: "#8a7060",
      pit2: "#6a5040",
    };
  }
  return {
    skyTop: veil ? "#c5d8ee" : "#b8d6f4",
    skyMid: veil ? "#d7e4f2" : "#d2e6f8",
    skyHor: veil ? "#f0e4d0" : "#f8ead0",
    far: "#9eb8a8",
    farHi: "#c8dcc8",
    mid: "#7fa882",
    midHi: "#b4d0a8",
    near: "#6a9870",
    bush: "#3f8a4a",
    bushHi: "#c8dc6a",
    cloud: "#fffdf8",
    dirt: "#d4b48c",
    dirtMid: "#b8946c",
    dirtDk: "#8e6c48",
    grass: "#58b05a",
    grassHi: "#9ee078",
    lip: "#e0c46a",
    pit: "#c8b49a",
    pit2: "#a08868",
  };
}

function fillHill(x, baseY, w, h, color, hi) {
  const cx = x + w / 2;
  ctx.beginPath();
  ctx.ellipse(cx, baseY, Math.max(8, w / 2), Math.max(6, h), 0, Math.PI, 0, true);
  ctx.fillStyle = color;
  ctx.fill();
  if (hi) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.ellipse(cx - w * 0.14, baseY - h * 0.12, w * 0.16, h * 0.52, 0, Math.PI, 0, true);
    ctx.fillStyle = hi;
    ctx.fill();
    ctx.restore();
  }
}

function drawPixelCloud(x, y, s, color) {
  ctx.fillStyle = "rgba(28, 40, 64, 0.12)";
  ctx.beginPath();
  ctx.ellipse(x + 16 * s, y + 11 * s, 22 * s, 6 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x + 14 * s, y + 6 * s, 18 * s, 8 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 5 * s, y + 8 * s, 10 * s, 6 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 24 * s, y + 7 * s, 11 * s, 7 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 15 * s, y + 1 * s, 9 * s, 6 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.beginPath();
  ctx.ellipse(x + 12 * s, y + 1 * s, 6 * s, 3 * s, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBush(x, y, pal) {
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.beginPath();
  ctx.ellipse(x + 14, y - 2, 16, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pal.bush;
  ctx.beginPath();
  ctx.ellipse(x + 12, y - 10, 14, 10, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 22, y - 12, 10, 9, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 4, y - 9, 9, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pal.bushHi;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.ellipse(x + 8, y - 14, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawTree(x, y, pal) {
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.beginPath();
  ctx.ellipse(x + 11, y - 2, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4a2e1c";
  ctx.fillRect(x + 8, y - 28, 6, 28);
  ctx.fillStyle = "#6e4430";
  ctx.fillRect(x + 11, y - 28, 2, 26);
  ctx.fillStyle = pal.bush;
  ctx.beginPath();
  ctx.ellipse(x + 11, y - 42, 15, 17, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 2, y - 34, 9, 10, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 20, y - 34, 9, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pal.bushHi;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.ellipse(x + 6, y - 48, 6, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
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
  ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
  ctx.fillRect(x + w - 5, y + capH, 3, Math.max(6, h - capH - 6));
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

function drawSky(pal, dusk, W, H) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.skyTop);
  g.addColorStop(0.38, pal.skyMid);
  g.addColorStop(0.68, pal.skyHor);
  g.addColorStop(1, dusk ? "#e88858" : "#f0c888");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const sunX = dusk ? 640 : 790;
  const sunY = dusk ? 92 : 52;
  const glow = dusk ? "255, 160, 70" : "255, 210, 80";
  ctx.fillStyle = `rgba(${glow}, 0.16)`;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(${glow}, 0.28)`;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dusk ? "#ffc070" : "#ffe08a";
  ctx.beginPath();
  ctx.arc(sunX, sunY, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dusk ? "#ffe0a8" : "#fff6c8";
  ctx.beginPath();
  ctx.arc(sunX - 5, sunY - 5, 6, 0, Math.PI * 2);
  ctx.fill();
  const haze = ctx.createLinearGradient(0, H * 0.42, 0, H * 0.72);
  haze.addColorStop(0, "rgba(255, 255, 255, 0)");
  haze.addColorStop(1, dusk ? "rgba(255, 170, 90, 0.22)" : "rgba(255, 236, 200, 0.18)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, H * 0.42, W, H * 0.3);
}

function drawParallax(pal, night, W) {
  const lite = liteDraw();
  const farOff = ((run.scroll * 0.1) % 240 + 240) % 240;
  const farStep = lite ? 240 : 190;
  for (let x = -220; x < W + 240; x += farStep) {
    fillHill(x - farOff, 300, 230, 96, pal.far, pal.farHi);
  }
  if (!lite) {
    const ridgeOff = ((run.scroll * 0.18) % 200 + 200) % 200;
    for (let x = -180; x < W + 200; x += 160) {
      fillHill(x - ridgeOff + 40, 332, 170, 64, pal.mid, pal.midHi);
    }
  }
  if (night && !lite) {
    const span = 64;
    const off = run.scroll * 0.2;
    const base = Math.floor(off / span);
    for (let i = -2; i < 18; i++) {
      const id = base + i;
      const sx = id * span - off;
      const hh = 22 + hash11(id * 13) * 40;
      ctx.fillStyle = "#2a1c18";
      ctx.fillRect(sx, 300 - hh, 18, hh);
      ctx.fillStyle = "#3a2820";
      ctx.fillRect(sx + 18, 308 - hh * 0.7, 10, hh * 0.7);
      ctx.fillStyle = "#ffc070";
      if (hash11(id + 3) > 0.38) ctx.fillRect(sx + 4, 300 - hh + 8, 3, 3);
      if (hash11(id + 7) > 0.5) ctx.fillRect(sx + 10, 300 - hh + 16, 3, 3);
      if (hash11(id + 11) > 0.55) ctx.fillRect(sx + 21, 308 - hh * 0.7 + 10, 3, 3);
    }
  }
  const midOff = ((run.scroll * 0.3) % 260 + 260) % 260;
  const midStep = lite ? 280 : 200;
  for (let x = -240; x < W + 260; x += midStep) {
    fillHill(x - midOff, 372, 250, 78, pal.mid, pal.midHi);
    if (!lite) fillHill(x - midOff + 88, 362, 160, 58, pal.near, pal.midHi);
  }
  const cSpan = W + 180;
  const cOff = run.scroll * 0.07;
  const clouds = lite ? 3 : 6;
  for (let i = 0; i < clouds; i++) {
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
  const lite = liteDraw();
  const step = lite ? 12 : 8;
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
    const ys = [];
    for (let x = sx; x <= x1; x += step) ys.push(vis(x));
    ctx.beginPath();
    ctx.moveTo(sx, H);
    for (let i = 0; i < ys.length; i++) ctx.lineTo(sx + i * step, ys[i]);
    ctx.lineTo(x1, H);
    ctx.closePath();
    ctx.fillStyle = pal.dirt;
    ctx.fill();
    if (!lite) {
      ctx.fillStyle = pal.dirtMid || pal.dirtDk;
      for (let i = 0; i < ys.length; i++) {
        ctx.fillRect(sx + i * step, ys[i] + 18, step + 1, 28);
      }
    }
    ctx.strokeStyle = pal.grass;
    ctx.lineWidth = lite ? 6 : 8;
    ctx.beginPath();
    for (let i = 0; i < ys.length; i++) {
      const x = sx + i * step;
      if (i === 0) ctx.moveTo(x, ys[i]);
      else ctx.lineTo(x, ys[i]);
    }
    ctx.stroke();
    if (!lite) {
      ctx.strokeStyle = pal.grassHi || pal.grass;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < ys.length; i++) {
        const x = sx + i * step;
        if (i === 0) ctx.moveTo(x, ys[i] - 3);
        else ctx.lineTo(x, ys[i] - 3);
      }
      ctx.stroke();
    }
    const bladeGap = lite ? 32 : 28;
    for (let x = sx + 8; x < x1; x += bladeGap) {
      if (hash11(Math.floor((run.scroll + x) / 28)) < 0.42) continue;
      const gy = vis(x);
      ctx.fillStyle = pal.grassHi || pal.grass;
      ctx.fillRect(x, gy - 10, 3, 10);
      ctx.fillRect(x + 4, gy - 7, 2, 7);
      ctx.fillRect(x - 3, gy - 6, 2, 6);
    }
    sx = e;
  }
  ctx.fillStyle = pal.dirtDk;
  ctx.fillRect(0, H - 44, W, 44);
  ctx.fillStyle = "rgba(40, 24, 12, 0.2)";
  ctx.fillRect(0, H - 14, W, 14);
}

function drawLight(o, night) {
  const pulse = (Math.sin(o.phase) + 1) / 2;
  const on = pulse > 0.4;
  const lethal = pulse > 0.86;
  const cx = o.x + o.w / 2;
  const lgy = groundAt(run, run.scroll + cx);
  ctx.fillStyle = "#1a2438";
  ctx.fillRect(cx - 14, 16, 28, 14);
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(cx - 16, 14, 32, 4);
  ctx.fillStyle = lethal ? "#ffe08a" : on ? "#d8c57a" : "#5d738c";
  ctx.fillRect(cx - 8, 24, 16, 8);
  const beamAlpha = night ? 0.14 + pulse * 0.14 : 0.1 + pulse * 0.1;
  if (on) {
    if (liteDraw()) {
      ctx.fillStyle = `rgba(255, 220, 90, ${beamAlpha.toFixed(3)})`;
      ctx.fillRect(o.x - 6, 32, o.w + 12, Math.max(40, lgy - 62));
    } else {
      const grd = ctx.createLinearGradient(cx, 32, cx, lgy);
      grd.addColorStop(0, `rgba(255, 220, 90, ${beamAlpha.toFixed(3)})`);
      grd.addColorStop(1, `rgba(255, 210, 80, ${(beamAlpha * 0.22).toFixed(3)})`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(cx - 7, 32);
      ctx.lineTo(cx + 7, 32);
      ctx.lineTo(o.x + o.w + 6, lgy - 30);
      ctx.lineTo(o.x - 6, lgy - 30);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(255, 240, 160, ${(0.14 + pulse * 0.1).toFixed(3)})`;
    ctx.fillRect(cx - 3, 32, 6, 10);
  } else {
    ctx.fillStyle = "rgba(93, 115, 140, 0.16)";
    ctx.fillRect(cx - 2, 32, 4, Math.max(40, lgy - 80));
  }
  const tunnel = 52;
  ctx.fillStyle = lethal ? "rgba(8, 14, 24, 0.42)" : "rgba(8, 14, 24, 0.24)";
  ctx.fillRect(o.x - 8, lgy - tunnel, o.w + 16, tunnel + 4);
  ctx.fillStyle = "#f0c14a";
  ctx.fillRect(o.x - 8, lgy - 6, o.w + 16, 3);
  ctx.fillStyle = "#ffe08a";
  const mid = Math.round(cx);
  ctx.fillRect(mid - 5, lgy - 18, 10, 3);
  ctx.fillRect(mid - 3, lgy - 14, 6, 3);
  ctx.fillRect(mid - 1, lgy - 10, 2, 4);
  if (!liteDraw()) {
    ctx.font = lang === "en" ? "8px 'Press Start 2P'" : "12px 'Noto Sans SC', 'Noto Sans', sans-serif";
    ctx.fillStyle = "#000";
    ctx.fillText(t("stayLow"), mid - 31, lgy + 16);
    ctx.fillStyle = "#ffe08a";
    ctx.fillText(t("stayLow"), mid - 32, lgy + 15);
  }
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
  const spr = coinMark || (imgCoin.complete && imgCoin.naturalWidth ? imgCoin : null);
  if (spr) {
    ctx.drawImage(spr, -s / 2, -s / 2, s, s);
  } else {
    ctx.fillStyle = "#c9a227";
    ctx.beginPath();
    ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f0d36a";
    ctx.beginPath();
    ctx.arc(0, 0, s / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
  }
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
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(imgCat, -24, -30, 48, 48);
    ctx.imageSmoothingEnabled = false;
  } else {
    ctx.fillStyle = "#c49a4a";
    ctx.fillRect(-16, -10, 32, 24);
  }
  ctx.restore();
}

function drawFx() {
  if (!run.fx?.length) return;
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
  const items = liteDraw() ? run.popped.slice(-3) : run.popped;
  ctx.font = lang === "en" ? "10px 'Press Start 2P'" : "13px 'Noto Sans', 'Noto Sans SC', sans-serif";
  for (const n of items) {
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
  const dusk = Boolean(run.overtime);
  const veil = run.invuln > 0;
  const pal = worldPal(dusk, veil);
  const lite = liteDraw();
  drawSky(pal, dusk, W, H);
  drawParallax(pal, dusk, W);
  drawGround(pal, W, H);
  drawLedges(pal);

  for (const o of run.objects) {
    if (o.x < -90 || o.x > W + 90) continue;
    if (o.kind === "coin" && !o.hit) drawCoin(o);
    if (o.kind === "beam") {
      if (o.style === "brick") drawBrick(o, dusk);
      else drawPipe(o, dusk);
    }
    if (o.kind === "light") drawLight(o, dusk);
  }

  drawFx();
  drawCat();
  drawTutorialCallout();

  if (run.flash > 0) {
    ctx.fillStyle = `rgba(230, 184, 76, ${0.018 * run.flash})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (!lite) {
    const vg = ctx.createLinearGradient(0, 0, 0, H);
    vg.addColorStop(0, "rgba(255, 248, 236, 0.18)");
    vg.addColorStop(0.12, "transparent");
    vg.addColorStop(0.88, "transparent");
    vg.addColorStop(1, "rgba(80, 56, 32, 0.12)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

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
    payout: displayPayout(got, ticket, window._rewardBps || 10500, Boolean(run.free)),
  };
  try {
    CatboxChain.noteRunFinished?.(got, dailyScore);
  } catch (_) {}
  show(over);
  showSettleWalletHint(true);
  refreshOver();
  settleOnchain(got, ticket, dailyScore);
}

function showSettleWalletHint(on) {
  const hint = $("overSettleHint");
  if (hint) hint.classList.toggle("hidden", !on);
}

function paintSettledTx(el, rec) {
  if (!rec?.hash) {
    el.textContent = "";
    return;
  }
  lastFinish.tx = rec.hash;
  lastFinish.burnHash = rec.burned > 0n ? rec.hash : "";
  if (rec.burned > 0n) lastFinish.burned = Number(ethers.formatUnits(rec.burned, 18));
  if (rec.payout != null && rec.payout > 0n) {
    lastFinish.payout = Number(ethers.formatUnits(rec.payout, 18));
  }
  const fair = displayPayout(
    lastFinish.got,
    lastFinish.ticket,
    lastFinish.bps || window._rewardBps || 10500,
    lastFinish.free,
  );
  if (Number(lastFinish.payout) + 0.05 < Number(fair)) {
    showToast(
      t("settleShortfall", {
        fair: Number(fair).toFixed(2),
        paid: Number(lastFinish.payout).toFixed(2),
      }),
    );
  }
  const settleLink = `<a class="tx-view" href="${CatboxChain.txUrl(rec.hash)}" target="_blank" rel="noopener">${t("viewTx")}</a>`;
  const paidLim = CatboxChain.formatLim(rec.payout != null ? rec.payout : ethers.parseUnits(String(lastFinish.payout || 0), 18));
  const floorLink = rec.floorHash
    ? ` · <a class="tx-view" href="${CatboxChain.txUrl(rec.floorHash)}" target="_blank" rel="noopener">${t("floorSent")}</a>`
    : "";
  const extraLink = rec.extraHash
    ? ` · <a class="tx-view" href="${CatboxChain.txUrl(rec.extraHash)}" target="_blank" rel="noopener">+extra</a>`
    : "";
  el.classList.add("settled");
  el.style.cursor = "";
  el.onclick = null;
  el.innerHTML = `<span class="ok">${t("settledTx", { n: paidLim })}</span> · ${settleLink}${floorLink}${extraLink}`;
  showSettleWalletHint(false);
  refreshOver();
}

async function retryFloorOverage(el) {
  if (!el || !window.CatboxChain) return;
  el.onclick = null;
  el.textContent = t("settlingFloor");
  try {
    const hash = await CatboxChain.clearFloorOverage();
    lastFinish.floorHash = hash || lastFinish.floorHash;
    if (lastFinish.ticket != null) lastFinish.payout = lastFinish.ticket;
    el.classList.add("settled");
    el.style.cursor = "";
    const settleLink = lastFinish.tx
      ? ` · <a class="tx-view" href="${CatboxChain.txUrl(lastFinish.tx)}" target="_blank" rel="noopener">${t("viewTx")}</a>`
      : "";
    const floorLink = hash
      ? ` · <a class="tx-view" href="${CatboxChain.txUrl(hash)}" target="_blank" rel="noopener">${t("floorSent")}</a>`
      : "";
    el.innerHTML = `<span class="ok">${t("settledTx", { n: String(lastFinish.payout) })}</span>${settleLink}${floorLink}`;
    showSettleWalletHint(false);
    refreshOver();
    window._settleBusy = false;
  } catch (_) {
    el.classList.remove("settled");
    el.textContent = t("floorDue");
    el.style.cursor = "pointer";
    el.onclick = () => retryFloorOverage(el);
  }
}

async function settleOnchain(got, ticket, score) {
  const el = $("overTx");
  if (!el || !window.CatboxChain) return;
  if (window._settleBusy) return;
  window._settleBusy = true;
  try {
    el.classList.remove("settled");
    el.onclick = null;
    el.textContent = t("settling");
    const wait = 5500 - (Date.now() - (run?.startedMs || Date.now()));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const rec = await CatboxChain.settleRun(
      got,
      ticket,
      score,
      () => {
        el.textContent = t("settlingExtra");
      },
      () => {
        el.textContent = t("settlingFloor");
      },
    );
    paintSettledTx(el, rec);
    await syncOnchainPool();
    refreshInviteUi();
    refreshClaimUi();
    await refreshFreeUi();
    pullLiveBoards(true);
    window._settleBusy = false;
  } catch (e) {
    if (e?.message === "FLOOR_DUE") {
      if (e.settleHash) lastFinish.tx = e.settleHash;
      el.classList.remove("settled");
      el.textContent = t("floorDue");
      el.style.cursor = "pointer";
      el.onclick = () => retryFloorOverage(el);
      return;
    }
    el.textContent = t("txFail");
    window._settleBusy = false;
  }
}

mountLangs();
applyI18n();
bootTutorial();
bootLobbyTabs();
bootNoticeCarousel();
bootBoardMore();
bootBoardLookup();
show(lobby);
bootWallet();
window.addEventListener("pagehide", () => {
  if (!run || run.dead || !window.CatboxChain) return;
  try {
    CatboxChain.noteRunProgress?.(run.collected, run.free ? 0 : boardScore());
  } catch (_) {}
});
