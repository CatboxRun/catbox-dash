/**
 * Live fund adequacy check for all game contracts.
 * Usage: node scripts/check-funds.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, JsonRpcProvider, formatUnits, parseUnits } from "ethers";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "config.js"), "utf8");
const cfg = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const v5Addr = cfg.freeAddress || cfg.address;
const v6Addr = cfg.v6?.address;
const extraAddr = cfg.extra?.address;
const MULTI = "0xcA11bde05977b3631167028862bE2a173976CA11";

const rpc = process.env.BSC_RPC || "https://bsc-rpc.publicnode.com";
const provider = new JsonRpcProvider(rpc, cfg.chainId, { staticNetwork: true, batchMaxCount: 1 });
const lim = new Contract(cfg.lim, ["function balanceOf(address) view returns (uint256)"], provider);
const v5 = new Contract(v5Addr, cfg.abi, provider);
const v6 = v6Addr ? new Contract(v6Addr, cfg.v6.abi, provider) : null;
const extra = extraAddr ? new Contract(extraAddr, cfg.extra.abi, provider) : null;

const wallets = JSON.parse(readFileSync(join(root, "data/board-wallets.json"), "utf8"));
const addrs = wallets.addrs || wallets;

function fmt(v) {
  return Number(formatUnits(v, 18)).toFixed(4);
}
function pct(pool, need) {
  if (need === 0n) return "100%";
  return `${Number((pool * 10000n) / need) / 100}%`;
}

async function sumPending(game, addr) {
  const multi = new Contract(
    MULTI,
    ["function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])"],
    provider,
  );
  let inv = 0n;
  let day = 0n;
  const batch = 80;
  for (let i = 0; i < addr.length; i += batch) {
    const chunk = addr.slice(i, i + batch);
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

async function readContractState() {
  const [
    v5LimBal,
    v6LimBal,
    extraLimBal,
    ownerLim,
    ownerBnb,
    v5Week,
    v5Invite,
    v5Free,
    v5TicketFloat,
    v5Burned,
  ] = await Promise.all([
    lim.balanceOf(v5Addr),
    v6 ? lim.balanceOf(v6Addr) : 0n,
    extra ? lim.balanceOf(extraAddr) : 0n,
    lim.balanceOf(cfg.owner),
    provider.getBalance(cfg.owner),
    v5.weekPool(),
    v5.invitePool(),
    v5.freePool(),
    v5.ticketFloat().catch(() => 0n),
    v5.burnedTotal(),
  ]);

  let v6Day = 0n;
  let v6Eq = 0n;
  let v6Invite = 0n;
  let v6Free = 0n;
  let v6Burned = 0n;
  let v6TicketFloat = 0n;
  let extraPool = 0n;
  let extraPaused = false;

  if (v6) {
    [v6Day, v6Eq, v6Invite, v6Free, v6Burned, v6TicketFloat] = await Promise.all([
      v6.dayPool(),
      v6.dayEqPool(),
      v6.invitePool(),
      v6.freePool(),
      v6.burnedTotal(),
      v6.ticketFloat?.().catch(() => 0n) ?? 0n,
    ]);
  }
  if (extra) {
    [extraPool, extraPaused] = await Promise.all([extra.pool(), extra.paused?.().catch(() => false) ?? false]);
  }

  const v5Accounted = v5Free + v5Week + v5Invite + v5TicketFloat;
  const v5Dust = v5LimBal > v5Accounted ? v5LimBal - v5Accounted : 0n;
  const v6Board = v6Day + v6Eq + v6Invite;
  const v6Accounted = (v6Free || 0n) + v6Board + (v6TicketFloat || 0n);
  const v6Dust = v6LimBal > v6Accounted ? v6LimBal - v6Accounted : 0n;

  return {
    v5LimBal,
    v6LimBal,
    extraLimBal,
    ownerLim,
    ownerBnb,
    v5Week,
    v5Invite,
    v5Free,
    v5TicketFloat,
    v5Burned,
    v5Accounted,
    v5Dust,
    v6Day,
    v6Eq,
    v6Invite,
    v6Free,
    v6Burned,
    v6TicketFloat,
    v6Board,
    v6Accounted,
    v6Dust,
    extraPool,
    extraPaused,
  };
}

console.log("=== Catbox fund check ===");
console.log("rpc", rpc);
console.log("wallets scanned", addrs.length);

const s = await readContractState();
console.log("\n--- Contract LIM balances ---");
console.log("V5 contract", fmt(s.v5LimBal), "accounted", fmt(s.v5Accounted), "dust", fmt(s.v5Dust));
console.log("V6 contract", fmt(s.v6LimBal), "accounted", fmt(s.v6Accounted), "dust", fmt(s.v6Dust));
console.log("Extra contract", fmt(s.extraLimBal), "pool()", fmt(s.extraPool), "paused", s.extraPaused);
console.log("Owner vault", fmt(s.ownerLim), "BNB", fmt(s.ownerBnb));

console.log("\n--- Pool buckets ---");
console.log("V5 weekPool", fmt(s.v5Week), "invitePool", fmt(s.v5Invite), "freePool", fmt(s.v5Free), "ticketFloat", fmt(s.v5TicketFloat));
console.log("V6 dayPool", fmt(s.v6Day), "dayEqPool", fmt(s.v6Eq), "invitePool", fmt(s.v6Invite), "freePool", fmt(s.v6Free), "ticketFloat", fmt(s.v6TicketFloat));
console.log("Display week (V6 day+eq + V5 week)", fmt(s.v6Day + s.v6Eq + s.v5Week));
console.log("Display invite (V6 + V5)", fmt(s.v6Invite + s.v5Invite));
console.log("Burned V5", fmt(s.v5Burned), "V6", fmt(s.v6Burned));

console.log("\n--- Pending vs pools (claim liability) ---");
const v5Pending = await sumPending(v5, addrs);
console.log("V5 pending day", fmt(v5Pending.day), "invite", fmt(v5Pending.inv), "total", fmt(v5Pending.total));
console.log("V5 coverage day", pct(s.v5Week, v5Pending.day), "invite", pct(s.v5Invite, v5Pending.inv));
const v5ShortDay = v5Pending.day > s.v5Week ? v5Pending.day - s.v5Week : 0n;
const v5ShortInv = v5Pending.inv > s.v5Invite ? v5Pending.inv - s.v5Invite : 0n;
console.log("V5 SHORTFALL day", fmt(v5ShortDay), "invite", fmt(v5ShortInv), "total", fmt(v5ShortDay + v5ShortInv));

let v6Pending = { inv: 0n, day: 0n, total: 0n };
if (v6) {
  v6Pending = await sumPending(v6, addrs);
  const v6DayPool = s.v6Day + s.v6Eq;
  console.log("V6 pending day", fmt(v6Pending.day), "invite", fmt(v6Pending.inv), "total", fmt(v6Pending.total));
  console.log("V6 coverage day", pct(v6DayPool, v6Pending.day), "invite", pct(s.v6Invite, v6Pending.inv));
  const v6ShortDay = v6Pending.day > v6DayPool ? v6Pending.day - v6DayPool : 0n;
  const v6ShortInv = v6Pending.inv > s.v6Invite ? v6Pending.inv - s.v6Invite : 0n;
  console.log("V6 SHORTFALL day", fmt(v6ShortDay), "invite", fmt(v6ShortInv), "total", fmt(v6ShortDay + v6ShortInv));
}

const totalPending = v5Pending.total + v6Pending.total;
const totalBoard = s.v5Week + s.v5Invite + s.v6Day + s.v6Eq + s.v6Invite;
const totalShort = v5ShortDay + v5ShortInv + (v6Pending.day > s.v6Day + s.v6Eq ? v6Pending.day - s.v6Day - s.v6Eq : 0n) + (v6Pending.inv > s.v6Invite ? v6Pending.inv - s.v6Invite : 0n);

console.log("\n--- Combined boards ---");
console.log("Total board liquidity", fmt(totalBoard));
console.log("Total pending (V5+V6)", fmt(totalPending));
console.log("Combined coverage", pct(totalBoard, totalPending));
console.log("Combined SHORTFALL", fmt(totalShort));

console.log("\n--- Free pool / runtime ---");
console.log("V5 freePool", fmt(s.v5Free), "(bonus reserve for free SCOUT runs)");
console.log("V6 freePool", fmt(s.v6Free));
console.log("V5 ticketFloat", fmt(s.v5TicketFloat), "(active run stakes locked)");
console.log("V6 ticketFloat", fmt(s.v6TicketFloat));

console.log("\n--- Owner ops ---");
const gasOk = s.ownerBnb >= parseUnits("0.0003", 18);
console.log("Owner BNB for gas", fmt(s.ownerBnb), gasOk ? "OK" : "LOW — need top-up");
console.log("Owner LIM available", fmt(s.ownerLim));

console.log("\n--- Verdict ---");
const issues = [];
if (v5ShortDay + v5ShortInv > 0n) issues.push(`V5 legacy pending short ${fmt(v5ShortDay + v5ShortInv)} LIM`);
if (v6) {
  const v6ShortDay = v6Pending.day > s.v6Day + s.v6Eq ? v6Pending.day - s.v6Day - s.v6Eq : 0n;
  const v6ShortInv = v6Pending.inv > s.v6Invite ? v6Pending.inv - s.v6Invite : 0n;
  if (v6ShortDay + v6ShortInv > 0n) issues.push(`V6 board pending short ${fmt(v6ShortDay + v6ShortInv)} LIM`);
}
if (s.v5Free < parseUnits("100", 18)) issues.push(`V5 freePool low (${fmt(s.v5Free)} LIM)`);
if (s.extraPool < parseUnits("50", 18)) issues.push(`Extra pool low (${fmt(s.extraPool)} LIM)`);
if (!gasOk) issues.push("Owner BNB low for admin txs");
if (s.extraPaused) issues.push("Extra contract paused");

if (issues.length === 0) console.log("All checked buckets look adequately funded for current pending.");
else issues.forEach((x) => console.log("!", x));
