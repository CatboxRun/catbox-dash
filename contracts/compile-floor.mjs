/**
 * Compile CatboxFloor and patch config.js CREATE2 address.
 * Run: node contracts/compile-floor.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { keccak256, getCreate2Address, id } from "ethers";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const solc = require("solc");

const dir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(dir, "CatboxFloor.sol"), "utf8");
const input = {
  language: "Solidity",
  sources: { "CatboxFloor.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
if (out.errors?.some((e) => e.severity === "error")) {
  console.error(out.errors.filter((e) => e.severity === "error"));
  process.exit(1);
}
const art = out.contracts["CatboxFloor.sol"].CatboxFloor;
const abi = art.abi;
const bytecode = "0x" + art.evm.bytecode.object;
const factory = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const salt = id("LIMINAL.CATBOX.FLOOR.V2");
const address = getCreate2Address(factory, salt, keccak256(bytecode));
const floor = { address, salt, bytecode, abi };
writeFileSync(join(dir, "floor.json"), JSON.stringify(floor, null, 2));

const cfgPath = join(dir, "..", "config.js");
let src = readFileSync(cfgPath, "utf8");
const inner = JSON.stringify(floor, null, 2)
  .split("\n")
  .map((line, i) => (i === 0 ? line : "  " + line))
  .join("\n");
const block = `  "floor": ${inner},`;
const start = src.indexOf('\n  "floor":');
if (start >= 0) {
  const brace = src.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        if (src[end] === ",") end++;
        break;
      }
    }
  }
  src = src.slice(0, start + 1) + block + src.slice(end);
} else {
  src = src.replace('\n  "social":', "\n" + block + '\n  "social":');
}
writeFileSync(cfgPath, src);
console.log("address", address);
console.log("salt", salt);
console.log("bytecode bytes", (bytecode.length - 2) / 2);
