/**
 * Split paid V6 overtime: 50% floor / 50% burn via CatboxOvertimeSink.
 * Owner-only. Does not touch V6 freePool. Does not ask players to sign.
 *
 *   node scripts/split-overtime.mjs
 *   EXECUTE=1 PRIVATE_KEY=0x... node scripts/split-overtime.mjs
 *   FROM_BLOCK=117500000 node scripts/split-overtime.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, Interface, JsonRpcProvider, Wallet, formatUnits, id, formatEther } from "ethers";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
try {
  const txt = readFileSync(join(root, ".env"), "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
} catch (_) {}

const raw = readFileSync(join(root, "config.js"), "utf8");
const cfg = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const sinkCfg = cfg.sink;
if (!sinkCfg?.address) {
  console.error("NO_SINK");
  process.exit(1);
}
const execute = process.env.EXECUTE === "1";
const V6 = cfg.v6.address;
const CALL_RPC = process.env.BSC_RPC || cfg.rpc || "https://bsc-dataseed.binance.org";
const LOG_RPCS = [
  process.env.LOG_RPC,
  "https://bsc.rpc.blxrbdn.com",
  "https://1rpc.io/bnb",
  "https://bsc-rpc.publicnode.com",
  "https://bsc.publicnode.com",
  CALL_RPC,
].filter(Boolean);
const fmt = (v) => Number(formatUnits(v || 0n, 18));

function withT(pr, ms = 15000) {
  let t;
  return Promise.race([
    pr.finally(() => clearTimeout(t)),
    new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error("T")), ms);
    }),
  ]);
}

function extraCap(paid) {
  if (paid <= 0n) return 0n;
  if (paid <= 10n ** 18n) return paid;
  return paid / 2n;
}

const callP = new JsonRpcProvider(CALL_RPC, cfg.chainId, { staticNetwork: true, batchMaxCount: 1 });
const logPs = LOG_RPCS.map(
  (url) => new JsonRpcProvider(url, cfg.chainId, { staticNetwork: true, batchMaxCount: 1 }),
);

async function getLogsRange(from, to) {
  let lastErr;
  for (const lp of logPs) {
    try {
      return await withT(lp.getLogs({ address: V6, topics: [TOPIC_SET], fromBlock: from, toBlock: to }), 12000);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("logs");
}
const v6 = new Contract(
  V6,
  [
    "function runs(uint256) view returns (address player,uint256 paid,uint64 startedAt,bool settled,bool free)",
    "function freePool() view returns (uint256)",
  ],
  callP,
);
const sink = new Contract(
  sinkCfg.address,
  [
    "function pool() view returns (uint256)",
    "function splitOf(uint256) view returns (uint256)",
    "function splitBatch(uint256[] runIds,uint256[] collected)",
  ],
  callP,
);

const latest = await withT(callP.getBlockNumber());
const now = Math.floor(Date.now() / 1000);
const sgt = 8 * 3600;
const dayStart = now + sgt - ((now + sgt) % 86400) - sgt;
const approxFrom = process.env.FROM_BLOCK
  ? Number(process.env.FROM_BLOCK)
  : latest - Math.ceil((now - dayStart) / 3) - 200;
const fromBlock = Math.max(1, approxFrom);
const TOPIC_SET = id("RunSettled(uint256,address,uint256,uint256,uint256,uint256,uint256)");
const setI = new Interface([
  "event RunSettled(uint256 indexed runId,address indexed player,uint256 collected,uint256 leftover,uint256 score,uint256 burned,uint256 payout)",
]);

const events = [];
const chunk = 400;
for (let to = latest; to >= fromBlock; to -= chunk) {
  const from = Math.max(fromBlock, to - chunk + 1);
  try {
    const logs = await getLogsRange(from, to);
    for (const l of logs) events.push(setI.parseLog(l));
  } catch (e) {
    console.log("log fail", from, to, e.shortMessage || e.message);
  }
}

const pending = [];
for (const ev of events) {
  const runId = ev.args.runId;
  const collected = ev.args.collected;
  let already = 0n;
  let run;
  try {
    already = await sink.splitOf(runId);
    run = await v6.runs(runId);
  } catch (_) {
    continue;
  }
  if (already > 0n) continue;
  const paid = run.paid ?? run[1];
  const settled = Boolean(run.settled ?? run[3]);
  const free = Boolean(run.free ?? run[4]);
  if (!settled || free) continue;
  let extra = collected > paid ? collected - paid : 0n;
  const cap = extraCap(paid);
  if (extra > cap) extra = cap;
  if (extra <= 0n) continue;
  pending.push({
    runId: Number(runId),
    collected,
    extra,
    toFloor: extra / 2n,
    toBurn: extra - extra / 2n,
    player: run.player || run[0],
  });
}

pending.sort((a, b) => a.runId - b.runId);
const need = pending.reduce((s, r) => s + r.extra, 0n);
const [pool, free6, ownerBnb] = await Promise.all([
  sink.pool().catch(() => 0n),
  v6.freePool().catch(() => 0n),
  callP.getBalance(cfg.owner),
]);

console.log(
  JSON.stringify(
    {
      execute,
      fromBlock,
      latest,
      events: events.length,
      pending: pending.length,
      need: fmt(need),
      sinkPool: fmt(pool),
      v6FreePool: fmt(free6),
      ownerBnb: formatEther(ownerBnb),
      sample: pending.slice(0, 8).map((r) => ({
        runId: r.runId,
        extra: fmt(r.extra),
        floor: fmt(r.toFloor),
        burn: fmt(r.toBurn),
      })),
    },
    null,
    2,
  ),
);

if (!execute) {
  console.log("dry-run. EXECUTE=1 to splitBatch.");
  process.exit(0);
}
if (!pending.length) {
  console.log("nothing to split");
  process.exit(0);
}
let work = pending;
if (pool < need) {
  work = [];
  let used = 0n;
  for (const row of pending) {
    if (used + row.extra > pool) break;
    work.push(row);
    used += row.extra;
  }
  console.log("sink pool covers", work.length, "/", pending.length, "need", fmt(need));
  if (!work.length) {
    console.error("sink pool too low", fmt(pool), "< first extra", fmt(pending[0].extra));
    process.exit(1);
  }
}

const key = process.env.PRIVATE_KEY || process.env.BSC_PRIVATE_KEY;
if (!key) {
  console.error("NO_KEY");
  process.exit(2);
}
const w = new Wallet(key, callP);
if (w.address.toLowerCase() !== String(cfg.owner).toLowerCase()) {
  console.error("not owner");
  process.exit(1);
}
const sinkW = sink.connect(w);
const batch = 20;
for (let i = 0; i < work.length; i += batch) {
  const chunkRows = work.slice(i, i + batch);
  const ids = chunkRows.map((r) => BigInt(r.runId));
  const cols = chunkRows.map((r) => r.collected);
  await sinkW.splitBatch.staticCall(ids, cols);
  const tx = await sinkW.splitBatch(ids, cols);
  console.log("splitBatch", chunkRows.length, tx.hash);
  await tx.wait();
}
console.log("sink pool after", fmt(await sink.pool()));
