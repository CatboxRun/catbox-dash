import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JsonRpcProvider, Wallet, formatEther, Contract, parseUnits, MaxUint256, formatUnits } from "ethers";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "config.js"), "utf8");
const cfg = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const v6 = cfg.v6;
if (!v6?.address || !v6?.bytecode) {
  console.error("NO_V6");
  process.exit(1);
}

const rpc = process.env.BSC_RPC || cfg.rpc;
const provider = new JsonRpcProvider(rpc, cfg.chainId, { staticNetwork: true, batchMaxCount: 1 });
const code = await provider.getCode(v6.address);
console.log("v6", v6.address);
console.log("free/v5", cfg.freeAddress || cfg.address);
console.log("code", code && code !== "0x" ? `${(code.length - 2) / 2} bytes` : "none");

const key = process.env.PRIVATE_KEY || process.env.BSC_PRIVATE_KEY;
if (!key) {
  console.log("NO_KEY — set PRIVATE_KEY to deploy");
  process.exit(2);
}

const wallet = new Wallet(key, provider);
console.log("deployer", wallet.address);
if (wallet.address.toLowerCase() !== String(cfg.owner).toLowerCase()) {
  console.error("key is not owner");
  process.exit(1);
}
console.log("owner BNB", formatEther(await provider.getBalance(wallet.address)));

if (!code || code === "0x") {
  const data = v6.salt + v6.bytecode.slice(2);
  const tx = await wallet.sendTransaction({ to: cfg.factory, data });
  console.log("deploy tx", tx.hash);
  const rec = await tx.wait();
  console.log("status", rec.status, "block", rec.blockNumber);
  const after = await provider.getCode(v6.address);
  if (!after || after === "0x") {
    console.error("deploy failed");
    process.exit(1);
  }
  console.log("deployed", v6.address);
} else {
  console.log("already deployed");
}

const freeAddr = cfg.freeAddress || cfg.address;
const v5 = new Contract(freeAddr, cfg.abi, wallet);
const paid = new Contract(v6.address, v6.abi, wallet);
const lim = new Contract(
  cfg.lim,
  [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
    "function transfer(address,uint256) returns (bool)",
  ],
  wallet,
);

if (process.env.SKIP_MIGRATE === "1") {
  console.log("SKIP_MIGRATE");
  process.exit(0);
}

const [week, invite] = await Promise.all([v5.weekPool(), v5.invitePool()]);
console.log("v5 week", formatUnits(week, 18), "invite", formatUnits(invite, 18));

if (week + invite > 0n) {
  const txW = await v5.withdrawWeekly(week + invite);
  console.log("withdrawWeekly", txW.hash);
  await txW.wait();
}

const bal = await lim.balanceOf(wallet.address);
console.log("owner LIM", formatUnits(bal, 18));

const fundDay = week;
const fundInv = invite;
const need = fundDay + fundInv;
if (need > 0n) {
  if (bal < need) {
    console.error("owner LIM too low after withdraw");
    process.exit(1);
  }
  const allow = await lim.allowance(wallet.address, v6.address);
  if (allow < need) {
    const txA = await lim.approve(v6.address, MaxUint256);
    console.log("approve", txA.hash);
    await txA.wait();
  }
  const txF = await paid.fundBoards(fundDay, fundInv);
  console.log("fundBoards", txF.hash);
  await txF.wait();
  console.log("funded day", formatUnits(fundDay, 18), "invite", formatUnits(fundInv, 18));
}

// optional bonus reserve for overtime on V6
const bonus = process.env.FUND_BONUS_LIM;
if (bonus) {
  const amt = parseUnits(String(bonus), 18);
  const allow = await lim.allowance(wallet.address, v6.address);
  if (allow < amt) {
    const txA = await lim.approve(v6.address, MaxUint256);
    await txA.wait();
  }
  const txB = await paid.fund(amt);
  console.log("fund bonus freePool", txB.hash);
  await txB.wait();
}

console.log("done deploy+fund. Run migrate-v6.mjs next.");
