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

async function multicall(p, iface, fn, items, batch = 40, target = cfg.address) {
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

function toRows(map) {
  return Object.entries(map)
    .map(([addr, pts]) => ({
      tag: short(addr),
      addr,
      pts: asNum(pts),
    }))
    .filter((r) => r.pts > 0)
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 1000);
}

const { p } = await pickProvider();
const game = new Contract(cfg.address, cfg.abi, p);
const iface = game.interface;
const latest = Number(await withTimeout(p.getBlockNumber(), 4000));
const nextRunId = Number(await withTimeout(game.nextRunId(), 8000));
console.error("block", latest, "nextRunId", nextRunId);

let prices = [
  10n ** 18n,
  3n * 10n ** 18n,
  6n * 10n ** 18n,
  10n * 10n ** 18n,
];
try {
  prices = await Promise.all([0, 1, 2, 3].map((i) => game.ticketPrice(i)));
} catch {}

const ids = [];
for (let i = 1; i < nextRunId; i++) ids.push(i);
const runRows = await multicall(p, iface, "runs", ids);
const rows = [];
const seen = new Set();
for (let i = 0; i < ids.length; i++) {
  const decoded = runRows[i];
  if (!decoded) continue;
  const playerRaw = decoded.player || decoded[0];
  if (!playerRaw || playerRaw === ZERO) continue;
  const player = getAddress(playerRaw);
  const paid = decoded.paid ?? decoded[1] ?? 0n;
  const startedAt = Number(decoded.startedAt ?? decoded[2] ?? 0);
  const settled = Boolean(decoded.settled ?? decoded[3]);
  const tier = tierOfPaid(paid, prices);
  seen.add(player);
  rows.push({
    id: ids[i],
    player,
    paid,
    ticketLim: tier.lim,
    tierId: tier.id,
    tierName: tier.name,
    startedAt,
    settled,
    free: null,
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

const addrs = [...seen];
console.error("runs", rows.length, "wallets", addrs.length);
const [weekRows, invRows, refRows, usedRows] = await Promise.all([
  multicall(p, iface, "weekPts", addrs),
  multicall(p, iface, "invitePts", addrs),
  multicall(p, iface, "refOf", addrs),
  multicall(p, iface, "freeUsed", addrs),
]);
const week = {};
const invite = {};
const refs = {};
const freeUsed = {};
addrs.forEach((a, j) => {
  const w = weekRows[j] ? weekRows[j][0] || 0n : 0n;
  const inv = invRows[j] ? invRows[j][0] || 0n : 0n;
  if (w > 0n) week[a] = w;
  if (inv > 0n) invite[a] = inv;
  const refRaw = refRows[j] ? refRows[j][0] : ZERO;
  refs[a] = refRaw && refRaw !== ZERO ? getAddress(refRaw) : ZERO;
  freeUsed[a] = Number(usedRows[j] ? usedRows[j][0] || 0n : 0n);
});
const missingRefs = [...new Set(Object.values(refs).filter((a) => a !== ZERO && invite[a] == null))];
if (missingRefs.length) {
  const extra = await multicall(p, iface, "invitePts", missingRefs);
  missingRefs.forEach((a, j) => {
    const pts = extra[j] ? extra[j][0] || 0n : 0n;
    if (pts > 0n) invite[a] = pts;
  });
}

console.error("fetching logs");
const logs = await collectLogs(cfg.address, iface, ["RunStarted", "RunSettled", "FreeEnter", "Burned"], latest);
const byId = new Map(rows.map((r) => [r.id, r]));
const burnsByHash = new Map();
for (const log of logs) {
  if (log.name === "RunStarted") {
    const row = byId.get(Number(log.args.runId));
    if (!row) continue;
    const ref = log.args.referrer;
    if (ref && ref !== ZERO) row.referrer = getAddress(ref);
    if (log.args.paid != null) row.paid = log.args.paid;
  } else if (log.name === "RunSettled") {
    const row = byId.get(Number(log.args.runId));
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
      const key = log.transactionHash || `run-${log.args.runId}`;
      burnsByHash.set(key, {
        player,
        tag: short(player),
        amount: amt,
        hash: log.transactionHash || "",
        runId: Number(log.args.runId),
        blockNumber: log.blockNumber,
      });
    }
  } else if (log.name === "FreeEnter") {
    const row = byId.get(Number(log.args.runId));
    if (row) row.free = true;
  } else if (log.name === "Burned") {
    const amt = log.args.amount ?? 0n;
    if (amt <= 0n) continue;
    const player = getAddress(log.args.player);
    const key = log.transactionHash || `${log.blockNumber}-${player}`;
    const prev = burnsByHash.get(key) || {};
    burnsByHash.set(key, {
      ...prev,
      player,
      tag: short(player),
      amount: amt,
      hash: log.transactionHash || prev.hash || "",
      blockNumber: log.blockNumber || prev.blockNumber || 0,
      runId: prev.runId,
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
  list.sort((a, b) => a.id - b.id);
  const oneLim = list.filter((r) => r.paid <= 10n ** 18n);
  let left = freeUsed[list[0].player] || 0;
  for (const r of list) {
    if (r.paid > 10n ** 18n) {
      r.free = false;
      continue;
    }
  }
  for (const r of oneLim) {
    if (r.free === true) {
      if (left > 0) left -= 1;
      continue;
    }
    if (left > 0) {
      r.free = true;
      left -= 1;
    } else {
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
try {
  [weekPool, invitePool, freePool, burnedTotal] = await Promise.all([
    game.weekPool(),
    game.invitePool(),
    game.freePool(),
    game.burnedTotal(),
  ]);
} catch {}

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
    const extraLogs = await collectLogs(extraAddr, extraIface, ["ExtraPaid", "Funded", "Withdrawn"], latest, 40);
    for (const log of extraLogs) {
      if (log.name === "ExtraPaid") {
        const id = Number(log.args.runId);
        const amt = log.args.amount ?? 0n;
        const row = byId.get(id);
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
    const sinceIds = rows.map((r) => r.id).filter((id) => id >= extraSinceRunId);
    if (sinceIds.length) {
      const paidRows = await multicall(p, extraIface, "paidExtra", sinceIds, 40, extraAddr);
      extraPaidTotal = 0n;
      extraPaidCount = 0;
      sinceIds.forEach((id, j) => {
        const v = paidRows[j] ? paidRows[j][0] || 0n : 0n;
        if (v <= 0n) return;
        const row = byId.get(id);
        if (row) row.extraPaid = v;
        extraPaidTotal += v;
        extraPaidCount += 1;
      });
    }
  } catch (e) {
    console.error("extra fail", e?.message || e);
  }
}

const burns = [...burnsByHash.values()]
  .sort((a, b) => (b.blockNumber || 0) - (a.blockNumber || 0) || (b.runId || 0) - (a.runId || 0))
  .slice(0, 1000)
  .map((b) => ({
    player: b.player,
    tag: b.tag,
    amount: weiStr(b.amount),
    hash: b.hash || "",
    runId: b.runId ?? null,
    blockNumber: b.blockNumber || 0,
  }));

const snapshot = {
  at: new Date().toISOString(),
  block: latest,
  nextRunId,
  weekPool: weiStr(weekPool),
  invitePool: weiStr(invitePool),
  freePool: weiStr(freePool),
  burnedTotal: weiStr(burnedTotal),
  extraPool: weiStr(extraPool),
  extraPaused,
  extraSinceRunId,
  extraPaidTotal: weiStr(extraPaidTotal),
  extraPaidCount,
  extraFundedTotal: weiStr(extraFundedTotal),
  extraWithdrawnTotal: weiStr(extraWithdrawnTotal),
  totalRuns: rows.length,
  uniqueWallets: addrs.length,
  freeCount: rows.filter((r) => r.free === true).length,
  paidCount: rows.filter((r) => r.free === false).length,
  unknownPay: rows.filter((r) => r.free == null).length,
  week: toRows(week),
  invite: toRows(invite),
  burns,
  runs: rows
    .sort((a, b) => b.id - a.id)
    .map((r) => ({
      id: r.id,
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
);
