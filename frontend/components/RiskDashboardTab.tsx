"use client";

import { useState, useCallback } from "react";
import { useWriteContract, usePublicClient } from "wagmi";
import { useCofheClient } from "@/hooks/useCofheClient";
import {
  GHOSTBAG_GUARD_ADDRESS,
  GHOSTBAG_GUARD_ABI,
} from "@/lib/contracts";
import { StressTestPanel } from "./StressTestPanel";
import { PublicRevealPanel } from "./PublicRevealPanel";
import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────
type MetricStatus = "idle" | "computing" | "computed" | "decrypting" | "decrypted";

interface MetricState {
  status: MetricStatus;
  decryptedValue: bigint | null;
  error: string | null;
  txHash: string | null;
}

const initialMetricState: MetricState = {
  status: "idle",
  decryptedValue: null,
  error: null,
  txHash: null,
};

// ─── Compliance Tier Helpers ──────────────────────────────────────────────────
const TIER_LABELS: Record<number, string> = {
  0: "Low Risk",
  1: "Medium Risk",
  2: "High Risk",
};

const TIER_COLORS: Record<number, string> = {
  0: "bg-green-500/20 text-green-400 border-green-500/40",
  1: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  2: "bg-red-500/20 text-red-400 border-red-500/40",
};

function getTierBadge(tier: number) {
  const label = TIER_LABELS[tier] ?? `Tier ${tier}`;
  const colorClass = TIER_COLORS[tier] ?? TIER_COLORS[2];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${colorClass}`}
    >
      {label}
    </span>
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

// ─── Health Factor Gauge ──────────────────────────────────────────────────────
function HealthFactorGauge({ value }: { value: number }) {
  // Health factor is in basis points: 10000 = 1.0x ratio
  // Clamp to a displayable range (0 to 30000 = 0x to 3.0x)
  const maxDisplay = 30000;
  const clampedValue = Math.min(value, maxDisplay);
  const percentage = (clampedValue / maxDisplay) * 100;

  // Color based on health factor level
  let fill = "#ef4444"; // red < 1.0x
  if (value >= 20000) fill = "#22c55e"; // green >= 2.0x
  else if (value >= 10000) fill = "#f59e0b"; // amber >= 1.0x

  const data = [{ value: percentage, fill }];

  return (
    <div className="flex flex-col items-center">
      <RadialBarChart
        width={160}
        height={160}
        cx={80}
        cy={80}
        innerRadius={50}
        outerRadius={70}
        barSize={12}
        data={data}
        startAngle={180}
        endAngle={0}
      >
        <PolarAngleAxis
          type="number"
          domain={[0, 100]}
          angleAxisId={0}
          tick={false}
        />
        <RadialBar
          dataKey="value"
          cornerRadius={6}
          background={{ fill: "rgba(255,255,255,0.05)" }}
        />
      </RadialBarChart>
      <p className="mt-[-40px] text-center text-lg font-bold text-foreground">
        {(value / 10000).toFixed(2)}x
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Health Factor</p>
    </div>
  );
}

// ─── Metric Section Component ─────────────────────────────────────────────────
interface MetricSectionProps {
  title: string;
  description: string;
  state: MetricState;
  onCompute: () => void;
  onDecrypt: () => void;
  clientReady: boolean;
  renderValue: (value: bigint) => React.ReactNode;
}

function MetricSection({
  title,
  description,
  state,
  onCompute,
  onDecrypt,
  clientReady,
  renderValue,
}: MetricSectionProps) {
  const isComputing = state.status === "computing";
  const isDecrypting = state.status === "decrypting";
  const isComputed = state.status === "computed" || state.status === "decrypting";
  const isDecrypted = state.status === "decrypted";

  return (
    <div className="rounded-lg border border-border/60 bg-card p-5 shadow-sm">
      {/* Header */}
      <div className="mb-3">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>

      {/* Compute Button */}
      <button
        onClick={onCompute}
        disabled={isComputing}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isComputing ? (
          <span className="flex items-center justify-center gap-2">
            <LoadingSpinner />
            Computing...
          </span>
        ) : (
          `Compute ${title}`
        )}
      </button>

      {state.txHash && (
        <p className="mt-2 text-xs text-muted-foreground">
          Tx: {state.txHash.slice(0, 8)}...{state.txHash.slice(-6)}
        </p>
      )}

      {/* Result Display */}
      <div className="mt-4 border-t border-border/40 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isDecrypted && state.decryptedValue !== null ? (
              <>
                <span className="text-sm" title="Decrypted" aria-label="Unlocked">
                  🔓
                </span>
                <span className="text-sm font-medium text-foreground">
                  {renderValue(state.decryptedValue)}
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

          {(isComputed || isDecrypted) && (
            <button
              onClick={onDecrypt}
              disabled={isDecrypting || isDecrypted || !clientReady}
              className="rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDecrypting ? (
                <span className="flex items-center gap-1">
                  <LoadingSpinner />
                  Decrypting...
                </span>
              ) : isDecrypted ? (
                "Revealed"
              ) : (
                "Decrypt"
              )}
            </button>
          )}
        </div>

        {state.error && (
          <p className="mt-2 text-xs text-destructive">{state.error}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main RiskDashboardTab Component ──────────────────────────────────────────
export function RiskDashboardTab() {
  const { client, isInitializing, error: clientError } = useCofheClient();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const [riskState, setRiskState] = useState<MetricState>({ ...initialMetricState });
  const [healthState, setHealthState] = useState<MetricState>({ ...initialMetricState });
  const [complianceState, setComplianceState] = useState<MetricState>({ ...initialMetricState });

  // ─── Compute Risk Exposure ────────────────────────────────────────────
  const handleComputeRisk = useCallback(async () => {
    setRiskState((prev) => ({ ...prev, status: "computing", error: null }));

    try {
      const hash = await writeContractAsync({
        address: GHOSTBAG_GUARD_ADDRESS,
        abi: GHOSTBAG_GUARD_ABI,
        functionName: "computeRisk",
        args: [],
      });

      setRiskState((prev) => ({
        ...prev,
        status: "computed",
        txHash: hash,
      }));
    } catch (err: any) {
      setRiskState((prev) => ({
        ...prev,
        status: "idle",
        error: err?.message ?? "Compute risk failed",
      }));
    }
  }, [writeContractAsync]);

  // ─── Compute Health Factor ────────────────────────────────────────────
  const handleComputeHealth = useCallback(async () => {
    setHealthState((prev) => ({ ...prev, status: "computing", error: null }));

    try {
      const hash = await writeContractAsync({
        address: GHOSTBAG_GUARD_ADDRESS,
        abi: GHOSTBAG_GUARD_ABI,
        functionName: "computeHealthFactor",
        args: [],
      });

      setHealthState((prev) => ({
        ...prev,
        status: "computed",
        txHash: hash,
      }));
    } catch (err: any) {
      setHealthState((prev) => ({
        ...prev,
        status: "idle",
        error: err?.message ?? "Compute health factor failed",
      }));
    }
  }, [writeContractAsync]);

  // ─── Compute Compliance Tier ──────────────────────────────────────────
  const handleComputeCompliance = useCallback(async () => {
    setComplianceState((prev) => ({ ...prev, status: "computing", error: null }));

    try {
      const hash = await writeContractAsync({
        address: GHOSTBAG_GUARD_ADDRESS,
        abi: GHOSTBAG_GUARD_ABI,
        functionName: "computeComplianceTier",
        args: [],
      });

      setComplianceState((prev) => ({
        ...prev,
        status: "computed",
        txHash: hash,
      }));
    } catch (err: any) {
      setComplianceState((prev) => ({
        ...prev,
        status: "idle",
        error: err?.message ?? "Compute compliance tier failed",
      }));
    }
  }, [writeContractAsync]);

  // ─── Decrypt Risk Exposure ────────────────────────────────────────────
  const handleDecryptRisk = useCallback(async () => {
    if (!client || !publicClient) return;

    setRiskState((prev) => ({ ...prev, status: "decrypting", error: null }));

    try {
      const { FheTypes } = await import("@cofhe/sdk");

      const handle = (await publicClient.readContract({
        address: GHOSTBAG_GUARD_ADDRESS,
        abi: GHOSTBAG_GUARD_ABI,
        functionName: "getRiskExposure",
        args: [],
      })) as bigint;

      const value = await client
        .decryptForView(handle, FheTypes.Uint64)
        .execute();

      setRiskState((prev) => ({
        ...prev,
        status: "decrypted",
        decryptedValue: BigInt(value.toString()),
      }));
    } catch (err: any) {
      setRiskState((prev) => ({
        ...prev,
        status: "computed",
        error: err?.message ?? "Decryption failed",
      }));
    }
  }, [client, publicClient]);

  // ─── Decrypt Health Factor ────────────────────────────────────────────
  const handleDecryptHealth = useCallback(async () => {
    if (!client || !publicClient) return;

    setHealthState((prev) => ({ ...prev, status: "decrypting", error: null }));

    try {
      const { FheTypes } = await import("@cofhe/sdk");

      const handle = (await publicClient.readContract({
        address: GHOSTBAG_GUARD_ADDRESS,
        abi: GHOSTBAG_GUARD_ABI,
        functionName: "getHealthFactor",
        args: [],
      })) as bigint;

      const value = await client
        .decryptForView(handle, FheTypes.Uint64)
        .execute();

      setHealthState((prev) => ({
        ...prev,
        status: "decrypted",
        decryptedValue: BigInt(value.toString()),
      }));
    } catch (err: any) {
      setHealthState((prev) => ({
        ...prev,
        status: "computed",
        error: err?.message ?? "Decryption failed",
      }));
    }
  }, [client, publicClient]);

  // ─── Decrypt Compliance Tier ──────────────────────────────────────────
  const handleDecryptCompliance = useCallback(async () => {
    if (!client || !publicClient) return;

    setComplianceState((prev) => ({ ...prev, status: "decrypting", error: null }));

    try {
      const { FheTypes } = await import("@cofhe/sdk");

      const handle = (await publicClient.readContract({
        address: GHOSTBAG_GUARD_ADDRESS,
        abi: GHOSTBAG_GUARD_ABI,
        functionName: "getComplianceTier",
        args: [],
      })) as bigint;

      const value = await client
        .decryptForView(handle, FheTypes.Uint8)
        .execute();

      setComplianceState((prev) => ({
        ...prev,
        status: "decrypted",
        decryptedValue: BigInt(value.toString()),
      }));
    } catch (err: any) {
      setComplianceState((prev) => ({
        ...prev,
        status: "computed",
        error: err?.message ?? "Decryption failed",
      }));
    }
  }, [client, publicClient]);

  // ─── Client initialization state ─────────────────────────────────────
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
        <h2 className="text-lg font-semibold text-foreground">Risk Dashboard</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Compute and decrypt encrypted risk metrics, health factor, and compliance
          tier for the treasury.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
        {/* Risk Exposure Section */}
        <MetricSection
          title="Risk Exposure"
          description="Weighted sum of all asset balances multiplied by their risk weights."
          state={riskState}
          onCompute={handleComputeRisk}
          onDecrypt={handleDecryptRisk}
          clientReady={!!client}
          renderValue={(value) => (
            <span>{value.toString()} bps</span>
          )}
        />

        {/* Health Factor Section */}
        <div className="rounded-lg border border-border/60 bg-card p-5 shadow-sm">
          <div className="mb-3">
            <h3 className="text-base font-semibold text-foreground">Health Factor</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Ratio of total assets to weighted risk exposure (10000 = 1.0x).
            </p>
          </div>

          {/* Compute Button */}
          <button
            onClick={handleComputeHealth}
            disabled={healthState.status === "computing"}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {healthState.status === "computing" ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner />
                Computing...
              </span>
            ) : (
              "Compute Health Factor"
            )}
          </button>

          {healthState.txHash && (
            <p className="mt-2 text-xs text-muted-foreground">
              Tx: {healthState.txHash.slice(0, 8)}...{healthState.txHash.slice(-6)}
            </p>
          )}

          {/* Gauge / Result Display */}
          <div className="mt-4 border-t border-border/40 pt-3">
            {healthState.status === "decrypted" && healthState.decryptedValue !== null ? (
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm" title="Decrypted" aria-label="Unlocked">
                    🔓
                  </span>
                  <span className="text-xs text-muted-foreground">Decrypted</span>
                </div>
                <HealthFactorGauge value={Number(healthState.decryptedValue)} />
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm" title="Encrypted" aria-label="Locked">
                    🔒
                  </span>
                  <span className="text-sm text-muted-foreground/60">
                    ••••••
                  </span>
                </div>

                {(healthState.status === "computed" || healthState.status === "decrypting") && (
                  <button
                    onClick={handleDecryptHealth}
                    disabled={healthState.status === "decrypting" || !client}
                    className="rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {healthState.status === "decrypting" ? (
                      <span className="flex items-center gap-1">
                        <LoadingSpinner />
                        Decrypting...
                      </span>
                    ) : (
                      "Decrypt"
                    )}
                  </button>
                )}
              </div>
            )}

            {healthState.error && (
              <p className="mt-2 text-xs text-destructive">{healthState.error}</p>
            )}
          </div>
        </div>

        {/* Compliance Tier Section */}
        <MetricSection
          title="Compliance Tier"
          description="Risk classification: Low (0), Medium (1), or High (2) based on thresholds."
          state={complianceState}
          onCompute={handleComputeCompliance}
          onDecrypt={handleDecryptCompliance}
          clientReady={!!client}
          renderValue={(value) => getTierBadge(Number(value))}
        />
      </div>

      {/* Stress Test Panel */}
      <StressTestPanel />

      {/* Public Reveal Panel (owner-only) */}
      <PublicRevealPanel />
    </div>
  );
}
