"use client";

import { useState, useCallback } from "react";
import { useWriteContract, usePublicClient, useAccount } from "wagmi";
import { keccak256, toHex, isAddress } from "viem";
import { useCofheClient } from "@/hooks/useCofheClient";
import {
  GHOSTBAG_GUARD_ADDRESS,
  GHOSTBAG_GUARD_ABI,
  ASSET_IDS,
} from "@/lib/contracts";
import { validateAmount, UINT64_MAX } from "@/lib/validation";

// ─── Constants ────────────────────────────────────────────────────────────────
const ASSETS = [
  { id: ASSET_IDS.USDC, label: "USDC", symbol: "💵" },
  { id: ASSET_IDS.WETH, label: "WETH", symbol: "Ξ" },
  { id: ASSET_IDS.DEFI, label: "DEFI", symbol: "🔮" },
] as const;

// ─── Input Validation ─────────────────────────────────────────────────────────
function validateRecipient(value: string): { valid: boolean; error?: string } {
  if (!value || value.trim() === "") {
    return { valid: false, error: "Recipient address is required" };
  }
  if (!isAddress(value.trim())) {
    return { valid: false, error: "Invalid Ethereum address" };
  }
  return { valid: true };
}

function validatePaymentRef(value: string): { valid: boolean; error?: string } {
  if (!value || value.trim() === "") {
    return { valid: false, error: "Payment reference is required" };
  }
  return { valid: true };
}

function validateThreshold(value: string): { valid: boolean; error?: string } {
  if (!value || value.trim() === "") {
    return { valid: false, error: "Threshold amount is required" };
  }

  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    return {
      valid: false,
      error: "Threshold must be a positive integer (no decimals, signs, or letters)",
    };
  }

  const num = BigInt(trimmed);

  if (num === BigInt(0)) {
    return { valid: false, error: "Threshold must be greater than zero" };
  }

  if (num > UINT64_MAX) {
    return {
      valid: false,
      error: `Threshold must not exceed ${UINT64_MAX.toString()} (uint64 max)`,
    };
  }

  return { valid: true };
}

/**
 * Converts a payment reference string to bytes32.
 * If the input is already a valid 0x-prefixed 66-character hex string, use it directly.
 * Otherwise, keccak256 hash the text to produce a bytes32 value.
 */
function toPaymentRefBytes32(value: string): `0x${string}` {
  const trimmed = value.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed as `0x${string}`;
  }
  return keccak256(toHex(trimmed));
}

/**
 * Truncates a hex string for display: first 8 + last 6 characters.
 */
