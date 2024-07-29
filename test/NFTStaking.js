const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

let owner, Alice, Bob, Joy, nonOwner;
let NFT1, NFT2, NFT3, NFT4;
let rewardToken;
let NFTStaking;

async function setup() {
  [owner, Alice, Bob, Joy, nonOwner] = await ethers.getSigners();

  rewardToken = await ethers.deployContract("MockRewardToken", [owner.address]);
  NFT1 = await ethers.deployContract("MockNFT", ["MARVEL", "MVL"]);
  NFT2 = await ethers.deployContract("MockNFT", ["POKEMON", "POK"]);
  NFT3 = await ethers.deployContract("MockNFT", ["MERCEDES", "MER"]);
  NFT4 = await ethers.deployContract("MockNFT", ["NISSAN", "NIS"]);

  let nftStaking = await ethers.getContractFactory("NftStaking");
  NFTStaking = await upgrades.deployProxy(
    nftStaking,
    [owner.address, rewardToken.target],
    {
      initializer: "initialize(address, address)",
      kind: "uups",
    }
  );
}

async function setupStakingConfig() {
  const pools = [NFT1.target, NFT2.target, NFT3.target, NFT4.target];
  const rewardPerBlock = [100, 200, 300, 400];
  const bondingPeriodBN = [10, 20, 30, 40];
  const claimBufferBN = [50, 100, 150, 200];

  await rewardToken
    .connect(owner)
    .transfer(NFTStaking.target, ethers.parseEther("1000"));

  await NFTStaking.connect(owner).addPool(
    pools,
    rewardPerBlock,
    bondingPeriodBN,
    claimBufferBN
  );
}

async function mineBlocks(numberOfBlocks) {
  await helpers.mine(numberOfBlocks);
}

async function mintNFTs() {
  await NFT1.connect(Alice).safeMint(Alice.address, 1);
  await NFT2.connect(Bob).safeMint(Bob.address, 2);
  await NFT3.connect(Joy).safeMint(Joy.address, 3);
}

