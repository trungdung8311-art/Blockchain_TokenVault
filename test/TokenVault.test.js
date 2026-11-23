const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TokenVault Security & Functional Tests", function () {
  let owner, alice, bob;
  let vdtToken, vusdToken, vault;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const USER_START_BALANCE = ethers.parseEther("10000");

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const VaultToken = await ethers.getContractFactory("VaultToken");
    vdtToken = await VaultToken.deploy("Vault Demo Token", "VDT", INITIAL_SUPPLY);
    await vdtToken.waitForDeployment();

    vusdToken = await VaultToken.deploy("Vault USD Stable", "vUSD", INITIAL_SUPPLY);
    await vusdToken.waitForDeployment();

    const TokenVault = await ethers.getContractFactory("TokenVault");
    vault = await TokenVault.deploy();
    await vault.waitForDeployment();

    await vault.addSupportedToken(await vdtToken.getAddress());
    await vault.addSupportedToken(await vusdToken.getAddress());

    await vdtToken.transfer(alice.address, USER_START_BALANCE);
    await vdtToken.transfer(bob.address, USER_START_BALANCE);
    await vusdToken.transfer(alice.address, USER_START_BALANCE);
  });

  describe("1. Quản lý Token & Phân quyền (Ownable)", function () {
    it("Thiết lập đúng Owner và danh sách token được hỗ trợ", async function () {
      expect(await vault.owner()).to.equal(owner.address);
      expect(await vault.isSupportedToken(await vdtToken.getAddress())).to.equal(true);
      expect(await vault.isSupportedToken(await vusdToken.getAddress())).to.equal(true);

      const list = await vault.getSupportedTokens();
      expect(list.length).to.equal(2);
    });

    it("Chặn người không phải Owner thêm/xóa token hoặc tạm dừng Vault", async function () {
      await expect(
        vault.connect(alice).addSupportedToken(alice.address)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");

      await expect(
        vault.connect(alice).pause()
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("Không cho phép thêm địa chỉ 0 hoặc thêm trùng token", async function () {
      await expect(
        vault.addSupportedToken(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(vault, "ZeroAddress");

      await expect(
        vault.addSupportedToken(await vdtToken.getAddress())
      ).to.be.revertedWithCustomError(vault, "TokenAlreadySupported");
    });
  });

  describe("2. Gửi Token (Deposit) an toàn", function () {
    it("Cho phép người dùng approve và gửi token vào Vault chính xác", async function () {
      const depositAmount = ethers.parseEther("500");
      const tokenAddr = await vdtToken.getAddress();
      const vaultAddr = await vault.getAddress();

      await vdtToken.connect(alice).approve(vaultAddr, depositAmount);

      await expect(vault.connect(alice).deposit(tokenAddr, depositAmount))
        .to.emit(vault, "Deposited");

      expect(await vault.balanceOf(alice.address, tokenAddr)).to.equal(depositAmount);
      expect(await vault.totalVaultBalances(tokenAddr)).to.equal(depositAmount);
      expect(await vdtToken.balanceOf(vaultAddr)).to.equal(depositAmount);
      expect(await vault.totalDepositTransactions()).to.equal(1);
    });

    it("Hỗ trợ lưu trữ độc lập giữa nhiều người dùng và nhiều token", async function () {
      const vaultAddr = await vault.getAddress();
      const vdtAddr = await vdtToken.getAddress();
      const vusdAddr = await vusdToken.getAddress();

      await vdtToken.connect(alice).approve(vaultAddr, ethers.parseEther("300"));
      await vault.connect(alice).deposit(vdtAddr, ethers.parseEther("300"));

      await vusdToken.connect(alice).approve(vaultAddr, ethers.parseEther("700"));
      await vault.connect(alice).deposit(vusdAddr, ethers.parseEther("700"));

      await vdtToken.connect(bob).approve(vaultAddr, ethers.parseEther("1200"));
      await vault.connect(bob).deposit(vdtAddr, ethers.parseEther("1200"));

      expect(await vault.balanceOf(alice.address, vdtAddr)).to.equal(ethers.parseEther("300"));
      expect(await vault.balanceOf(alice.address, vusdAddr)).to.equal(ethers.parseEther("700"));
      expect(await vault.balanceOf(bob.address, vdtAddr)).to.equal(ethers.parseEther("1200"));
      expect(await vault.totalVaultBalances(vdtAddr)).to.equal(ethers.parseEther("1500"));
    });

    it("Từ chối gửi số lượng 0 hoặc token không được hỗ trợ", async function () {
      const vdtAddr = await vdtToken.getAddress();

      await expect(
        vault.connect(alice).deposit(vdtAddr, 0)
      ).to.be.revertedWithCustomError(vault, "ZeroAmount");

      await expect(
        vault.connect(alice).deposit(bob.address, ethers.parseEther("10"))
      ).to.be.revertedWithCustomError(vault, "TokenNotSupported");
    });
  });

  describe("3. Rút Token (Withdraw & WithdrawAll) an toàn", function () {
    beforeEach(async function () {
      const vaultAddr = await vault.getAddress();
      const vdtAddr = await vdtToken.getAddress();
      await vdtToken.connect(alice).approve(vaultAddr, ethers.parseEther("1000"));
      await vault.connect(alice).deposit(vdtAddr, ethers.parseEther("1000"));
    });

    it("Cho phép rút một phần và cập nhật chính xác số dư", async function () {
      const vdtAddr = await vdtToken.getAddress();
      const withdrawAmount = ethers.parseEther("400");

      await expect(vault.connect(alice).withdraw(vdtAddr, withdrawAmount))
        .to.emit(vault, "Withdrawn");

      expect(await vault.balanceOf(alice.address, vdtAddr)).to.equal(ethers.parseEther("600"));
      expect(await vault.totalVaultBalances(vdtAddr)).to.equal(ethers.parseEther("600"));
      expect(await vdtToken.balanceOf(alice.address)).to.equal(ethers.parseEther("9400"));
    });

    it("Cho phép rút toàn bộ bằng withdrawAll()", async function () {
      const vdtAddr = await vdtToken.getAddress();

      await vault.connect(alice).withdrawAll(vdtAddr);

      expect(await vault.balanceOf(alice.address, vdtAddr)).to.equal(0);
      expect(await vault.totalVaultBalances(vdtAddr)).to.equal(0);
      expect(await vdtToken.balanceOf(alice.address)).to.equal(USER_START_BALANCE);
    });

    it("Chặn rút vượt số dư hiện có hoặc rút của người khác", async function () {
      const vdtAddr = await vdtToken.getAddress();

      await expect(
        vault.connect(alice).withdraw(vdtAddr, ethers.parseEther("1001"))
      ).to.be.revertedWithCustomError(vault, "InsufficientVaultBalance");

      await expect(
        vault.connect(bob).withdraw(vdtAddr, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(vault, "InsufficientVaultBalance");
    });

    it("Người dùng vẫn rút được tài sản kể cả khi token bị gỡ khỏi danh sách nạp mới", async function () {
      const vdtAddr = await vdtToken.getAddress();

      await vault.removeSupportedToken(vdtAddr);

      // Không thể nạp thêm
      await vdtToken.connect(alice).approve(await vault.getAddress(), ethers.parseEther("10"));
      await expect(
        vault.connect(alice).deposit(vdtAddr, ethers.parseEther("10"))
      ).to.be.revertedWithCustomError(vault, "TokenNotSupported");

      // Nhưng vẫn rút được tiền cũ an toàn
      await expect(vault.connect(alice).withdrawAll(vdtAddr)).to.emit(vault, "Withdrawn");
      expect(await vault.balanceOf(alice.address, vdtAddr)).to.equal(0);
    });
  });

  describe("4. Cơ chế Bảo mật Nâng cao (Pausable, Withdrawal Limit, ReentrancyGuard)", function () {
    it("Pausable: Ngăn gửi/rút khi tạm dừng khẩn cấp và hoạt động lại khi unpause", async function () {
      const vaultAddr = await vault.getAddress();
      const vdtAddr = await vdtToken.getAddress();

      await vdtToken.connect(alice).approve(vaultAddr, ethers.parseEther("200"));
      await vault.connect(alice).deposit(vdtAddr, ethers.parseEther("100"));

      await vault.pause();

      await expect(
        vault.connect(alice).deposit(vdtAddr, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");

      await expect(
        vault.connect(alice).withdraw(vdtAddr, ethers.parseEther("50"))
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");

      await vault.unpause();

      await expect(vault.connect(alice).withdraw(vdtAddr, ethers.parseEther("50"))).to.emit(
        vault,
        "Withdrawn"
      );
    });

    it("Withdrawal Limit: Chặn giao dịch rút vượt hạn mức cấu hình", async function () {
      const vaultAddr = await vault.getAddress();
      const vdtAddr = await vdtToken.getAddress();

      await vdtToken.connect(alice).approve(vaultAddr, ethers.parseEther("1000"));
      await vault.connect(alice).deposit(vdtAddr, ethers.parseEther("1000"));

      await vault.setWithdrawalLimit(vdtAddr, ethers.parseEther("250"));

      await expect(
        vault.connect(alice).withdraw(vdtAddr, ethers.parseEther("300"))
      ).to.be.revertedWithCustomError(vault, "ExceedsWithdrawalLimit");

      await expect(vault.connect(alice).withdraw(vdtAddr, ethers.parseEther("250"))).to.emit(
        vault,
        "Withdrawn"
      );
    });

    it("ReentrancyGuard: Chặn thành công tấn công tái nhập (Reentrancy Attack)", async function () {
      const MaliciousToken = await ethers.getContractFactory("ReentrantMaliciousToken");
      const malToken = await MaliciousToken.deploy();
      await malToken.waitForDeployment();

      const malAddr = await malToken.getAddress();
      const vaultAddr = await vault.getAddress();

      await vault.addSupportedToken(malAddr);
      await malToken.approve(vaultAddr, ethers.parseEther("1000"));
      await vault.deposit(malAddr, ethers.parseEther("1000"));

      // Kích hoạt kịch bản token gọi ngược lại vault.withdraw() trong hàm transfer()
      await malToken.configureAttack(vaultAddr, ethers.parseEther("100"), true);

      await expect(
        vault.withdraw(malAddr, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(vault, "ReentrancyGuardReentrantCall");
    });

    it("VaultToken Faucet: Cho phép người dùng nhận token test và áp dụng cooldown", async function () {
      const before = await vdtToken.balanceOf(bob.address);
      await vdtToken.connect(bob).faucet();
      const after = await vdtToken.balanceOf(bob.address);

      expect(after - before).to.equal(ethers.parseEther("1000"));

      await expect(vdtToken.connect(bob).faucet()).to.be.revertedWithCustomError(
        vdtToken,
        "FaucetCooldownActive"
      );
    });
  });
});
