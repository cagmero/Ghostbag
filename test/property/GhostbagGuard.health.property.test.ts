// Feature: ghostbag, Property 5: Health Factor Computation
// **Validates: Requirements 5.1, 5.2**

import { expect } from "chai";
import { ethers } from "hardhat";
import hre from "hardhat";
import { Encryptable, FheTypes } from "@cofhe/sdk";
import * as fc from "fast-check";

describe("GhostbagGuard - Property 5: Health Factor Computation", function () {
  /**
   * Property: For any three Treasury_Balance values (b0, b1, b2) and any three
   * Risk_Weight values (w0, w1, w2) with non-zero weighted exposure, calling
   * computeHealthFactor() SHALL produce a Health_Factor handle that decrypts to
   * ((b0 + b1 + b2) * 10000) / (b0*w0 + b1*w1 + b2*w2) using integer division.
   *
   * When exposure is zero, the Health_Factor SHALL be max uint64 (2^64 - 1).
   */
  it("health factor equals ((b0+b1+b2) * 10000) / weightedRiskExposure for all valid inputs", async function () {
    await fc.assert(
      fc.asyncProperty(
        // Generate three balances (constrained to avoid overflow: totalBalance * 10000 must fit uint64)
        fc.bigInt({ min: 1n, max: 2n ** 28n }),
        fc.bigInt({ min: 1n, max: 2n ** 28n }),
        fc.bigInt({ min: 1n, max: 2n ** 28n }),
        // Generate three weights (min 1 to ensure non-zero exposure)
        fc.integer({ min: 1, max: 50000 }),
        fc.integer({ min: 1, max: 50000 }),
        fc.integer({ min: 1, max: 50000 }),
        async (b0, b1, b2, w0, w1, w2) => {
          // Pre-compute expected values
          const totalBalance = b0 + b1 + b2;
          const numerator = totalBalance * 10000n;
          const weightedRiskExposure =
            b0 * BigInt(w0) + b1 * BigInt(w1) + b2 * BigInt(w2);

          // Ensure numerator and dot product fit in uint64
          fc.pre(numerator < 2n ** 64n);
          fc.pre(weightedRiskExposure < 2n ** 64n);
          fc.pre(weightedRiskExposure > 0n);

          const expectedHealthFactor = numerator / weightedRiskExposure;

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

          // Compute risk first (required before health factor)
          await guard.computeRisk();

          // Compute health factor
          await guard.computeHealthFactor();

          // Verify result
          const healthHandle = await guard.getHealthFactor();
          await hre.cofhe.mocks.expectPlaintext(healthHandle, expectedHealthFactor);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("health factor returns max uint64 when weighted risk exposure is zero", async function () {
    const MAX_UINT64 = 18446744073709551615n;

    // Deploy fresh contract
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("GhostbagGuard");
    const guard = await Factory.deploy();

    // Create CoFHE client
    const client = await hre.cofhe.createClientWithBatteries(owner);

    // Load zero balances (all positions default to zero, but let's be explicit)
    const enc0 = await client
      .encryptInputs([Encryptable.uint64(0n)])
      .execute();
    await guard.loadPosition(0, enc0[0]);

    const enc1 = await client
      .encryptInputs([Encryptable.uint64(0n)])
      .execute();
    await guard.loadPosition(1, enc1[0]);

    const enc2 = await client
      .encryptInputs([Encryptable.uint64(0n)])
      .execute();
    await guard.loadPosition(2, enc2[0]);

    // Weights don't matter since all balances are zero — exposure will be zero
    // Use default weights (1000, 5500, 14000)

    // Compute risk (will be zero since all balances are zero)
    await guard.computeRisk();

    // Compute health factor — should return max uint64 sentinel
    await guard.computeHealthFactor();

    // Verify result is max uint64
    const healthHandle = await guard.getHealthFactor();
    await hre.cofhe.mocks.expectPlaintext(healthHandle, MAX_UINT64);
  });
});
