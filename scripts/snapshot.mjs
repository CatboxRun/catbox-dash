import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Contract,
  JsonRpcProvider,
  ZeroAddress,
  formatUnits,
  getAddress,
} from "ethers";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cfgSrc = readFileSync(join(root, "config.js"), "utf8");
const cfg = JSON.parse(cfgSrc.slice(cfgSrc.indexOf("{"), cfgSrc.lastIndexOf("}") + 1));

const RPCS = [
  process.env.BSC_RPC,
  "https://bsc-rpc.publicnode.com",
  "https://bsc.publicnode.com",
  "https://1rpc.io/bnb",
  cfg.rpc,
].filter(Boolean);

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const TIER_NAMES = ["SCOUT", "RUNNER", "PHANTOM", "VAULT"];
const ZERO = ZeroAddress;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout(promise, ms) {
  let t;
  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error("TIMEOUT")), ms);
    }),
  ]);
}

function makeProvider(url) {
  return new JsonRpcProvider(url, cfg.chainId, { staticNetwork: true, batchMaxCount: 1 });
}

async function pickProvider() {
  for (const url of RPCS) {
    try {
      const p = makeProvider(url);
      await withTimeout(p.getBlockNumber(), 4000);
      console.error("rpc", url);
      return { p, url };
    } catch {
      console.error("rpc fail", url);
    }
  }
  throw new Error("NO_RPC");
}

function weiStr(v) {
  if (v == null) return null;
  try {
    return (typeof v === "bigint" ? v : BigInt(v)).toString();
  } catch {
    return null;
  }
}

