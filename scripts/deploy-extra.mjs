import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Contract, JsonRpcProvider, Wallet, formatEther, formatUnits, MaxUint256, parseUnits } from "ethers";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "config.js"), "utf8");
const cfg = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const extraCfg = cfg.extra;
if (!extraCfg?.address || !extraCfg?.bytecode) {
  console.error("NO_EXTRA");
  process.exit(1);
}

const rpc = process.env.BSC_RPC || cfg.rpc;
const provider = new JsonRpcProvider(rpc, cfg.chainId);
const ownerBal = await provider.getBalance(cfg.owner);
const extraCode = await provider.getCode(extraCfg.address);
console.log("extra", extraCfg.address);
console.log("owner", cfg.owner);
console.log("owner BNB", formatEther(ownerBal));
console.log("code", extraCode && extraCode !== "0x" ? `${(extraCode.length - 2) / 2} bytes` : "none");

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

const oldAddr = process.env.WITHDRAW_OLD;
if (oldAddr && oldAddr.toLowerCase() !== extraCfg.address.toLowerCase()) {
  const oldCode = await provider.getCode(oldAddr);
  if (oldCode && oldCode !== "0x") {
    const old = new Contract(oldAddr, extraCfg.abi, wallet);
    const oldPool = await old.pool();
    console.log("old extra", oldAddr, formatUnits(oldPool, 18));
    if (oldPool > 0n) {
      const txW = await old.withdraw(oldPool);
      console.log("withdraw old", txW.hash);
      await txW.wait();
    }
  }
}

if (!extraCode || extraCode === "0x") {
  const data = extraCfg.salt + extraCfg.bytecode.slice(2);
  const tx = await wallet.sendTransaction({ to: cfg.factory, data });
  console.log("deploy tx", tx.hash);
  const rec = await tx.wait();
  console.log("status", rec.status, "block", rec.blockNumber);
  const after = await provider.getCode(extraCfg.address);
  if (!after || after === "0x") {
    console.error("deploy failed: still empty");
    process.exit(1);
  }
  console.log("deployed", extraCfg.address);
} else {
  console.log("already deployed");
}

const fundLim = process.env.FUND_LIM;
if (fundLim) {
  const lim = new Contract(
    cfg.lim,
    [
      "function balanceOf(address) view returns (uint256)",
      "function allowance(address,address) view returns (uint256)",
      "function approve(address,uint256) returns (bool)",
    ],
    wallet,
  );
  const extra = new Contract(extraCfg.address, extraCfg.abi, wallet);
  const amt = parseUnits(String(fundLim), 18);
  const bal = await lim.balanceOf(wallet.address);
  console.log("owner LIM", formatUnits(bal, 18));
  if (bal < amt) {
    console.error("not enough LIM to fund");
    process.exit(1);
  }
  const allow = await lim.allowance(wallet.address, extraCfg.address);
  if (allow < amt) {
    const txA = await lim.approve(extraCfg.address, MaxUint256);
    console.log("approve", txA.hash);
    await txA.wait();
  }
  const txF = await extra.fund(amt);
  console.log("fund", txF.hash);
  await txF.wait();
  console.log("pool", formatUnits(await extra.pool(), 18));
}
