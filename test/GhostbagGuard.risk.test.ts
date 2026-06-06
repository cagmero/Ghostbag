import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import hre from "hardhat";
import { Encryptable, FheTypes } from "@cofhe/sdk";

describe("GhostbagGuard - Risk Computation, Health Factor, and Compliance Tier", function () {
  async function deployGhostbagFixture() {
    const [owner, nonOwner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("GhostbagGuard");
    const guard = await Factory.deploy();
    const guardAddress = await guard.getAddress();

    // Create a CoFHE client for encryption
    const client = await hre.cofhe.createClientWithBatteries(owner);

    return { guard, guardAddress, owner, nonOwner, client };
  }

  /**
   * Helper: loads positions for all three assets with known values.
   */
  async function loadPositions(
    guard: any,
    client: any,
    usdc: bigint,
    weth: bigint,
    defi: bigint
  ) {
    const encUsdc = await client
      .encryptInputs([Encryptable.uint64(usdc)])
      .execute();
    await guard.loadPosition(0, encUsdc[0]);

    const encWeth = await client
      .encryptInputs([Encryptable.uint64(weth)])
      .execute();
    await guard.loadPosition(1, encWeth[0]);

    const encDefi = await client
      .encryptInputs([Encryptable.uint64(defi)])
      .execute();
    await guard.loadPosition(2, encDefi[0]);
  }

  // ─── computeRisk Tests ────────────────────────────────────────────────

  describe("computeRisk", function () {
    it("should produce correct weighted sum with known inputs", async function () {
      const { guard, client } = await loadFixture(deployGhostbagFixture);

      // Load known positions
      const usdc = 100n;
      const weth = 200n;
      const defi = 50n;

      await loadPositions(guard, client, usdc, weth, defi);

      // Compute risk
      await guard.computeRisk();

      // Expected: 100*1000 + 200*5500 + 50*14000 = 100000 + 1100000 + 700000 = 1900000
      const expectedRisk = usdc * 1000n + weth * 5500n + defi * 14000n;

      const riskHandle = await guard.getRiskExposure();
      await hre.cofhe.mocks.expectPlaintext(riskHandle, expectedRisk);
    });

    it("should revert for non-owner", async function () {
      const { guard, nonOwner } = await loadFixture(deployGhostbagFixture);

      await expect(
        guard.connect(nonOwner).computeRisk()
      ).to.be.revertedWith("Only owner");
    });

    it("should emit RiskComputed event", async function () {
      const { guard, client } = await loadFixture(deployGhostbagFixture);

      await loadPositions(guard, client, 10n, 20n, 30n);

      await expect(guard.computeRisk()).to.emit(guard, "RiskComputed");
    });
  });

  // ─── computeHealthFactor Tests ────────────────────────────────────────

  describe("computeHealthFactor", function () {
    it("should produce correct value with known inputs", async function () {
      const { guard, client } = await loadFixture(deployGhostbagFixture);

      const usdc = 100n;
      const weth = 200n;
      const defi = 50n;

      await loadPositions(guard, client, usdc, weth, defi);
      await guard.computeRisk();
      await guard.computeHealthFactor();

      // Health factor = (totalBalance * 10000) / weightedRiskExposure
      // totalBalance = 100 + 200 + 50 = 350
      // weightedRiskExposure = 100*1000 + 200*5500 + 50*14000 = 1900000
      // healthFactor = (350 * 10000) / 1900000 = 3500000 / 1900000 = 1 (integer division)
      const totalBalance = usdc + weth + defi;
      const weightedRisk = usdc * 1000n + weth * 5500n + defi * 14000n;
      const expectedHealth = (totalBalance * 10000n) / weightedRisk;

      const healthHandle = await guard.getHealthFactor();
      await hre.cofhe.mocks.expectPlaintext(healthHandle, expectedHealth);
    });

    it("should return max uint64 when exposure is zero", async function () {
      const { guard, client } = await loadFixture(deployGhostbagFixture);

      // All balances are zero (default from constructor), so risk exposure is zero
      await guard.computeRisk();
      await guard.computeHealthFactor();

      const maxUint64 = 18446744073709551615n;
      const healthHandle = await guard.getHealthFactor();
      await hre.cofhe.mocks.expectPlaintext(healthHandle, maxUint64);
    });

    it("should revert before computeRisk is called", async function () {
      const { guard } = await loadFixture(deployGhostbagFixture);

      await expect(guard.computeHealthFactor()).to.be.revertedWith(
        "Risk not computed"
      );
    });

    it("should revert for non-owner", async function () {
      const { guard, nonOwner, client } = await loadFixture(
        deployGhostbagFixture
      );

      await guard.computeRisk();

      await expect(
        guard.connect(nonOwner).computeHealthFactor()
      ).to.be.revertedWith("Only owner");
    });

    it("should emit HealthFactorComputed event", async function () {
      const { guard, client } = await loadFixture(deployGhostbagFixture);

      await loadPositions(guard, client, 100n, 200n, 50n);
      await guard.computeRisk();

      await expect(guard.computeHealthFactor()).to.emit(
        guard,
        "HealthFactorComputed"
      );
    });
  });

  // ─── computeComplianceTier Tests ──────────────────────────────────────

  describe("computeComplianceTier", function () {
    it("should return 0 (Low) when exposure <= tierThresholdLow", async function () {
      const { guard, client } = await loadFixture(deployGhostbagFixture);

      // Need weightedRiskExposure <= 50000 (tierThresholdLow)
      // Use USDC only: balance * 1000 <= 50000 → balance <= 50
      // Let's use USDC=50, WETH=0, DEFI=0 → exposure = 50*1000 = 50000
      await loadPositions(guard, client, 50n, 0n, 0n);
      await guard.computeRisk();
      await guard.computeComplianceTier();

      const tierHandle = await guard.getComplianceTier();
      await hre.cofhe.mocks.expectPlaintext(tierHandle, 0n);
    });

    it("should return 1 (Medium) when between thresholds", async function () {
      const { guard, client } = await loadFixture(deployGhostbagFixture);

      // Need 50000 < weightedRiskExposure < 100000
      // Use USDC=60, WETH=0, DEFI=0 → exposure = 60*1000 = 60000
      await loadPositions(guard, client, 60n, 0n, 0n);
      await guard.computeRisk();
      await guard.computeComplianceTier();

      const tierHandle = await guard.getComplianceTier();
      await hre.cofhe.mocks.expectPlaintext(tierHandle, 1n);
    });

    it("should return 2 (High) when exposure >= tierThresholdHigh", async function () {
      const { guard, client } = await loadFixture(deployGhostbagFixture);

      // Need weightedRiskExposure >= 100000 (tierThresholdHigh)
      // Use USDC=100, WETH=0, DEFI=0 → exposure = 100*1000 = 100000
      await loadPositions(guard, client, 100n, 0n, 0n);
      await guard.computeRisk();
      await guard.computeComplianceTier();

      const tierHandle = await guard.getComplianceTier();
      await hre.cofhe.mocks.expectPlaintext(tierHandle, 2n);
    });

    it("should revert before computeRisk is called", async function () {
      const { guard } = await loadFixture(deployGhostbagFixture);

      await expect(guard.computeComplianceTier()).to.be.revertedWith(
        "Risk not computed"
      );
    });

    it("should revert for non-owner", async function () {
      const { guard, nonOwner } = await loadFixture(deployGhostbagFixture);

      await guard.computeRisk();

      await expect(
        guard.connect(nonOwner).computeComplianceTier()
      ).to.be.revertedWith("Only owner");
    });

    it("should emit ComplianceTierComputed event", async function () {
      const { guard, client } = await loadFixture(deployGhostbagFixture);

      await loadPositions(guard, client, 10n, 0n, 0n);
      await guard.computeRisk();

      await expect(guard.computeComplianceTier()).to.emit(
        guard,
        "ComplianceTierComputed"
      );
    });
  });
});
