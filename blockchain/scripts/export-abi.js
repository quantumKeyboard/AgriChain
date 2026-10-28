// Copies the compiled ABI + bytecode to deployments/AgriChainLedger.json (committed),
// so the Python backend can deploy and call the contract without needing a compiler.
const fs = require("fs");
const path = require("path");
const artifact = require("../artifacts/contracts/AgriChainLedger.sol/AgriChainLedger.json");
const out = path.join(__dirname, "..", "deployments", "AgriChainLedger.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  JSON.stringify({ contractName: artifact.contractName, abi: artifact.abi, bytecode: artifact.bytecode }, null, 2),
);
console.log(`ABI + bytecode written to ${path.relative(process.cwd(), out)}`);
