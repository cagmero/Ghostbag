"use client";

import { useState, useCallback } from "react";
import { useWriteContract, usePublicClient } from "wagmi";
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

/**
 * Truncates a hex string to first 6 + last 6 characters.
 * e.g. "0x1234567890abcdef1234" → "0x1234...ef1234"
 */
function truncateHandle(handle: string): string {
  if (handle.length <= 14) return handle;
  return `${handle.slice(0, 8)}...${handle.slice(-6)}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface AssetState {
  inputValue: string;
  inputError: string | null;
  encryptedHandle: string | null;
  isEncrypting: boolean;
  isSubmitting: boolean;
  isDecrypting: boolean;
  decryptedBalance: bigint | null;
  decryptError: string | null;
  txHash: string | null;
}

const initialAssetState: AssetState = {
  inputValue: "",
  inputError: null,
  encryptedHandle: null,
  isEncrypting: false,
  isSubmitting: false,
  isDecrypting: false,
  decryptedBalance: null,
  decryptError: null,
  txHash: null,
};

// ─── Asset Card Component ─────────────────────────────────────────────────────
interface AssetCardProps {
  asset: (typeof ASSETS)[number];
  state: AssetState;
  onInputChange: (value: string) => void;
  onEncryptAndLoad: () => void;
  onDecrypt: () => void;
  clientReady: boolean;
}

function AssetCard({
  asset,
  state,
  onInputChange,
  onEncryptAndLoad,
  onDecrypt,
  clientReady,
}: AssetCardProps) {
  const isBusy = state.isEncrypting || state.isSubmitting;

  return (
    <div className="rounded-lg border border-border/60 bg-card p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xl">{asset.symbol}</span>
        <h3 className="text-base font-semibold text-foreground">
          {asset.label}
        </h3>
      </div>

      {/* Input */}
      <div className="mb-3">
        <label
          htmlFor={`amount-${asset.id}`}
          className="mb-1 block text-xs font-medium text-muted-foreground"
        >
          Amount (uint64)
        </label>
        <input
          id={`amount-${asset.id}`}
          type="text"
          inputMode="numeric"
          value={state.inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          disabled={isBusy}
          placeholder="Enter amount..."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
        />
        {state.inputError && (
          <p className="mt-1 text-xs text-destructive">{state.inputError}</p>
        )}
      </div>

      {/* Encrypted Handle Preview */}
      {state.encryptedHandle && (
        <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="text-xs text-muted-foreground">Encrypted handle:</p>
          <p className="font-mono text-xs text-primary">
            {truncateHandle(state.encryptedHandle)}
          </p>
        </div>
      )}

      {/* Encrypt & Load Button */}
      <button
        onClick={onEncryptAndLoad}
        disabled={isBusy || !clientReady}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state.isEncrypting
          ? "Encrypting..."
          : state.isSubmitting
          ? "Submitting..."
          : "Encrypt & Load"}
      </button>

      {state.txHash && (
        <p className="mt-2 text-xs text-muted-foreground">
          Tx: {truncateHandle(state.txHash)}
        </p>
      )}

      {/* Balance Display */}
      <div className="mt-4 border-t border-border/40 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {state.decryptedBalance !== null ? (
              <>
                <span className="text-sm" title="Decrypted" aria-label="Unlocked">
                  🔓
                </span>
                <span className="text-sm font-medium text-foreground">
                  {state.decryptedBalance.toString()}
                </span>
              </>
            ) : (
              <>
                <span className="text-sm" title="Encrypted" aria-label="Locked">
                  🔒
                </span>
                <span className="text-sm text-muted-foreground/60">
                  ••••••
                </span>
              </>
            )}
          </div>

          <button
            onClick={onDecrypt}
            disabled={state.isDecrypting || !clientReady}
            className="rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state.isDecrypting ? (
              <span className="flex items-center gap-1">
                <LoadingSpinner />
                Decrypting...
              </span>
            ) : (
              "Decrypt"
            )}
          </button>
        </div>

        {state.decryptError && (
          <p className="mt-1 text-xs text-destructive">{state.decryptError}</p>
        )}
      </div>
    </div>
  );
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

// ─── Main PositionsTab Component ──────────────────────────────────────────────
export function PositionsTab() {
  const { client, isInitializing, error: clientError } = useCofheClient();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const [assetStates, setAssetStates] = useState<Record<number, AssetState>>({
    [ASSET_IDS.USDC]: { ...initialAssetState },
    [ASSET_IDS.WETH]: { ...initialAssetState },
    [ASSET_IDS.DEFI]: { ...initialAssetState },
  });

  const updateAssetState = useCallback(
    (assetId: number, updates: Partial<AssetState>) => {
      setAssetStates((prev) => ({
        ...prev,
        [assetId]: { ...prev[assetId], ...updates },
      }));
    },
    []
  );

  const handleInputChange = useCallback(
    (assetId: number, value: string) => {
      const validation = value ? validateAmount(value) : { valid: true };
      updateAssetState(assetId, {
        inputValue: value,
        inputError: value ? (validation.valid ? null : validation.error!) : null,
        encryptedHandle: null,
      });
    },
    [updateAssetState]
  );

  const handleEncryptAndLoad = useCallback(
    async (assetId: number) => {
      const state = assetStates[assetId];
      const validation = validateAmount(state.inputValue);

      if (!validation.valid) {
        updateAssetState(assetId, { inputError: validation.error! });
        return;
      }

      if (!client) {
        updateAssetState(assetId, {
          inputError: "CoFHE client not initialized",
        });
        return;
      }

      const amount = BigInt(state.inputValue.trim());

      // Step 1: Encrypt
      updateAssetState(assetId, {
        isEncrypting: true,
        inputError: null,
        encryptedHandle: null,
        txHash: null,
      });

      try {
        const { Encryptable } = await import("@cofhe/sdk");
        const encryptedItems = await client
          .encryptInputs([Encryptable.uint64(amount)])
          .execute();

        const encrypted = encryptedItems[0];

        // Build a hex representation of the handle for display
        const handleHex =
          typeof encrypted === "object" && encrypted !== null && "data" in encrypted
            ? `0x${Array.from(new Uint8Array((encrypted as any).data).slice(0, 20))
                .map((b: number) => b.toString(16).padStart(2, "0"))
                .join("")}`
            : String(encrypted).slice(0, 42);

        updateAssetState(assetId, {
          isEncrypting: false,
          encryptedHandle: handleHex,
        });

        // Step 2: Submit transaction
        updateAssetState(assetId, { isSubmitting: true });

        const hash = await writeContractAsync({
          address: GHOSTBAG_GUARD_ADDRESS,
          abi: GHOSTBAG_GUARD_ABI,
          functionName: "loadPosition",
          args: [assetId, encrypted as any],
        });

        updateAssetState(assetId, {
          isSubmitting: false,
          txHash: hash,
          inputValue: "",
          encryptedHandle: null,
        });
      } catch (err: any) {
        const isCofheError =
          err?.code && typeof err.code === "string" && err.code.includes("_");
        const errorMsg = isCofheError
          ? `Encryption failed: ${err.message}`
          : err?.message ?? "Operation failed";

        updateAssetState(assetId, {
          isEncrypting: false,
          isSubmitting: false,
          inputError: errorMsg,
        });
      }
    },
    [assetStates, client, updateAssetState, writeContractAsync]
  );

  const handleDecrypt = useCallback(
    async (assetId: number) => {
      if (!client || !publicClient) return;

      updateAssetState(assetId, {
        isDecrypting: true,
        decryptError: null,
      });

      try {
        const { FheTypes } = await import("@cofhe/sdk");

        // Read the balance handle from contract
        const handle = (await publicClient.readContract({
          address: GHOSTBAG_GUARD_ADDRESS,
          abi: GHOSTBAG_GUARD_ABI,
          functionName: "getBalance",
          args: [assetId],
        })) as bigint;

        // Decrypt using the SDK's decryptForView with permit
        const value = await client
          .decryptForView(handle, FheTypes.Uint64)
          .execute();

        updateAssetState(assetId, {
          isDecrypting: false,
          decryptedBalance: BigInt(value.toString()),
        });
      } catch (err: any) {
        updateAssetState(assetId, {
          isDecrypting: false,
          decryptError: err?.message ?? "Decryption failed",
        });
      }
    },
    [client, publicClient, updateAssetState]
  );

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
        <h2 className="text-lg font-semibold text-foreground">Positions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Load and view encrypted treasury positions across USDC, WETH, and DEFI
          assets.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
        {ASSETS.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            state={assetStates[asset.id]}
            onInputChange={(v) => handleInputChange(asset.id, v)}
            onEncryptAndLoad={() => handleEncryptAndLoad(asset.id)}
            onDecrypt={() => handleDecrypt(asset.id)}
            clientReady={!!client}
          />
        ))}
      </div>
    </div>
  );
}
