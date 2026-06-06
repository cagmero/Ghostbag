// Feature: ghostbag, Property 2: GhostPay Transfer Correctness
// Validates: Requirements 2.1, 2.3

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import hre from "hardhat";
import { Encryptable } from "@cofhe/sdk";
import * as fc from "fast-check";

describe("GhostbagGuard - Property 2: GhostPay Transfer Correctness (Branchless Select)", function () {
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
   * **Validates: Requirements 2.1, 2.3**
   *
   * Property 2: GhostPay Transfer Correctness (Branchless Select)
   *
   * For any Treasury_Balance B, for any transfer amount A, and for any recipient address R:
   * - If B >= A, then new balance = B - A and transfer amount = A
   * - If B < A, then new balance = B (unchanged) and transfer amount = 0
   */
  it("should correctly apply branchless select for all balance/amount combinations", async function () {
    this.timeout(0); // Disable timeout for property-based test

    await fc.assert(
      fc.asyncProperty(
        fc.bigInt({ min: 0n, max: 2n ** 64n - 1n }),
        fc.bigInt({ min: 0n, max: 2n ** 64n - 1n }),
        async (balance: bigint, amount: bigint) => {
          const { contract, recipient, client } = await loadFixture(deployGhostbagFixture);

          // Load position with the generated balance (assetId = 0 for USDC)
          const encBalance = await encryptUint64(client, balance);
          await contract.loadPosition(0, encBalance);

          // Generate a unique payment reference
          const paymentRef = ethers.keccak256(
            ethers.toUtf8Bytes(`pbt-${balance}-${amount}`)
          );

          // Execute ghostPay with the generated amount
          const encAmount = await encryptUint64(client, amount);
          await contract.ghostPay(encAmount, recipient.address, 0, paymentRef);

          // Verify correctness based on the branchless select logic
          const balanceHandle = await contract.getBalance(0);
          const transferHandle = await contract.getTransferHandle(
            recipient.address,
            paymentRef
          );

          if (balance >= amount) {
            // Sufficient funds: balance decreases, transfer = amount
            const expectedBalance = balance - amount;
            await hre.cofhe.mocks.expectPlaintext(balanceHandle, expectedBalance);
            await hre.cofhe.mocks.expectPlaintext(transferHandle, amount);
          } else {
            // Insufficient funds: balance unchanged, transfer = 0
            await hre.cofhe.mocks.expectPlaintext(balanceHandle, balance);
            await hre.cofhe.mocks.expectPlaintext(transferHandle, 0n);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