describe("NftStaking", function () {
  beforeEach("deploy the contracts", async () => {
    await setup();
    await mintNFTs();
  });

  describe("Initialization", function () {
    it("Should initialize with correct owner and reward token", async function () {
      expect(await NFTStaking.owner()).to.equal(owner.address);
      expect(await NFTStaking.REWARDTOKEN()).to.equal(rewardToken.target);
    });

    it("Should not allow re-initialization", async function () {
      await expect(
        NFTStaking.initialize(Alice.address, rewardToken.target)
      ).to.be.revertedWithCustomError(NFTStaking, "InvalidInitialization");
    });
  });

  describe("Pool Management", function () {
    it("Should add pools correctly", async function () {
      await setupStakingConfig();
      const poolInfo = await NFTStaking.poolInfo(NFT1.target);
      expect(poolInfo.exist).to.be.true;
      expect(poolInfo.rewardPerBlock).to.equal(100);
      expect(poolInfo.unbondingPeriod).to.equal(10);
      expect(poolInfo.claimRewardBuffer).to.equal(50);
    });

    it("Should fail to add pools with mismatched array lengths", async function () {
      const pools = [NFT1.target, NFT2.target];
      const rewardPerBlock = [100];
      const bondingPeriodBN = [10, 20];
      const claimBufferBN = [50, 100];

      await expect(
        NFTStaking.connect(owner).addPool(
          pools,
          rewardPerBlock,
          bondingPeriodBN,
          claimBufferBN
        )
      ).to.be.revertedWithCustomError(NFTStaking, "UnmatchedPoolLength");
    });

    it("Should fail to add pool with zero address", async function () {
      const pools = [ethers.ZeroAddress];
      const rewardPerBlock = [100];
      const bondingPeriodBN = [10];
      const claimBufferBN = [50];

      await expect(
        NFTStaking.connect(owner).addPool(
          pools,
          rewardPerBlock,
          bondingPeriodBN,
          claimBufferBN
        )
      ).to.be.revertedWithCustomError(NFTStaking, "ZeroPoolAddress");
    });

    it("Should update reward per block", async function () {
      await setupStakingConfig();
      await NFTStaking.connect(owner).updateRewardPerBlock(NFT1.target, 150);
      const poolInfo = await NFTStaking.poolInfo(NFT1.target);
      expect(poolInfo.rewardPerBlock).to.equal(150);
    });

    it("Should fail to update reward for non-existent pool", async function () {
      await expect(
        NFTStaking.connect(owner).updateRewardPerBlock(ethers.ZeroAddress, 150)
      ).to.be.revertedWithCustomError(NFTStaking, "ZeroPoolAddress");
    });

    it("Should fail to update reward if not owner", async function () {
      await setupStakingConfig();
      await expect(
        NFTStaking.connect(Alice).updateRewardPerBlock(NFT1.target, 150)
      )
        .to.be.revertedWithCustomError(NFTStaking, "OwnableUnauthorizedAccount")
        .withArgs(Alice.address);
    });
  });

  describe("Deposit", function () {
    beforeEach(async function () {
      await setupStakingConfig();
    });

    it("Should deposit NFT successfully", async function () {
      await NFT1.connect(Alice).approve(NFTStaking.target, 1);
      const tx = await NFTStaking.connect(Alice).deposit(NFT1.target, 1);
      await expect(tx)
        .to.emit(NFTStaking, "Deposit")
        .withArgs(NFT1.target, Alice.address, 1);

      const userInfo = await NFTStaking.userInfo(NFT1.target, Alice.address);
      expect(userInfo.tokenId).to.equal(1);
      expect(userInfo.depositedAt).to.equal(tx.blockNumber);
    });

    it("Should fail to deposit if pool doesn't exist", async function () {
      await NFT1.connect(Alice).approve(NFTStaking.target, 1);
      await expect(
        NFTStaking.connect(Alice).deposit(ethers.ZeroAddress, 1)
      ).to.be.revertedWithCustomError(NFTStaking, "PoolDoesNotExist");
    });

    it("Should fail to deposit if user already has a deposit", async function () {
      await NFT1.connect(Alice).approve(NFTStaking.target, 1);
      await NFTStaking.connect(Alice).deposit(NFT1.target, 1);
      await expect(
        NFTStaking.connect(Alice).deposit(NFT1.target, 1)
      ).to.be.revertedWithCustomError(NFTStaking, "UserAlreadyExists");
    });

    it("Should fail to deposit if NFT is not approved", async function () {
      await expect(NFTStaking.connect(Alice).deposit(NFT1.target, 1))
        .to.be.revertedWithCustomError(NFT1, "ERC721InsufficientApproval")
        .withArgs(NFTStaking.target, 1);
    });

    it("Should fail to deposit when paused", async function () {
      await NFTStaking.connect(owner).pause();
      await NFT1.connect(Alice).approve(NFTStaking.target, 1);
      await expect(
        NFTStaking.connect(Alice).deposit(NFT1.target, 1)
      ).to.be.revertedWithCustomError(NFTStaking, "EnforcedPause");
    });
  });

  describe("Withdraw Request", function () {
    beforeEach(async function () {
      await setupStakingConfig();
      await NFT1.connect(Alice).approve(NFTStaking.target, 1);
    });

    it("Should request withdrawal successfully", async function () {
      await NFTStaking.connect(Alice).deposit(NFT1.target, 1);
      const tx = await NFTStaking.connect(Alice).requestWithdraw(NFT1.target);
      await expect(tx)
        .to.emit(NFTStaking, "WithdrawRequested")
        .withArgs(NFT1.target, Alice.address, 1);

      const userInfo = await NFTStaking.userInfo(NFT1.target, Alice.address);
      expect(userInfo.withdrawRequestedAt).to.equal(tx.blockNumber);
    });

    it("Should fail to request withdrawal if pool doesn't exist", async function () {
      await NFTStaking.connect(Alice).deposit(NFT1.target, 1);
      await expect(
        NFTStaking.connect(Alice).requestWithdraw(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(NFTStaking, "PoolDoesNotExist");
    });

    it("Should fail to request withdrawal if already requested", async function () {
      await NFTStaking.connect(Alice).deposit(NFT1.target, 1);
      await NFTStaking.connect(Alice).requestWithdraw(NFT1.target);
      await expect(
        NFTStaking.connect(Alice).requestWithdraw(NFT1.target)
      ).to.be.revertedWithCustomError(NFTStaking, "WithdrawalAlreadyRequested");
    });

    it("Should fail to request withdrawal if deposit is not made", async function () {
      await expect(
        NFTStaking.connect(Alice).requestWithdraw(NFT1.target)
      ).to.be.revertedWithCustomError(NFTStaking, "DepositNotFound");
    });
  });

  describe("Withdraw", function () {
    beforeEach(async function () {
      await setupStakingConfig();
      await NFT1.connect(Alice).approve(NFTStaking.target, 1);
      await NFTStaking.connect(Alice).deposit(NFT1.target, 1);
      await NFTStaking.connect(Alice).requestWithdraw(NFT1.target);
    });

    it("Should withdraw NFT successfully after unbonding period", async function () {
      await mineBlocks(10); // Unbonding period
      const tx = await NFTStaking.connect(Alice).withdraw(NFT1.target);
      await expect(tx)
        .to.emit(NFTStaking, "Withdraw")
        .withArgs(NFT1.target, Alice.address, 1);

      expect(await NFT1.ownerOf(1)).to.equal(Alice.address);
    });

    it("Should fail to withdraw if pool doesn't exist", async function () {
      await expect(
        NFTStaking.connect(Alice).withdraw(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(NFTStaking, "PoolDoesNotExist");
    });

    it("Should fail to withdraw if withdrawal not requested", async function () {
      await NFT2.connect(Bob).approve(NFTStaking.target, 2);
      await NFTStaking.connect(Bob).deposit(NFT2.target, 2);
      await expect(
        NFTStaking.connect(Bob).withdraw(NFT1.target)
      ).to.be.revertedWithCustomError(NFTStaking, "WithdrawalNotRequested");
    });

    it("Should fail to withdraw before unbonding period", async function () {
      await expect(
        NFTStaking.connect(Alice).withdraw(NFT1.target)
      ).to.be.revertedWithCustomError(NFTStaking, "UnbondingPeriodNotElapsed");
    });
  });

  describe("Claim Rewards", function () {
    let depositedAt;
    let withdrawRequestedAt;
    let rewardBlocks;
    beforeEach(async function () {
      await setupStakingConfig();
      await NFT1.connect(Alice).approve(NFTStaking.target, 1);
      let tx = await NFTStaking.connect(Alice).deposit(NFT1.target, 1);
      depositedAt = tx.blockNumber;
      await mineBlocks(100);
      let tx1 = await NFTStaking.connect(Alice).requestWithdraw(NFT1.target);
      withdrawRequestedAt = tx1.blockNumber;
      rewardBlocks = withdrawRequestedAt - depositedAt;
      await mineBlocks(10); // Unbonding period
      await NFTStaking.connect(Alice).withdraw(NFT1.target);
    });

    it("Should claim rewards successfully after claim buffer", async function () {
      await mineBlocks(50); // Claim buffer
      const tx = await NFTStaking.connect(Alice).claimRewards(
        NFT1.target,
        Alice.address
      );
      let rewardAmount = rewardBlocks * 100; // 100 reward per block
      await expect(tx)
        .to.emit(NFTStaking, "Claimed")
        .withArgs(NFT1.target, Alice.address, Alice.address, rewardAmount);
      expect(await rewardToken.balanceOf(Alice.address)).to.equal(rewardAmount);
    });

    it("Should fail to claim rewards if pool doesn't exist", async function () {
      await expect(
        NFTStaking.connect(Alice).claimRewards(
          ethers.ZeroAddress,
          Alice.address
        )
      ).to.be.revertedWithCustomError(NFTStaking, "PoolDoesNotExist");
    });

    it("Should fail to claim rewards if NFT not withdrawn", async function () {
      await NFT2.connect(Bob).approve(NFTStaking.target, 2);
      await NFTStaking.connect(Bob).deposit(NFT2.target, 2);
      await expect(
        NFTStaking.connect(Bob).claimRewards(NFT2.target, Bob.address)
      ).to.be.revertedWithCustomError(NFTStaking, "NFTNotWithdrawnYet");
    });

    it("Should fail to claim rewards before claim buffer", async function () {
      await expect(
        NFTStaking.connect(Alice).claimRewards(NFT1.target, Alice.address)
      ).to.be.revertedWithCustomError(NFTStaking, "ClaimBufferNotElapsed");
    });

    it("Should fail to claim zero rewards", async function () {
      await mineBlocks(50); // Claim buffer
      await NFTStaking.connect(Alice).claimRewards(NFT1.target, Alice.address);
      await expect(
        NFTStaking.connect(Alice).claimRewards(NFT1.target, Alice.address)
      ).to.be.revertedWithCustomError(NFTStaking, "NFTNotWithdrawnYet");
    });
  });

  describe("Claim reward with correct APR", function () {
    let depositedAt;
    let withdrawRequestedAt;
    let rewardBlocks;

    beforeEach(async function () {
      await setupStakingConfig();
      await NFT1.connect(Alice).approve(NFTStaking.target, 1);
      let tx = await NFTStaking.connect(Alice).deposit(NFT1.target, 1);
      depositedAt = tx.blockNumber;
    });

    it("should claim reward with correct APR even if the reward per block is updated", async function () {
      let rewardPerBlockBeforeUpdate = (await NFTStaking.poolInfo(NFT1.target))
        .rewardPerBlock;
      expect(rewardPerBlockBeforeUpdate).to.be.equal(100);

      await NFTStaking.connect(owner).updateRewardPerBlock(NFT1.target, 150);
      const rewardPerBlockAfterUpdate = (await NFTStaking.poolInfo(NFT1.target))
        .rewardPerBlock;
      expect(rewardPerBlockAfterUpdate).to.equal(150);

      await mineBlocks(100);

      let tx1 = await NFTStaking.connect(Alice).requestWithdraw(NFT1.target);
      withdrawRequestedAt = tx1.blockNumber;
      rewardBlocks = withdrawRequestedAt - depositedAt;
      await mineBlocks(10); // Unbonding period
      await NFTStaking.connect(Alice).withdraw(NFT1.target);

      await mineBlocks(50); // Claim buffer
      const tx = await NFTStaking.connect(Alice).claimRewards(
        NFT1.target,
        Alice.address
      );
      let rewardAmount = BigInt(rewardBlocks) * rewardPerBlockBeforeUpdate; // 100 reward per block
      await expect(tx)
        .to.emit(NFTStaking, "Claimed")
        .withArgs(NFT1.target, Alice.address, Alice.address, rewardAmount);
      expect(await rewardToken.balanceOf(Alice.address)).to.equal(rewardAmount);
    });
  });

  describe("Pause and Unpause", function () {
    it("Should pause and unpause the contract", async function () {
      await NFTStaking.connect(owner).pause();
      expect(await NFTStaking.paused()).to.be.true;

      await NFTStaking.connect(owner).unpause();
      expect(await NFTStaking.paused()).to.be.false;
    });

    it("Should fail to pause if not owner", async function () {
      await expect(NFTStaking.connect(Alice).pause())
        .to.be.revertedWithCustomError(NFTStaking, "OwnableUnauthorizedAccount")
        .withArgs(Alice.address);
    });

    it("Should fail to unpause if not owner", async function () {
      await NFTStaking.connect(owner).pause();
      await expect(NFTStaking.connect(Alice).unpause())
        .to.be.revertedWithCustomError(NFTStaking, "OwnableUnauthorizedAccount")
        .withArgs(Alice.address);
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await setupStakingConfig();
      await NFT1.connect(Alice).approve(NFTStaking.target, 1);
      await NFTStaking.connect(Alice).deposit(NFT1.target, 1);
    });

    it("Should return correct pool info", async function () {
      const poolInfo = await NFTStaking.poolInfo(NFT1.target);
      expect(poolInfo.exist).to.be.true;
      expect(poolInfo.rewardPerBlock).to.equal(100);
      expect(poolInfo.unbondingPeriod).to.equal(10);
      expect(poolInfo.claimRewardBuffer).to.equal(50);
    });

    it("Should return correct user info", async function () {
      const userInfo = await NFTStaking.userInfo(NFT1.target, Alice.address);
      expect(userInfo.tokenId).to.equal(1);
      expect(userInfo.rewardDebt).to.equal(0);
      expect(userInfo.depositedAt).to.be.gt(0);
      expect(userInfo.withdrawRequestedAt).to.equal(0);
      expect(userInfo.withdrawAt).to.equal(0);
    });

    it("Should return false for isRewardWithdrawable when NFT not withdrawn", async function () {
      await expect(
        NFTStaking.isRewardWithdrawable(Alice.address, NFT1.target)
      ).to.be.revertedWithCustomError(NFTStaking, "NFTNotWithdrawnYet");
    });

    it("Should return correct isRewardWithdrawable status", async function () {
      // Request withdraw
      await NFTStaking.connect(Alice).requestWithdraw(NFT1.target);

      // Mine blocks for unbonding period
      await mineBlocks(10);

      // Withdraw
      await NFTStaking.connect(Alice).withdraw(NFT1.target);

      // Check isRewardWithdrawable before claim buffer
      expect(await NFTStaking.isRewardWithdrawable(Alice.address, NFT1.target))
        .to.be.false;

      // Mine blocks for claim buffer
      await mineBlocks(50);

      // Check isRewardWithdrawable after claim buffer
      expect(await NFTStaking.isRewardWithdrawable(Alice.address, NFT1.target))
        .to.be.true;
    });
  });
});
