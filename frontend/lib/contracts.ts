/**
 * GhostbagGuard contract ABI and deployment address.
 *
 * The ABI covers all public functions of the GhostbagGuard contract
 * including position loading, GhostPay transfers, risk computation,
 * health factor, compliance tier, auditor access, and public reveals.
 */

/**
 * Replace this placeholder with the actual deployed address after running:
 *   DEPLOYER_PRIVATE_KEY=0x... npx hardhat run scripts/deploy.ts --network sepolia
 */
export const GHOSTBAG_GUARD_ADDRESS =
  "0x56CBFd5b7C6B8463faeC2BFD007D5DcA37976e5D" as const;

export const GHOSTBAG_GUARD_ABI = [
  // ─── Events ───────────────────────────────────────────────────────────
  {
    type: "event",
    name: "PositionUpdated",
    inputs: [
      { name: "assetId", type: "uint8", indexed: true, internalType: "uint8" },
    ],
  },
  {
    type: "event",
    name: "PaymentExecuted",
    inputs: [
      { name: "recipient", type: "address", indexed: true, internalType: "address" },
      { name: "paymentRef", type: "bytes32", indexed: true, internalType: "bytes32" },
    ],
  },
  {
    type: "event",
    name: "RiskComputed",
    inputs: [],
  },
  {
    type: "event",
    name: "HealthFactorComputed",
    inputs: [],
  },
  {
    type: "event",
    name: "ComplianceTierComputed",
    inputs: [],
  },
  {
    type: "event",
    name: "RiskWeightUpdated",
    inputs: [
      { name: "assetId", type: "uint8", indexed: true, internalType: "uint8" },
      { name: "newWeight", type: "uint32", indexed: false, internalType: "uint32" },
    ],
  },
  {
    type: "event",
    name: "AuditorAccessGranted",
    inputs: [
      { name: "auditor", type: "address", indexed: true, internalType: "address" },
    ],
  },
  {
    type: "event",
    name: "PublicRevealEnabled",
    inputs: [
      { name: "metricName", type: "string", indexed: false, internalType: "string" },
    ],
  },

  // ─── Position Loading ─────────────────────────────────────────────────
  {
    type: "function",
    name: "loadPosition",
    inputs: [
      { name: "assetId", type: "uint8", internalType: "uint8" },
      {
        name: "encAmount",
        type: "tuple",
        internalType: "struct InEuint64",
        components: [
          { name: "data", type: "bytes", internalType: "bytes" },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // ─── GhostPay ─────────────────────────────────────────────────────────
  {
    type: "function",
    name: "ghostPay",
    inputs: [
      {
        name: "encAmount",
        type: "tuple",
        internalType: "struct InEuint64",
        components: [
          { name: "data", type: "bytes", internalType: "bytes" },
        ],
      },
      { name: "recipient", type: "address", internalType: "address" },
      { name: "assetId", type: "uint8", internalType: "uint8" },
      { name: "paymentRef", type: "bytes32", internalType: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // ─── Recipient Verification ───────────────────────────────────────────
  {
    type: "function",
    name: "verifyPayment",
    inputs: [
      { name: "paymentRef", type: "bytes32", internalType: "bytes32" },
      { name: "threshold", type: "uint64", internalType: "uint64" },
    ],
    outputs: [
      { name: "", type: "uint256", internalType: "ebool" },
    ],
    stateMutability: "nonpayable",
  },

  // ─── Risk Computation ─────────────────────────────────────────────────
  {
    type: "function",
    name: "computeRisk",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // ─── Health Factor ────────────────────────────────────────────────────
  {
    type: "function",
    name: "computeHealthFactor",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // ─── Compliance Tier ──────────────────────────────────────────────────
  {
    type: "function",
    name: "computeComplianceTier",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // ─── Risk Weight Governance ───────────────────────────────────────────
  {
    type: "function",
    name: "updateRiskWeight",
    inputs: [
      { name: "assetId", type: "uint8", internalType: "uint8" },
      { name: "newWeight", type: "uint32", internalType: "uint32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // ─── Auditor Access ───────────────────────────────────────────────────
  {
    type: "function",
    name: "grantAuditorAccess",
    inputs: [
      { name: "auditor", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // ─── Public Reveal ────────────────────────────────────────────────────
  {
    type: "function",
    name: "allowPublicReveal",
    inputs: [
      { name: "metricId", type: "uint8", internalType: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "publishReveal",
    inputs: [
      { name: "ctHash", type: "uint256", internalType: "euint64" },
      { name: "plaintext", type: "uint64", internalType: "uint64" },
      { name: "signature", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // ─── Getters ──────────────────────────────────────────────────────────
  {
    type: "function",
    name: "getBalance",
    inputs: [
      { name: "assetId", type: "uint8", internalType: "uint8" },
    ],
    outputs: [
      { name: "", type: "uint256", internalType: "euint64" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRiskExposure",
    inputs: [],
    outputs: [
      { name: "", type: "uint256", internalType: "euint64" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getHealthFactor",
    inputs: [],
    outputs: [
      { name: "", type: "uint256", internalType: "euint64" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getComplianceTier",
    inputs: [],
    outputs: [
      { name: "", type: "uint256", internalType: "euint8" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getTransferHandle",
    inputs: [
      { name: "recipient", type: "address", internalType: "address" },
      { name: "paymentRef", type: "bytes32", internalType: "bytes32" },
    ],
    outputs: [
      { name: "", type: "uint256", internalType: "euint64" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getDecryptResult",
    inputs: [
      { name: "handle", type: "uint256", internalType: "euint64" },
    ],
    outputs: [
      { name: "value", type: "uint256", internalType: "uint256" },
      { name: "ready", type: "bool", internalType: "bool" },
    ],
    stateMutability: "view",
  },

  // ─── Public State ─────────────────────────────────────────────────────
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [
      { name: "", type: "address", internalType: "address" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "auditor",
    inputs: [],
    outputs: [
      { name: "", type: "address", internalType: "address" },
    ],
    stateMutability: "view",
  },
] as const;

/** Asset IDs matching the contract's hardcoded 3-asset model */
export const ASSET_IDS = {
  USDC: 0,
  WETH: 1,
  DEFI: 2,
} as const;

/** Human-readable asset labels */
export const ASSET_LABELS: Record<number, string> = {
  0: "USDC",
  1: "WETH",
  2: "DEFI",
};

/** Default risk weights in basis points (10000 = 100%) */
export const DEFAULT_RISK_WEIGHTS = {
  USDC: 1000,
  WETH: 5500,
  DEFI: 14000,
} as const;

/** Ethereum Sepolia chain ID */
export const CHAIN_ID = 11155111;
