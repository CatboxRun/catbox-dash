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
const salt = id("LIMINAL.CATBOX.DASH.V6");
const address = getCreate2Address(factory, salt, keccak256(bytecode));

writeFileSync(new URL("./abi.json", import.meta.url), JSON.stringify(abi, null, 2));
writeFileSync(
  new URL("./v6.json", import.meta.url),
  JSON.stringify({ address, salt, bytecodeLength: (bytecode.length - 2) / 2, bytecode, abi }, null, 2),
);
console.log("V6 compiled locally — NOT written to config.js (Pages stays on V5)");
console.log("address", address);
console.log("salt", salt);
console.log("bytecode bytes", (bytecode.length - 2) / 2);

function readSol() {
  const { fileURLToPath } = require("node:url");
  const { dirname, join } = require("node:path");
  return readFileSync(join(dirname(fileURLToPath(import.meta.url)), "CatboxDash.sol"), "utf8");
}
