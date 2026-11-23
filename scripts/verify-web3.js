const { Web3 } = require("web3");
const fs = require("fs");
const path = require("path");

async function main() {
  const deploymentPath = path.join(
    __dirname,
    "..",
    "frontend",
    "src",
    "contracts",
    "deployment.json"
  );
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));

  const web3 = new Web3("http://127.0.0.1:8545");
  const accounts = await web3.eth.getAccounts();
  const [owner, user1] = accounts;

  const vaultAddress = deployment.contracts.TokenVault.address;
  const vaultAbi = deployment.contracts.TokenVault.abi;
  const tokenAbi = deployment.contracts.VaultTokenABI;
  const vdtAddress = deployment.contracts.tokens[0].address;

  const vault = new web3.eth.Contract(vaultAbi, vaultAddress);
  const vdt = new web3.eth.Contract(tokenAbi, vdtAddress);

  console.log("1. Testing Web3.js v4 Faucet for user1...");
  await vdt.methods.faucet().send({ from: user1 });

  const depositAmt = web3.utils.toWei("250", "ether");
  console.log("2. Testing Web3.js v4 Approve + Deposit (250 VDT)...");
  await vdt.methods.approve(vaultAddress, depositAmt).send({ from: user1 });
  await vault.methods.deposit(vdtAddress, depositAmt).send({ from: user1 });

  const infoAfterDeposit = await vault.methods.getVaultInfo(user1, vdtAddress).call();
  if (BigInt(infoAfterDeposit.userBalance) !== BigInt(depositAmt)) {
    throw new Error("Deposit balance mismatch!");
  }
  console.log("   -> Verified userBalance:", web3.utils.fromWei(infoAfterDeposit.userBalance, "ether"), "VDT");

  const withdrawAmt = web3.utils.toWei("100", "ether");
  console.log("3. Testing Web3.js v4 Withdraw (100 VDT)...");
  await vault.methods.withdraw(vdtAddress, withdrawAmt).send({ from: user1 });

  const infoAfterWithdraw = await vault.methods.getVaultInfo(user1, vdtAddress).call();
  const expectedRemaining = web3.utils.toWei("150", "ether");
  if (BigInt(infoAfterWithdraw.userBalance) !== BigInt(expectedRemaining)) {
    throw new Error("Withdraw balance mismatch!");
  }
  console.log("   -> Verified remaining balance:", web3.utils.fromWei(infoAfterWithdraw.userBalance, "ether"), "VDT");

  console.log("4. Testing Web3.js v4 getPastEvents(Deposited & Withdrawn)...");
  const depositEvents = await vault.getPastEvents("Deposited", { fromBlock: 0, toBlock: "latest" });
  const withdrawEvents = await vault.getPastEvents("Withdrawn", { fromBlock: 0, toBlock: "latest" });
  if (depositEvents.length < 1 || withdrawEvents.length < 1) {
    throw new Error("Events not recorded properly!");
  }
  console.log(`   -> Found ${depositEvents.length} Deposited & ${withdrawEvents.length} Withdrawn events.`);

  console.log("5. Testing Web3.js v4 Admin Pause / Unpause...");
  await vault.methods.pause().send({ from: owner });
  const pausedInfo = await vault.methods.getVaultInfo(user1, vdtAddress).call();
  if (!pausedInfo.isPaused) throw new Error("Pause failed!");
  await vault.methods.unpause().send({ from: owner });

  console.log("6. Testing Web3.js v4 withdrawAll...");
  await vault.methods.withdrawAll(vdtAddress).send({ from: user1 });
  const finalInfo = await vault.methods.getVaultInfo(user1, vdtAddress).call();
  if (BigInt(finalInfo.userBalance) !== 0n) throw new Error("withdrawAll failed!");

  console.log("ALL WEB3.JS V4 END-TO-END CHECKS PASSED!");
}

main().catch((err) => {
  console.error("Web3.js verification failed:", err);
  process.exit(1);
});
