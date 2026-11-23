// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface ITokenVault {
    function withdraw(address token, uint256 amount) external;
}

/**
 * @title ReentrantMaliciousToken
 * @notice Hợp đồng token giả lập dùng riêng cho kiểm thử tự động nhằm xác minh
 *         ReentrancyGuard trong TokenVault ngăn chặn thành công tấn công tái nhập.
 */
contract ReentrantMaliciousToken is ERC20 {
    ITokenVault public targetVault;
    bool public attackEnabled;
    uint256 public attackAmount;

    constructor() ERC20("Malicious Token", "MAL") {
        _mint(msg.sender, 100_000 * 10 ** 18);
    }

    function configureAttack(address vault_, uint256 amount_, bool enabled_) external {
        targetVault = ITokenVault(vault_);
        attackAmount = amount_;
        attackEnabled = enabled_;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        if (attackEnabled && msg.sender == address(targetVault)) {
            attackEnabled = false;
            targetVault.withdraw(address(this), attackAmount);
        }
        return super.transfer(to, value);
    }
}
