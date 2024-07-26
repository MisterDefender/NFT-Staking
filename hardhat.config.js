require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
require("hardhat-deploy");
require('@openzeppelin/hardhat-upgrades');
require('solidity-coverage')

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
  defaultNetwork: "hardhat",
  namedAccounts: {
    deployer: { default: 0 },
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: false,
    },
    arbSepolia: {
      accounts: [process.env.OWNER_PVT_KEY],
      url: `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_NODE_KEY}`,
      settings: {
        optimizer: { enabled: true, runs: 9999 },
      },
      gasPrice: "auto",
      saveDeployments: true,
      live: true,
      gasMultiplier: 2,
    },
    arbitrum: {
      accounts: [process.env.OWNER_PVT_KEY],
      url: `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_NODE_KEY}`,
      settings: {
        optimizer: { enabled: true, runs: 9999 },
      },
      gasPrice: "auto",
      saveDeployments: true,
      live: true,
      gasMultiplier: 2,
    },
  },
  etherscan: {
    apiKey: {
      arbitrumSepolia: process.env.ARBITRUM_API_KEY,
      arbitrumOne: process.env.ARBITRUM_API_KEY,
    },
  },

  sourcify: {
    enabled: true,
  },
};
