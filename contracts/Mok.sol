//SPDX-License-Identifier: Unlicense
pragma solidity ~0.6.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Mok is ERC20 {
    address public owner;

    constructor() public ERC20("Fixed", "FIX") {
        owner = msg.sender;
        _mint(msg.sender, 10000 ether);
    }

    function mintself() public {
        _mint(msg.sender, 1000 ether);
    }

    function myBalance() public view returns (uint256) {
        return balanceOf(msg.sender);
    }
}
