// Feature: ghostbag, Property 1: Position Loading Round-Trip
import { expect } from "chai";
import { ethers } from "hardhat";
import hre from "hardhat";
import fc from "fast-check";
import { Encryptable, FheTypes } from "@cofhe/sdk";

describe("GhostbagGuard - Property Tests", function () {
  /**
   * **Validates: Requirements 1.1**
   *
   * Property 1: Position Loading Round-Trip
   *
   * For any valid Asset_ID (0, 1, or 2) and for any uint64 amount value,
   * when the Owner calls loadPosition(assetId, encrypt(amount)), the stored
   * Treasury_Balance for that asset SHALL decrypt to the provided amount.
   */
  describe("Property 1: Position Loading Round-Trip", function () {
    it("should store and retrieve any valid assetId/amount combination", async function () {
      this.timeout(0); // Disable mocha timeout for property tests

      const [owner] = await ethers.getSigners();
      const Factory = await ethers.getContractFactory("GhostbagGuard");
      const client = await hre.cofhe.createClientWithBatteries(owner);

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 2 }),
          fc.bigInt({ min: 1n, max: 2n ** 64n - 1n }),
          async (assetId, amount) => {
            // Deploy a fresh contract for each iteration to avoid state leakage
            const contract = await Factory.deploy();
            await contract.waitForDeployment();

            // Encrypt the amount
            const encrypted = await client
              .encryptInputs([Encryptable.uint64(amount)])
              .execute();
            const encAmount = encrypted[0];

            // Load the position
            await contract.loadPosition(assetId, encAmount);

            // Read back the balance handle
            const balanceHandle = await contract.getBalance(assetId);

            // Verify the stored value matches the input
            await hre.cofhe.mocks.expectPlaintext(balanceHandle, amount);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
