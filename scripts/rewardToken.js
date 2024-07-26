const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
require("dotenv").config();

async function deployRewardToken() {
  const [owner] = await ethers.getSigners();

  console.log(`CURRENT NETWORK FOR DEPLOYMENT: ${hre.network.name}`);
  console.log(
    "\n\n--------------------- DEPLOYMENT STARTED --------------------\n\n"
  );

  const RewardToken = await ethers.deployContract(
    "MockRewardToken",
    [owner.address],
    owner
  );
  await RewardToken.waitForDeployment();
  console.log("Mock reward token deployed at: ", RewardToken.target);
}

deployRewardToken()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
