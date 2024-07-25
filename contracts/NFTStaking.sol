// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "./Interfaces/INFTStaking.sol";

contract NftStaking is
    INftStaking,
    UUPSUpgradeable,
    IERC721Receiver,
    Ownable2StepUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    using SafeERC20 for IERC20;

    IERC20 public REWARDTOKEN;

    mapping(address => NFTPoolInfo) private _poolInfo;
    mapping(address => mapping(address => UserInfo)) private _userInfo;

    function initialize(address _admin, address _REWARDTOKEN) public override initializer {
        __Ownable_init(_admin);
        __ReentrancyGuard_init();
        __Pausable_init();
        REWARDTOKEN = IERC20(_REWARDTOKEN);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function addPool(
        address[] memory _pool,
        uint256[] memory _rewardPerBlock,
        uint256[] memory _unBondingPeriod,
        uint256[] memory _claimRewardBuffer
    ) external override onlyOwner {
        if (
            _pool.length != _rewardPerBlock.length || _rewardPerBlock.length != _unBondingPeriod.length
                || _unBondingPeriod.length != _claimRewardBuffer.length
        ) {
            revert UnmatchedPoolLength();
        }

        for (uint256 i; i < _pool.length; ++i) {
            if (_pool[i] == address(0)) revert ZeroPoolAddress();
            _poolInfo[_pool[i]].exist = true;
            _poolInfo[_pool[i]].rewardPerBlock = _rewardPerBlock[i];
            _poolInfo[_pool[i]].unbondingPeriod = _unBondingPeriod[i];
            _poolInfo[_pool[i]].claimRewardBuffer = _claimRewardBuffer[i];
        }

        emit LogPoolAddition(msg.sender, _pool);
    }

    function updateRewardPerBlock(address _poolAddress, uint256 _rewardAmountPerBlock) external onlyOwner {
        if (_poolAddress == address(0)) revert ZeroPoolAddress();
        if (!_poolInfo[_poolAddress].exist) revert PoolDoesNotExist();
        _poolInfo[_poolAddress].rewardPerBlock = _rewardAmountPerBlock;
        emit RewardPerBlockUpdated(_poolAddress, _rewardAmountPerBlock);
    }

    function deposit(address _pool, uint256 _tokenId) external whenNotPaused {
        if (!_poolInfo[_pool].exist) revert PoolDoesNotExist();
        address depositor = msg.sender;
        UserInfo memory _user = _userInfo[_pool][depositor];
        if (_user.tokenId != 0) revert UserAlreadyExists();

        _user.tokenId = _tokenId;
        _user.depositedAt = block.number;
        _userInfo[_pool][depositor] = _user;

        IERC721(_pool).safeTransferFrom(depositor, address(this), _tokenId);

        emit Deposit(_pool, depositor, _tokenId);
    }

    function requestWithdraw(address _pool) external nonReentrant {
        if (!_poolInfo[_pool].exist) revert PoolDoesNotExist();
        address withdrawer = msg.sender;

        UserInfo memory _user = _userInfo[_pool][withdrawer];
        if (_user.withdrawRequestedAt != 0) revert WithdrawalAlreadyRequested();

        _user.rewardDebt = _calculateRewardAccumulated(_user.depositedAt, _poolInfo[_pool].rewardPerBlock);
        _user.withdrawRequestedAt = block.number;
        _userInfo[_pool][withdrawer] = _user;

        emit WithdrawRequested(_pool, withdrawer, _user.tokenId);
    }

    function withdraw(address _pool) external nonReentrant {
        if (!_poolInfo[_pool].exist) revert PoolDoesNotExist();

        address withdrawer = msg.sender;
        UserInfo memory _user = _userInfo[_pool][withdrawer];
        if (_user.withdrawRequestedAt == 0) revert WithdrawalNotRequested();
        if (block.number < (_user.withdrawRequestedAt + _poolInfo[_pool].unbondingPeriod)) {
            revert UnbondingPeriodNotElapsed();
        }

        uint256 _tokenId = _user.tokenId;
        _user.tokenId = 0;
        _user.depositedAt = 0;
        _user.withdrawRequestedAt = 0;
        _user.withdrawAt = block.number;
        _userInfo[_pool][withdrawer] = _user;

        IERC721(_pool).transferFrom(address(this), msg.sender, _tokenId);

        emit Withdraw(_pool, withdrawer, _tokenId);
    }

    function claimRewards(address _pool, address _to) external nonReentrant {
        if (!_poolInfo[_pool].exist) revert PoolDoesNotExist();

        address rewardClaimer = msg.sender;
        UserInfo memory _user = _userInfo[_pool][rewardClaimer];
        if (_user.withdrawAt == 0) revert NFTNotWithdrawnYet();
        if (block.number <= _user.withdrawAt + _poolInfo[_pool].claimRewardBuffer) {
            revert ClaimBufferNotElapsed();
        }
        uint256 reward = _user.rewardDebt;
        if (reward == 0) revert ZeroRewardToWithdraw();

        _user.rewardDebt = 0;
        _user.withdrawAt = 0;
        _userInfo[_pool][rewardClaimer] = _user;

        REWARDTOKEN.safeTransfer(_to, reward);

        emit Claimed(_pool, rewardClaimer, _to, reward);
    }

    function isRewardWithdrawable(address _user, address _nftPool) external view returns (bool isWithdrawable) {
        UserInfo memory _userData = _userInfo[_nftPool][_user];
        if (_userData.withdrawAt == 0) revert NFTNotWithdrawnYet();
        if (block.number <= _userData.withdrawAt + _poolInfo[_nftPool].claimRewardBuffer) {
            isWithdrawable = false;
        }
        isWithdrawable = true;
    }

    function _calculateRewardAccumulated(uint256 _depositedAt, uint256 _perBlockReward)
        internal
        view
        returns (uint256 accumulatedRewards)
    {
        uint256 blockLapsed = block.number - _depositedAt;
        accumulatedRewards = blockLapsed * _perBlockReward;
        if (accumulatedRewards / blockLapsed != _perBlockReward) revert InvalidRewardAmount();
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function poolInfo(address nft) public view returns (NFTPoolInfo memory) {
        return _poolInfo[nft];
    }

    function userInfo(address pool, address user) public view returns (UserInfo memory) {
        return _userInfo[pool][user];
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
