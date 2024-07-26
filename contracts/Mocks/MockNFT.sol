// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockNFT is ERC721 {
    constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {}

    function safeMint(address to, uint256 _tokenId) external {
        _safeMint(to, _tokenId);
    }
}
