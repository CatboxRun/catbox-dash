/**
 * Deploy CatboxDash V6 bytecode that includes fundBoardsFromBalance.
 * NOTE: CREATE2 address changes when bytecode changes — this is a NEW address.
 * Reserve LIM sent to the old V6 address stays there unless migrated manually.
 *
 * Usage:
 *   PRIVATE_KEY=0x... node scripts/deploy-v6-reserve-fn.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcProvider, Wallet, formatUnits } from "ethers";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "config.js"), "utf8");
const cfg = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));

execSync("node contracts/compile.mjs", { cwd: root, stdio: "inherit" });
const v6 = JSON.parse(readFileSync(join(root, "contracts/v6.json"), "utf8"));

const rpc = process.env.BSC_RPC || cfg.rpc;
const provider = new JsonRpcProvider(rpc, cfg.chainId, { staticNetwork: true });
const key = process.env.PRIVATE_KEY || process.env.BSC_PRIVATE_KEY;
if (!key) {
  console.error("NO_KEY");
  process.exit(2);
}
const wallet = new Wallet(key, provider);
if (wallet.address.toLowerCase() !== String(cfg.owner).toLowerCase()) {
  console.error("not owner");
  process.exit(1);
}

const live = cfg.v6.address.toLowerCase();
const next = v6.address.toLowerCase();
console.log("live V6", cfg.v6.address);
console.log("compiled V6", v6.address);
if (live === next) {
  console.log("Same CREATE2 address — safe to deploy upgrade in place (no prior code).");
} else {
  console.log("WARNING: new bytecode => new address. Reserve on old V6 is NOT auto-migrated.");
}

const code = await provider.getCode(v6.address);
if (code && code !== "0x") {
  console.log("target already has code — skip deploy");
} else {
  const data = v6.salt + v6.bytecode.slice(2);
  const tx = await wallet.sendTransaction({ to: cfg.factory, data });
  console.log("deploy tx", tx.hash);
  await tx.wait();
  const after = await provider.getCode(v6.address);
  if (!after || after === "0x") {
    console.error("deploy failed");
    process.exit(1);
  }
  console.log("deployed", v6.address);
}

console.log("\nUpdate config.js v6.address / bytecode / abi from contracts/v6.json, then run:");
console.log("  EXECUTE=1 PRIVATE_KEY=0x... node scripts/allocate-board-reserve.mjs");
