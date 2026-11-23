# Token Vault — Hệ Thống Lưu Trữ, Gửi & Rút Token An Toàn

Hệ thống DApp **Token Vault** xây dựng bằng **Solidity 0.8.24**, **OpenZeppelin Contracts v5**, **Hardhat** và **Web3.js v4** (React + Vite), cho phép người dùng lưu trữ, gửi (deposit) và rút (withdraw) các token ERC-20 an toàn với đầy đủ cơ chế phòng chống tấn công chuẩn DeFi.

---

## 1. Kiến Trúc & Công Nghệ Sử Dụng

- **Smart Contracts (`contracts/`)**:
  - `TokenVault.sol`: Hợp đồng kho lưu trữ đa token ERC-20 tích hợp bảo mật từ **OpenZeppelin**:
    - `ReentrancyGuard`: Chống tấn công tái nhập (Reentrancy Attack) với modifier `nonReentrant`.
    - `SafeERC20`: Chuyển token an toàn (`safeTransfer`, `safeTransferFrom`) với mọi biến thể ERC-20.
    - `Pausable`: Cơ chế ngắt mạch khẩn cấp (Circuit Breaker) cho phép Owner tạm dừng gửi/rút khi phát hiện rủi ro.
    - `Ownable`: Quản lý quyền quản trị (thêm/gỡ token, thiết lập hạn mức rút tối đa, tạm dừng).
    - **Checks-Effects-Interactions (CEI)** & **Balance-Delta Accounting**: Cập nhật trạng thái trước khi chuyển tiền và đo chính xác số dư thực nhận.
  - `VaultToken.sol`: Token ERC-20 mẫu (`VDT` và `vUSD`) tích hợp hàm `faucet()` để người dùng nhận miễn phí 1,000 token kiểm thử.
  - `test/ReentrantMaliciousToken.sol`: Token giả lập tấn công tái nhập dùng trong kiểm thử tự động.
- **Frontend (`frontend/`)**:
  - **Web3.js v4 (`web3`)** tương tác trực tiếp với Smart Contract (gọi view, gửi giao dịch `approve`, `deposit`, `withdraw`, `withdrawAll`, `faucet`, đọc sự kiện on-chain `getPastEvents`).
  - Hỗ trợ cả **MetaMask** lẫn **Hardhat Local Node** (chuyển đổi tài khoản Admin/User ngay trên giao diện để demo nhanh).

---

## 2. Hướng Dẫn Cài Đặt & Chạy Hệ Thống

### Bước 1: Cài đặt thư viện
```bash
npm install
npm --prefix frontend install
```

### Bước 2: Biên dịch Smart Contract & Chạy Kiểm Thử Bảo Mật
```bash
npm run compile
npm test
```

### Bước 3: Khởi động mạng Blockchain cục bộ (Terminal 1)
```bash
npm run node
```
*(Giữ nguyên cửa sổ terminal này đang chạy ở `http://127.0.0.1:8545`)*

### Bước 4: Triển khai Smart Contracts lên mạng cục bộ (Terminal 2)
```bash
npm run deploy:local
```
Lệnh này tự động triển khai `VaultToken` (`VDT`, `vUSD`), `TokenVault`, đăng ký token vào Vault và xuất file cấu hình ABI + địa chỉ vào `frontend/src/contracts/deployment.json`.

### Bước 5: Khởi động giao diện Web (Terminal 2)
```bash
npm run frontend:dev
```
Truy cập trình duyệt tại địa chỉ: `http://localhost:5173`

---

## 3. Hướng Dẫn Trải Nghiệm & Kiểm Thử Trên Web

1. **Kết nối ví**:
   - Nhấn **"Dùng thử nhanh (Hardhat Local Node)"** để kết nối trực tiếp tới node cục bộ (có thể chuyển đổi giữa `Admin #0` và `User #1..#4` trên thanh công cụ).
   - Hoặc nhấn **"Kết nối ví MetaMask"** (ứng dụng hỗ trợ tự động thêm mạng Hardhat Localhost Chain ID `31337`).
2. **Nhận Token Test (Faucet)**:
   - Chọn token `VDT` hoặc `vUSD` và nhấn **"Nhận +1,000 ... (Faucet)"**.
3. **Gửi Token vào Vault (Deposit)**:
   - Nhập số lượng hoặc bấm `25%`, `50%`, `75%`, `MAX`.
   - Thực hiện quy trình 2 bước an toàn chuẩn ERC-20: **Bước 1: Cấp quyền (Approve)** -> **Bước 2: Gửi vào Vault (Deposit)**.
4. **Rút Token từ Vault (Withdraw)**:
   - Chuyển sang tab **Rút Token**, nhập số lượng muốn rút hoặc nhấn **"Rút toàn bộ số dư"** (`withdrawAll`).
5. **Kiểm tra Lịch Sử & Quản Trị Bảo Mật**:
   - Xem bảng **Lịch Sử Giao Dịch On-Chain** đọc trực tiếp từ Events qua `Web3.js`.
   - Với tài khoản `Admin #0` (Owner), thử tính năng **Tạm dừng khẩn cấp (Pause)** hoặc **Đặt giới hạn rút tối đa** để thấy cơ chế bảo vệ hoạt động trực tiếp.
