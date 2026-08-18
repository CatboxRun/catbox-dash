/**
 * Deploy CatboxFloor via CREATE2, fund 500 LIM, mark today's V5+V6 players.
 *
 *   EXECUTE=1 PRIVATE_KEY=0x... node scripts/deploy-floor.mjs
 *   FUND_LIM=500 (default)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, JsonRpcProvider, Wallet, MaxUint256, formatEther, formatUnits, parseUnits } from "ethers";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "config.js"), "utf8");
const cfg = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const floorCfg = cfg.floor;
if (!floorCfg?.address || !floorCfg?.bytecode) {
  console.error("NO_FLOOR — run node contracts/compile-floor.mjs");
  process.exit(1);
}
const execute = process.env.EXECUTE === "1";
const fundLim = parseUnits(String(process.env.FUND_LIM || "500"), 18);
const rpc = process.env.BSC_RPC || cfg.rpc || "https://bsc-dataseed.binance.org";
const p = new JsonRpcProvider(rpc, cfg.chainId, { staticNetwork: true, batchMaxCount: 1 });
const fmt = (v) => Number(formatUnits(v || 0n, 18)).toFixed(4);
const BJ = 8 * 3600;
const DAY = 86400;

const runAbi = [
  "function nextRunId() view returns (uint256)",
  "function runs(uint256) view returns (address player, uint256 paid, uint64 startedAt, bool settled)",
];
const v6RunAbi = [
  "function nextRunId() view returns (uint256)",
  "function runs(uint256) view returns (address player, uint256 paid, uint64 startedAt, bool settled, bool free)",
];

async function uniqueToday(game, paidLane) {
  const now = Math.floor(Date.now() / 1000);
  const todayStart = Math.floor((now + BJ) / DAY) * DAY - BJ;
  const n = Number(await game.nextRunId());
  const seen = new Set();
  const from = Math.max(1, n - 800);
  for (let id = n - 1; id >= from; id--) {
    const r = await game.runs(id).catch(() => null);
    if (!r) continue;
    const started = Number(r.startedAt ?? r[2] ?? 0);
    if (started && started < todayStart) break;
    const settled = r.settled ?? r[3];
    const player = r.player || r[0];
    if (settled && player && player !== "0x0000000000000000000000000000000000000000") {
      seen.add(String(player).toLowerCase());
    }
    if (id % 40 === 0) console.log("scan", paidLane ? "v6" : "v5", id);
  }
  return [...seen];
}

const code = await p.getCode(floorCfg.address);
const ownerLim = await new Contract(cfg.lim, ["function balanceOf(address) view returns (uint256)"], p).balanceOf(cfg.owner);
const ownerBnb = await p.getBalance(cfg.owner);
console.log(JSON.stringify({
  execute,
  floor: floorCfg.address,
  deployed: Boolean(code && code !== "0x"),
  fundLim: fmt(fundLim),
  ownerLim: fmt(ownerLim),
  ownerBnb: formatEther(ownerBnb),
}, null, 2));

if (!execute) {
  console.log("dry-run. EXECUTE=1 to deploy + fund + mark.");
  process.exit(0);
}

const key = process.env.PRIVATE_KEY || process.env.BSC_PRIVATE_KEY;
if (!key) {
  console.error("NO_KEY");
  process.exit(2);
}
const w = new Wallet(key, p);
if (w.address.toLowerCase() !== String(cfg.owner).toLowerCase()) {
  console.error("not owner");
  process.exit(1);
}

if (!code || code === "0x") {
  const data = floorCfg.salt + floorCfg.bytecode.slice(2);
  const tx = await w.sendTransaction({ to: cfg.factory, data });
  console.log("deploy", tx.hash);
  await tx.wait();
  const after = await p.getCode(floorCfg.address);
  if (!after || after === "0x") {
    console.error("deploy failed");
    process.exit(1);
  }
} else {
  console.log("already deployed");
}

const lim = new Contract(cfg.lim, [
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
], w);
const floor = new Contract(floorCfg.address, floorCfg.abi, w);
const allow = await lim.allowance(cfg.owner, floorCfg.address);
if (allow < fundLim) {
  const txA = await lim.approve(floorCfg.address, MaxUint256);
  console.log("approve", txA.hash);
  await txA.wait();
}
await floor.fund.staticCall(fundLim);
const txF = await floor.fund(fundLim);
console.log("fund", txF.hash);
await txF.wait();

const v5 = new Contract(cfg.freeAddress || cfg.address, runAbi, p);
const v6 = new Contract(cfg.v6.address, v6RunAbi, p);
const [a5, a6] = await Promise.all([uniqueToday(v5, false), uniqueToday(v6, true)]);
const addrs = [...new Set([...a5, ...a6])];
console.log("today players", addrs.length, "v5", a5.length, "v6", a6.length);
const batch = 40;
for (let i = 0; i < addrs.length; i += batch) {
  const chunk = addrs.slice(i, i + batch);
  const txM = await floor.mark(chunk);
  console.log("mark", chunk.length, txM.hash);
  await txM.wait();
}

const [livePool, liveCount, today] = await Promise.all([
  floor.livePool(),
  floor.liveCount(),
  floor.currentDay(),
]);
console.log(JSON.stringify({
  livePool: fmt(livePool),
  liveCount: liveCount.toString(),
  currentDay: today.toString(),
}, null, 2));
