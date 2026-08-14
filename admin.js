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

function renderTable() {
  const rows = visibleRows();
  const body = $("rows");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="12" class="empty">${allRows.length ? "无匹配地址" : "暂无对局"}</td></tr>`;
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
        <td>${lim(r.leftover)}</td>
        <td>${lim(r.burned)}</td>
        <td>${score}</td>
        <td>${fmtPts(r.weekPts)}</td>
        <td>${settled}</td>
        <td>${fmtTime(r.startedAt)}</td>
        <td>${addrCell(r.referrer)}</td>
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

const TIER_NAMES = ["SCOUT", "RUNNER", "PHANTOM", "VAULT"];
const READ_RPCS = [
  "https://bsc-dataseed.binance.org",
  "https://bsc-dataseed1.binance.org",
  "https://bsc-rpc.publicnode.com",
  "https://1rpc.io/bnb",
];
const LOG_RPCS = ["https://bsc-rpc.publicnode.com", "https://bsc.publicnode.com"];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function makePublic(url) {
  return new ethers.JsonRpcProvider(url, CatboxChain.cfg.chainId, {
    staticNetwork: true,
    batchMaxCount: 1,
  });
}

async function pickProvider(urls) {
  for (const url of urls) {
    try {
      const p = makePublic(url);
      await p.getBlockNumber();
      return p;
    } catch (_) {}
  }
  return makePublic(urls[0]);
}

function gameAt(provider) {
  const cfg = CatboxChain.cfg;
  return new ethers.Contract(cfg.address, cfg.abi, provider);
}

function parseRun(id, r) {
  const player = r.player || r[0];
  const paid = r.paid != null ? r.paid : r[1];
  const startedAt = r.startedAt != null ? r.startedAt : r[2];
  const settled = Boolean(r.settled != null ? r.settled : r[3]);
  let free = null;
  if (r.free != null) free = Boolean(r.free);
  else if (r.length > 4 && r[4] != null) free = Boolean(r[4]);
  return { id, player, paid: paid ?? 0n, startedAt: Number(startedAt || 0), settled, free };
}

function tierOfPaid(paid, prices) {
  const n = Number(ethers.formatUnits(paid || 0n, 18));
  let best = 0;
  let bestDiff = Infinity;
  (prices || []).forEach((p, i) => {
    const d = Math.abs(Number(ethers.formatUnits(p, 18)) - n);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  });
  return { id: best, name: TIER_NAMES[best] || `T${best}`, lim: n };
}

async function fetchRunEventLogs(provider, needStartIds) {
  const cfg = CatboxChain.cfg;
  const need = new Set(needStartIds);
  const iface = gameAt(provider).interface;
  const topicsOr = [
    iface.getEvent("RunStarted").topicHash,
    iface.getEvent("RunSettled").topicHash,
  ];
  try {
    topicsOr.push(iface.getEvent("FreeEnter").topicHash);
  } catch (_) {}
  const latest = await provider.getBlockNumber();
  const started = [];
  const settled = [];
  const frees = [];
  const ingest = (got) => {
    for (const log of got || []) {
      try {
        const parsed = iface.parseLog(log);
        const rec = { args: parsed.args, blockNumber: log.blockNumber, transactionHash: log.transactionHash };
        if (parsed.name === "RunStarted") {
          started.push(rec);
          need.delete(Number(parsed.args.runId));
        } else if (parsed.name === "RunSettled") settled.push(rec);
        else if (parsed.name === "FreeEnter") frees.push(rec);
      } catch (_) {}
    }
  };
  try {
    const all = await provider.getLogs({
      address: cfg.address,
      topics: [topicsOr],
      fromBlock: 0,
      toBlock: latest,
    });
    ingest(all);
    if (need.size === 0) return { started, settled, frees, covered: true };
  } catch (_) {}
  const chunk = 1200;
  const maxChunks = 120;
  for (let i = 0; i < maxChunks; i++) {
    const toBlock = latest - i * chunk;
    if (toBlock < 0) break;
    const fromBlock = Math.max(0, toBlock - chunk + 1);
    let got = null;
    for (let attempt = 0; attempt < 3 && !got; attempt++) {
      try {
        got = await provider.getLogs({
          address: cfg.address,
          topics: [topicsOr],
          fromBlock,
          toBlock,
        });
      } catch (_) {
        await sleep(300 * (attempt + 1));
      }
    }
    ingest(got);
    if (need.size === 0) break;
    await sleep(120);
  }
  return { started, settled, frees, covered: need.size === 0 };
}

async function fetchAllRuns(onProgress) {
  if (!CatboxChain.account || !CatboxChain.isOwner()) throw new Error("NOT_OWNER");
  const read = await pickProvider([CatboxChain.cfg.rpc, ...READ_RPCS]);
  const c = gameAt(read);
  const n = Number(await c.nextRunId());
  const ids = [];
  for (let i = n - 1; i >= 1; i--) ids.push(i);
  if (onProgress) onProgress({ phase: "runs", done: 0, total: ids.length });

  let prices = [
    ethers.parseUnits("1", 18),
    ethers.parseUnits("3", 18),
    ethers.parseUnits("6", 18),
    ethers.parseUnits("10", 18),
  ];
  try {
    prices = await Promise.all([0, 1, 2, 3].map((i) => c.ticketPrice(i)));
  } catch (_) {}

  const batch = 8;
  const rows = [];
  for (let i = 0; i < ids.length; i += batch) {
    const chunk = ids.slice(i, i + batch);
    const runs = await Promise.all(chunk.map((id) => c.runs(id)));
    chunk.forEach((id, j) => {
      const parsed = parseRun(id, runs[j]);
      if (!parsed.player || parsed.player === ethers.ZeroAddress) return;
      const player = ethers.getAddress(parsed.player);
      const tier = tierOfPaid(parsed.paid, prices);
      rows.push({
        id,
        player,
        paid: parsed.paid,
        ticketLim: tier.lim,
        tierId: tier.id,
        tierName: tier.name,
        startedAt: parsed.startedAt,
        settled: parsed.settled,
        free: parsed.free,
        collected: null,
        leftover: null,
        burned: null,
        score: null,
        weekPts: 0n,
        referrer: ethers.ZeroAddress,
        tx: null,
      });
    });
    if (onProgress) onProgress({ phase: "runs", done: Math.min(i + batch, ids.length), total: ids.length });
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  if (onProgress) onProgress({ phase: "logs", done: 0, total: rows.length });
  try {
    const logsP = await pickProvider(LOG_RPCS);
    const ev = await fetchRunEventLogs(logsP, rows.map((r) => r.id));
    for (const log of ev.started) {
      const row = byId.get(Number(log.args.runId));
      if (!row) continue;
      const ref = log.args.referrer;
      if (ref && ref !== ethers.ZeroAddress) row.referrer = ethers.getAddress(ref);
      if (log.args.paid != null) row.paid = log.args.paid;
    }
    for (const log of ev.settled) {
      const row = byId.get(Number(log.args.runId));
      if (!row) continue;
      row.collected = log.args.collected;
      row.leftover = log.args.leftover;
      row.score = log.args.score;
      row.burned = log.args.burned;
      row.tx = log.transactionHash;
      row.settled = true;
    }
    const freeIds = new Set(ev.frees.map((l) => Number(l.args.runId)));
    for (const row of rows) {
      if (row.free != null) continue;
      if (freeIds.has(row.id)) row.free = true;
      else if (ev.covered) row.free = false;
    }
  } catch (_) {}

  const players = [...new Set(rows.map((r) => r.player))];
  const week = {};
  const refs = {};
  for (let i = 0; i < players.length; i += batch) {
    const chunk = players.slice(i, i + batch);
    const [pts, refList] = await Promise.all([
      Promise.all(chunk.map((a) => c.weekPts(a).catch(() => 0n))),
      Promise.all(chunk.map((a) => c.refOf(a).catch(() => ethers.ZeroAddress))),
    ]);
    chunk.forEach((a, j) => {
      week[a] = pts[j] || 0n;
      const ref = refList[j];
      refs[a] = ref && ref !== ethers.ZeroAddress ? ethers.getAddress(ref) : ethers.ZeroAddress;
    });
  }
  for (const row of rows) {
    row.weekPts = week[row.player] || 0n;
    if (!row.referrer || row.referrer === ethers.ZeroAddress) {
      row.referrer = refs[row.player] || ethers.ZeroAddress;
    }
  }

  let burnedTotal = 0n;
  try {
    burnedTotal = await c.burnedTotal();
  } catch (_) {}

  const unique = new Set(rows.map((r) => r.player.toLowerCase()));
  return {
    nextRunId: n,
    runs: rows,
    burnedTotal,
    totalRuns: rows.length,
    uniqueWallets: unique.size,
    freeCount: rows.filter((r) => r.free === true).length,
    paidCount: rows.filter((r) => r.free === false).length,
    unknownPay: rows.filter((r) => r.free == null).length,
  };
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
