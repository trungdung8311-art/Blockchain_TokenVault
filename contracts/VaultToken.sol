// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VaultToken
 * @notice ERC-20 Token chuẩn OpenZeppelin dùng để lưu trữ và thử nghiệm gửi/rút trong TokenVault.
 *         Tích hợp Faucet cho phép người dùng nhận token test miễn phí trên môi trường phát triển.
 */
contract VaultToken is ERC20, Ownable {
    uint256 public constant FAUCET_AMOUNT = 1_000 * 10 ** 18;
    uint256 public constant FAUCET_COOLDOWN = 30 seconds;

    mapping(address => uint256) public lastFaucetTime;

    event FaucetClaimed(address indexed recipient, uint256 amount, uint256 timestamp);

    error FaucetCooldownActive(uint256 timeRemaining);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        if (initialSupply_ > 0) {
            _mint(msg.sender, initialSupply_);
        }
    }

    /**
     * @notice Nhận 1,000 token miễn phí để thử nghiệm gửi/rút vào Vault.
     */
    function faucet() external {
        uint256 lastClaim = lastFaucetTime[msg.sender];
        if (lastClaim != 0 && block.timestamp < lastClaim + FAUCET_COOLDOWN) {
            revert FaucetCooldownActive((lastClaim + FAUCET_COOLDOWN) - block.timestamp);
        }

        lastFaucetTime[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);

        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT, block.timestamp);
    }

    /**
     * @notice Phát hành thêm token (chỉ Owner).
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
