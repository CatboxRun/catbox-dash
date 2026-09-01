/**
 * Deploy CatboxDrop via CREATE2 and set merkle root.
 * Does not fund 100k LIM unless FUND_LIM is set.
 *
 *   node scripts/deploy-drop.mjs
 *   EXECUTE=1 node scripts/deploy-drop.mjs
 *   EXECUTE=1 FUND_LIM=100000 node scripts/deploy-drop.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, JsonRpcProvider, Wallet, MaxUint256, formatEther, formatUnits, parseUnits } from "ethers";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const envPath of [join(root, ".env"), join(root, "..", ".env")]) {
  try {
    const txt = readFileSync(envPath, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m || process.env[m[1]]) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch (_) {}
}

const raw = readFileSync(join(root, "config.js"), "utf8");
const cfg = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const dropCfg = cfg.drop;
if (!dropCfg?.address || !dropCfg?.bytecode) {
  console.error("NO_DROP — run node contracts/compile-drop.mjs");
  process.exit(1);
}
const list = JSON.parse(readFileSync(join(root, "airdrop-list.json"), "utf8"));
const execute = process.env.EXECUTE === "1";
const fundLim = process.env.FUND_LIM ? parseUnits(String(process.env.FUND_LIM), 18) : 0n;
const rpc = process.env.BSC_RPC || cfg.rpc || "https://bsc-dataseed.binance.org";
const p = new JsonRpcProvider(rpc, cfg.chainId, { staticNetwork: true, batchMaxCount: 1 });
const fmt = (v) => Number(formatUnits(v || 0n, 18)).toFixed(4);

const code = await p.getCode(dropCfg.address);
const ownerLim = await new Contract(cfg.lim, ["function balanceOf(address) view returns (uint256)"], p).balanceOf(cfg.owner);
const ownerBnb = await p.getBalance(cfg.owner);
console.log(JSON.stringify({
  execute,
  drop: dropCfg.address,
  deployed: Boolean(code && code !== "0x"),
  root: list.root,
  count: list.count,
  fundLim: fmt(fundLim),
  ownerLim: fmt(ownerLim),
  ownerBnb: formatEther(ownerBnb),
}, null, 2));

if (!execute) {
  console.log("dry-run. EXECUTE=1 to deploy + setRoot. FUND_LIM=100000 to also fund.");
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
  const data = dropCfg.salt + dropCfg.bytecode.slice(2);
  const tx = await w.sendTransaction({ to: cfg.factory, data });
  console.log("deploy", tx.hash);
  await tx.wait();
  const after = await p.getCode(dropCfg.address);
  if (!after || after === "0x") {
    console.error("deploy failed");
    process.exit(1);
  }
} else {
  console.log("already deployed");
}

const drop = new Contract(dropCfg.address, dropCfg.abi, w);
const onRoot = await drop.root();
if (String(onRoot).toLowerCase() !== String(list.root).toLowerCase()) {
  const txR = await drop.setRoot(list.root);
  console.log("setRoot", txR.hash);
  await txR.wait();
} else {
  console.log("root already set");
}

if (fundLim > 0n) {
  const lim = new Contract(cfg.lim, [
    "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
  ], w);
  const allow = await lim.allowance(cfg.owner, dropCfg.address);
  if (allow < fundLim) {
    const txA = await lim.approve(dropCfg.address, MaxUint256);
    console.log("approve", txA.hash);
    await txA.wait();
  }
  const txF = await drop.fund(fundLim);
  console.log("fund", txF.hash);
  await txF.wait();
}

const [pool, rootNow] = await Promise.all([drop.pool(), drop.root()]);
console.log(JSON.stringify({
  drop: dropCfg.address,
  root: rootNow,
  pool: fmt(pool),
}, null, 2));
