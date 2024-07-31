const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
require("dotenv").config();

async function upgradeNFTStaking() {
  const [owner] = await ethers.getSigners();

  console.log(`CURRENT NETWORK FOR UPGRADE: ${hre.network.name}`);
  console.log(
    "\n\n--------------------- UPGRADE STARTED --------------------\n\n"
  );
  const NFTStakingProxyAddress = "0xe841B5F4167a0E953d1351E6A513158320439469";
  const nftStakingV2 = await ethers.getContractFactory("NftStaking", owner);
  const NFTStaking2 = await upgrades.upgradeProxy(
    NFTStakingProxyAddress,
    nftStakingV2
  );
  await NFTStaking2.waitForDeployment();

  const newImplementationAddress =
    await upgrades.erc1967.getImplementationAddress(NFTStakingProxyAddress);

  console.log(
    `New Implementation contract address: ${newImplementationAddress}\n` //0x7F9BD0BE298Ce389E1449Dc172A53d20d9103DF2
  );
  ("\n\n--------------------- UPGRADE COMPLETED --------------------\n\n");
}

upgradeNFTStaking()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
