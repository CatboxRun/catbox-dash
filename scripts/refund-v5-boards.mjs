/**
 * Refill V5 week/invite pools so legacy pending claims can pay out in full.
 *
 * V6 migration moved board liquidity off V5 via withdrawWeekly → fundBoards(V6).
 * V5 has no fundBoards; the only way to raise weekPool/invitePool is paid enter +
 * zero-collect settle (50% week / 20% invite / 30% burn on leftover ticket).
 *
 * Usage:
 *   node scripts/refund-v5-boards.mjs            # dry-run
 *   EXECUTE=1 PRIVATE_KEY=0x... node scripts/refund-v5-boards.mjs
 *
 * Optional:
 *   REFUND_TIER=3        ticket tier for injection runs (default 3 = 10 LIM)
 *   EXTRA_LIM=150        extra owner LIM beyond V6 board withdraw (if needed)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  JsonRpcProvider,
  Wallet,
  Contract,
  ZeroAddress,
  MaxUint256,
  formatUnits,
  parseUnits,
} from "ethers";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "config.js"), "utf8");
const cfg = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const v6 = cfg.v6;
const v5Addr = cfg.freeAddress || cfg.address;
const execute = process.env.EXECUTE === "1";
const tierId = Number(process.env.REFUND_TIER ?? 3);
const MULTI = "0xcA11bde05977b3631167028862bE2a173976CA11";

const rpc = process.env.BSC_RPC || cfg.rpc || "https://bsc-rpc.publicnode.com";
const provider = new JsonRpcProvider(rpc, cfg.chainId, { staticNetwork: true, batchMaxCount: 1 });

const lim = new Contract(
  cfg.lim,
  [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
  ],
  provider,
);
const v5 = new Contract(v5Addr, cfg.abi, provider);
const paid = v6?.address ? new Contract(v6.address, v6.abi, provider) : null;

function fmt(v) {
  return formatUnits(v, 18);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sumV5Pending(addrs) {
  const multi = new Contract(
    MULTI,
    ["function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])"],
    provider,
  );
  let week = 0n;
  let invite = 0n;
  const batch = 80;
  for (let i = 0; i < addrs.length; i += batch) {
    const chunk = addrs.slice(i, i + batch);
    const calls = chunk.map((a) => ({
      target: v5Addr,
      allowFailure: true,
      callData: v5.interface.encodeFunctionData("pending", [a]),
    }));
    const rows = await multi.aggregate3.staticCall(calls);
    for (let j = 0; j < chunk.length; j++) {
      const row = rows[j];
      if (!row.success || !row.returnData || row.returnData === "0x") continue;
      const d = v5.interface.decodeFunctionResult("pending", row.returnData);
      invite += d[0];
      week += d[1];
    }
  }
  return { week, invite, total: week + invite };
}

function grossTicketForShortfall(needWeek, needInvite) {
  const weekGross = needWeek * 2n; // leftover split: 50% → weekPool
  const invGross = needInvite * 5n; // leftover split: 20% → invitePool
  return weekGross > invGross ? weekGross : invGross;
}

async function readPools() {
  const [v5Week, v5Invite, v5Free, ownerLim, ownerBnb] = await Promise.all([
    v5.weekPool(),
    v5.invitePool(),
    v5.freePool(),
    lim.balanceOf(cfg.owner),
    provider.getBalance(cfg.owner),
  ]);
  let v6Day = 0n;
  let v6Invite = 0n;
  if (paid) {
    const [day, eq, inv] = await Promise.all([paid.dayPool(), paid.dayEqPool(), paid.invitePool()]);
    v6Day = day + eq;
    v6Invite = inv;
  }
  return { v5Week, v5Invite, v5Free, v6Day, v6Invite, ownerLim, ownerBnb };
}

const wallets = JSON.parse(readFileSync(join(root, "data/board-wallets.json"), "utf8"));
const addrs = wallets.addrs || wallets;
console.log("mode", execute ? "EXECUTE" : "dry-run");
console.log("v5", v5Addr);
console.log("v6", v6?.address || "none");

const pools = await readPools();
const pending = await sumV5Pending(addrs);
const needWeek = pending.week > pools.v5Week ? pending.week - pools.v5Week : 0n;
const needInvite = pending.invite > pools.v5Invite ? pending.invite - pools.v5Invite : 0n;
const needTotal = needWeek + needInvite;
const grossInject = grossTicketForShortfall(needWeek, needInvite);
const burnEst = (grossInject * 3n) / 10n;

console.log("V5 pending week", fmt(pending.week), "invite", fmt(pending.invite), "total", fmt(pending.total));
console.log("V5 pools week", fmt(pools.v5Week), "invite", fmt(pools.v5Invite), "free", fmt(pools.v5Free));
console.log("shortfall week", fmt(needWeek), "invite", fmt(needInvite), "total", fmt(needTotal));
console.log("V6 board liquidity day", fmt(pools.v6Day), "invite", fmt(pools.v6Invite), "total", fmt(pools.v6Day + pools.v6Invite));
console.log("gross ticket LIM needed for full refill (50/20/30 settle path)", fmt(grossInject), "est burn", fmt(burnEst));
console.log("owner LIM", fmt(pools.ownerLim), "BNB", fmt(pools.ownerBnb));

if (needTotal <= 0n) {
  console.log("V5 board pools already cover pending — nothing to do.");
  process.exit(0);
}

const takeInvite = needInvite < pools.v6Invite ? needInvite : pools.v6Invite;
const takeDay = needWeek < pools.v6Day ? needWeek : pools.v6Day;
const fromV6 = takeInvite + takeDay;
const extra = process.env.EXTRA_LIM ? parseUnits(String(process.env.EXTRA_LIM), 18) : 0n;
const budget = fromV6 + pools.ownerLim + extra;
const injectBudget = budget < grossInject ? budget : grossInject;

console.log("plan withdraw from V6 invite", fmt(takeInvite), "day", fmt(takeDay), "total", fmt(fromV6));
console.log("plan settle injection budget", fmt(injectBudget), injectBudget < grossInject ? "(partial — need more LIM for full cover)" : "(full cover)");

if (!execute) {
  console.log("\nDry-run only. To execute:");
  console.log("  EXECUTE=1 PRIVATE_KEY=0x... node scripts/refund-v5-boards.mjs");
  if (injectBudget < grossInject) {
    console.log(`  Optionally add owner LIM or EXTRA_LIM=${fmt(grossInject - fromV6)}`);
  }
  process.exit(0);
}

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

const v5w = v5.connect(wallet);
const paidw = paid.connect(wallet);
const limw = lim.connect(wallet);

if (BigInt(await provider.getBalance(wallet.address)) < parseUnits("0.0005", 18)) {
  console.error("owner BNB too low for gas");
  process.exit(1);
}

if (takeInvite > 0n || takeDay > 0n) {
  const DAY = 86400;
  const BJ = 8 * 3600;
  const now = Math.floor(Date.now() / 1000);
  const todayStart = Math.floor((now + BJ) / DAY) * DAY - BJ;
  const claimOpen = now >= todayStart && now < todayStart + 3600;
  const nextOpen = claimOpen || now < todayStart ? todayStart : todayStart + DAY;
  if (claimOpen || now < nextOpen) {
    console.error("V6 board withdraw blocked — claim window not open yet or still active");
    console.error("Use owner LIM only; will not drain V6 day/invite pools before claim hour ends");
  } else {
    if (takeInvite > 0n) {
      const tx = await paidw.withdrawWeekly(takeInvite);
      console.log("v6 withdrawWeekly", fmt(takeInvite), tx.hash);
      await tx.wait();
    }
    if (takeDay > 0n) {
      const tx = await paidw.withdrawDaily(takeDay);
      console.log("v6 withdrawDaily", fmt(takeDay), tx.hash);
      await tx.wait();
    }
  }
}

const ticket = await v5w.ticketPrice(tierId);
if (!ticket || ticket <= 0n) {
  console.error("bad tier", tierId);
  process.exit(1);
}
console.log("injection tier", tierId, "price", fmt(ticket));

let spent = 0n;
let runs = 0;
const gasFloor = parseUnits(process.env.GAS_FLOOR_BNB || "0.00025", 18);
while (spent + ticket <= injectBudget) {
  const gasLeft = await provider.getBalance(wallet.address);
  if (gasLeft < gasFloor) {
    console.log("stop: BNB reserve", fmt(gasLeft), "< floor", fmt(gasFloor));
    break;
  }
  const active = await v5w.activeRun(wallet.address);
  if (active && active !== 0n) {
    console.error("owner has active run", active.toString());
    process.exit(1);
  }
  const bal = await limw.balanceOf(wallet.address);
  if (bal < ticket) {
    console.log("stop: owner LIM", fmt(bal), "< ticket", fmt(ticket));
    break;
  }
  const allow = await limw.allowance(wallet.address, v5Addr);
  if (allow < ticket) {
    const txA = await limw.approve(v5Addr, MaxUint256);
    await txA.wait();
  }
  const txE = await v5w.enter(ZeroAddress, tierId);
  console.log("enter", fmt(ticket), txE.hash);
  await txE.wait();
  await sleep(6500);
  const txS = await v5w.settle(0, 0);
  console.log("settle", txS.hash);
  await txS.wait();
  spent += ticket;
  runs += 1;
  const [wk, inv] = await Promise.all([v5w.weekPool(), v5w.invitePool()]);
  console.log("  pools now week", fmt(wk), "invite", fmt(inv));
}

const after = await readPools();
const pendingAfter = await sumV5Pending(addrs);
console.log("done runs", runs, "spent ticket LIM", fmt(spent));
console.log("V5 pools week", fmt(after.v5Week), "invite", fmt(after.v5Invite));
console.log("remaining shortfall week", fmt(pendingAfter.week > after.v5Week ? pendingAfter.week - after.v5Week : 0n));
console.log("remaining shortfall invite", fmt(pendingAfter.invite > after.v5Invite ? pendingAfter.invite - after.v5Invite : 0n));
