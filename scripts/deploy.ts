import { ethers, run, network } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying GhostbagGuard with account:", deployer.address);
  console.log("Network:", network.name);

  // Deploy CoFHE mocks if running on the local hardhat network
  if (network.name === "hardhat" || network.name === "localhost") {
    console.log("Deploying CoFHE mock contracts...");
    await run("task:cofhe-mocks:deploy");
  }

  const Factory = await ethers.getContractFactory("GhostbagGuard");
  const guard = await Factory.deploy();
  await guard.waitForDeployment();

  const address = await guard.getAddress();
  console.log("");
  console.log("═══════════════════════════════════════════════════");
  console.log("  GhostbagGuard deployed to:", address);
  console.log("═══════════════════════════════════════════════════");
  console.log("");

  // Verify on Etherscan if not on local network
  if (network.name === "sepolia" && process.env.ETHERSCAN_API_KEY) {
    console.log("Waiting for block confirmations before verification...");
    // Wait for 5 block confirmations so Etherscan can index the contract
    const deployTx = guard.deploymentTransaction();
    if (deployTx) {
      await deployTx.wait(5);
    }

    console.log("Verifying contract on Etherscan...");
    try {
      await run("verify:verify", {
        address: address,
        constructorArguments: [],
      });
      console.log("✓ Contract verified on Etherscan!");
      console.log(`  https://sepolia.etherscan.io/address/${address}#code`);
    } catch (error: any) {
      if (error.message.includes("Already Verified")) {
        console.log("✓ Contract is already verified on Etherscan.");
      } else {
        console.error("✗ Etherscan verification failed:", error.message);
        console.log("  You can verify manually with:");
        console.log(`  npx hardhat verify --network sepolia ${address}`);
      }
    }
  } else if (network.name === "sepolia") {
    console.log("⚠ ETHERSCAN_API_KEY not set — skipping verification.");
    console.log("  To verify later:");
    console.log(`  npx hardhat verify --network sepolia ${address}`);
  }

  console.log("");
  console.log("Next steps:");
  console.log(`  1. Update frontend/lib/contracts.ts GHOSTBAG_GUARD_ADDRESS to "${address}"`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
