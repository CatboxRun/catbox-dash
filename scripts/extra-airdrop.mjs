import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Contract, JsonRpcProvider, Wallet, formatUnits } from "ethers";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "config.js"), "utf8");
const cfg = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const extraCfg = cfg.extra;
if (!extraCfg?.address || !extraCfg?.abi) {
  console.log("NO_EXTRA");
  process.exit(0);
}

const rpc = process.env.BSC_RPC || cfg.rpc;
const provider = new JsonRpcProvider(rpc, cfg.chainId);
const code = await provider.getCode(extraCfg.address);
if (!code || code === "0x") {
  console.log("extra not deployed", extraCfg.address);
  process.exit(0);
}

const key = process.env.PRIVATE_KEY || process.env.BSC_PRIVATE_KEY;
if (!key) {
  console.log("NO_KEY");
  process.exit(0);
}

const wallet = new Wallet(key, provider);
if (wallet.address.toLowerCase() !== String(cfg.owner).toLowerCase()) {
  console.log("wrong key", wallet.address);
  process.exit(1);
}

const game = new Contract(cfg.address, cfg.abi, provider);
const extra = new Contract(extraCfg.address, extraCfg.abi, wallet);
const [sinceRunId, pool, nextRunId, paused] = await Promise.all([
  extra.sinceRunId(),
  extra.pool(),
  game.nextRunId(),
  extra.paused(),
]);
if (paused) {
  console.log("paused");
  process.exit(0);
}

const current = await provider.getBlockNumber();
const fromBlock = Math.max(1, current - 4000);
const logs = await game.queryFilter(game.filters.RunSettled(), fromBlock, current);
let paid = 0;
let skipped = 0;

for (const log of logs) {
  const runId = log.args.runId;
  if (runId < sinceRunId) continue;
  const already = await extra.paidExtra(runId);
  if (already > 0n) {
    skipped++;
    continue;
  }
  const run = await game.runs(runId);
  const player = run.player ?? run[0];
  const ticket = run.paid ?? run[1];
  const settled = run.settled ?? run[3];
  if (!settled || ticket === 0n) continue;

  const tx = await provider.getTransaction(log.transactionHash);
  let collected = 0n;
  try {
    const parsed = game.interface.parseTransaction({ data: tx.data });
    if (parsed?.name === "settle") collected = parsed.args.collected ?? parsed.args[0] ?? 0n;
  } catch (_) {
    continue;
  }
  if (collected <= ticket) continue;
  const cap = ticket <= 10n ** 18n ? ticket : ticket / 2n;
  let extraWei = collected - ticket;
  if (extraWei > cap) extraWei = cap;
  if (extraWei <= 0n) continue;
  const bal = await extra.pool();
  if (bal < extraWei) {
    console.log("pool empty", formatUnits(bal, 18));
    break;
  }
  const sent = await extra.pay(runId, extraWei);
  const rec = await sent.wait();
  paid++;
  console.log("paid", String(runId), player, formatUnits(extraWei, 18), rec.hash);
}

console.log("done", {
  fromBlock,
  nextRunId: String(nextRunId),
  sinceRunId: String(sinceRunId),
  pool: formatUnits(pool, 18),
  paid,
  skipped,
  deployer: wallet.address,
});
