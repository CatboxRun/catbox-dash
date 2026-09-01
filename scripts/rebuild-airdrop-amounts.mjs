/**
 * Recalculate settlement amounts:
 *   top 10  = 100 LIM (total, not bonus-on-share)
 *   11–40   = 50 LIM
 *   rest    = remaining 97,500 LIM split equally
 *   nobody  > 100 LIM
 *   sum     = 100,000 LIM exactly
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getAddress } from "ethers";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const resolvePath = join(rootDir, "data", "_airdrop-resolve.json");
const src = JSON.parse(readFileSync(resolvePath, "utf8"));

const WAD = 10n ** 18n;
const TOTAL = 100000n * WAD;
const CAP = 100n * WAD;
const TOP10 = 100n * WAD;
const MID = 50n * WAD;
const BONUS_POOL = 10n * TOP10 + 30n * MID;
const REMAIN = TOTAL - BONUS_POOL;

const topByAddr = new Map();
for (const t of src.top) {
  const a = getAddress(t.addr);
  if (topByAddr.has(a)) {
    console.error("duplicate top", a);
    process.exit(1);
  }
  topByAddr.set(a, t);
}
if (topByAddr.size !== 40) {
  console.error("top unique", topByAddr.size);
  process.exit(1);
}

const seen = new Set();
const addrs = [];
for (const r of src.rows) {
  const a = getAddress(r.a);
  if (seen.has(a)) continue;
  seen.add(a);
  addrs.push(a);
}
for (const a of topByAddr.keys()) {
  if (!seen.has(a)) {
    seen.add(a);
    addrs.push(a);
  }
}

const shareAddrs = addrs.filter((a) => !topByAddr.has(a));
const shareCount = BigInt(shareAddrs.length);
const shareWei = REMAIN / shareCount;
const dustWei = REMAIN % shareCount;
if (shareWei > CAP) {
  console.error("share exceeds cap", shareWei.toString());
  process.exit(1);
}

const lastShare = shareAddrs[shareAddrs.length - 1];
const rows = addrs.map((a) => {
  const t = topByAddr.get(a);
  let n;
  if (t) n = t.rank <= 10 ? TOP10 : MID;
  else n = a === lastShare ? shareWei + dustWei : shareWei;
  if (n > CAP) {
    console.error("over cap", a, n.toString());
    process.exit(1);
  }
  return { a, n: n.toString() };
});

rows.sort((x, y) => {
  const d = BigInt(y.n) - BigInt(x.n);
  if (d > 0n) return 1;
  if (d < 0n) return -1;
  return x.a.localeCompare(y.a);
});

let sum = 0n;
let max = 0n;
const buckets = { 100: 0, 50: 0, share: 0 };
for (const r of rows) {
  const n = BigInt(r.n);
  sum += n;
  if (n > max) max = n;
  if (n === TOP10) buckets[100]++;
  else if (n === MID) buckets[50]++;
  else buckets.share++;
}
if (sum !== TOTAL) {
  console.error("sum mismatch", sum.toString());
  process.exit(1);
}

src.at = new Date().toISOString();
src.played = src.played;
src.recipients = rows.length;
src.totalWei = TOTAL.toString();
src.bonusWei = BONUS_POOL.toString();
src.remainWei = REMAIN.toString();
src.shareWei = shareWei.toString();
src.dustWei = dustWei.toString();
src.maxWei = CAP.toString();
src.rows = rows;

writeFileSync(resolvePath, JSON.stringify(src, null, 2) + "\n");
console.log(JSON.stringify({
  recipients: rows.length,
  topUnique: topByAddr.size,
  shareCount: Number(shareCount),
  shareWei: shareWei.toString(),
  shareLim: Number(shareWei) / 1e18,
  dustWei: dustWei.toString(),
  maxLim: Number(max) / 1e18,
  sumLim: Number(sum) / 1e18,
  buckets,
  sample: rows.slice(0, 5),
}, null, 2));
