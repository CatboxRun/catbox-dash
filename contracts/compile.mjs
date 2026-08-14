import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { keccak256, getCreate2Address, id } from "ethers";

const require = createRequire(import.meta.url);
const solc = require("solc");

const source = readSol();
const input = {
  language: "Solidity",
  sources: { "CatboxDash.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input)));
if (out.errors?.some((e) => e.severity === "error")) {
  console.error(out.errors);
  process.exit(1);
}
const art = out.contracts["CatboxDash.sol"].CatboxDash;
const abi = art.abi;
const bytecode = "0x" + art.evm.bytecode.object;
const factory = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const salt = id("LIMINAL.CATBOX.DASH.V4");
const address = getCreate2Address(factory, salt, keccak256(bytecode));

writeFileSync(new URL("./abi.json", import.meta.url), JSON.stringify(abi, null, 2));
writeFileSync(
  new URL("../config.js", import.meta.url),
  `window.CATBOX_CHAIN = ${JSON.stringify(
    {
      chainId: 56,
      chainName: "BNB Smart Chain",
      rpc: "https://bsc-dataseed.binance.org",
      explorer: "https://bscscan.com",
      lim: "0x1D6430FDFC63ea481fE157017B47530663C96001",
      infinity: {
        kind: "CL",
        currency0: "0x1D6430FDFC63ea481fE157017B47530663C96001",
        currency1: "0x55d398326f99059fF775485246999027B3197955",
        hooks: "0x0000000000000000000000000000000000000000",
        poolManager: "0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b",
        fee: 46184,
        tickSpacing: 1,
        parameters: "0x0000000000000000000000000000000000000000000000000000000000010000",
        payToken: "0x55d398326f99059fF775485246999027B3197955",
      },
      owner: "0x252B70B928B0cEF1326305cB6eb065852d0F76Eb",
      vault: "0x252B70B928B0cEF1326305cB6eb065852d0F76Eb",
      dead: "0x000000000000000000000000000000000000dEaD",
      ticket: "1",
      tickets: ["1", "3", "6", "10"],
      factory,
      salt,
      address,
      bytecode,
      abi,
    },
    null,
    2,
  )};\n`,
);
console.log("address", address);
console.log("salt", salt);
console.log("bytecode bytes", (bytecode.length - 2) / 2);

function readSol() {
  const { fileURLToPath } = require("node:url");
  const { dirname, join } = require("node:path");
  return readFileSync(join(dirname(fileURLToPath(import.meta.url)), "CatboxDash.sol"), "utf8");
}
