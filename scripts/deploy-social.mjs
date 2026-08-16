import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JsonRpcProvider, Wallet, formatEther } from "ethers";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "config.js"), "utf8");
const cfg = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const socialCfg = cfg.social;
if (!socialCfg?.address || !socialCfg?.bytecode) {
  console.error("NO_SOCIAL");
  process.exit(1);
}

const rpc = process.env.BSC_RPC || cfg.rpc;
const provider = new JsonRpcProvider(rpc, cfg.chainId);
const code = await provider.getCode(socialCfg.address);
console.log("social", socialCfg.address);
console.log("owner", cfg.owner);
console.log("owner BNB", formatEther(await provider.getBalance(cfg.owner)));
console.log("code", code && code !== "0x" ? `${(code.length - 2) / 2} bytes` : "none");

const key = process.env.PRIVATE_KEY || process.env.BSC_PRIVATE_KEY;
if (!key) {
  console.log("NO_KEY");
  process.exit(2);
}

const wallet = new Wallet(key, provider);
console.log("deployer", wallet.address);
if (wallet.address.toLowerCase() !== String(cfg.owner).toLowerCase()) {
  console.error("key is not owner");
  process.exit(1);
}

if (!code || code === "0x") {
  const data = socialCfg.salt + socialCfg.bytecode.slice(2);
  const tx = await wallet.sendTransaction({ to: cfg.factory, data });
  console.log("deploy tx", tx.hash);
  const rec = await tx.wait();
  console.log("status", rec.status, "block", rec.blockNumber);
  const after = await provider.getCode(socialCfg.address);
  if (!after || after === "0x") {
    console.error("deploy failed: still empty");
    process.exit(1);
  }
  console.log("deployed", socialCfg.address);
} else {
  console.log("already deployed");
}
