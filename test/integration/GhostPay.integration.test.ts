import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import hre from "hardhat";
import { Encryptable, FheTypes } from "@cofhe/sdk";

describe("GhostPay Integration - Full Flow", function () {
  /**
   * Validates: Requirements 2.1, 2.3, 3.1, 10.1
   *
   * End-to-end flow:
   * 1. Deploy GhostbagGuard
   * 2. Owner encrypts and loads a position (10000 USDC)
   * 3. Owner encrypts an amount (3000) and calls ghostPay to a recipient
   * 4. Verify owner's remaining balance = 7000
   * 5. Verify transfer amount stored for recipient = 3000
   * 6. Recipient calls verifyPayment with threshold below amount (2000) → true
   * 7. Recipient calls verifyPayment with threshold above amount (5000) → false
   */

  async function deployGhostbagFixture() {
    const [owner, recipient] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("GhostbagGuard");
    const contract = await Factory.deploy();
    const contractAddress = await contract.getAddress();

    // Create a client for encryption (owner)
    const client = await hre.cofhe.createClientWithBatteries(owner);

    return { contract, owner, recipient, client, contractAddress };
  }

  async function encryptUint64(client: any, amount: bigint) {
    const encrypted = await client
      .encryptInputs([Encryptable.uint64(amount)])
      .execute();
    return encrypted[0];
  }

  it("should execute full GhostPay flow: encrypt → load → pay → verify", async function () {
    const { contract, owner, recipient, client } = await loadFixture(deployGhostbagFixture);

    const PAYMENT_REF = ethers.keccak256(ethers.toUtf8Bytes("invoice-integration-001"));

    // ─── Step 1: Owner encrypts and loads 10000 USDC (assetId = 0) ────────
    const encBalance = await encryptUint64(client, 10000n);
    await contract.loadPosition(0, encBalance);

    // Verify position was loaded correctly
    const initialBalanceHandle = await contract.getBalance(0);
    await hre.cofhe.mocks.expectPlaintext(initialBalanceHandle, 10000n);

    // ─── Step 2: Owner encrypts 3000 and calls ghostPay to recipient ──────
    const encPayAmount = await encryptUint64(client, 3000n);
    const payTx = await contract.ghostPay(encPayAmount, recipient.address, 0, PAYMENT_REF);
    await payTx.wait();

    // ─── Step 3: Verify owner's remaining balance = 7000 ──────────────────
    const remainingBalanceHandle = await contract.getBalance(0);
    await hre.cofhe.mocks.expectPlaintext(remainingBalanceHandle, 7000n);

    // ─── Step 4: Verify transfer amount stored for recipient = 3000 ───────
    const transferHandle = await contract.getTransferHandle(recipient.address, PAYMENT_REF);
    await hre.cofhe.mocks.expectPlaintext(transferHandle, 3000n);

    // ─── Step 5: Recipient verifies with threshold BELOW amount (2000) ────
    // 3000 >= 2000 → should be true (1)
    const verifyLowTx = await contract.connect(recipient).verifyPayment(PAYMENT_REF, 2000);
    await verifyLowTx.wait();

    const resultHandleLow = await contract
      .connect(recipient)
      .verifyPayment.staticCall(PAYMENT_REF, 2000);
    await hre.cofhe.mocks.expectPlaintext(resultHandleLow, 1n);

    // ─── Step 6: Recipient verifies with threshold ABOVE amount (5000) ────
    // 3000 >= 5000 → should be false (0)
    const verifyHighTx = await contract.connect(recipient).verifyPayment(PAYMENT_REF, 5000);
    await verifyHighTx.wait();

    const resultHandleHigh = await contract
      .connect(recipient)
      .verifyPayment.staticCall(PAYMENT_REF, 5000);
    await hre.cofhe.mocks.expectPlaintext(resultHandleHigh, 0n);
  });
});
