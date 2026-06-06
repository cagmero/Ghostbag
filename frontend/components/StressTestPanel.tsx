"use client";

import { useState, useCallback } from "react";
import { useWriteContract, usePublicClient } from "wagmi";
import { useCofheClient } from "@/hooks/useCofheClient";
import {
  GHOSTBAG_GUARD_ADDRESS,
  GHOSTBAG_GUARD_ABI,
  ASSET_LABELS,
  DEFAULT_RISK_WEIGHTS,
} from "@/lib/contracts";

// ─── Types ────────────────────────────────────────────────────────────────────
type StressTestStatus = "idle" | "updating-weight" | "computing-risk" | "computing-tier" | "decrypting" | "done";

interface SliderState {
  assetId: number;
  label: string;
  weight: number; // basis points
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MIN_WEIGHT = 0;
const MAX_WEIGHT = 50000;

const TIER_LABELS: Record<number, string> = {
  0: "Low Risk",
  1: "Medium Risk",
  2: "High Risk",
};

const TIER_COLORS: Record<number, string> = {
  0: "text-green-400",
  1: "text-amber-400",
  2: "text-red-400",
};

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

// ─── Main StressTestPanel Component ───────────────────────────────────────────
export function StressTestPanel() {
  const { client } = useCofheClient();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const [sliders, setSliders] = useState<SliderState[]>([
    { assetId: 0, label: "USDC", weight: DEFAULT_RISK_WEIGHTS.USDC },
    { assetId: 1, label: "WETH", weight: DEFAULT_RISK_WEIGHTS.WETH },
    { assetId: 2, label: "DEFI", weight: DEFAULT_RISK_WEIGHTS.DEFI },
  ]);

  const [status, setStatus] = useState<StressTestStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [previousTier, setPreviousTier] = useState<number | null>(null);
  const [currentTier, setCurrentTier] = useState<number | null>(null);

  // Track last successful slider values for rollback on failure
  const [lastSuccessfulWeights, setLastSuccessfulWeights] = useState<number[]>([
    DEFAULT_RISK_WEIGHTS.USDC,
    DEFAULT_RISK_WEIGHTS.WETH,
    DEFAULT_RISK_WEIGHTS.DEFI,
  ]);

  const handleSliderChange = useCallback((assetId: number, newWeight: number) => {
    setSliders((prev) =>
      prev.map((s) => (s.assetId === assetId ? { ...s, weight: newWeight } : s))
    );
  }, []);

  const handleConfirmStressTest = useCallback(async () => {
    setError(null);
    setStatus("updating-weight");

    try {
      // Step 1: Update risk weights for all three assets
      for (const slider of sliders) {
        await writeContractAsync({
          address: GHOSTBAG_GUARD_ADDRESS,
          abi: GHOSTBAG_GUARD_ABI,
          functionName: "updateRiskWeight",
          args: [slider.assetId, slider.weight],
        });
      }

      // Step 2: Compute risk
      setStatus("computing-risk");
      await writeContractAsync({
        address: GHOSTBAG_GUARD_ADDRESS,
        abi: GHOSTBAG_GUARD_ABI,
        functionName: "computeRisk",
        args: [],
      });

      // Step 3: Compute compliance tier
      setStatus("computing-tier");
      await writeContractAsync({
        address: GHOSTBAG_GUARD_ADDRESS,
        abi: GHOSTBAG_GUARD_ABI,
        functionName: "computeComplianceTier",
        args: [],
      });

      // Step 4: Decrypt the new compliance tier
      setStatus("decrypting");
      if (client && publicClient) {
        const { FheTypes } = await import("@cofhe/sdk");

        const handle = (await publicClient.readContract({
          address: GHOSTBAG_GUARD_ADDRESS,
          abi: GHOSTBAG_GUARD_ABI,
          functionName: "getComplianceTier",
          args: [],
        })) as bigint;

        const decryptResult = await client
          .decryptHandle(handle, FheTypes.Uint8)
          .decrypt();

        if (decryptResult.success) {
          // Store previous tier before updating
          if (currentTier !== null) {
            setPreviousTier(currentTier);
          }
          setCurrentTier(Number(decryptResult.data));
        }
      }

      // Mark success and update last successful weights
      setLastSuccessfulWeights(sliders.map((s) => s.weight));
      setStatus("done");
    } catch (err: any) {
      // On failure, retain last successful values
      setSliders((prev) =>
        prev.map((s, i) => ({ ...s, weight: lastSuccessfulWeights[i] }))
      );
      setError(err?.message ?? "Stress test transaction failed");
      setStatus("idle");
    }
  }, [sliders, writeContractAsync, client, publicClient, currentTier, lastSuccessfulWeights]);

  const isRunning = status !== "idle" && status !== "done";

  return (
    <div className="mt-6 rounded-lg border border-border/60 bg-card p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground">
          Stress Test Panel
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Adjust risk weights and observe compliance tier changes. Values are in
          basis points (10000 = 100%).
        </p>
      </div>

      {/* Sliders */}
      <div className="space-y-4">
        {sliders.map((slider) => (
          <div key={slider.assetId}>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor={`weight-slider-${slider.assetId}`}
                className="text-sm font-medium text-foreground"
              >
                {slider.label}
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {slider.weight} bps
              </span>
            </div>
            <input
              id={`weight-slider-${slider.assetId}`}
              type="range"
              min={MIN_WEIGHT}
              max={MAX_WEIGHT}
              step={100}
              value={slider.weight}
              onChange={(e) =>
                handleSliderChange(slider.assetId, Number(e.target.value))
              }
              disabled={isRunning}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-muted accent-primary disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`${slider.label} risk weight: ${slider.weight} basis points`}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/60 mt-0.5">
              <span>{MIN_WEIGHT}</span>
              <span>{MAX_WEIGHT}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Confirm Button */}
      <button
        onClick={handleConfirmStressTest}
        disabled={isRunning}
        className="mt-4 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isRunning ? (
          <span className="flex items-center justify-center gap-2">
            <LoadingSpinner />
            {status === "updating-weight" && "Updating Weights..."}
            {status === "computing-risk" && "Computing Risk..."}
            {status === "computing-tier" && "Computing Tier..."}
            {status === "decrypting" && "Decrypting Tier..."}
          </span>
        ) : (
          "Confirm Stress Test"
        )}
      </button>

      {/* Tier Comparison Display */}
      {(previousTier !== null || currentTier !== null) && (
        <div className="mt-4 rounded-md border border-border/40 bg-muted/30 px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">
            Compliance Tier Transition
          </p>
          <div className="flex items-center gap-2 text-sm font-medium">
            {previousTier !== null ? (
              <span className={TIER_COLORS[previousTier] ?? "text-foreground"}>
                {TIER_LABELS[previousTier] ?? `Tier ${previousTier}`}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
            <span className="text-muted-foreground">→</span>
            {currentTier !== null ? (
              <span className={TIER_COLORS[currentTier] ?? "text-foreground"}>
                {TIER_LABELS[currentTier] ?? `Tier ${currentTier}`}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <p className="mt-3 text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
