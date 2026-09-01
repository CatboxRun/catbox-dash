/**
 * Direct LIM.transfer into the drop contract (pool() is balanceOf).
 * Use when drop.fund() reverts "pull" (transferFrom blocked).
 *
 *   node scripts/fund-drop-direct.mjs
 *   EXECUTE=1 FUND_LIM=50 node scripts/fund-drop-direct.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, JsonRpcProvider, Wallet, formatEther, formatUnits, parseUnits } from "ethers";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const envPath of [join(rootDir, ".env"), join(rootDir, "..", ".env")]) {
  try {
    const txt = readFileSync(envPath, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m || process.env[m[1]]) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch (_) {}
}

const raw = readFileSync(join(rootDir, "config.js"), "utf8");
const cfg = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const dropAddr = cfg.drop.address;
const list = JSON.parse(readFileSync(join(rootDir, "airdrop-list.json"), "utf8"));
const execute = process.env.EXECUTE === "1";
const want = parseUnits(String(process.env.FUND_LIM || "50"), 18);
const rpc = process.env.BSC_RPC || cfg.rpc || "https://bsc-dataseed.binance.org";
const p = new JsonRpcProvider(rpc, cfg.chainId, { staticNetwork: true, batchMaxCount: 1 });
const fmt = (v) => Number(formatUnits(v || 0n, 18)).toFixed(4);

const lim = new Contract(cfg.lim, [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function transferFrom(address,address,uint256) returns (bool)",
], p);
const drop = new Contract(dropAddr, cfg.drop.abi, p);

const [ownerLim, ownerBnb, pool, onRoot, allow] = await Promise.all([
  lim.balanceOf(cfg.owner),
  p.getBalance(cfg.owner),
  drop.pool(),
  drop.root(),
  lim.allowance(cfg.owner, dropAddr),
]);

console.log(JSON.stringify({
  execute,
  drop: dropAddr,
  fundLim: fmt(want),
  ownerLim: fmt(ownerLim),
  ownerBnb: formatEther(ownerBnb),
  pool: fmt(pool),
  allowance: fmt(allow),
  onRoot,
  listRoot: list.root,
  rootMatch: String(onRoot).toLowerCase() === String(list.root).toLowerCase(),
}, null, 2));

if (!execute) {
  console.log("dry-run. EXECUTE=1 to transfer LIM to drop.");
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
if (ownerLim < want) {
  console.error("NO_LIM");
  process.exit(1);
}

const limW = lim.connect(w);
const tx = await limW.transfer(dropAddr, want);
console.log("transfer", tx.hash);
await tx.wait();

const [poolAfter, ownerAfter] = await Promise.all([
  drop.pool(),
  lim.balanceOf(cfg.owner),
]);
console.log(JSON.stringify({
  pool: fmt(poolAfter),
  ownerLim: fmt(ownerAfter),
  tx: tx.hash,
}, null, 2));
