"use client";

import { useState, useCallback, useEffect } from "react";
import { useWriteContract, usePublicClient, useAccount } from "wagmi";
import { useCofheClient } from "@/hooks/useCofheClient";
import {
  GHOSTBAG_GUARD_ADDRESS,
  GHOSTBAG_GUARD_ABI,
} from "@/lib/contracts";

// ─── Types ────────────────────────────────────────────────────────────────────
type RevealStatus =
  | "idle"
  | "allowing"
  | "decrypting"
  | "publishing"
  | "polling"
  | "revealed"
  | "error";

interface RevealState {
  status: RevealStatus;
  revealedValue: bigint | null;
  error: string | null;
  pollAttempt: number;
}

const initialRevealState: RevealState = {
  status: "idle",
  revealedValue: null,
  error: null,
  pollAttempt: 0,
};

// ─── Metric Definitions ───────────────────────────────────────────────────────
interface MetricDef {
  metricId: number;
  label: string;
  getter: "getRiskExposure" | "getHealthFactor" | "getComplianceTier";
  description: string;
}

const METRICS: MetricDef[] = [
  {
    metricId: 0,
    label: "Risk Exposure",
    getter: "getRiskExposure",
    description: "Publicly reveal weighted risk exposure",
  },
  {
    metricId: 1,
    label: "Health Factor",
    getter: "getHealthFactor",
    description: "Publicly reveal health factor ratio",
  },
  {
    metricId: 2,
    label: "Compliance Tier",
    getter: "getComplianceTier",
    description: "Publicly reveal compliance tier classification",
  },
];

// ─── Constants ────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_RETRIES = 10;

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

