import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JsonRpcProvider, Wallet, Contract, getAddress, ZeroAddress } from "ethers";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "config.js"), "utf8");
const cfg = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const v6 = cfg.v6;
if (!v6?.address) {
  console.error("NO_V6");
  process.exit(1);
}

const snap = JSON.parse(readFileSync(join(root, "data/snapshot.json"), "utf8"));
const rpc = process.env.BSC_RPC || cfg.rpc;
const provider = new JsonRpcProvider(rpc, cfg.chainId, { staticNetwork: true, batchMaxCount: 1 });
const key = process.env.PRIVATE_KEY || process.env.BSC_PRIVATE_KEY;
if (!key) {
  console.log("NO_KEY");
  process.exit(2);
}
const wallet = new Wallet(key, provider);
if (wallet.address.toLowerCase() !== String(cfg.owner).toLowerCase()) {
  console.error("not owner");
  process.exit(1);
}

const paid = new Contract(v6.address, v6.abi, wallet);
const free = new Contract(cfg.freeAddress || cfg.address, cfg.abi, wallet);
const code = await provider.getCode(v6.address);
if (!code || code === "0x") {
  console.error("v6 not deployed");
  process.exit(1);
}

const byPlayer = new Map();
for (const r of snap.runs || []) {
  const a = getAddress(r.player);
  const cur = byPlayer.get(a) || {
    addr: a,
    day: 0n,
    invite: 0n,
    plays: 0,
    freeUsed: 0,
    ref: ZeroAddress,
    invCount: 0,
  };
  cur.plays = Math.max(cur.plays, Number(r.plays || 0));
  cur.invCount = Math.max(cur.invCount, Number(r.invites || 0));
  if (r.referrer && r.referrer !== ZeroAddress) cur.ref = getAddress(r.referrer);
  if (r.weekPts) cur.day = BigInt(r.weekPts) > cur.day ? BigInt(r.weekPts) : cur.day;
  if (r.invitePts) cur.invite = BigInt(r.invitePts) > cur.invite ? BigInt(r.invitePts) : cur.invite;
  byPlayer.set(a, cur);
}
for (const row of snap.week || []) {
  const a = getAddress(row.addr);
  const cur = byPlayer.get(a) || { addr: a, day: 0n, invite: 0n, plays: 0, freeUsed: 0, ref: ZeroAddress, invCount: 0 };
  const pts = BigInt(row.pts || 0);
  if (pts > cur.day) cur.day = pts;
  byPlayer.set(a, cur);
}
for (const row of snap.invite || []) {
  const a = getAddress(row.addr);
  const cur = byPlayer.get(a) || { addr: a, day: 0n, invite: 0n, plays: 0, freeUsed: 0, ref: ZeroAddress, invCount: 0 };
  const pts = BigInt(row.pts || 0);
  if (pts > cur.invite) cur.invite = pts;
  byPlayer.set(a, cur);
}

const all = [...byPlayer.values()].filter((x) => x.day > 0n || x.invite > 0n || x.plays > 0 || x.ref !== ZeroAddress);
console.log("migrate wallets", all.length);

// Pull freeUsed from V5 so playCount migration does not double-count free SCOUT.
for (let i = 0; i < all.length; i += 40) {
  const chunk = all.slice(i, i + 40);
  await Promise.all(
    chunk.map(async (c) => {
      try {
        c.freeUsed = Number(await free.freeUsed(c.addr));
      } catch (_) {
        c.freeUsed = 0;
      }
    }),
  );
}

const BATCH = Number(process.env.BATCH || 40);
for (let i = 0; i < all.length; i += BATCH) {
  const chunk = all.slice(i, i + BATCH);
  const users = chunk.map((c) => c.addr);
  const dayScores = chunk.map((c) => c.day);
  const inviteScores = chunk.map((c) => c.invite);
  const plays = chunk.map((c) => {
    const freeN = Math.min(2, Math.max(0, Number(c.freeUsed || 0)));
    return BigInt(Math.max(0, c.plays - freeN));
  });
  const refs = chunk.map((c) => c.ref);
  const invCounts = chunk.map((c) => BigInt(c.invCount));
  const tx = await paid.migratePlayers(users, dayScores, inviteScores, plays, refs, invCounts);
  console.log("batch", i, "-", i + chunk.length, tx.hash);
  await tx.wait();
}
console.log("migrate done");
