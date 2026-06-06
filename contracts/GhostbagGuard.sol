// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint64, euint8, ebool, InEuint64 } from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import { MockPermissioned as Permissioned } from "@cofhe/mock-contracts/contracts/Permissioned.sol";

contract GhostbagGuard is Permissioned {

    // ─── Events ───────────────────────────────────────────────────────────
    event PositionUpdated(uint8 indexed assetId);
    event PaymentExecuted(address indexed recipient, bytes32 indexed paymentRef);
    event RiskComputed();
    event HealthFactorComputed();
    event ComplianceTierComputed();
    event RiskWeightUpdated(uint8 indexed assetId, uint32 newWeight);
    event AuditorAccessGranted(address indexed auditor);
    event PublicRevealEnabled(string metricName);

    // ─── State Variables ──────────────────────────────────────────────────

    // Ownership
    address public owner;

    // Treasury Positions (encrypted)
    euint64 private balance_USDC;   // Asset_ID 0
    euint64 private balance_WETH;   // Asset_ID 1
    euint64 private balance_DEFI;   // Asset_ID 2

    // Risk Weights (public, basis points)
    uint32 public riskWeight_USDC;  // Default: 1000  (10%)
    uint32 public riskWeight_WETH;  // Default: 5500  (55%)
    uint32 public riskWeight_DEFI;  // Default: 14000 (140%)

    // Computed Risk Metrics (encrypted)
    euint64 private weightedRiskExposure;
    euint64 private healthFactor;
    euint8 private complianceTier;

    // Compliance Thresholds (public, basis points)
    uint64 public tierThresholdLow;   // Default: 50000
    uint64 public tierThresholdHigh;  // Default: 100000

    // GhostPay State
    mapping(bytes32 => euint64) private transferAmounts;

    // Auditor
    address public auditor;

    // Computation Flags
    bool public riskComputed;

    // ─── Modifiers ────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier validAsset(uint8 assetId) {
        require(assetId <= 2, "Invalid asset");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────

    constructor() Permissioned() {
        owner = msg.sender;

        // Initialize all three balances to encrypted zero with ACL grants
        balance_USDC = FHE.asEuint64(0);
        FHE.allowThis(balance_USDC);
        FHE.allow(balance_USDC, msg.sender);

        balance_WETH = FHE.asEuint64(0);
        FHE.allowThis(balance_WETH);
        FHE.allow(balance_WETH, msg.sender);

        balance_DEFI = FHE.asEuint64(0);
        FHE.allowThis(balance_DEFI);
        FHE.allow(balance_DEFI, msg.sender);

        // Set default risk weights (basis points)
        riskWeight_USDC = 1000;
        riskWeight_WETH = 5500;
        riskWeight_DEFI = 14000;

        // Set default tier thresholds
        tierThresholdLow = 50000;
        tierThresholdHigh = 100000;
    }

    // ─── Position Loading ─────────────────────────────────────────────────

    function loadPosition(uint8 assetId, InEuint64 calldata encAmount)
        external onlyOwner validAsset(assetId)
    {
        euint64 handle = FHE.asEuint64(encAmount);

        if (assetId == 0) {
            balance_USDC = handle;
        } else if (assetId == 1) {
            balance_WETH = handle;
        } else {
            balance_DEFI = handle;
        }

        FHE.allowThis(handle);
        FHE.allow(handle, owner);

        emit PositionUpdated(assetId);
    }

    // ─── GhostPay ─────────────────────────────────────────────────────────

    function ghostPay(
        InEuint64 calldata encAmount,
        address recipient,
        uint8 assetId,
        bytes32 paymentRef
    ) external onlyOwner validAsset(assetId) {
        // Convert encrypted input to FHE handle
        euint64 amount = FHE.asEuint64(encAmount);

        // Get current balance for the specified asset
        euint64 currentBalance;
        if (assetId == 0) {
            currentBalance = balance_USDC;
        } else if (assetId == 1) {
            currentBalance = balance_WETH;
        } else {
            currentBalance = balance_DEFI;
        }

        // Branchless sufficient-balance check
        ebool hasFunds = FHE.gte(currentBalance, amount);

        // Compute effective amount: full amount if sufficient, zero otherwise
        euint64 effectiveAmt = FHE.select(hasFunds, amount, FHE.asEuint64(0));

        // Update balance by subtracting effective amount
        euint64 newBalance = FHE.sub(currentBalance, effectiveAmt);

        // Grant ACL for the new balance
        FHE.allowThis(newBalance);
        FHE.allow(newBalance, owner);

        // Store updated balance back to the correct variable
        if (assetId == 0) {
            balance_USDC = newBalance;
        } else if (assetId == 1) {
            balance_WETH = newBalance;
        } else {
            balance_DEFI = newBalance;
        }

        // Store transfer amount indexed by (recipient, paymentRef)
        bytes32 transferKey = keccak256(abi.encodePacked(recipient, paymentRef));
        transferAmounts[transferKey] = effectiveAmt;

        // Grant ACL for the transfer amount
        FHE.allowThis(effectiveAmt);
        FHE.allow(effectiveAmt, recipient);

        emit PaymentExecuted(recipient, paymentRef);
    }

    // ─── Recipient Verification ──────────────────────────────────────────

    function verifyPayment(bytes32 paymentRef, uint64 threshold) external returns (ebool) {
        // Derive key from msg.sender (recipient) + paymentRef
        bytes32 key = keccak256(abi.encodePacked(msg.sender, paymentRef));

        // Require transfer exists (non-zero handle check)
        require(euint64.unwrap(transferAmounts[key]) != 0, "No transfer found");

        // Compute encrypted comparison: transferAmount >= threshold
        ebool result = FHE.gte(transferAmounts[key], FHE.asEuint64(threshold));

        // Grant ACL access
        FHE.allowThis(result);
        FHE.allow(result, msg.sender);

        return result;
    }

    // ─── Getters ──────────────────────────────────────────────────────────

    function getBalance(uint8 assetId) external view validAsset(assetId) returns (euint64) {
        if (assetId == 0) {
            return balance_USDC;
        } else if (assetId == 1) {
            return balance_WETH;
        } else {
            return balance_DEFI;
        }
    }

    function getRiskExposure() external view returns (euint64) {
        return weightedRiskExposure;
    }

    function getHealthFactor() external view returns (euint64) {
        return healthFactor;
    }

    function getComplianceTier() external view returns (euint8) {
        return complianceTier;
    }

    function getTransferHandle(address recipient, bytes32 paymentRef) external view returns (euint64) {
        bytes32 key = keccak256(abi.encodePacked(recipient, paymentRef));
        return transferAmounts[key];
    }

    // ─── Risk Computation ─────────────────────────────────────────────────

    function computeRisk() external onlyOwner {
        euint64 w0 = FHE.mul(balance_USDC, FHE.asEuint64(uint64(riskWeight_USDC)));
        euint64 w1 = FHE.mul(balance_WETH, FHE.asEuint64(uint64(riskWeight_WETH)));
        euint64 w2 = FHE.mul(balance_DEFI, FHE.asEuint64(uint64(riskWeight_DEFI)));

        euint64 sumPartial = FHE.add(w0, w1);
        weightedRiskExposure = FHE.add(sumPartial, w2);

        FHE.allowThis(weightedRiskExposure);
        FHE.allow(weightedRiskExposure, owner);

        if (auditor != address(0)) {
            FHE.allow(weightedRiskExposure, auditor);
        }

        riskComputed = true;
        emit RiskComputed();
    }

    // ─── Health Factor Computation ────────────────────────────────────────

    function computeHealthFactor() external onlyOwner {
        require(riskComputed, "Risk not computed");

        euint64 totalBalance = FHE.add(FHE.add(balance_USDC, balance_WETH), balance_DEFI);
        euint64 numerator = FHE.mul(totalBalance, FHE.asEuint64(10000));

        euint64 zero = FHE.asEuint64(0);
        ebool isZeroExposure = FHE.eq(weightedRiskExposure, zero);

        euint64 rawHealth = FHE.div(numerator, weightedRiskExposure);
        euint64 maxSentinel = FHE.asEuint64(type(uint64).max);

        healthFactor = FHE.select(isZeroExposure, maxSentinel, rawHealth);

        FHE.allowThis(healthFactor);
        FHE.allow(healthFactor, owner);

        emit HealthFactorComputed();
    }

    // ─── Compliance Tier Classification ───────────────────────────────────

    function computeComplianceTier() external onlyOwner {
        require(riskComputed, "Risk not computed");

        euint64 lowThreshold = FHE.asEuint64(tierThresholdLow);
        euint64 highThreshold = FHE.asEuint64(tierThresholdHigh);

        ebool belowLow = FHE.lte(weightedRiskExposure, lowThreshold);
        ebool aboveHigh = FHE.gte(weightedRiskExposure, highThreshold);

        euint8 tier0 = FHE.asEuint8(0);  // Low Risk
        euint8 tier1 = FHE.asEuint8(1);  // Medium Risk
        euint8 tier2 = FHE.asEuint8(2);  // High Risk

        euint8 tier = FHE.select(belowLow, tier0, tier1);
        complianceTier = FHE.select(aboveHigh, tier2, tier);

        FHE.allowThis(complianceTier);
        FHE.allow(complianceTier, owner);

        if (auditor != address(0)) {
            FHE.allow(complianceTier, auditor);
        }

        emit ComplianceTierComputed();
    }

    // ─── Auditor Access ───────────────────────────────────────────────────

    function grantAuditorAccess(address _auditor) external onlyOwner {
        auditor = _auditor;

        if (riskComputed) {
            FHE.allow(weightedRiskExposure, _auditor);
            FHE.allow(complianceTier, _auditor);
        }

        emit AuditorAccessGranted(_auditor);
    }

    // ─── Risk Weight Governance ───────────────────────────────────────────

    function updateRiskWeight(uint8 assetId, uint32 newWeight) external onlyOwner validAsset(assetId) {
        if (assetId == 0) {
            riskWeight_USDC = newWeight;
        } else if (assetId == 1) {
            riskWeight_WETH = newWeight;
        } else {
            riskWeight_DEFI = newWeight;
        }

        emit RiskWeightUpdated(assetId, newWeight);
    }

    // ─── Public Reveal ────────────────────────────────────────────────────

    function allowPublicReveal(uint8 metricId) external onlyOwner {
        require(metricId <= 2, "Invalid metric");

        if (metricId == 0) {
            FHE.allowPublic(weightedRiskExposure);
            emit PublicRevealEnabled("riskExposure");
        } else if (metricId == 1) {
            FHE.allowPublic(healthFactor);
            emit PublicRevealEnabled("healthFactor");
        } else {
            FHE.allowPublic(complianceTier);
            emit PublicRevealEnabled("complianceTier");
        }
    }

    function publishReveal(euint64 ctHash, uint64 plaintext, bytes calldata signature) external {
        FHE.publishDecryptResult(ctHash, plaintext, signature);
    }

    function getDecryptResult(euint64 handle) external view returns (uint256 value, bool ready) {
        (uint64 result, bool decrypted) = FHE.getDecryptResultSafe(handle);
        return (uint256(result), decrypted);
    }
}
