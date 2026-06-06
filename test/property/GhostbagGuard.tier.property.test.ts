// Feature: ghostbag, Property 6: Compliance Tier Classification
// **Validates: Requirements 6.1, 6.4**

import { expect } from "chai";
import { ethers } from "hardhat";
import hre from "hardhat";
import { Encryptable, FheTypes } from "@cofhe/sdk";
import * as fc from "fast-check";

describe("GhostbagGuard - Property 6: Compliance Tier Classification", function () {
  /**
   * Property: For any Weighted_Risk_Exposure value WRE and fixed thresholds
   * (tierThresholdLow = 50000, tierThresholdHigh = 100000):
   * - If WRE <= 50000, the Compliance_Tier SHALL be 0 (Low Risk).
   * - If 50000 < WRE < 100000, the Compliance_Tier SHALL be 1 (Medium Risk).
   * - If WRE >= 100000, the Compliance_Tier SHALL be 2 (High Risk).
   *
   * Strategy: Generate a target WRE value in [0, 200000], then reverse-engineer
   * balances/weights that produce that WRE. Use only USDC (assetId 0) with
   * weight=1, so WRE = balance_USDC * 1. Set riskWeight_USDC to 1,
   * riskWeight_WETH to 0, riskWeight_DEFI to 0. Load USDC balance = targetWRE,
   * WETH/DEFI = 0. This gives weightedRiskExposure = targetWRE exactly.
   */
  it("compliance tier is correctly classified for any weighted risk exposure value", async function () {
    this.timeout(0); // Disable mocha timeout for property tests

    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("GhostbagGuard");
    const client = await hre.cofhe.createClientWithBatteries(owner);

    await fc.assert(
      fc.asyncProperty(
        fc.bigInt({ min: 0n, max: 200000n }),
        async (targetWRE) => {
          // Deploy fresh contract
          const guard = await Factory.deploy();
          await guard.waitForDeployment();

          // Set risk weights: USDC=1, WETH=0, DEFI=0
          // This means WRE = balance_USDC * 1 + balance_WETH * 0 + balance_DEFI * 0
          await guard.updateRiskWeight(0, 1);
          await guard.updateRiskWeight(1, 0);
          await guard.updateRiskWeight(2, 0);

          // Load USDC balance = targetWRE (WETH and DEFI stay at 0 from constructor)
          const encBalance = await client
            .encryptInputs([Encryptable.uint64(targetWRE)])
            .execute();
          await guard.loadPosition(0, encBalance[0]);

          // Compute risk (WRE will equal targetWRE)
          await guard.computeRisk();

          // Compute compliance tier
          await guard.computeComplianceTier();

          // Get the compliance tier handle and verify
          const tierHandle = await guard.getComplianceTier();

          // Determine expected tier based on thresholds
          let expectedTier: bigint;
          if (targetWRE <= 50000n) {
            expectedTier = 0n; // Low Risk
          } else if (targetWRE >= 100000n) {
            expectedTier = 2n; // High Risk
          } else {
            expectedTier = 1n; // Medium Risk
          }

          await hre.cofhe.mocks.expectPlaintext(tierHandle, expectedTier);
        }
      ),
      { numRuns: 100 }
    );
  });
});
