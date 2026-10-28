// Manual deployment (the backend also deploys automatically if no contract is found).
//   npx hardhat run scripts/deploy.js --network localhost   (or --network sepolia)
// Accounts: #0 admin/registrar, #1 ML oracle, #2 auditor.
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

async function main() {
  const [admin, oracle, auditor] = await ethers.getSigners();
  const ledger = await (await ethers.getContractFactory("AgriChainLedger")).deploy(
    admin.address,
    oracle?.address ?? admin.address,
    auditor?.address ?? admin.address,
  );
  await ledger.waitForDeployment();
  const address = await ledger.getAddress();
  const receipt = await ledger.deploymentTransaction().wait();
  const out = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        network: network.name,
        chainId: Number((await ethers.provider.getNetwork()).chainId),
        address,
        deployTx: receipt.hash,
        deployBlock: receipt.blockNumber,
        admin: admin.address,
        oracle: oracle?.address ?? admin.address,
        auditor: auditor?.address ?? admin.address,
      },
      null,
      2,
    ),
  );
  console.log(`AgriChainLedger deployed to ${address} on ${network.name} (block ${receipt.blockNumber})`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