function asNum(v) {
  if (v == null) return 0;
  try {
    const n = typeof v === "bigint" ? Number(v) : Number(v);
    return Number.isFinite(n) ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function short(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function rewardBpsFromParts(inviteN, playN) {
  const inv = Math.max(0, Math.floor(Number(inviteN) || 0)) * 500;
  const extra = Math.max(0, Math.floor(Number(playN) || 0) - 1) * 10;
  return Math.min(20000, 10500 + inv + extra);
}

function payoutCapWei(ticket) {
  if (ticket <= 10n ** 18n) return ticket * 2n;
  return (ticket * 15n) / 10n;
}

function displayPayout(collected, paid, bps) {
  if (collected == null) return null;
  const got = typeof collected === "bigint" ? collected : BigInt(collected);
  const ticket = typeof paid === "bigint" ? paid : BigInt(paid || 0);
  const raw = (got * BigInt(bps || 10500)) / 10000n;
  const cap = payoutCapWei(ticket);
  return raw > cap ? cap : raw;
}

function tierOfPaid(paid, prices) {
  const n = Number(formatUnits(paid || 0n, 18));
  let best = 0;
  let bestDiff = Infinity;
  (prices || []).forEach((p, i) => {
    const d = Math.abs(Number(formatUnits(p, 18)) - n);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  });
  return { id: best, name: TIER_NAMES[best] || `T${best}`, lim: n };
}

async function multicall(p, iface, fn, items, batch = 40, target) {
  if (!target) target = gameAddr || cfg.address;
  const multi = new Contract(
    MULTICALL3,
    [
      "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
    ],
    p,
  );
  const out = [];
  for (let i = 0; i < items.length; i += batch) {
    const chunk = items.slice(i, i + batch);
    const calls = chunk.map((item) => ({
      target,
      allowFailure: true,
      callData: iface.encodeFunctionData(fn, [item]),
    }));
    let rows;
    try {
      rows = await withTimeout(multi.aggregate3.staticCall(calls), 12000);
    } catch {
      await sleep(250);
      rows = await withTimeout(multi.aggregate3.staticCall(calls), 12000);
    }
    chunk.forEach((_, j) => {
      const row = rows[j];
      const ok = row?.success === true || row?.[0] === true;
      const bytes = row?.returnData || row?.[1] || "0x";
      if (!ok || !bytes || bytes === "0x") {
        out.push(null);
        return;
      }
      try {
        out.push(iface.decodeFunctionResult(fn, bytes));
      } catch {
        out.push(null);
      }
    });
    if (i && i % 200 === 0) console.error(fn, i, "/", items.length);
  }
  return out;
}

async function getLogsChunk(urls, filter) {
  for (const url of urls) {
    try {
      const p = makeProvider(url);
      return (await withTimeout(p.getLogs(filter), 8000)) || [];
    } catch {}
  }
  return null;
}

async function collectLogs(addr, iface, names, latest, maxChunks = 80) {
  const urls = RPCS.slice();
  const span = 1000;
  const out = [];
  for (const name of names) {
    const topic = iface.getEvent(name).topicHash;
    for (let i = 0; i < maxChunks; i++) {
      const toBlock = latest - i * span;
      if (toBlock < 0) break;
      const fromBlock = Math.max(0, toBlock - span + 1);
      const got = await getLogsChunk(urls, {
        address: addr,
        topics: [topic],
        fromBlock,
        toBlock,
      });
      if (!got) continue;
      for (const log of got) {
        try {
          const ev = iface.parseLog(log);
          out.push({
            name: ev.name,
            args: ev.args,
            blockNumber: Number(log.blockNumber),
            transactionHash: log.transactionHash,
          });
        } catch {}
      }
    }
    console.error("logs", name, out.filter((e) => e.name === name).length);
  }
  return out;
}

function toRows(map, allAddrs) {
  const keys = allAddrs && allAddrs.length ? allAddrs : Object.keys(map);
  return keys
    .map((addr) => ({
      tag: short(addr),
      addr,
      pts: asNum(map[addr] || 0n),
    }))
    .sort((a, b) => b.pts - a.pts || a.addr.localeCompare(b.addr))
    .slice(0, 2000);
}

const { p } = await pickProvider();
const freeAddr = cfg.freeAddress || cfg.address;
const freeAbi = cfg.abi;
let paidAddr = null;
let paidAbi = null;
if (cfg.v6?.address) {
  const code = await withTimeout(p.getCode(cfg.v6.address), 4000);
  if (code && code !== "0x") {
    paidAddr = cfg.v6.address;
    paidAbi = cfg.v6.abi;
  }
}
const boardAddr = paidAddr || freeAddr;
const boardAbi = paidAddr ? paidAbi : freeAbi;
console.error("snapshot free", freeAddr, "paid", paidAddr || "(none)", "boards", boardAddr);

const freeGame = new Contract(freeAddr, freeAbi, p);
const boardGame = new Contract(boardAddr, boardAbi, p);
const freeIface = freeGame.interface;
const boardIface = boardGame.interface;
const latest = Number(await withTimeout(p.getBlockNumber(), 4000));

let prices = [
  10n ** 18n,
  3n * 10n ** 18n,
  6n * 10n ** 18n,
  10n * 10n ** 18n,
];
try {
  prices = await Promise.all([0, 1, 2, 3].map((i) => boardGame.ticketPrice(i)));
} catch {}

async function loadRunsFrom(label, addr, iface, contract, opts = {}) {
  const next = Number(await withTimeout(contract.nextRunId(), 8000));
  const fromId = Math.max(1, Number(opts.fromId || 1));
  const toExclusive = Math.min(next, Number(opts.toIdExclusive || next));
  console.error("runs", label, "nextRunId", next, "scan", fromId, "..", toExclusive - 1);
  const ids = [];
  for (let i = fromId; i < toExclusive; i++) ids.push(i);
  if (!ids.length) return { next, rows: [] };
  const runRows = await multicall(p, iface, "runs", ids, 40, addr);
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    const decoded = runRows[i];
    if (!decoded) continue;
    const playerRaw = decoded.player || decoded[0];
    if (!playerRaw || playerRaw === ZERO) continue;
    const player = getAddress(playerRaw);
    const paid = decoded.paid ?? decoded[1] ?? 0n;
    const startedAt = Number(decoded.startedAt ?? decoded[2] ?? 0);
    const settled = Boolean(decoded.settled ?? decoded[3]);
    let freeFlag = null;
    if (decoded.free != null) freeFlag = Boolean(decoded.free);
    else if (decoded.length > 4 && decoded[4] != null) freeFlag = Boolean(decoded[4]);
    const tier = tierOfPaid(paid, prices);
    out.push({
      id: ids[i],
      lane: label,
      key: `${label}-${ids[i]}`,
      player,
      paid,
      ticketLim: tier.lim,
      tierId: tier.id,
      tierName: tier.name,
      startedAt,
      settled,
      free: freeFlag,
      collected: null,
      leftover: null,
      burned: null,
      score: null,
      payout: null,
      rewardBps: 10500,
      invites: 0,
      plays: 0,
      weekPts: 0n,
      invitePts: 0n,
      extraPaid: 0n,
      extraTx: null,
      referrer: ZERO,
      tx: null,
    });
  }
  return { next, rows: out };
}

function readJsonFile(path) {
  try {
    const buf = readFileSync(path);
    let text = buf.toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    // Windows tools sometimes rewrite as UTF-16; recover instead of dropping wallets.
    if (text.includes("\u0000")) {
      text = buf.toString("utf16le");
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    }
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function prevRunToInternal(r) {
  const lane = r.lane === "paid" ? "v6" : r.lane === "free" ? "v5" : r.lane || "v5";
  return {
    id: r.id,
    lane,
    key: `${lane}-${r.id}`,
    player: getAddress(r.player),
    paid: BigInt(r.paid || "0"),
    ticketLim: r.ticketLim,
    tierId: r.tierId,
    tierName: r.tierName,
    startedAt: Number(r.startedAt || 0),
    settled: Boolean(r.settled),
    free: r.free == null ? null : Boolean(r.free),
    collected: r.collected != null ? BigInt(r.collected) : null,
    leftover: r.leftover != null ? BigInt(r.leftover) : null,
    burned: r.burned != null ? BigInt(r.burned) : null,
    score: r.score == null ? null : Number(r.score),
    payout: r.payout != null ? BigInt(r.payout) : null,
    rewardBps: r.rewardBps ?? 10500,
    invites: r.invites ?? 0,
    plays: r.plays ?? 0,
    weekPts: BigInt(r.weekPts || "0"),
    invitePts: BigInt(r.invitePts || "0"),
    extraPaid: BigInt(r.extraPaid || "0"),
    extraTx: r.extraTx || null,
    xClaimed: Boolean(r.xClaimed),
    tgClaimed: Boolean(r.tgClaimed),
    referrer: r.referrer && r.referrer !== ZERO ? getAddress(r.referrer) : ZERO,
    tx: r.tx || null,
  };
}

function loadPrevV5Runs(prev) {
  if (!prev?.runs?.length) return [];
  return prev.runs
    .filter((r) => r.lane === "v5" || r.lane === "free")
    .map(prevRunToInternal);
}

function mergeRunRows(...lists) {
  const byKey = new Map();
  for (const list of lists) {
    for (const r of list) {
      const key = r.key || `${r.lane}-${r.id}`;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, { ...r, key });
        continue;
      }
      // Prefer freshly scanned chain rows; keep prev enrichments when scan is sparse.
      const merged = { ...prev, ...r, key };
      if (prev.tx && !r.tx) merged.tx = prev.tx;
      if (prev.collected != null && r.collected == null) merged.collected = prev.collected;
      if (prev.leftover != null && r.leftover == null) merged.leftover = prev.leftover;
      if (prev.burned != null && r.burned == null) merged.burned = prev.burned;
      if (prev.score != null && r.score == null) merged.score = prev.score;
      if (prev.referrer && prev.referrer !== ZERO && (!r.referrer || r.referrer === ZERO)) {
        merged.referrer = prev.referrer;
      }
      byKey.set(key, merged);
    }
  }
  return [...byKey.values()];
}

function loadPrevBoardAddrs() {
  const out = new Set();
  const prev = readJsonFile(join(root, "data/snapshot.json"));
  if (prev) {
    for (const row of prev.week || []) if (row?.addr) out.add(getAddress(row.addr));
    for (const row of prev.invite || []) if (row?.addr) out.add(getAddress(row.addr));
    for (const row of prev.runs || []) if (row?.player) out.add(getAddress(row.player));
  }
  const book = readJsonFile(join(root, "data/board-wallets.json"));
  if (book?.addrs) {
    for (const a of book.addrs) {
      try {
        out.add(getAddress(a));
      } catch {}
    }
  }
  return out;
}

function saveBoardWallets(addrs) {
  const file = join(root, "data/board-wallets.json");
  const prev = readJsonFile(file);
  const set = new Set(prev?.addrs || []);
  for (const a of addrs) set.add(a);
  const list = [...set].sort((a, b) => a.localeCompare(b));
  writeFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), addrs: list })}\n`);
  console.error("board-wallets", list.length);
  return list;
}

const prevSnapEarly = readJsonFile(join(root, "data/snapshot.json")) || {};

const paidPack = paidAddr
  ? await loadRunsFrom("v6", paidAddr, boardIface, boardGame)
  : { next: 0, rows: [] };

// After V6 cutover, do NOT full-scan V5 history in one shot — it times out Actions.
// Live window: recent V5 for free SCOUT + logs; older V5 paid runs backfill incrementally + carry forward.
const V5_RECENT = Number(process.env.V5_RECENT || 120);
const V5_RUN_CHUNK = Number(process.env.V5_RUN_CHUNK || 150);
let freePack;
let nextFree = 0;
if (paidAddr) {
  nextFree = Number(await withTimeout(freeGame.nextRunId(), 8000));
  const fromId = Math.max(1, nextFree - V5_RECENT);
  freePack = await loadRunsFrom("v5", freeAddr, freeIface, freeGame, {
    fromId,
    toIdExclusive: nextFree,
  });
} else {
  freePack = await loadRunsFrom("v5", freeAddr, freeIface, freeGame);
  nextFree = freePack.next;
}

let v5HistRows = [];
let v5RunScanBefore = Number(prevSnapEarly.v5RunScanBefore || 0);
if (paidAddr && nextFree > 1) {
  if (!Number.isFinite(v5RunScanBefore) || v5RunScanBefore <= 0) {
    v5RunScanBefore = Math.max(1, nextFree - V5_RECENT);
  }
  if (v5RunScanBefore > nextFree) v5RunScanBefore = nextFree;
  const histTo = v5RunScanBefore;
  const histFrom = Math.max(1, histTo - V5_RUN_CHUNK);
  if (histFrom < histTo) {
    console.error("v5 run backfill", histFrom, "..", histTo - 1);
    const histPack = await loadRunsFrom("v5", freeAddr, freeIface, freeGame, {
      fromId: histFrom,
      toIdExclusive: histTo,
    });
    v5HistRows = histPack.rows;
    v5RunScanBefore = histFrom;
  }
}

const prevV5Rows = paidAddr ? loadPrevV5Runs(prevSnapEarly) : [];

let rows;
if (paidAddr) {
  rows = mergeRunRows(
    paidPack.rows,
    freePack.rows.map((r) => ({ ...r, lane: "v5" })),
    v5HistRows.map((r) => ({ ...r, lane: "v5" })),
    prevV5Rows,
  );
} else {
  rows = mergeRunRows(freePack.rows.map((r) => ({ ...r, lane: "v5" })), prevV5Rows);
}

const seen = new Set(rows.map((r) => r.player));
for (const a of loadPrevBoardAddrs()) seen.add(a);
const addrs = saveBoardWallets([...seen]);
const nextRunId = paidAddr ? paidPack.next : freePack.next;
console.error("runs merged", rows.length, "wallets", addrs.length);

const gameAddr = boardAddr;
const iface = boardIface;
const game = boardGame;

const [weekRows, invRows, refRows] = await Promise.all([
  multicall(p, boardIface, "weekPts", addrs, 40, boardAddr),
  multicall(p, boardIface, "invitePts", addrs, 40, boardAddr),
  multicall(p, boardIface, "refOf", addrs, 40, boardAddr),
]);
let usedRows = await multicall(p, freeIface, "freeUsed", addrs, 40, freeAddr);
let v5InvRows = [];
if (paidAddr && freeAddr.toLowerCase() !== boardAddr.toLowerCase()) {
  v5InvRows = await multicall(p, freeIface, "invitePts", addrs, 40, freeAddr);
}
const week = {};
const invite = {};
const refs = {};
const freeUsed = {};
addrs.forEach((a, j) => {
  const w = weekRows[j] ? weekRows[j][0] || 0n : 0n;
  const inv6 = invRows[j] ? invRows[j][0] || 0n : 0n;
  const inv5 = v5InvRows[j] ? v5InvRows[j][0] || 0n : 0n;
  const inv = inv6 > inv5 ? inv6 : inv5;
  if (w > 0n) week[a] = w;
  if (inv > 0n) invite[a] = inv;
  const refRaw = refRows[j] ? refRows[j][0] : ZERO;
  refs[a] = refRaw && refRaw !== ZERO ? getAddress(refRaw) : ZERO;
  freeUsed[a] = Number(usedRows[j] ? usedRows[j][0] || 0n : 0n);
});
const missingRefs = [...new Set(Object.values(refs).filter((a) => a !== ZERO && invite[a] == null))];
if (missingRefs.length) {
  const extra = await multicall(p, boardIface, "invitePts", missingRefs, 40, boardAddr);
  let extra5 = [];
  if (paidAddr && freeAddr.toLowerCase() !== boardAddr.toLowerCase()) {
    extra5 = await multicall(p, freeIface, "invitePts", missingRefs, 40, freeAddr);
  }
  missingRefs.forEach((a, j) => {
    const p6 = extra[j] ? extra[j][0] || 0n : 0n;
    const p5 = extra5[j] ? extra5[j][0] || 0n : 0n;
    const pts = p6 > p5 ? p6 : p5;
    if (pts > 0n) invite[a] = pts;
  });
}

console.error("fetching logs");
const logChunksPaid = Number(process.env.LOG_CHUNKS_PAID || 40);
const logChunksFree = Number(process.env.LOG_CHUNKS_FREE || (paidAddr ? 12 : 80));
const logsPaid = paidAddr
  ? await collectLogs(paidAddr, boardIface, ["RunStarted", "RunSettled", "Burned"], latest, logChunksPaid)
  : [];
// V6 live: recent free settles + FreeEnter only (full V5 Burned history is filled incrementally below).
const freeLogNames = paidAddr
  ? ["RunSettled", "FreeEnter"]
  : ["RunStarted", "RunSettled", "FreeEnter", "Burned"];
const logsFree = await collectLogs(freeAddr, freeIface, freeLogNames, latest, logChunksFree);

// Incrementally backfill V5 Burned logs so the burn board grows over time without timing out.
const prevSnap = prevSnapEarly;
const burnChunks = Number(process.env.BURN_CHUNKS || 10);
let burnScanBefore = Number(prevSnap.burnScanBefore || latest);
if (!Number.isFinite(burnScanBefore) || burnScanBefore <= 0) burnScanBefore = latest;
if (burnScanBefore > latest) burnScanBefore = latest;
const burnSpan = 1000;
const burnFrom = Math.max(0, burnScanBefore - burnChunks * burnSpan);
if (paidAddr && burnScanBefore > 0) {
  console.error("burn backfill", burnFrom, "..", burnScanBefore);
  const topic = freeIface.getEvent("Burned").topicHash;
  for (let toBlock = burnScanBefore; toBlock > burnFrom; toBlock -= burnSpan) {
    const fromBlock = Math.max(burnFrom, toBlock - burnSpan + 1);
    const got = await getLogsChunk(RPCS, {
      address: freeAddr,
      topics: [topic],
      fromBlock,
      toBlock,
    });
    for (const log of got || []) {
      try {
        const parsed = freeIface.parseLog(log);
        logsFree.push({
          name: parsed.name,
          args: parsed.args,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
        });
      } catch {}
    }
  }
  burnScanBefore = burnFrom;
}
const logs = [...logsPaid.map((l) => ({ ...l, lane: "v6" })), ...logsFree.map((l) => ({ ...l, lane: "v5" }))];
const byKey = new Map(rows.map((r) => [r.key, r]));
const burnsByHash = new Map();
for (const log of logs) {
  const lane = log.lane || (paidAddr ? "v6" : "v5");
  const key = `${lane}-${Number(log.args.runId)}`;
  if (log.name === "RunStarted") {
    const row = byKey.get(key);
    if (!row) continue;
    const ref = log.args.referrer;
    if (ref && ref !== ZERO) row.referrer = getAddress(ref);
    if (log.args.paid != null) row.paid = log.args.paid;
  } else if (log.name === "RunSettled") {
    const row = byKey.get(key);
    if (row) {
      row.collected = log.args.collected;
      row.leftover = log.args.leftover;
      row.score = log.args.score;
      row.burned = log.args.burned;
      row.tx = log.transactionHash;
      row.settled = true;
    }
    const amt = log.args.burned ?? 0n;
    if (amt > 0n) {
      const player = getAddress(log.args.player);
      const bkey = log.transactionHash || `run-${key}`;
      burnsByHash.set(bkey, {
        player,
        tag: short(player),
        amount: amt,
        hash: log.transactionHash || "",
        runId: Number(log.args.runId),
        lane,
        blockNumber: log.blockNumber,
      });
    }
  } else if (log.name === "FreeEnter") {
    const row = byKey.get(key);
    if (row) row.free = true;
  } else if (log.name === "Burned") {
    const amt = log.args.amount ?? 0n;
    if (amt <= 0n) continue;
    const player = getAddress(log.args.player);
    const bkey = log.transactionHash || `${log.blockNumber}-${player}`;
    const prev = burnsByHash.get(bkey) || {};
    burnsByHash.set(bkey, {
      ...prev,
      player,
      tag: short(player),
      amount: amt,
      hash: log.transactionHash || prev.hash || "",
      blockNumber: log.blockNumber || prev.blockNumber || 0,
      runId: prev.runId,
      lane: prev.lane || lane,
    });
  }
}

const playN = {};
const invitees = {};
const byPlayer = {};
for (const row of rows) {
  playN[row.player] = (playN[row.player] || 0) + 1;
  if (!row.referrer || row.referrer === ZERO) row.referrer = refs[row.player] || ZERO;
  if (row.referrer && row.referrer !== ZERO) {
    if (!invitees[row.referrer]) invitees[row.referrer] = new Set();
    invitees[row.referrer].add(row.player);
  }
  if (!byPlayer[row.player]) byPlayer[row.player] = [];
  byPlayer[row.player].push(row);
}
for (const list of Object.values(byPlayer)) {
  list.sort((a, b) => a.startedAt - b.startedAt || a.id - b.id);
  const freeLane = list.filter((r) => r.lane === "v5" && r.paid <= 10n ** 18n);
  let left = freeUsed[list[0].player] || 0;
  for (const r of list) {
    if (r.lane === "v6") {
      r.free = false;
      continue;
    }
    if (r.paid > 10n ** 18n) {
      r.free = false;
    }
  }
  for (const r of freeLane) {
    if (r.free === true) {
      if (left > 0) left -= 1;
      continue;
    }
    if (left > 0) {
      r.free = true;
      left -= 1;
    } else if (r.free == null) {
      r.free = false;
    }
  }
}
for (const row of rows) {
  row.weekPts = week[row.player] || 0n;
  row.invitePts = invite[row.player] || 0n;
  row.plays = playN[row.player] || 0;
  row.invites = invitees[row.player] ? invitees[row.player].size : 0;
  row.rewardBps = rewardBpsFromParts(row.invites, row.plays);
  row.payout = displayPayout(row.collected, row.paid, row.rewardBps);
}

let weekPool = 0n;
let invitePool = 0n;
let freePool = 0n;
let burnedTotal = 0n;
let strandedBurn = 0n;
try {
  const boardPools = await Promise.all([
    boardGame.weekPool(),
    boardGame.invitePool(),
    boardGame.burnedTotal(),
  ]);
  weekPool = boardPools[0];
  invitePool = boardPools[1];
  burnedTotal = boardPools[2];
} catch {}
try {
  freePool = await freeGame.freePool();
} catch {}
try {
  if (paidAddr) {
    const freeBurned = await freeGame.burnedTotal();
    burnedTotal += freeBurned;
  }
} catch {}

// After V6 cutover, V5 board leftovers (+ accounting dust beyond freePool/ticketFloat) are
// no longer the live claim pools — fold into displayed burned total. Keep freePool intact.
try {
  if (paidAddr) {
    const lim = new Contract(cfg.lim, ["function balanceOf(address) view returns (uint256)"], p);
    const [v5Bal, v5Week, v5Invite, ticketFloat] = await Promise.all([
      lim.balanceOf(freeAddr),
      freeGame.weekPool().catch(() => 0n),
      freeGame.invitePool().catch(() => 0n),
      freeGame.ticketFloat().catch(() => 0n),
    ]);
    const accounted = freePool + v5Week + v5Invite + ticketFloat;
    const dust = v5Bal > accounted ? v5Bal - accounted : 0n;
    // Leftover V5 day/invite boards + unaccounted dust (not free scout reserve, not live tickets).
    strandedBurn = v5Week + v5Invite + dust;
    if (strandedBurn > 0n) {
      burnedTotal += strandedBurn;
      console.error(
        "strandedBurn",
        formatUnits(strandedBurn, 18),
        "v5Week",
        formatUnits(v5Week, 18),
        "v5Invite",
        formatUnits(v5Invite, 18),
        "dust",
        formatUnits(dust, 18),
      );
    }
  }
} catch (e) {
  console.error("strandedBurn fail", e?.message || e);
}

let extraPool = 0n;
let extraPaused = false;
let extraSinceRunId = 0;
let extraFundedTotal = 0n;
let extraWithdrawnTotal = 0n;
let extraPaidTotal = 0n;
let extraPaidCount = 0;
const extraAddr = cfg.extra?.address;
if (extraAddr && cfg.extra?.abi) {
  try {
    const extra = new Contract(extraAddr, cfg.extra.abi, p);
    const extraIface = extra.interface;
    try {
      extraPool = await extra.pool();
      extraPaused = Boolean(await extra.paused());
      extraSinceRunId = Number(await extra.sinceRunId());
    } catch {}
    console.error("fetching extra logs", extraAddr);
    const extraLogs = await collectLogs(
      extraAddr,
      extraIface,
      ["ExtraPaid", "Funded", "Withdrawn"],
      latest,
      Number(process.env.LOG_CHUNKS_EXTRA || (paidAddr ? 16 : 40)),
    );
    for (const log of extraLogs) {
      if (log.name === "ExtraPaid") {
        const id = Number(log.args.runId);
        const amt = log.args.amount ?? 0n;
        const row = byKey.get(`v5-${id}`);
        if (row) {
          row.extraPaid = amt;
          row.extraTx = log.transactionHash;
        }
        extraPaidTotal += amt;
        extraPaidCount += 1;
      } else if (log.name === "Funded") {
        extraFundedTotal += log.args.amount ?? 0n;
      } else if (log.name === "Withdrawn") {
        extraWithdrawnTotal += log.args.amount ?? 0n;
      }
    }
    const freeIds = rows.filter((r) => r.lane === "v5" && r.id >= extraSinceRunId).map((r) => r.id);
    if (freeIds.length) {
      const paidRows = await multicall(p, extraIface, "paidExtra", freeIds, 40, extraAddr);
      extraPaidTotal = 0n;
      extraPaidCount = 0;
      freeIds.forEach((id, j) => {
        const v = paidRows[j] ? paidRows[j][0] || 0n : 0n;
        if (v <= 0n) return;
        const row = byKey.get(`v5-${id}`);
        if (row) row.extraPaid = v;
        extraPaidTotal += v;
        extraPaidCount += 1;
      });
    }
  } catch (e) {
    console.error("extra fail", e?.message || e);
  }
}
{
  const extraIn = extraPool + extraPaidTotal + extraWithdrawnTotal;
  if (extraFundedTotal < extraIn) extraFundedTotal = extraIn;
}

let xClaimCount = 0;
let tgClaimCount = 0;
const socialByAddr = {};
// Carry forward prior social flags so we do not re-multicall thousands of wallets every 10 minutes.
for (const row of prevSnap.social || []) {
  if (!row?.addr) continue;
  try {
    const player = getAddress(row.addr);
    socialByAddr[player] = {
      addr: player,
      tag: row.tag || short(player),
      x: Boolean(row.x),
      tg: Boolean(row.tg),
      xTx: row.xTx || "",
      tgTx: row.tgTx || "",
      xBlock: row.xBlock || 0,
      tgBlock: row.tgBlock || 0,
    };
  } catch {}
}
const socialAddr = cfg.social?.address;
if (socialAddr && cfg.social?.abi) {
  try {
    const social = new Contract(socialAddr, cfg.social.abi, p);
    const socialIface = social.interface;
    const code = await withTimeout(p.getCode(socialAddr), 4000);
    if (code && code !== "0x") {
      console.error("fetching social logs", socialAddr);
      const socialLogs = await collectLogs(
        socialAddr,
        socialIface,
        ["XBonus", "TgBonus"],
        latest,
        Number(process.env.LOG_CHUNKS_SOCIAL || 12),
      );
      for (const log of socialLogs) {
        const player = getAddress(log.args.player);
        if (!socialByAddr[player]) socialByAddr[player] = { addr: player, tag: short(player), x: false, tg: false };
        if (log.name === "XBonus") {
          socialByAddr[player].x = true;
          socialByAddr[player].xTx = log.transactionHash;
          socialByAddr[player].xBlock = log.blockNumber;
        } else if (log.name === "TgBonus") {
          socialByAddr[player].tg = true;
          socialByAddr[player].tgTx = log.transactionHash;
          socialByAddr[player].tgBlock = log.blockNumber;
        }
      }
    } else {
      console.error("social not deployed", socialAddr);
    }
  } catch (e) {
    console.error("social fail", e?.message || e);
  }
}
for (const row of Object.values(socialByAddr)) {
  if (row.x) xClaimCount += 1;
  if (row.tg) tgClaimCount += 1;
}
for (const row of rows) {
  const s = socialByAddr[row.player];
  row.xClaimed = Boolean(s?.x);
  row.tgClaimed = Boolean(s?.tg);
}

if (paidAddr) {
  try {
    const prev = readJsonFile(join(root, "data/snapshot.json")) || {};
    for (const b of prev.burns || []) {
      const hash = b.hash || "";
      const key = hash || `${b.blockNumber || 0}-${b.player || ""}-${b.amount || ""}`;
      if (!key || burnsByHash.has(key)) continue;
      burnsByHash.set(key, {
        player: b.player,
        tag: b.tag || short(b.player),
        amount: BigInt(b.amount || 0),
        hash,
        runId: b.runId ?? null,
        blockNumber: Number(b.blockNumber || 0),
        lane: b.lane || "v5",
      });
    }
  } catch (_) {}
}

const burns = [...burnsByHash.values()]
  .sort((a, b) => (b.blockNumber || 0) - (a.blockNumber || 0) || (b.runId || 0) - (a.runId || 0))
  .slice(0, 5000)
  .map((b) => ({
    player: b.player,
    tag: b.tag,
    amount: weiStr(b.amount),
    hash: b.hash || "",
    runId: b.runId ?? null,
    blockNumber: b.blockNumber || 0,
  }));

const social = Object.values(socialByAddr)
  .sort((a, b) => Number(b.x) + Number(b.tg) - (Number(a.x) + Number(a.tg)) || a.addr.localeCompare(b.addr))
  .slice(0, 5000)
  .map((r) => ({
    addr: r.addr,
    tag: r.tag,
    x: Boolean(r.x),
    tg: Boolean(r.tg),
    xTx: r.xTx || "",
    tgTx: r.tgTx || "",
    xBlock: r.xBlock || 0,
    tgBlock: r.tgBlock || 0,
  }));

const v5Runs = rows.filter((r) => r.lane === "v5").length;
const v6Runs = rows.filter((r) => r.lane === "v6").length;

const snapshot = {
  at: new Date().toISOString(),
  block: latest,
  freeAddress: freeAddr,
  paidAddress: paidAddr || null,
  nextRunId,
  v5NextRunId: nextFree || freePack.next,
  v6NextRunId: paidPack.next || 0,
  v5Runs,
  v6Runs,
  v5RunScanBefore: paidAddr ? v5RunScanBefore : 0,
  weekPool: weiStr(weekPool),
  invitePool: weiStr(invitePool),
  freePool: weiStr(freePool),
  burnedTotal: weiStr(burnedTotal),
  strandedBurn: weiStr(strandedBurn),
  extraPool: weiStr(extraPool),
  extraPaused,
  extraSinceRunId,
  extraPaidTotal: weiStr(extraPaidTotal),
  extraPaidCount,
  extraFundedTotal: weiStr(extraFundedTotal),
  extraWithdrawnTotal: weiStr(extraWithdrawnTotal),
  xClaimCount,
  tgClaimCount,
  totalRuns: rows.length,
  uniqueWallets: addrs.length,
  freeCount: rows.filter((r) => r.free === true).length,
  paidCount: rows.filter((r) => r.free === false).length,
  unknownPay: rows.filter((r) => r.free == null).length,
  burnScanBefore,
  // Daily board: every known wallet (0 shards still listed). Invite board: only wallets with invitePts.
  week: toRows(week, addrs),
  invite: toRows(invite),
  burns,
  social,
  runs: rows
    .sort((a, b) => b.startedAt - a.startedAt || b.id - a.id)
    .map((r) => ({
      id: r.id,
      lane: r.lane || "v5",
      player: r.player,
      paid: weiStr(r.paid),
      ticketLim: r.ticketLim,
      tierId: r.tierId,
      tierName: r.tierName,
      startedAt: r.startedAt,
      settled: r.settled,
      free: r.free,
      collected: weiStr(r.collected),
      leftover: weiStr(r.leftover),
      burned: weiStr(r.burned),
      score: r.score == null ? null : asNum(r.score),
      payout: weiStr(r.payout),
      rewardBps: r.rewardBps,
      invites: r.invites,
      plays: r.plays,
      weekPts: weiStr(r.weekPts),
      invitePts: weiStr(r.invitePts),
      extraPaid: weiStr(r.extraPaid),
      extraTx: r.extraTx,
      xClaimed: Boolean(r.xClaimed),
      tgClaimed: Boolean(r.tgClaimed),
      referrer: r.referrer,
      tx: r.tx,
    })),
};

const outDir = join(root, "data");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "snapshot.json");
writeFileSync(outFile, `${JSON.stringify(snapshot)}\n`);
console.error(
  "wrote",
  outFile,
  "runs",
  snapshot.totalRuns,
  "week",
  snapshot.week.length,
  "invite",
  snapshot.invite.length,
  "burns",
  snapshot.burns.length,
  "x",
  xClaimCount,
  "tg",
  tgClaimCount,
);
