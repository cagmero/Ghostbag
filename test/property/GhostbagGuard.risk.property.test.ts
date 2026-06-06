// Feature: ghostbag, Property 4: Risk Computation Dot Product
// **Validates: Requirements 4.1**

import { expect } from "chai";
import { ethers } from "hardhat";
import hre from "hardhat";
import { Encryptable, FheTypes } from "@cofhe/sdk";
import * as fc from "fast-check";

describe("GhostbagGuard - Property 4: Risk Computation Dot Product", function () {
  /**
   * Property: For any three Treasury_Balance values (b0, b1, b2) and any three
   * Risk_Weight values (w0, w1, w2), calling computeRisk() SHALL produce a
   * Weighted_Risk_Exposure handle that decrypts to (b0 × w0) + (b1 × w1) + (b2 × w2).
   *
   * We constrain balances and weights so that the dot product fits within uint64.
   */
  it("risk exposure equals dot product of balances and weights for all valid inputs", async function () {
    await fc.assert(
      fc.asyncProperty(
        // Generate three balances (constrained to avoid uint64 overflow in dot product)
        fc.bigInt({ min: 0n, max: 2n ** 32n - 1n }),
        fc.bigInt({ min: 0n, max: 2n ** 32n - 1n }),
        fc.bigInt({ min: 0n, max: 2n ** 32n - 1n }),
        // Generate three weights in basis points (realistic range)
        fc.integer({ min: 0, max: 50000 }),
        fc.integer({ min: 0, max: 50000 }),
        fc.integer({ min: 0, max: 50000 }),
        async (b0, b1, b2, w0, w1, w2) => {
          // Pre-filter: ensure dot product fits in uint64
          const dotProduct =
            b0 * BigInt(w0) + b1 * BigInt(w1) + b2 * BigInt(w2);
          fc.pre(dotProduct < 2n ** 64n);

          // Deploy fresh contract
          const [owner] = await ethers.getSigners();
          const Factory = await ethers.getContractFactory("GhostbagGuard");
          const guard = await Factory.deploy();

          // Create CoFHE client
          const client = await hre.cofhe.createClientWithBatteries(owner);

          // Load positions
          const enc0 = await client
            .encryptInputs([Encryptable.uint64(b0)])
            .execute();
          await guard.loadPosition(0, enc0[0]);

          const enc1 = await client
            .encryptInputs([Encryptable.uint64(b1)])
            .execute();
          await guard.loadPosition(1, enc1[0]);

          const enc2 = await client
            .encryptInputs([Encryptable.uint64(b2)])
            .execute();
          await guard.loadPosition(2, enc2[0]);

          // Update risk weights
          await guard.updateRiskWeight(0, w0);
          await guard.updateRiskWeight(1, w1);
          await guard.updateRiskWeight(2, w2);

          // Compute risk
          await guard.computeRisk();

          // Verify result
          const riskHandle = await guard.getRiskExposure();
          await hre.cofhe.mocks.expectPlaintext(riskHandle, dotProduct);
        }
      ),
      { numRuns: 100 }
    );
  });
});
