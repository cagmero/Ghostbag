import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { Encryptable } from "@cofhe/sdk";

describe("GhostbagGuard - Auditor Access & Public Reveals", function () {
  async function deployGhostbagFixture() {
    const [owner, auditor, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("GhostbagGuard");
    const guard = await Factory.deploy();
    return { guard, owner, auditor, other };
  }

  async function deployWithPositionsAndRiskFixture() {
    const [owner, auditor, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("GhostbagGuard");
    const guard = await Factory.deploy();

    // Create client for encryption
    const client = await hre.cofhe.createClientWithBatteries(owner);

    // Load positions: USDC=1000, WETH=500, DEFI=200
    const [encUSDC] = await client.encryptInputs([Encryptable.uint64(1000n)]).execute();
    const [encWETH] = await client.encryptInputs([Encryptable.uint64(500n)]).execute();
    const [encDEFI] = await client.encryptInputs([Encryptable.uint64(200n)]).execute();

    await guard.loadPosition(0, encUSDC);
    await guard.loadPosition(1, encWETH);
    await guard.loadPosition(2, encDEFI);

    // Compute risk metrics
    await guard.computeRisk();
    await guard.computeComplianceTier();

    return { guard, owner, auditor, other, client };
  }

  describe("grantAuditorAccess", function () {
    it("should set auditor address and emit AuditorAccessGranted", async function () {
      const { guard, owner, auditor } = await loadFixture(deployGhostbagFixture);

      await expect(guard.grantAuditorAccess(auditor.address))
        .to.emit(guard, "AuditorAccessGranted")
        .withArgs(auditor.address);

      expect(await guard.auditor()).to.equal(auditor.address);
    });

    it("should revert when called by non-owner", async function () {
      const { guard, auditor, other } = await loadFixture(deployGhostbagFixture);

      await expect(
        guard.connect(other).grantAuditorAccess(auditor.address)
      ).to.be.revertedWith("Only owner");
    });
  });

  describe("Auditor ACL Isolation", function () {
    it("auditor can access riskExposure and complianceTier after grant", async function () {
      const { guard, owner, auditor } = await loadFixture(deployWithPositionsAndRiskFixture);

      // Grant auditor access
      await guard.grantAuditorAccess(auditor.address);

      // Get the ACL mock to verify permissions
      const mockACL = await hre.cofhe.mocks.getMockACL();

      // Get handles
      const riskHandle = await guard.getRiskExposure();
      const tierHandle = await guard.getComplianceTier();

      // Verify auditor is allowed to decrypt riskExposure and complianceTier
      const riskAllowed = await mockACL.isAllowed(riskHandle, auditor.address);
      const tierAllowed = await mockACL.isAllowed(tierHandle, auditor.address);

      expect(riskAllowed).to.be.true;
      expect(tierAllowed).to.be.true;
    });

    it("auditor cannot access individual balance handles (ACL isolation)", async function () {
      const { guard, owner, auditor } = await loadFixture(deployWithPositionsAndRiskFixture);

      // Grant auditor access
      await guard.grantAuditorAccess(auditor.address);

      // Get the ACL mock to verify permissions
      const mockACL = await hre.cofhe.mocks.getMockACL();

      // Get balance handles
      const balUSDC = await guard.getBalance(0);
      const balWETH = await guard.getBalance(1);
      const balDEFI = await guard.getBalance(2);

      // Verify auditor is NOT allowed to decrypt individual balances
      const usdcAllowed = await mockACL.isAllowed(balUSDC, auditor.address);
      const wethAllowed = await mockACL.isAllowed(balWETH, auditor.address);
      const defiAllowed = await mockACL.isAllowed(balDEFI, auditor.address);

      expect(usdcAllowed).to.be.false;
      expect(wethAllowed).to.be.false;
      expect(defiAllowed).to.be.false;
    });

    it("auditor retains access to updated handles after recompute", async function () {
      const { guard, owner, auditor, client } = await loadFixture(deployWithPositionsAndRiskFixture);

      // Grant auditor access
      await guard.grantAuditorAccess(auditor.address);

      // Load a new position to change balances
      const [encNewUSDC] = await client.encryptInputs([Encryptable.uint64(5000n)]).execute();
      await guard.loadPosition(0, encNewUSDC);

      // Recompute risk and compliance tier (creates NEW handles)
      await guard.computeRisk();
      await guard.computeComplianceTier();

      // Get the ACL mock to verify permissions
      const mockACL = await hre.cofhe.mocks.getMockACL();

      // Get NEW handles after recompute
      const newRiskHandle = await guard.getRiskExposure();
      const newTierHandle = await guard.getComplianceTier();

      // Verify auditor still has access to the new handles
      const riskAllowed = await mockACL.isAllowed(newRiskHandle, auditor.address);
      const tierAllowed = await mockACL.isAllowed(newTierHandle, auditor.address);

      expect(riskAllowed).to.be.true;
      expect(tierAllowed).to.be.true;
    });
  });

  describe("updateRiskWeight", function () {
    it("should update risk weight and emit RiskWeightUpdated", async function () {
      const { guard, owner } = await loadFixture(deployGhostbagFixture);

      await expect(guard.updateRiskWeight(0, 2000))
        .to.emit(guard, "RiskWeightUpdated")
        .withArgs(0, 2000);

      expect(await guard.riskWeight_USDC()).to.equal(2000);
    });

    it("should update WETH risk weight correctly", async function () {
      const { guard, owner } = await loadFixture(deployGhostbagFixture);

      await expect(guard.updateRiskWeight(1, 7000))
        .to.emit(guard, "RiskWeightUpdated")
        .withArgs(1, 7000);

      expect(await guard.riskWeight_WETH()).to.equal(7000);
    });

    it("should update DEFI risk weight correctly", async function () {
      const { guard, owner } = await loadFixture(deployGhostbagFixture);

      await expect(guard.updateRiskWeight(2, 20000))
        .to.emit(guard, "RiskWeightUpdated")
        .withArgs(2, 20000);

      expect(await guard.riskWeight_DEFI()).to.equal(20000);
    });

    it("should revert when called by non-owner", async function () {
      const { guard, other } = await loadFixture(deployGhostbagFixture);

      await expect(
        guard.connect(other).updateRiskWeight(0, 2000)
      ).to.be.revertedWith("Only owner");
    });

    it("should revert for invalid assetId", async function () {
      const { guard, owner } = await loadFixture(deployGhostbagFixture);

      await expect(
        guard.updateRiskWeight(3, 2000)
      ).to.be.revertedWith("Invalid asset");

      await expect(
        guard.updateRiskWeight(255, 2000)
      ).to.be.revertedWith("Invalid asset");
    });
  });

  describe("allowPublicReveal", function () {
    it("should enable public decryption of riskExposure and emit PublicRevealEnabled", async function () {
      const { guard, owner } = await loadFixture(deployWithPositionsAndRiskFixture);

      await expect(guard.allowPublicReveal(0))
        .to.emit(guard, "PublicRevealEnabled")
        .withArgs("riskExposure");
    });

    it("should enable public decryption of healthFactor", async function () {
      const { guard, owner } = await loadFixture(deployWithPositionsAndRiskFixture);

      // Need to compute health factor first
      await guard.computeHealthFactor();

      await expect(guard.allowPublicReveal(1))
        .to.emit(guard, "PublicRevealEnabled")
        .withArgs("healthFactor");
    });

    it("should enable public decryption of complianceTier", async function () {
      const { guard, owner } = await loadFixture(deployWithPositionsAndRiskFixture);

      await expect(guard.allowPublicReveal(2))
        .to.emit(guard, "PublicRevealEnabled")
        .withArgs("complianceTier");
    });

    it("should revert when called by non-owner", async function () {
      const { guard, other } = await loadFixture(deployWithPositionsAndRiskFixture);

      await expect(
        guard.connect(other).allowPublicReveal(0)
      ).to.be.revertedWith("Only owner");
    });
  });
});
