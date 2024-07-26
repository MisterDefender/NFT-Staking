// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockRewardToken is ERC20 {
    address public owner;
    uint256 INITIAL_SUPPLY = 10000000000 * 1e18;

    constructor(address owner_) ERC20("RewardToken", "RWT") {
        owner = owner_;
        _mint(owner_, INITIAL_SUPPLY);
    }
}
