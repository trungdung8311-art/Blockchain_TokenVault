const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer, user1] = await hre.ethers.getSigners();
  console.log("========================================");
  console.log("Deploying Token Vault System...");
  console.log("Deployer address:", deployer.address);
  console.log("========================================");

  const initialSupply = hre.ethers.parseEther("1000000");

  // 1. Deploy Vault Demo Token (VDT)
  const VaultToken = await hre.ethers.getContractFactory("VaultToken");
  const vdtToken = await VaultToken.deploy("Vault Demo Token", "VDT", initialSupply);
  await vdtToken.waitForDeployment();
  const vdtAddress = await vdtToken.getAddress();
  console.log("Vault Demo Token (VDT) deployed to:", vdtAddress);

  // 2. Deploy Vault USD Token (vUSD) - chứng minh hỗ trợ đa token
  const vusdToken = await VaultToken.deploy("Vault USD Stable", "vUSD", initialSupply);
  await vusdToken.waitForDeployment();
  const vusdAddress = await vusdToken.getAddress();
  console.log("Vault USD Stable (vUSD) deployed to:", vusdAddress);

  // 3. Deploy TokenVault
  const TokenVault = await hre.ethers.getContractFactory("TokenVault");
  const vault = await TokenVault.deploy();
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("TokenVault deployed to:", vaultAddress);

  // 4. Đăng ký các token vào Vault
  await (await vault.addSupportedToken(vdtAddress)).wait();
  await (await vault.addSupportedToken(vusdAddress)).wait();
  console.log("Added VDT and vUSD as supported tokens in TokenVault.");

  // 5. Gửi sẵn một lượng token cho tài khoản thứ 2 (nếu có) để tiện demo đa tài khoản
  if (user1) {
    const giftAmount = hre.ethers.parseEther("5000");
    await (await vdtToken.transfer(user1.address, giftAmount)).wait();
    await (await vusdToken.transfer(user1.address, giftAmount)).wait();
    console.log(`Transferred 5,000 VDT & 5,000 vUSD to demo user: ${user1.address}`);
  }

  // 6. Xuất ABI và địa chỉ hợp đồng cho Frontend (Web3.js)
  const vaultArtifact = await hre.artifacts.readArtifact("TokenVault");
  const tokenArtifact = await hre.artifacts.readArtifact("VaultToken");

  const network = await hre.ethers.provider.getNetwork();

  const deploymentData = {
    chainId: Number(network.chainId),
    networkName: hre.network.name,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      TokenVault: {
        address: vaultAddress,
        abi: vaultArtifact.abi,
      },
      tokens: [
        {
          name: "Vault Demo Token",
          symbol: "VDT",
          decimals: 18,
          address: vdtAddress,
          description: "Token tiện ích mẫu của hệ thống Token Vault",
        },
        {
          name: "Vault USD Stable",
          symbol: "vUSD",
          decimals: 18,
          address: vusdAddress,
          description: "Stablecoin mẫu dùng kiểm thử lưu trữ đa tài sản",
        },
      ],
      VaultTokenABI: tokenArtifact.abi,
    },
  };

  const outDir = path.join(__dirname, "..", "frontend", "src", "contracts");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "deployment.json");
  fs.writeFileSync(outPath, JSON.stringify(deploymentData, null, 2), "utf-8");

  console.log("Exported deployment config & ABIs to:", outPath);
  console.log("========================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
