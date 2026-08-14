/* global ethers, CatboxChain */

const OWNER_HINT = "连接钱包后查看链上对局。TokenPocket / MetaMask 均可。";
const ZERO = "0x0000000000000000000000000000000000000000";

const $ = (id) => document.getElementById(id);

let allRows = [];
let sortKey = "id";
let sortDir = "desc";
let filterText = "";
let loading = false;

function show(el, on) {
  el.classList.toggle("hidden", !on);
}

function lim(v) {
  if (v == null) return "—";
  try {
    return CatboxChain.formatLim(v);
  } catch (_) {
    return "—";
  }
}

function fmtTime(ts) {
  if (!ts) return "—";
  const d = new Date(Number(ts) * 1000);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function fmtPts(v) {
  if (v == null) return "—";
  try {
    const n = typeof v === "bigint" ? Number(v) : Number(v);
    return Number.isFinite(n) ? String(Math.floor(n)) : "—";
  } catch (_) {
    return "—";
  }
}

function payLabel(free) {
  if (free === true) return "免费";
  if (free === false) return "付费";
  return "—";
}

function copyText(text, btn) {
  const done = () => {
    const prev = btn.textContent;
    btn.textContent = "已复制";
    setTimeout(() => {
      btn.textContent = prev;
    }, 900);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-999px";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    done();
  } catch (_) {}
  ta.remove();
}

function cmp(a, b, key) {
  const va = a[key];
  const vb = b[key];
  const numKeys = {
    id: 1,
    tierId: 1,
    ticketLim: 1,
    collected: 1,
    leftover: 1,
    burned: 1,
    payout: 1,
    rewardBps: 1,
    invites: 1,
    plays: 1,
    score: 1,
    weekPts: 1,
    startedAt: 1,
  };
  if (key === "free") {
    const na = va === true ? 0 : va === false ? 1 : 2;
    const nb = vb === true ? 0 : vb === false ? 1 : 2;
    return na - nb;
  }
  if (key === "settled") return Number(!!va) - Number(!!vb);
  if (key === "player" || key === "referrer") {
    return String(va || "").localeCompare(String(vb || ""), undefined, { sensitivity: "accent" });
  }
  if (numKeys[key]) {
    const na = va == null ? -1 : Number(va);
    const nb = vb == null ? -1 : Number(vb);
    return na - nb;
  }
  return String(va ?? "").localeCompare(String(vb ?? ""));
}

function visibleRows() {
  const q = filterText.trim().toLowerCase();
  let rows = allRows.slice();
  if (q) {
    rows = rows.filter((r) => {
      const addr = String(r.player || "").toLowerCase();
      const ref = String(r.referrer || "").toLowerCase();
      return addr.includes(q) || ref.includes(q) || String(r.id) === q;
    });
  }
  rows.sort((a, b) => {
    const d = cmp(a, b, sortKey);
    return sortDir === "asc" ? d : -d;
  });
  return rows;
}

function renderChips(summary) {
  const s = summary || {};
  const paidBit =
    s.unknownPay > 0
      ? `${s.paidCount} 付费 / ${s.freeCount} 免费 / ${s.unknownPay} 未知`
      : `${s.paidCount ?? 0} 付费 / ${s.freeCount ?? 0} 免费`;
  $("chips").innerHTML = [
    ["局数", s.totalRuns ?? allRows.length],
    ["独立钱包", s.uniqueWallets ?? "—"],
    ["付费 / 免费", paidBit],
    ["日奖池", s.weekPool != null ? `${lim(s.weekPool)} LIM` : "—"],
    ["邀请池", s.invitePool != null ? `${lim(s.invitePool)} LIM` : "—"],
    ["免费池", s.freePool != null ? `${lim(s.freePool)} LIM` : "—"],
    ["累计销毁", s.burnedTotal != null ? `${lim(s.burnedTotal)} LIM` : "—"],
  ]
    .map(([k, v]) => `<div class="chip"><span>${k}</span><b>${v}</b></div>`)
    .join("");
}

function addrCell(addr) {
  if (!addr || addr === ZERO) return "—";
  const href = CatboxChain.addrUrl(addr);
  return `<span class="addr"><a href="${href}" target="_blank" rel="noopener noreferrer">${addr}</a><button type="button" class="copy" data-copy="${addr}">复制</button></span>`;
}

function fmtBps(bps) {
  const n = Number(bps || 10500);
  if (!Number.isFinite(n)) return "—";
  return `${(n / 100).toFixed(1)}%`;
}

function txCell(hash) {
  if (!hash) return "—";
  const href = CatboxChain.txUrl(hash);
  const shortHash = `${hash.slice(0, 10)}…${hash.slice(-6)}`;
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${shortHash}</a>`;
}

function renderTable() {
  const rows = visibleRows();
  const body = $("rows");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="17" class="empty">${allRows.length ? "无匹配地址" : "暂无对局"}</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map((r) => {
      const settled = r.settled
        ? `<span class="yes">是</span>`
        : `<span class="no">否</span>`;
      const pay = r.free === true ? `<span class="free">免费</span>` : payLabel(r.free);
      const score = r.score != null ? fmtPts(r.score) : "—";
      return `<tr>
        <td>${r.id}</td>
        <td>${addrCell(r.player)}</td>
        <td>${r.tierName || "—"} · ${Number(r.ticketLim || 0)} LIM</td>
        <td>${pay}</td>
        <td>${lim(r.collected)}</td>
        <td>${lim(r.payout)}</td>
        <td>${fmtBps(r.rewardBps)}</td>
        <td>${lim(r.leftover)}</td>
        <td>${lim(r.burned)}</td>
        <td>${score}</td>
        <td>${fmtPts(r.weekPts)}</td>
        <td>${r.invites ?? 0}</td>
        <td>${r.plays ?? 0}</td>
        <td>${settled}</td>
        <td>${fmtTime(r.startedAt)}</td>
        <td>${addrCell(r.referrer)}</td>
        <td>${txCell(r.tx)}</td>
      </tr>`;
    })
    .join("");
}

function paintSortHeaders() {
  document.querySelectorAll("table.runs th[data-key]").forEach((th) => {
    const on = th.dataset.key === sortKey;
    th.dataset.dir = on ? sortDir : "";
  });
}

function setStatus(msg) {
  $("status").textContent = msg || "";
}

function paintWalletBtn() {
  const acc = CatboxChain.account;
  const label = acc ? CatboxChain.short(acc) : "连接钱包";
  $("walletBtn").textContent = label;
  $("gateConnect").textContent = acc ? CatboxChain.short(acc) : "连接钱包";
}

async function fetchAllRuns(onProgress) {
  if (!CatboxChain.account || !CatboxChain.isOwner()) throw new Error("NOT_OWNER");
  return CatboxChain.fetchOwnerRuns(onProgress);
}

function paintGate() {
  const acc = CatboxChain.account;
  const owner = acc && CatboxChain.isOwner();
  paintWalletBtn();
  if (!acc) {
    show($("gate"), true);
    show($("board"), false);
    show($("denied"), false);
    $("gateHint").textContent = window.ethereum ? OWNER_HINT : "请用 TokenPocket 或 MetaMask 打开此页。";
    return false;
  }
  if (!owner) {
    show($("gate"), true);
    show($("board"), false);
    show($("denied"), true);
    $("gateHint").textContent = OWNER_HINT;
    return false;
  }
  show($("gate"), false);
  show($("board"), true);
  show($("denied"), false);
  return true;
}

async function loadRuns() {
  if (!paintGate()) return;
  if (loading) return;
  loading = true;
  setStatus("正在扫描全部对局…");
  try {
    const data = await fetchAllRuns((p) => {
      if (p.phase === "runs") setStatus(`读取对局 ${p.done}/${p.total}…`);
      else if (p.phase === "logs") setStatus("补齐结算 / 推荐人日志…");
      else if (p.phase === "done") setStatus(`已加载 ${p.total} 局`);
    });
    allRows = data.runs || [];
    renderChips(data);
    paintSortHeaders();
    renderTable();
    setStatus(`共 ${data.totalRuns} 局 · ${data.uniqueWallets} 个钱包`);
  } catch (e) {
    const msg = e?.message === "NOT_OWNER" ? "无权限" : e?.message === "NO_WALLET" ? "请先连接钱包" : "读取失败，请重试";
    setStatus(msg);
    if (e?.message === "NOT_OWNER") {
      show($("denied"), true);
      show($("gate"), true);
      show($("board"), false);
    }
  } finally {
    loading = false;
  }
}

async function connectWallet() {
  try {
    $("walletBtn").textContent = "连接中…";
    $("gateConnect").textContent = "连接中…";
    await CatboxChain.connect();
    await loadRuns();
  } catch (e) {
    paintWalletBtn();
    if (e?.message === "NO_WALLET") {
      $("gateHint").textContent = "请用 TokenPocket 或 MetaMask 打开此页。";
    }
  }
}

function boot() {
  $("walletBtn").onclick = connectWallet;
  $("gateConnect").onclick = connectWallet;
  $("refreshBtn").onclick = () => loadRuns();
  $("filter").addEventListener("input", (e) => {
    filterText = e.target.value || "";
    renderTable();
  });
  document.querySelector("table.runs thead").addEventListener("click", (e) => {
    const th = e.target.closest("th[data-key]");
    if (!th) return;
    const key = th.dataset.key;
    if (sortKey === key) sortDir = sortDir === "desc" ? "asc" : "desc";
    else {
      sortKey = key;
      sortDir = key === "id" || key === "startedAt" ? "desc" : "asc";
    }
    paintSortHeaders();
    renderTable();
  });
  $("rows").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    copyText(btn.getAttribute("data-copy"), btn);
  });
  window.addEventListener("catbox-wallet", () => {
    if (paintGate()) loadRuns();
    else {
      allRows = [];
      renderChips({});
      renderTable();
    }
  });

  paintGate();
  if (window.ethereum) {
    Promise.race([
      window.ethereum.request({ method: "eth_accounts" }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2500)),
    ])
      .then(async (accs) => {
        if (accs?.[0]) {
          await CatboxChain.connect();
          await loadRuns();
        }
      })
      .catch(() => paintGate());
  }
}

boot();
