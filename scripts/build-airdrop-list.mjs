/**
 * Build airdrop-list.json (address + wei) and merkle root from _airdrop-resolve.json.
 * Run after compile so ethers is available. Does not deploy.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getAddress, keccak256, concat, AbiCoder } from "ethers";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const resolvePath = join(rootDir, "data", "_airdrop-resolve.json");
const src = JSON.parse(readFileSync(resolvePath, "utf8"));

function leaf(addr, amount) {
  const inner = keccak256(AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [addr, BigInt(amount)]));
  return keccak256(inner);
}
function hashPair(a, b) {
  const aa = String(a).toLowerCase();
  const bb = String(b).toLowerCase();
  return aa < bb ? keccak256(concat([a, b])) : keccak256(concat([b, a]));
}
function build(leaves) {
  const layers = [leaves.slice()];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      if (i + 1 === prev.length) next.push(prev[i]);
      else next.push(hashPair(prev[i], prev[i + 1]));
    }
    layers.push(next);
  }
  return { layers, root: layers[layers.length - 1][0] };
}
function proofOf(layers, index) {
  const out = [];
  for (let L = 0; L < layers.length - 1; L++) {
    const layer = layers[L];
    const sib = index % 2 === 0 ? index + 1 : index - 1;
    if (sib < layer.length) out.push(layer[sib]);
    index = Math.floor(index / 2);
  }
  return out;
}
function verify(proofs, rootHash, leafHash) {
  let h = leafHash;
  for (let i = 0; i < proofs.length; i++) h = hashPair(h, proofs[i]);
  return String(h).toLowerCase() === String(rootHash).toLowerCase();
}

const rows = src.rows.map((r) => [getAddress(r.a), String(r.n)]);
const leaves = rows.map(([a, n]) => leaf(a, n));
const tree = build(leaves);

const checks = [0, 1, rows.length - 1, Math.floor(rows.length / 2), 40, 100, 1000, 2000, 3000].filter((i) => i < rows.length);
for (const i of checks) {
  const p = proofOf(tree.layers, i);
  if (!verify(p, tree.root, leaves[i])) {
    console.error("proof fail", i, rows[i][0]);
    process.exit(1);
  }
}
let sum = 0n;
for (const [, n] of rows) sum += BigInt(n);

const out = {
  root: tree.root,
  count: rows.length,
  totalWei: sum.toString(),
  shareWei: src.shareWei,
  dustWei: src.dustWei,
  rows,
};
writeFileSync(join(rootDir, "airdrop-list.json"), JSON.stringify(out));
console.log(JSON.stringify({
  root: tree.root,
  count: rows.length,
  recipients: src.recipients,
  topInPlayed: src.top.filter((t) => t.inPlayed).length,
  topOnlyBonus: src.top.filter((t) => !t.inPlayed).map((t) => t.rank),
  sample: rows.slice(0, 3),
}, null, 2));