function truncateHandle(handle: string): string {
  if (handle.length <= 14) return handle;
  return `${handle.slice(0, 8)}...${handle.slice(-6)}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type FormStatus = "idle" | "encrypting" | "submitting" | "success" | "error";
type VerifyStatus = "idle" | "submitting" | "decrypting" | "success" | "error";

interface PaymentResult {
  txHash: string;
  recipient: string;
  paymentRef: string;
}

// ─── Loading Spinner ──────────────────────────────────────────────────────────
function LoadingSpinner() {
  return (
    <svg
      className="h-3 w-3 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ─── Main GhostPayTab Component ───────────────────────────────────────────────
export function GhostPayTab() {
  const { client, isInitializing, error: clientError } = useCofheClient();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { address: connectedAddress } = useAccount();

  // Form state
  const [recipient, setRecipient] = useState("");
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<number>(ASSET_IDS.USDC);
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentRefError, setPaymentRefError] = useState<string | null>(null);

  // Transaction state
  const [status, setStatus] = useState<FormStatus>("idle");
  const [encryptedHandle, setEncryptedHandle] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null);

  // Verification state
  const [verifyRef, setVerifyRef] = useState("");
  const [verifyRefError, setVerifyRefError] = useState<string | null>(null);
  const [verifyThreshold, setVerifyThreshold] = useState("");
  const [verifyThresholdError, setVerifyThresholdError] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>("idle");
  const [verifyResult, setVerifyResult] = useState<boolean | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const isBusy = status === "encrypting" || status === "submitting";
  const isVerifying = verifyStatus === "submitting" || verifyStatus === "decrypting";

  const handleRecipientChange = useCallback((value: string) => {
    setRecipient(value);
    if (value) {
      const validation = validateRecipient(value);
      setRecipientError(validation.valid ? null : validation.error!);
    } else {
      setRecipientError(null);
    }
    // Reset transaction state on form change
    setEncryptedHandle(null);
    setPaymentResult(null);
    setErrorMessage(null);
    setStatus("idle");
  }, []);

  const handleAmountChange = useCallback((value: string) => {
    setAmount(value);
    if (value) {
      const validation = validateAmount(value);
      setAmountError(validation.valid ? null : validation.error!);
    } else {
      setAmountError(null);
    }
    setEncryptedHandle(null);
    setPaymentResult(null);
    setErrorMessage(null);
    setStatus("idle");
  }, []);

  const handlePaymentRefChange = useCallback((value: string) => {
    setPaymentRef(value);
    if (value) {
      const validation = validatePaymentRef(value);
      setPaymentRefError(validation.valid ? null : validation.error!);
    } else {
      setPaymentRefError(null);
    }
    setEncryptedHandle(null);
    setPaymentResult(null);
    setErrorMessage(null);
    setStatus("idle");
  }, []);

  const handleSubmit = useCallback(async () => {
    // Validate all fields
    const recipientValidation = validateRecipient(recipient);
    const amountValidation = validateAmount(amount);
    const paymentRefValidation = validatePaymentRef(paymentRef);

    if (!recipientValidation.valid) {
      setRecipientError(recipientValidation.error!);
      return;
    }
    if (!amountValidation.valid) {
      setAmountError(amountValidation.error!);
      return;
    }
    if (!paymentRefValidation.valid) {
      setPaymentRefError(paymentRefValidation.error!);
      return;
    }

    if (!client) {
      setErrorMessage("CoFHE client not initialized");
      return;
    }

    const amountBigInt = BigInt(amount.trim());
    const refBytes32 = toPaymentRefBytes32(paymentRef);

    // Step 1: Encrypt the amount
    setStatus("encrypting");
    setErrorMessage(null);
    setEncryptedHandle(null);
    setPaymentResult(null);

    try {
      const { Encryptable } = await import("@cofhe/sdk");
      const encryptedItems = await client
        .encryptInputs([Encryptable.uint64(amountBigInt)])
        .execute();

      const encrypted = encryptedItems[0];

      // Build a hex representation for display
      const handleHex =
        typeof encrypted === "object" && encrypted !== null && "data" in encrypted
          ? `0x${Array.from(new Uint8Array((encrypted as any).data).slice(0, 20))
              .map((b: number) => b.toString(16).padStart(2, "0"))
              .join("")}`
          : String(encrypted).slice(0, 42);

      setEncryptedHandle(handleHex);

      // Step 2: Submit the ghostPay transaction
      setStatus("submitting");

      const hash = await writeContractAsync({
        address: GHOSTBAG_GUARD_ADDRESS,
        abi: GHOSTBAG_GUARD_ABI,
        functionName: "ghostPay",
        args: [encrypted as any, recipient.trim() as `0x${string}`, assetId, refBytes32],
      });

      setStatus("success");
      setPaymentResult({
        txHash: hash,
        recipient: recipient.trim(),
        paymentRef: refBytes32,
      });

      // Reset form
      setRecipient("");
      setAmount("");
      setPaymentRef("");
      setEncryptedHandle(null);
    } catch (err: any) {
      const isCofheError =
        err?.code && typeof err.code === "string" && err.code.includes("_");
      const errorMsg = isCofheError
        ? `Encryption failed: ${err.message}`
        : err?.message ?? "Operation failed";

      setStatus("error");
      setErrorMessage(errorMsg);
    }
  }, [recipient, amount, paymentRef, assetId, client, writeContractAsync]);

  // ─── Verification Handlers ────────────────────────────────────────────────
  const handleVerifyRefChange = useCallback((value: string) => {
    setVerifyRef(value);
    if (value) {
      const validation = validatePaymentRef(value);
      setVerifyRefError(validation.valid ? null : validation.error!);
    } else {
      setVerifyRefError(null);
    }
    setVerifyResult(null);
    setVerifyError(null);
    setVerifyStatus("idle");
  }, []);

  const handleVerifyThresholdChange = useCallback((value: string) => {
    setVerifyThreshold(value);
    if (value) {
      const validation = validateThreshold(value);
      setVerifyThresholdError(validation.valid ? null : validation.error!);
    } else {
      setVerifyThresholdError(null);
    }
    setVerifyResult(null);
    setVerifyError(null);
    setVerifyStatus("idle");
  }, []);

  const handleVerify = useCallback(async () => {
    // Validate inputs
    const refValidation = validatePaymentRef(verifyRef);
    const thresholdValidation = validateThreshold(verifyThreshold);

    if (!refValidation.valid) {
      setVerifyRefError(refValidation.error!);
      return;
    }
    if (!thresholdValidation.valid) {
      setVerifyThresholdError(thresholdValidation.error!);
      return;
    }

    if (!client) {
      setVerifyError("CoFHE client not initialized");
      return;
    }

    if (!publicClient) {
      setVerifyError("Public client not available");
      return;
    }

    if (!connectedAddress) {
      setVerifyError("Wallet not connected");
      return;
    }

    const refBytes32 = toPaymentRefBytes32(verifyRef);
    const thresholdBigInt = BigInt(verifyThreshold.trim());

    setVerifyStatus("submitting");
    setVerifyError(null);
    setVerifyResult(null);

    try {
      // Step 1: Execute the verifyPayment transaction (creates FHE handle on-chain)
      await writeContractAsync({
        address: GHOSTBAG_GUARD_ADDRESS,
        abi: GHOSTBAG_GUARD_ABI,
        functionName: "verifyPayment",
        args: [refBytes32, thresholdBigInt],
      });

      // Step 2: Read the returned handle via static call after tx is mined
      setVerifyStatus("decrypting");

      const handle = await publicClient.simulateContract({
        address: GHOSTBAG_GUARD_ADDRESS,
        abi: GHOSTBAG_GUARD_ABI,
        functionName: "verifyPayment",
        args: [refBytes32, thresholdBigInt],
        account: connectedAddress,
      });

      const eboolHandle = handle.result as bigint;

      // Step 3: Decrypt the ebool handle
      const { FheTypes } = await import("@cofhe/sdk");

      const meetsThreshold = await client
        .decryptForView(eboolHandle, FheTypes.Bool)
        .execute();

      setVerifyResult(Boolean(meetsThreshold));
      setVerifyStatus("success");
    } catch (err: any) {
      setVerifyStatus("error");
      setVerifyError(err?.message ?? "Verification failed");
    }
  }, [verifyRef, verifyThreshold, client, publicClient, connectedAddress, writeContractAsync]);

  // Client initialization state
  if (isInitializing) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner />
        <span className="ml-2 text-sm text-muted-foreground">
          Initializing CoFHE client...
        </span>
      </div>
    );
  }

  if (clientError) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm text-destructive">
          CoFHE client error: {clientError}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">GhostPay</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Execute private encrypted transfers from the treasury to recipients.
        </p>
      </div>

      <div className="max-w-lg space-y-4">
        {/* Recipient Address */}
        <div>
          <label
            htmlFor="ghostpay-recipient"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Recipient Address
          </label>
          <input
            id="ghostpay-recipient"
            type="text"
            value={recipient}
            onChange={(e) => handleRecipientChange(e.target.value)}
            disabled={isBusy}
            placeholder="0x..."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
          />
          {recipientError && (
            <p className="mt-1 text-xs text-destructive">{recipientError}</p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label
            htmlFor="ghostpay-amount"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Amount (uint64)
          </label>
          <input
            id="ghostpay-amount"
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            disabled={isBusy}
            placeholder="Enter amount..."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
          />
          {amountError && (
            <p className="mt-1 text-xs text-destructive">{amountError}</p>
          )}
        </div>

        {/* Asset Selector */}
        <div>
          <label
            htmlFor="ghostpay-asset"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Asset
          </label>
          <select
            id="ghostpay-asset"
            value={assetId}
            onChange={(e) => setAssetId(Number(e.target.value))}
            disabled={isBusy}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ASSETS.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.symbol} {asset.label}
              </option>
            ))}
          </select>
        </div>

        {/* Payment Reference */}
        <div>
          <label
            htmlFor="ghostpay-ref"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Payment Reference
          </label>
          <input
            id="ghostpay-ref"
            type="text"
            value={paymentRef}
            onChange={(e) => handlePaymentRefChange(e.target.value)}
            disabled={isBusy}
            placeholder="Invoice ID or 0x... bytes32 hex"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-muted-foreground/70">
            Text will be hashed to bytes32. Or paste a raw 0x-prefixed 64-char hex value.
          </p>
          {paymentRefError && (
            <p className="mt-1 text-xs text-destructive">{paymentRefError}</p>
          )}
        </div>

        {/* Encrypted Handle Preview */}
        {encryptedHandle && (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
            <p className="text-xs text-muted-foreground">Encrypted amount handle:</p>
            <p className="font-mono text-xs text-primary">
              {truncateHandle(encryptedHandle)}
            </p>
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={isBusy || !client}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "encrypting" ? (
            <span className="flex items-center justify-center gap-2">
              <LoadingSpinner /> Encrypting...
            </span>
          ) : status === "submitting" ? (
            <span className="flex items-center justify-center gap-2">
              <LoadingSpinner /> Submitting...
            </span>
          ) : (
            "Encrypt & Send Payment"
          )}
        </button>

        {/* Error Message */}
        {status === "error" && errorMessage && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
            <p className="text-xs text-destructive">{errorMessage}</p>
          </div>
        )}

        {/* Success: PaymentExecuted Confirmation */}
        {status === "success" && paymentResult && (
          <div className="rounded-md border border-green-500/30 bg-green-500/5 px-4 py-3">
            <p className="mb-1 text-sm font-medium text-green-400">
              ✓ Payment Executed
            </p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                <span className="font-medium">Recipient:</span>{" "}
                <span className="font-mono">
                  {truncateHandle(paymentResult.recipient)}
                </span>
              </p>
              <p>
                <span className="font-medium">Payment Ref:</span>{" "}
                <span className="font-mono">
                  {truncateHandle(paymentResult.paymentRef)}
                </span>
              </p>
              <p>
                <span className="font-medium">Tx:</span>{" "}
                <span className="font-mono">
                  {truncateHandle(paymentResult.txHash)}
                </span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ─── Recipient Verification Section ──────────────────────────────────── */}
      <div className="mt-8 border-t border-border pt-6">
        <h3 className="text-md font-semibold text-foreground">
          Recipient Verification
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Verify that a received payment meets or exceeds an agreed threshold.
        </p>

        <div className="mt-4 max-w-lg space-y-4">
          {/* Payment Reference */}
          <div>
            <label
              htmlFor="verify-ref"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Payment Reference
            </label>
            <input
              id="verify-ref"
              type="text"
              value={verifyRef}
              onChange={(e) => handleVerifyRefChange(e.target.value)}
              disabled={isVerifying}
              placeholder="Invoice ID or 0x... bytes32 hex"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-muted-foreground/70">
              Text will be hashed to bytes32. Or paste a raw 0x-prefixed 64-char hex value.
            </p>
            {verifyRefError && (
              <p className="mt-1 text-xs text-destructive">{verifyRefError}</p>
            )}
          </div>

          {/* Threshold Amount */}
          <div>
            <label
              htmlFor="verify-threshold"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Threshold Amount (uint64)
            </label>
            <input
              id="verify-threshold"
              type="text"
              inputMode="numeric"
              value={verifyThreshold}
              onChange={(e) => handleVerifyThresholdChange(e.target.value)}
              disabled={isVerifying}
              placeholder="Minimum expected amount..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
            {verifyThresholdError && (
              <p className="mt-1 text-xs text-destructive">
                {verifyThresholdError}
              </p>
            )}
          </div>

          {/* Verify Button */}
          <button
            onClick={handleVerify}
            disabled={isVerifying || !client}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {verifyStatus === "submitting" ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner /> Verifying on-chain...
              </span>
            ) : verifyStatus === "decrypting" ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner /> Decrypting result...
              </span>
            ) : (
              "Verify Payment"
            )}
          </button>

          {/* Verification Error */}
          {verifyStatus === "error" && verifyError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              <p className="text-xs text-destructive">{verifyError}</p>
            </div>
          )}

          {/* Verification Result */}
          {verifyStatus === "success" && verifyResult !== null && (
            <div
              className={`rounded-md border px-4 py-3 ${
                verifyResult
                  ? "border-green-500/30 bg-green-500/5"
                  : "border-red-500/30 bg-red-500/5"
              }`}
            >
              <p
                className={`text-sm font-medium ${
                  verifyResult ? "text-green-400" : "text-red-400"
                }`}
              >
                {verifyResult ? "✓ Meets threshold" : "✗ Below threshold"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {verifyResult
                  ? "The received payment amount meets or exceeds the specified threshold."
                  : "The received payment amount is below the specified threshold."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
