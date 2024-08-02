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
async function setupCustomStakingConfig() {
  const pools = [NFT1.target, NFT2.target, NFT3.target, NFT4.target];
  const rewardPerBlock = [100, 100, 100, 100];
  const bondingPeriodBN = [10, 20, 30, 40];
  const claimBufferBN = [50, 100, 150, 200];

  await rewardToken
    .connect(owner)
    .transfer(NFTStaking.target, ethers.parseEther("10000"));

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
  await NFT4.connect(Alice).safeMint(Alice.address, 4);
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
    let withdrawAt;
    let rewardBlocks;
    beforeEach(async function () {
      await setupStakingConfig();
      await NFT1.connect(Alice).approve(NFTStaking.target, 1);
      let tx = await NFTStaking.connect(Alice).deposit(NFT1.target, 1);
      depositedAt = tx.blockNumber;
      await mineBlocks(100);
      await NFTStaking.connect(Alice).requestWithdraw(NFT1.target);
      await mineBlocks(10); // Unbonding period
      let tx1 = await NFTStaking.connect(Alice).withdraw(NFT1.target);
      withdrawAt = tx1.blockNumber;
      rewardBlocks = withdrawAt - depositedAt;
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
    let withdrawAt;
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

      await NFTStaking.connect(Alice).requestWithdraw(NFT1.target);
      await mineBlocks(10); // Unbonding period
      let tx1 = await NFTStaking.connect(Alice).withdraw(NFT1.target);
      withdrawAt = tx1.blockNumber;
      rewardBlocks = withdrawAt - depositedAt;

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

describe("Custom NFTStaking test", function () {
  beforeEach("deploy the contracts", async () => {
    await setup();
    await mintNFTs();
  });

  describe("custom test", function () {
    beforeEach("setup for withdraw", async () => {
      await setupCustomStakingConfig();
      await NFT1.connect(Alice).approve(NFTStaking.target, 1);
      await NFT2.connect(Bob).approve(NFTStaking.target, 2);
      await NFT3.connect(Joy).approve(NFTStaking.target, 3);
      await NFT4.connect(Alice).approve(NFTStaking.target, 4);
    });
    it("Should check the rewards of users for custom logic", async function () {
      const poolInfo = await NFTStaking.poolInfo(NFT1.target);
      expect(poolInfo.exist).to.be.true;
      expect(poolInfo.rewardPerBlock).to.equal(100);
      expect(poolInfo.unbondingPeriod).to.equal(10);
      expect(poolInfo.claimRewardBuffer).to.equal(50);

      // ALice deposits initially with RPB = 100
      let totalBlockelapsed = 0;
      let RPBWhenAliceFirstDeposits = poolInfo.rewardPerBlock;

      let tx_0 = await NFTStaking.connect(Alice).deposit(NFT1.target, 1);
      const AliceFirstDepositBN = tx_0.blockNumber; // consider this as day-0
      console.log("Alice first deposits BN: ", AliceFirstDepositBN);
      let AliceFirstDepositElapsedBN;
      let AliceSecondDepositElapsedBN;
      let extraBN = 0; // Due to 2 times reward updates
      await mineBlocks(29); // so that new txn is added in 30th block

      // USER-B deposits
      let RPBWhenBobDeposit = poolInfo.rewardPerBlock;
      let tx_1 = await NFTStaking.connect(Bob).deposit(NFT2.target, 2);
      const bobDepositBN = tx_1.blockNumber;
      console.log("bob deposited at: ", bobDepositBN);
      console.log(
        "difference b/w Alice and bob deposits BN",
        bobDepositBN - AliceFirstDepositBN
      );
      let totalBeforeFirstRewardUpdate = bobDepositBN - AliceFirstDepositBN;
      totalBlockelapsed += totalBeforeFirstRewardUpdate;

      // Update the reward per block of all NFT first time
      await mineBlocks(29); // so that new txn is added in 61th block
      const NFT = [NFT1.target, NFT2.target, NFT3.target, NFT4.target];
      const newRPB1 = [600, 600, 600, 600];
      let txn = await NFTStaking.connect(owner).batchUpdateRewardPerBlock(
        NFT,
        newRPB1
      );
      let firstRewardUpdatedBN = txn.blockNumber;
      console.log("First reward BN: ", firstRewardUpdatedBN);
      totalBlockelapsed += firstRewardUpdatedBN - bobDepositBN;
      expect(firstRewardUpdatedBN - bobDepositBN).to.be.equal(30); // 30days
      console.log(
        "Total block elapsed till RPB is updated for first time: ",
        totalBlockelapsed
      );

      //Assertions
      const poolInfo1 = await NFTStaking.poolInfo(NFT1.target);
      const poolInfo2 = await NFTStaking.poolInfo(NFT2.target);
      const poolInfo3 = await NFTStaking.poolInfo(NFT3.target);
      const poolInfo4 = await NFTStaking.poolInfo(NFT4.target);
      expect(poolInfo1.rewardPerBlock).to.equal(600);
      expect(poolInfo2.rewardPerBlock).to.equal(600);
      expect(poolInfo3.rewardPerBlock).to.equal(600);
      expect(poolInfo4.rewardPerBlock).to.equal(600);

      let RPBWhenJoyDeposit = poolInfo3.rewardPerBlock;

      let tx_2 = await NFTStaking.connect(Joy).deposit(NFT3.target, 3);
      const joyDepositBN = tx_2.blockNumber;
      console.log("Joy deposited at: ", joyDepositBN);
      totalBlockelapsed += joyDepositBN - firstRewardUpdatedBN;
      extraBN += joyDepositBN - firstRewardUpdatedBN;
      console.log(
        "Total block elapsed till RPB is 600 and User C deposit: ",
        totalBlockelapsed
      );
      console.log("minable blocks: ", 180 - totalBlockelapsed);
      let minableBlocks = 180 - totalBlockelapsed;
      await mineBlocks(minableBlocks); // to reach to 181 days for reward update txn

      const newRPB2 = [1200, 1200, 1200, 1200];
      let txn1 = await NFTStaking.connect(owner).batchUpdateRewardPerBlock(
        NFT,
        newRPB2
      );
      let secondRewardUpdatedBN = txn1.blockNumber;
      console.log("Second reward BN: ", secondRewardUpdatedBN);
      totalBlockelapsed += minableBlocks;
      expect(totalBlockelapsed).to.be.equal(180); // 180 days
      console.log(
        "Total block elapsed till RPB is updated for second time: ",
        totalBlockelapsed
      );

      //Assertions
      const poolInfo1Re = await NFTStaking.poolInfo(NFT1.target);
      const poolInfo2Re = await NFTStaking.poolInfo(NFT2.target);
      const poolInfo3Re = await NFTStaking.poolInfo(NFT3.target);
      const poolInfo4Re = await NFTStaking.poolInfo(NFT4.target);
      expect(poolInfo1Re.rewardPerBlock).to.equal(1200);
      expect(poolInfo2Re.rewardPerBlock).to.equal(1200);
      expect(poolInfo3Re.rewardPerBlock).to.equal(1200);
      expect(poolInfo4Re.rewardPerBlock).to.equal(1200);

      let RPBWhenAliceSecondDeposits = poolInfo4Re.rewardPerBlock;

      let tx_3 = await NFTStaking.connect(Alice).deposit(NFT4.target, 4);
      const aliceReDepositBN = tx_3.blockNumber;
      console.log("Alice Re deposited another NFT at: ", aliceReDepositBN);
      extraBN += aliceReDepositBN - secondRewardUpdatedBN;
      let minableBlocksAgain = 360 - totalBlockelapsed;
      await mineBlocks(minableBlocksAgain); // to reach to 361 days for reward update txn
      let blockNumberAtLastDay = await ethers.provider.getBlockNumber();

      totalBlockelapsed += minableBlocksAgain;
      expect(totalBlockelapsed).to.be.equal(360); // 360 days
      console.log(
        "Total block elapsed till 360 days RPB is updated for second time: ",
        totalBlockelapsed
      );
      console.log(
        "Extra block lapesed due to 2 times reward updates: ",
        extraBN
      );

      console.log("blockNumberAtLastDay: ", blockNumberAtLastDay);
      AliceFirstDepositElapsedBN = blockNumberAtLastDay - AliceFirstDepositBN;
      AliceSecondDepositElapsedBN = blockNumberAtLastDay - aliceReDepositBN;
      let BobDepositElapsedBN = blockNumberAtLastDay - bobDepositBN;
      let JoyDepositElapsedBN = blockNumberAtLastDay - joyDepositBN;

      let aliceExpectedRewardForFirstDeposit =
        BigInt(AliceFirstDepositElapsedBN) * RPBWhenAliceFirstDeposits;
      let aliceExpectedRewardForSecondDeposit =
        BigInt(AliceSecondDepositElapsedBN) * RPBWhenAliceSecondDeposits;
      let bobExpectedReward = BigInt(BobDepositElapsedBN) * RPBWhenBobDeposit;
      let joyExpectedReward = BigInt(JoyDepositElapsedBN) * RPBWhenJoyDeposit;

      let AliceReward1 = await NFTStaking.getAccumulatedReward(
        Alice.address,
        NFT1.target
      );
      let AliceReward2 = await NFTStaking.getAccumulatedReward(
        Alice.address,
        NFT4.target
      );
      let BobReward = await NFTStaking.getAccumulatedReward(
        Bob.address,
        NFT2.target
      );
      let JoyReward = await NFTStaking.getAccumulatedReward(
        Joy.address,
        NFT3.target
      );
      const expectedTotalAliceReward =
        aliceExpectedRewardForFirstDeposit +
        aliceExpectedRewardForSecondDeposit;
      const totalAliceReward = AliceReward1 + AliceReward2;
      expect(expectedTotalAliceReward).to.be.equal(totalAliceReward);
      expect(bobExpectedReward).to.be.equal(BobReward);
      expect(joyExpectedReward).to.be.equal(JoyReward);

      console.log(
        "Alice (User-A) expected reward for first deposit: ",
        aliceExpectedRewardForFirstDeposit.toString()
      );
      console.log(
        "Alice (User-A) expected reward for second deposit: ",
        aliceExpectedRewardForSecondDeposit.toString()
      );
      console.log(
        "Alice (User-A) actual reward for first deposit :",
        AliceReward1.toString()
      );
      console.log(
        "Alice (User-A) actual reward for second deposit :",
        AliceReward2.toString()
      );
      console.log(
        "Alice (User-A) total reward accumulated :",
        totalAliceReward.toString()
      );
      console.log(
        "Bob (user-B) expected reward for deposit :",
        bobExpectedReward.toString()
      );
      console.log(
        "Bob (user-B) actual reward for deposit :",
        BobReward.toString()
      );
      console.log(
        "Joy (user-C) expected reward for deposit :",
        joyExpectedReward.toString()
      );
      console.log(
        "Joy (user-C) actual reward for deposit :",
        JoyReward.toString()
      );
    });
  });
});
