/**
 * Deploy CatboxOvertimeSink via CREATE2, then optionally fund from Extra/owner.
 * Does NOT touch V6 freePool.
 *
 *   node scripts/deploy-sink.mjs
 *   EXECUTE=1 FUND_LIM=200 KEEP_EXTRA_LIM=200 PRIVATE_KEY=0x... node scripts/deploy-sink.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, JsonRpcProvider, Wallet, MaxUint256, formatEther, formatUnits, parseUnits } from "ethers";

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
if (!sinkCfg?.address || !sinkCfg?.bytecode) {
  console.error("NO_SINK — run node contracts/compile-sink.mjs");
  process.exit(1);
}
const execute = process.env.EXECUTE === "1";
const fundLim = parseUnits(String(process.env.FUND_LIM || "200"), 18);
const keepExtra = parseUnits(String(process.env.KEEP_EXTRA_LIM || "200"), 18);
const rpc = process.env.BSC_RPC || cfg.rpc || "https://bsc-dataseed.binance.org";
const p = new JsonRpcProvider(rpc, cfg.chainId, { staticNetwork: true, batchMaxCount: 1 });
const fmt = (v) => Number(formatUnits(v || 0n, 18)).toFixed(4);

const lim = new Contract(
  cfg.lim,
  [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
  ],
  p,
);
const extra = cfg.extra?.address
  ? new Contract(cfg.extra.address, ["function pool() view returns (uint256)", "function withdraw(uint256)"], p)
  : null;
const v6 = new Contract(cfg.v6.address, ["function freePool() view returns (uint256)"], p);

const [code, ownerLim, ownerBnb, extraPool, free6, sinkPool] = await Promise.all([
  p.getCode(sinkCfg.address),
  lim.balanceOf(cfg.owner),
  p.getBalance(cfg.owner),
  extra ? extra.pool() : Promise.resolve(0n),
  v6.freePool(),
  lim.balanceOf(sinkCfg.address),
]);

console.log(
  JSON.stringify(
    {
      execute,
      sink: sinkCfg.address,
      deployed: Boolean(code && code !== "0x"),
      fundLim: fmt(fundLim),
      keepExtra: fmt(keepExtra),
      extraPool: fmt(extraPool),
      ownerLim: fmt(ownerLim),
      ownerBnb: formatEther(ownerBnb),
      sinkPool: fmt(sinkPool),
      v6FreePool: fmt(free6),
    },
    null,
    2,
  ),
);

if (free6 > 0n) {
  console.log("note: V6 freePool still has LIM; do not refill. Website no longer claws overtime.");
}

if (!execute) {
  console.log("dry-run. EXECUTE=1 to deploy + fund.");
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
  const data = sinkCfg.salt + sinkCfg.bytecode.slice(2);
  const tx = await w.sendTransaction({ to: cfg.factory, data });
  console.log("deploy", tx.hash);
  await tx.wait();
  const after = await p.getCode(sinkCfg.address);
  if (!after || after === "0x") {
    console.error("deploy failed");
    process.exit(1);
  }
} else {
  console.log("already deployed");
}

if (fundLim <= 0n) {
  console.log("skip fund");
  process.exit(0);
}

const limW = lim.connect(w);
const sink = new Contract(sinkCfg.address, sinkCfg.abi, w);
let pulled = 0n;
if (extra && extraPool > keepExtra) {
  const fromExtra = extraPool - keepExtra;
  const take = fromExtra < fundLim ? fromExtra : fundLim;
  if (take > 0n) {
    const txW = await extra.connect(w).withdraw(take);
    console.log("extra.withdraw", fmt(take), txW.hash);
    await txW.wait();
    pulled += take;
  }
}
const stillNeed = fundLim - pulled;
if (stillNeed > 0n) {
  const ownerBal = await limW.balanceOf(w.address);
  if (ownerBal < stillNeed) {
    console.error("not enough owner LIM after Extra keep", fmt(ownerBal), "need", fmt(stillNeed));
    process.exit(1);
  }
  pulled += stillNeed;
}
const allow = await limW.allowance(w.address, sinkCfg.address);
if (allow < pulled) {
  const txA = await limW.approve(sinkCfg.address, MaxUint256);
  console.log("approve", txA.hash);
  await txA.wait();
}
await sink.fund.staticCall(pulled);
const txF = await sink.fund(pulled);
console.log("fund", fmt(pulled), txF.hash);
await txF.wait();
console.log("sink pool", fmt(await sink.pool()));
