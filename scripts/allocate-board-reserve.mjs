/**
 * Allocate V6 reserve LIM into board pools, then refill V5 legacy pools.
 *
 * Live V6 must expose fundBoardsFromBalance (added in CatboxDash.sol).
 * If missing, falls back to owner-wallet fundBoards + V5 settle injection.
 *
 * Usage:
 *   node scripts/allocate-board-reserve.mjs            # dry-run
 *   EXECUTE=1 PRIVATE_KEY=0x... node scripts/allocate-board-reserve.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  MaxUint256,
  formatUnits,
  parseUnits,
  ZeroAddress,
  id,
} from "ethers";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "config.js"), "utf8");
const cfg = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const v5Addr = cfg.freeAddress || cfg.address;
const v6Addr = cfg.v6?.address;
const execute = process.env.EXECUTE === "1";
const MULTI = "0xcA11bde05977b3631167028862bE2a173976CA11";
const rpc = process.env.BSC_RPC || cfg.rpc || "https://bsc-rpc.publicnode.com";
const provider = new JsonRpcProvider(rpc, cfg.chainId, { staticNetwork: true, batchMaxCount: 1 });

const RESERVE_ABI = [
  "function fundBoardsFromBalance(uint256 toDay,uint256 toInvite)",
  "function fundBoards(uint256 toDay,uint256 toInvite)",
  "function withdrawDaily(uint256 amount)",
  "function withdrawWeekly(uint256 amount)",
  "function dayPool() view returns (uint256)",
  "function dayEqPool() view returns (uint256)",
  "function invitePool() view returns (uint256)",
  "function ticketFloat() view returns (uint256)",
  "function freePool() view returns (uint256)",
  "function owed() view returns (uint256)",
  "function enter(address referrer,uint256 tierId) returns (uint256)",
  "function settle(uint256 collected,uint256 score)",
  "function activeRun(address) view returns (uint256)",
  "function ticketPrice(uint256) view returns (uint256)",
];

const v5 = new Contract(v5Addr, cfg.abi, provider);
const v6 = v6Addr ? new Contract(v6Addr, [...cfg.v6.abi, ...RESERVE_ABI], provider) : null;
const lim = new Contract(cfg.lim, [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
], provider);

const wallets = JSON.parse(readFileSync(join(root, "data/board-wallets.json"), "utf8"));
const addrs = wallets.addrs || wallets;

function fmt(v) {
  return formatUnits(v, 18);
}
function ceilLim(v) {
  const s = formatUnits(v, 18);
  const n = Math.ceil(Number(s) * 1000) / 1000;
  return parseUnits(String(n), 18);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sumPending(game, addr) {
  const multi = new Contract(
    MULTI,
    ["function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])"],
    provider,
  );
  let inv = 0n;
  let day = 0n;
  for (let i = 0; i < addr.length; i += 80) {
    const chunk = addr.slice(i, i + 80);
    const calls = chunk.map((a) => ({
      target: game.target,
      allowFailure: true,
      callData: game.interface.encodeFunctionData("pending", [a]),
    }));
    const rows = await multi.aggregate3.staticCall(calls);
    for (let j = 0; j < chunk.length; j++) {
      const row = rows[j];
      if (!row.success || !row.returnData || row.returnData === "0x") continue;
      const d = game.interface.decodeFunctionResult("pending", row.returnData);
      inv += d[0];
      day += d[1];
    }
  }
  return { inv, day, total: inv + day };
}

async function reserveOnV6() {
  if (!v6) return 0n;
  const [bal, tf, free, day, eq, inv, owed] = await Promise.all([
    lim.balanceOf(v6Addr),
    v6.ticketFloat(),
    v6.freePool(),
    v6.dayPool(),
    v6.dayEqPool(),
    v6.invitePool(),
    v6.owed(),
  ]);
  const booked = tf + free + day + eq + inv + owed;
  return bal > booked ? bal - booked : 0n;
}

async function hasFundFromBalance() {
  if (!v6) return false;
  const sel = id("fundBoardsFromBalance(uint256,uint256)").slice(0, 10);
  const code = await provider.getCode(v6Addr);
  if (!code.includes(sel.slice(2))) return false;
  try {
    await v6.fundBoardsFromBalance.staticCall(1n, 0n);
    return true;
  } catch (_) {
    return true;
  }
}

async function readState() {
  const [v5Week, v5Invite, v6Day, v6Eq, v6Invite, ownerLim, ownerBnb] = await Promise.all([
    v5.weekPool(),
    v5.invitePool(),
    v6 ? v6.dayPool() : 0n,
    v6 ? v6.dayEqPool() : 0n,
    v6 ? v6.invitePool() : 0n,
    lim.balanceOf(cfg.owner),
    provider.getBalance(cfg.owner),
  ]);
  const v5Pending = await sumPending(v5, addrs);
  let v6Pending = { inv: 0n, day: 0n, total: 0n };
  if (v6) v6Pending = await sumPending(v6, addrs);
  const v5ShortDay = v5Pending.day > v5Week ? v5Pending.day - v5Week : 0n;
  const v5ShortInv = v5Pending.inv > v5Invite ? v5Pending.inv - v5Invite : 0n;
  const v6DayPool = v6Day + v6Eq;
  const v6ShortDay = v6Pending.day > v6DayPool ? v6Pending.day - v6DayPool : 0n;
  const v6ShortInv = v6Pending.inv > v6Invite ? v6Pending.inv - v6Invite : 0n;
  const reserve = await reserveOnV6();
  return {
    v5Week,
    v5Invite,
    v6DayPool,
    v6Invite,
    v5ShortDay,
    v5ShortInv,
    v6ShortDay,
    v6ShortInv,
    v5Pending,
    v6Pending,
    reserve,
    ownerLim,
    ownerBnb,
    totalShort: v5ShortDay + v5ShortInv + v6ShortDay + v6ShortInv,
  };
}

function grossTicketForShortfall(needWeek, needInvite) {
  const weekGross = needWeek * 2n;
  const invGross = needInvite * 5n;
  return weekGross > invGross ? weekGross : invGross;
}

async function claimWindowOpen() {
  const DAY = 86400;
  const BJ = 8 * 3600;
  const now = Math.floor(Date.now() / 1000);
  const todayStart = Math.floor((now + BJ) / DAY) * DAY - BJ;
  return now >= todayStart && now < todayStart + 3600;
}

console.log("mode", execute ? "EXECUTE" : "dry-run");
const st = await readState();
const buf = parseUnits("0.5", 18);
const toV6Day = ceilLim(st.v6ShortDay + buf / 2n);
const toV6Inv = ceilLim(st.v6ShortInv + buf / 2n);
const toV5Day = ceilLim(st.v5ShortDay + buf / 2n);
const toV5Inv = ceilLim(st.v5ShortInv + buf / 2n);
const v6Need = toV6Day + toV6Inv;
const v5Need = toV5Day + toV5Inv;
const v5InjectGross = grossTicketForShortfall(toV5Day, toV5Inv);

console.log("V6 reserve (unbooked)", fmt(st.reserve));
console.log("shortfall V6 day", fmt(st.v6ShortDay), "invite", fmt(st.v6ShortInv));
console.log("shortfall V5 day", fmt(st.v5ShortDay), "invite", fmt(st.v5ShortInv));
console.log("plan V6 credit day", fmt(toV6Day), "invite", fmt(toV6Inv), "total", fmt(v6Need));
console.log("plan V5 credit day", fmt(toV5Day), "invite", fmt(toV5Inv), "total", fmt(v5Need));
console.log("plan V5 settle injection gross", fmt(v5InjectGross));
console.log("owner LIM", fmt(st.ownerLim), "BNB", fmt(st.ownerBnb));

const canReserveFn = await hasFundFromBalance();
console.log("fundBoardsFromBalance on live V6", canReserveFn ? "yes" : "no");

if (st.totalShort <= 0n) {
  console.log("Board pools already cover pending.");
  process.exit(0);
}

if (!canReserveFn) {
  console.log("\nLive V6 has no fundBoardsFromBalance — reserve cannot be booked yet.");
  console.log("Workaround: transfer", fmt(v6Need + v5InjectGross), "LIM to owner", cfg.owner);
  console.log("Then re-run, or deploy upgraded V6 bytecode from contracts/CatboxDash.sol");
  if (st.reserve >= v6Need + v5Need) {
    console.log("Reserve on V6 is enough once contract is upgraded.");
  }
}

if (!execute) {
  console.log("\nDry-run only. To execute:");
  console.log("  EXECUTE=1 PRIVATE_KEY=0x... node scripts/allocate-board-reserve.mjs");
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
if (BigInt(await provider.getBalance(wallet.address)) < parseUnits("0.0004", 18)) {
  console.error("owner BNB too low");
  process.exit(1);
}

const v6w = v6.connect(wallet);
const v5w = v5.connect(wallet);
const limw = lim.connect(wallet);

async function creditV6Pools(toDay, toInvite) {
  if (toDay + toInvite <= 0n) return;
  if (canReserveFn) {
    const reserve = await reserveOnV6();
    if (reserve < toDay + toInvite) throw new Error("reserve low");
    const tx = await v6w.fundBoardsFromBalance(toDay, toInvite);
    console.log("fundBoardsFromBalance", fmt(toDay), fmt(toInvite), tx.hash);
    await tx.wait();
    return;
  }
  const need = toDay + toInvite;
  const bal = await limw.balanceOf(wallet.address);
  if (bal < need) throw new Error(`owner LIM ${fmt(bal)} < ${fmt(need)}`);
  const allow = await limw.allowance(wallet.address, v6Addr);
  if (allow < need) {
    const txA = await limw.approve(v6Addr, MaxUint256);
    await txA.wait();
  }
  const tx = await v6w.fundBoards(toDay, toInvite);
  console.log("fundBoards", fmt(toDay), fmt(toInvite), tx.hash);
  await tx.wait();
}

async function withdrawV6ForV5(amount) {
  if (amount <= 0n || !v6) return;
  if (await claimWindowOpen()) {
    console.log("skip V6 withdraw — claim window open");
    return;
  }
  const avail = (await v6.dayPool()) + (await v6.dayEqPool()) + (await v6.invitePool());
  const take = amount > avail ? avail : amount;
  if (take <= 0n) return;
  const inv = await v6.invitePool();
  const takeInv = take > inv ? inv : take;
  const takeDay = take - takeInv;
  if (takeInv > 0n) {
    const tx = await v6w.withdrawWeekly(takeInv);
    console.log("v6 withdrawWeekly", fmt(takeInv), tx.hash);
    await tx.wait();
  }
  if (takeDay > 0n) {
    const tx = await v6w.withdrawDaily(takeDay);
    console.log("v6 withdrawDaily", fmt(takeDay), tx.hash);
    await tx.wait();
  }
}

async function injectV5Pools(budget) {
  if (budget <= 0n) return;
  const tierId = Number(process.env.REFUND_TIER ?? 3);
  const ticket = await v5w.ticketPrice(tierId);
  if (!ticket || ticket <= 0n) throw new Error("bad tier");
  let spent = 0n;
  let runs = 0;
  const gasFloor = parseUnits(process.env.GAS_FLOOR_BNB || "0.00025", 18);
  while (spent + ticket <= budget) {
    if (BigInt(await provider.getBalance(wallet.address)) < gasFloor) break;
    if ((await v5w.activeRun(wallet.address)) !== 0n) throw new Error("owner active v5 run");
    const bal = await limw.balanceOf(wallet.address);
    if (bal < ticket) break;
    const allow = await limw.allowance(wallet.address, v5Addr);
    if (allow < ticket) {
      const txA = await limw.approve(v5Addr, MaxUint256);
      await txA.wait();
    }
    const txE = await v5w.enter(ZeroAddress, tierId);
    console.log("v5 enter", fmt(ticket), txE.hash);
    await txE.wait();
    await sleep(6500);
    const txS = await v5w.settle(0, 0);
    console.log("v5 settle", txS.hash);
    await txS.wait();
    spent += ticket;
    runs += 1;
  }
  console.log("v5 injection runs", runs, "spent", fmt(spent));
}

await creditV6Pools(toV6Day, toV6Inv);

const movedForV5 = toV5Day + toV5Inv;
if (canReserveFn && movedForV5 > 0n) {
  await creditV6Pools(toV5Day, toV5Inv);
  await withdrawV6ForV5(movedForV5);
}

let budget = v5InjectGross;
const ownerBal = await limw.balanceOf(wallet.address);
if (budget > ownerBal) budget = ownerBal;
await injectV5Pools(budget);

const after = await readState();
console.log("after reserve", fmt(after.reserve));
console.log("after V5 pools week", fmt(after.v5Week), "invite", fmt(after.v5Invite));
console.log("after V6 pools day", fmt(after.v6DayPool), "invite", fmt(after.v6Invite));
console.log("remaining shortfall", fmt(after.totalShort));
