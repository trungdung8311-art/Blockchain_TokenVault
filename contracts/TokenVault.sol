// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TokenVault
 * @notice Kho lưu trữ Token ERC-20 an toàn, cho phép người dùng gửi (deposit) và rút (withdraw) token.
 * @dev Áp dụng các tiêu chuẩn bảo mật từ OpenZeppelin:
 *      - ReentrancyGuard: Chống tấn công tái nhập (Reentrancy Attack).
 *      - SafeERC20: Tương tác an toàn với mọi chuẩn token ERC-20.
 *      - Pausable: Cơ chế ngắt mạch khẩn cấp (Circuit Breaker) khi phát hiện sự cố.
 *      - Ownable: Phân quyền quản trị rõ ràng.
 *      - Checks-Effects-Interactions (CEI): Cập nhật số dư trước khi chuyển tài sản.
 *      - Balance-Delta Accounting: Ghi nhận chính xác số lượng thực nhận khi gửi.
 */
contract TokenVault is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    // Danh sách token được phép gửi vào Vault
    mapping(address => bool) public isSupportedToken;
    address[] private _supportedTokenList;

    // Số dư của từng người dùng theo từng token: user => token => amount
    mapping(address => mapping(address => uint256)) private _balances;

    // Tổng số lượng token đang khóa trong Vault (TVL): token => amount
    mapping(address => uint256) public totalVaultBalances;

    // Giới hạn rút tối đa mỗi giao dịch theo từng token (0 = không giới hạn)
    mapping(address => uint256) public maxWithdrawalLimit;

    // Thống kê số lượt giao dịch
    uint256 public totalDepositTransactions;
    uint256 public totalWithdrawTransactions;

    // ===================== EVENTS =====================
    event Deposited(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 newBalance,
        uint256 timestamp
    );

    event Withdrawn(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 remainingBalance,
        uint256 timestamp
    );

    event TokenAdded(address indexed token);
    event TokenRemoved(address indexed token);
    event WithdrawalLimitUpdated(address indexed token, uint256 newLimit);

    // ===================== CUSTOM ERRORS =====================
    error ZeroAddress();
    error ZeroAmount();
    error TokenNotSupported(address token);
    error TokenAlreadySupported(address token);
    error InsufficientVaultBalance(uint256 available, uint256 requested);
    error ExceedsWithdrawalLimit(uint256 limit, uint256 requested);

    constructor() Ownable(msg.sender) {}

    // ===================== CORE USER FUNCTIONS =====================

    /**
     * @notice Gửi token ERC-20 vào Vault. Yêu cầu người dùng đã gọi `approve()` trước đó.
     * @param token Địa chỉ hợp đồng token ERC-20.
     * @param amount Số lượng token muốn gửi (đơn vị wei).
     */
    function deposit(address token, uint256 amount) external nonReentrant whenNotPaused {
        if (token == address(0)) revert ZeroAddress();
        if (!isSupportedToken[token]) revert TokenNotSupported(token);
        if (amount == 0) revert ZeroAmount();

        IERC20 erc20 = IERC20(token);

        // Đo số dư thực nhận để an toàn với cả token có phí giao dịch (fee-on-transfer)
        uint256 balanceBefore = erc20.balanceOf(address(this));
        erc20.safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = erc20.balanceOf(address(this));

        uint256 actualReceived = balanceAfter - balanceBefore;
        if (actualReceived == 0) revert ZeroAmount();

        // Effects
        _balances[msg.sender][token] += actualReceived;
        totalVaultBalances[token] += actualReceived;
        totalDepositTransactions += 1;

        emit Deposited(
            msg.sender,
            token,
            actualReceived,
            _balances[msg.sender][token],
            block.timestamp
        );
    }

    /**
     * @notice Rút một lượng token cụ thể từ Vault về ví cá nhân.
     * @dev Người dùng luôn có quyền rút tài sản đã gửi ngay cả khi token bị ngừng hỗ trợ gửi mới.
     * @param token Địa chỉ hợp đồng token ERC-20.
     * @param amount Số lượng token muốn rút (đơn vị wei).
     */
    function withdraw(address token, uint256 amount) external nonReentrant whenNotPaused {
        _executeWithdraw(msg.sender, token, amount);
    }

    /**
     * @notice Rút toàn bộ số dư của một loại token từ Vault về ví cá nhân.
     * @param token Địa chỉ hợp đồng token ERC-20.
     */
    function withdrawAll(address token) external nonReentrant whenNotPaused {
        uint256 fullBalance = _balances[msg.sender][token];
        _executeWithdraw(msg.sender, token, fullBalance);
    }

    /**
     * @dev Nội bộ xử lý rút token tuân thủ chặt chẽ mẫu Checks-Effects-Interactions (CEI).
     */
    function _executeWithdraw(address user, address token, uint256 amount) internal {
        // 1. Checks
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 currentBalance = _balances[user][token];
        if (currentBalance < amount) {
            revert InsufficientVaultBalance(currentBalance, amount);
        }

        uint256 limit = maxWithdrawalLimit[token];
        if (limit > 0 && amount > limit) {
            revert ExceedsWithdrawalLimit(limit, amount);
        }

        // 2. Effects (Cập nhật trạng thái TRƯỚC khi chuyển token)
        uint256 remainingBalance = currentBalance - amount;
        _balances[user][token] = remainingBalance;
        totalVaultBalances[token] -= amount;
        totalWithdrawTransactions += 1;

        // 3. Interactions
        IERC20(token).safeTransfer(user, amount);

        emit Withdrawn(user, token, amount, remainingBalance, block.timestamp);
    }

    // ===================== ADMIN / SECURITY FUNCTIONS =====================

    /**
     * @notice Thêm token ERC-20 vào danh sách được phép lưu trữ trong Vault.
     */
    function addSupportedToken(address token) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (isSupportedToken[token]) revert TokenAlreadySupported(token);

        isSupportedToken[token] = true;

        bool alreadyInList = false;
        for (uint256 i = 0; i < _supportedTokenList.length; i++) {
            if (_supportedTokenList[i] == token) {
                alreadyInList = true;
                break;
            }
        }
        if (!alreadyInList) {
            _supportedTokenList.push(token);
        }

        emit TokenAdded(token);
    }

    /**
     * @notice Ngừng hỗ trợ gửi mới cho một token (người dùng cũ vẫn rút được bình thường).
     */
    function removeSupportedToken(address token) external onlyOwner {
        if (!isSupportedToken[token]) revert TokenNotSupported(token);

        isSupportedToken[token] = false;
        emit TokenRemoved(token);
    }

    /**
     * @notice Thiết lập giới hạn rút tối đa cho mỗi giao dịch (đặt 0 để bỏ giới hạn).
     */
    function setWithdrawalLimit(address token, uint256 limit) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        maxWithdrawalLimit[token] = limit;
        emit WithdrawalLimitUpdated(token, limit);
    }

    /**
     * @notice Tạm dừng khẩn cấp toàn bộ hoạt động gửi/rút của Vault.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Mở lại hoạt động gửi/rút của Vault sau khi xử lý sự cố.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ===================== VIEW FUNCTIONS =====================

    /**
     * @notice Kiểm tra số dư token của một người dùng trong Vault.
     */
    function balanceOf(address user, address token) external view returns (uint256) {
        return _balances[user][token];
    }

    /**
     * @notice Lấy danh sách địa chỉ tất cả token từng được đăng ký với Vault.
     */
    function getSupportedTokens() external view returns (address[] memory) {
        return _supportedTokenList;
    }

    /**
     * @notice Truy vấn tổng hợp thông tin Vault cho một người dùng và một token (tối ưu RPC calls).
     */
    function getVaultInfo(
        address user,
        address token
    )
        external
        view
        returns (
            uint256 userBalance,
            uint256 totalLocked,
            uint256 withdrawalLimit,
            bool supported,
            bool isPaused
        )
    {
        return (
            _balances[user][token],
            totalVaultBalances[token],
            maxWithdrawalLimit[token],
            isSupportedToken[token],
            paused()
        );
    }
}