// ─── Helper: delay ────────────────────────────────────────────────────────────
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main PublicRevealPanel Component ─────────────────────────────────────────
export function PublicRevealPanel() {
  const { client } = useCofheClient();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { address } = useAccount();

  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [ownerChecked, setOwnerChecked] = useState(false);

  const [revealStates, setRevealStates] = useState<Record<number, RevealState>>({
    0: { ...initialRevealState },
    1: { ...initialRevealState },
    2: { ...initialRevealState },
  });

  // ─── Check if connected wallet is the contract owner ──────────────────
  useEffect(() => {
    async function checkOwner() {
      if (!publicClient || !address) {
        setIsOwner(false);
        setOwnerChecked(true);
        return;
      }

      try {
        const owner = await publicClient.readContract({
          address: GHOSTBAG_GUARD_ADDRESS,
          abi: GHOSTBAG_GUARD_ABI,
          functionName: "owner",
          args: [],
        });

        setIsOwner(
          (owner as string).toLowerCase() === address.toLowerCase()
        );
      } catch {
        // If the contract isn't deployed or call fails, hide the panel
        setIsOwner(false);
      } finally {
        setOwnerChecked(true);
      }
    }

    checkOwner();
  }, [publicClient, address]);

  // ─── Update state helper ──────────────────────────────────────────────
  const updateRevealState = useCallback(
    (metricId: number, update: Partial<RevealState>) => {
      setRevealStates((prev) => ({
        ...prev,
        [metricId]: { ...prev[metricId], ...update },
      }));
    },
    []
  );

  // ─── Poll getDecryptResult ────────────────────────────────────────────
  const pollDecryptResult = useCallback(
    async (handle: bigint): Promise<{ value: bigint; ready: boolean }> => {
      if (!publicClient) throw new Error("Public client not available");

      const result = await publicClient.readContract({
        address: GHOSTBAG_GUARD_ADDRESS,
        abi: GHOSTBAG_GUARD_ABI,
        functionName: "getDecryptResult",
        args: [handle],
      });

      const [value, ready] = result as [bigint, boolean];
      return { value, ready };
    },
    [publicClient]
  );

  // ─── Public Reveal Flow ───────────────────────────────────────────────
  const handleReveal = useCallback(
    async (metric: MetricDef) => {
      if (!client || !publicClient) return;

      const { metricId, getter } = metric;

      updateRevealState(metricId, {
        status: "allowing",
        error: null,
        revealedValue: null,
        pollAttempt: 0,
      });

      try {
        // Step 1: Call allowPublicReveal(metricId) on-chain
        await writeContractAsync({
          address: GHOSTBAG_GUARD_ADDRESS,
          abi: GHOSTBAG_GUARD_ABI,
          functionName: "allowPublicReveal",
          args: [metricId],
        });

        // Step 2: Get the handle for this metric
        const handle = (await publicClient.readContract({
          address: GHOSTBAG_GUARD_ADDRESS,
          abi: GHOSTBAG_GUARD_ABI,
          functionName: getter,
          args: [],
        })) as bigint;

        // Step 3: Use decryptForTx to get ctHash, plaintext, and signature
        // from the Threshold Network (permit-free since allowPublicReveal was called)
        updateRevealState(metricId, { status: "decrypting" });

        const decryptResult = await (client as any)
          .decryptForTx(handle)
          .withoutPermit()
          .execute();

        // Step 4: Submit publishReveal on-chain
        updateRevealState(metricId, { status: "publishing" });

        await writeContractAsync({
          address: GHOSTBAG_GUARD_ADDRESS,
          abi: GHOSTBAG_GUARD_ABI,
          functionName: "publishReveal",
          args: [
            decryptResult.ctHash,
            decryptResult.decryptedValue,
            decryptResult.signature,
          ],
        });

        // Step 5: Poll getDecryptResult at 3-second intervals, max 10 retries
        updateRevealState(metricId, { status: "polling", pollAttempt: 0 });

        for (let attempt = 1; attempt <= MAX_POLL_RETRIES; attempt++) {
          updateRevealState(metricId, { pollAttempt: attempt });

          const { value, ready } = await pollDecryptResult(handle);

          if (ready) {
            updateRevealState(metricId, {
              status: "revealed",
              revealedValue: value,
            });
            return;
          }

          if (attempt < MAX_POLL_RETRIES) {
            await delay(POLL_INTERVAL_MS);
          }
        }

        // Timeout after max retries
        updateRevealState(metricId, {
          status: "error",
          error: `Decryption not ready after ${MAX_POLL_RETRIES} attempts (${(MAX_POLL_RETRIES * POLL_INTERVAL_MS) / 1000}s timeout). Please try again later.`,
        });
      } catch (err: any) {
        updateRevealState(metricId, {
          status: "error",
          error: err?.message ?? "Public reveal failed",
        });
      }
    },
    [client, publicClient, writeContractAsync, updateRevealState, pollDecryptResult]
  );

  // ─── Don't render if not owner or not yet checked ─────────────────────
  if (!ownerChecked || !isOwner) {
    return null;
  }

  return (
    <div className="mt-6 rounded-lg border border-border/60 bg-card p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground">
          Public Reveal
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Publicly reveal encrypted risk metrics on-chain for verifiable solvency
          proofs. This uses the async decryption pattern via the Threshold Network.
        </p>
      </div>

      {/* Metric Reveal Buttons */}
      <div className="space-y-3">
        {METRICS.map((metric) => {
          const state = revealStates[metric.metricId];
          const isProcessing =
            state.status !== "idle" &&
            state.status !== "revealed" &&
            state.status !== "error";

          return (
            <div
              key={metric.metricId}
              className="flex items-center justify-between rounded-md border border-border/40 bg-muted/20 px-4 py-3"
            >
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  {metric.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {metric.description}
                </p>

                {/* Status indicators */}
                {state.status === "allowing" && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <LoadingSpinner /> Enabling public access...
                  </p>
                )}
                {state.status === "decrypting" && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <LoadingSpinner /> Requesting decryption from Threshold Network...
                  </p>
                )}
                {state.status === "publishing" && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <LoadingSpinner /> Publishing reveal on-chain...
                  </p>
                )}
                {state.status === "polling" && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <LoadingSpinner /> Polling result ({state.pollAttempt}/{MAX_POLL_RETRIES})...
                  </p>
                )}
                {state.status === "revealed" && state.revealedValue !== null && (
                  <p className="mt-1 text-xs text-green-400">
                    ✓ Revealed: {state.revealedValue.toString()}
                  </p>
                )}
                {state.status === "error" && state.error && (
                  <p className="mt-1 text-xs text-destructive">
                    {state.error}
                  </p>
                )}
              </div>

              <button
                onClick={() => handleReveal(metric)}
                disabled={isProcessing || !client}
                className="ml-4 shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {state.status === "revealed" ? "Re-Reveal" : "Reveal"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
