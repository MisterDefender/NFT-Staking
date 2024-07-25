const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
require("dotenv").config();

async function deployNFTStaking() {
  const [owner] = await ethers.getSigners();

  const REWARD_TOKEN = process.env.REWARD_TOKEN;
  if (!REWARD_TOKEN) {
    console.error("ERROR: REWARD_TOKEN not set in .env file");
    process.exit(1);
  }

  console.log(`CURRENT NETWORK FOR DEPLOYMENT: ${hre.network.name}`);
  console.log(
    "\n\n--------------------- DEPLOYMENT STARTED --------------------\n\n"
  );

  const nftStaking = await ethers.getContractFactory("NftStaking");
  const NFTStaking = await upgrades.deployProxy(
    nftStaking,
    [owner.address, REWARD_TOKEN],
    {
      initializer: "initialize(address, address)",
      kind: "uups",
    }
  );
  await NFTStaking.waitForDeployment();

  const proxyAddress = NFTStaking.target;
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(
    proxyAddress
  );

  console.log(`\nNFTStaking contract is deployed at : ${proxyAddress}\n`);
  console.log(`Implementation contract address: ${implementationAddress}\n`);

  writeDeploymentAddressesToFile(proxyAddress, implementationAddress);
}

function writeDeploymentAddressesToFile(proxyAddress, implementationAddress) {
  const data = {
    NFTStakingProxy: proxyAddress,
    NFTStakingImplementation: implementationAddress,
  };

  fs.writeFile(
    "deploymentAddresses.json",
    JSON.stringify(data, null, 2),
    (err) => {
      if (err) {
        console.error("Error writing to file", err);
      } else {
        console.log("Deployment addresses saved to deploymentAddresses.json");
      }
    }
  );
}

deployNFTStaking()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
