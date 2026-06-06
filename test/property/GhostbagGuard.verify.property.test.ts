// Feature: ghostbag, Property 3: Recipient Verification Correctness
// Validates: Requirements 3.1

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import hre from "hardhat";
import { Encryptable } from "@cofhe/sdk";
import * as fc from "fast-check";

describe("GhostbagGuard - Property 3: Recipient Verification Correctness", function () {
  async function deployGhostbagFixture() {
    const [owner, recipient] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("GhostbagGuard");
    const contract = await Factory.deploy();

    const client = await hre.cofhe.createClientWithBatteries(owner);

    return { contract, owner, recipient, client };
  }

  async function encryptUint64(client: any, amount: bigint) {
    const encrypted = await client
      .encryptInputs([Encryptable.uint64(amount)])
      .execute();
    return encrypted[0];
  }

  /**
   * **Validates: Requirements 3.1**
   *
   * Property 3: Recipient Verification Correctness
   *
   * For any completed transfer with effective amount A stored for recipient R,
   * and for any threshold value T (uint64), calling verifyPayment(paymentRef, T)
   * from R SHALL produce a Verification_Handle that decrypts to true (1) when
   * A >= T, and false (0) when A < T.
   */
  it("should return true iff transferredAmount >= threshold", async function () {
    this.timeout(0); // Disable timeout for property-based test

    await fc.assert(
      fc.asyncProperty(
        // Generate transfer amount (uint64 range, but keep reasonable to avoid overflow)
        fc.bigInt({ min: 0n, max: 2n ** 64n - 1n }),
        // Generate threshold (uint64 range)
        fc.bigInt({ min: 0n, max: 2n ** 64n - 1n }),
        async (amount: bigint, threshold: bigint) => {
          const { contract, recipient, client } = await loadFixture(deployGhostbagFixture);

          // Use a balance large enough to cover the amount (ensures transfer succeeds)
          const balance = amount > 0n ? amount : 1n;

          // Load position with balance that covers the amount
          const encBalance = await encryptUint64(client, balance);
          await contract.loadPosition(0, encBalance);

          // Generate a unique payment reference
          const paymentRef = ethers.keccak256(
            ethers.toUtf8Bytes(`pbt-verify-${amount}-${threshold}`)
          );

          // Execute ghostPay with the generated amount
          const encAmount = await encryptUint64(client, amount);
          await contract.ghostPay(encAmount, recipient.address, 0, paymentRef);

          // Skip verification if amount is 0 (transfer stores encrypted zero,
          // which has a zero handle and verifyPayment would revert with "No transfer found")
          if (amount === 0n) {
            return; // trivially passes - no transfer to verify
          }

          // Recipient calls verifyPayment with threshold
          // First call as transaction to persist state
          const tx = await contract.connect(recipient).verifyPayment(paymentRef, threshold);
          await tx.wait();

          // Then staticCall to get the handle
          const resultHandle = await contract.connect(recipient).verifyPayment.staticCall(paymentRef, threshold);

          // Verify: result should be 1 (true) if amount >= threshold, 0 (false) otherwise
          if (amount >= threshold) {
            await hre.cofhe.mocks.expectPlaintext(resultHandle, 1n);
          } else {
            await hre.cofhe.mocks.expectPlaintext(resultHandle, 0n);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
