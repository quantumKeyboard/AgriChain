require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

const SOLC_VERSION = "0.8.28";

// Compile with the Solidity compiler bundled in the `solc` npm package instead of downloading
// it from binaries.soliditylang.org — works offline and on slow / filtered networks.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  if (args.solcVersion !== SOLC_VERSION) return runSuper();
  const solc = require("solc");
  return {
    compilerPath: require.resolve("solc/soljson.js"),
    isSolcJs: true,
    version: args.solcVersion,
    longVersion: solc.version().replace(/\.Emscripten.*$/, ""),
  };
});

const networks = {
  // In-process chain used by `npx hardhat test`.
  hardhat: { chainId: 31337 },
  // The local Ethereum node started with `npm run node` (what the app talks to).
  localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
};

// Optional public testnet: set SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY to deploy there.
if (process.env.SEPOLIA_RPC_URL && process.env.DEPLOYER_PRIVATE_KEY) {
  networks.sepolia = {
    url: process.env.SEPOLIA_RPC_URL,
    accounts: [process.env.DEPLOYER_PRIVATE_KEY],
    chainId: 11155111,
  };
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: SOLC_VERSION,
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
  },
  networks,
};
