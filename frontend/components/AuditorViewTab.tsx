"use client";

import { useState, useCallback, useEffect } from "react";
import { useWriteContract, usePublicClient, useAccount } from "wagmi";
import { useCofheClient } from "@/hooks/useCofheClient";
import {
  GHOSTBAG_GUARD_ADDRESS,
  GHOSTBAG_GUARD_ABI,
} from "@/lib/contracts";

// ─── Types ────────────────────────────────────────────────────────────────────
type DecryptStatus = "idle" | "decrypting" | "decrypted";

interface DecryptState {
  status: DecryptStatus;
  decryptedValue: bigint | null;
  error: string | null;
}

const initialDecryptState: DecryptState = {
  status: "idle",
  decryptedValue: null,
  error: null,
};

type Role = "owner" | "auditor" | "none" | "loading";

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

// ─── Owner View: Grant Auditor Access ─────────────────────────────────────────
function OwnerGrantForm() {
  const { writeContractAsync } = useWriteContract();
  const [auditorAddress, setAuditorAddress] = useState("");
  const [isGranting, setIsGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantSuccess, setGrantSuccess] = useState<string | null>(null);

  const handleGrant = useCallback(async () => {
    if (!auditorAddress || !/^0x[0-9a-fA-F]{40}$/.test(auditorAddress)) {
      setGrantError("Please enter a valid Ethereum address.");
      return;
    }

    setIsGranting(true);
    setGrantError(null);
    setGrantSuccess(null);

    try {
      const hash = await writeContractAsync({
        address: GHOSTBAG_GUARD_ADDRESS,
        abi: GHOSTBAG_GUARD_ABI,
        functionName: "grantAuditorAccess",
        args: [auditorAddress as `0x${string}`],
      });

      setGrantSuccess(`Access granted! Tx: ${hash.slice(0, 8)}...${hash.slice(-6)}`);
      setAuditorAddress("");
    } catch (err: any) {
      setGrantError(err?.message ?? "Failed to grant auditor access");
    } finally {
      setIsGranting(false);
    }
  }, [auditorAddress, writeContractAsync]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          Grant Auditor Access
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Grant an address limited access to view aggregated risk metrics
          (weighted exposure and compliance tier) without seeing individual positions.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="0x... auditor address"
          value={auditorAddress}
          onChange={(e) => setAuditorAddress(e.target.value)}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={handleGrant}
          disabled={isGranting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGranting ? (
            <span className="flex items-center gap-2">
              <LoadingSpinner />
              Granting...
            </span>
          ) : (
            "Grant Access"
          )}
        </button>
      </div>

      {grantError && (
        <p className="text-xs text-destructive">{grantError}</p>
      )}
      {grantSuccess && (
        <p className="text-xs text-green-400">{grantSuccess}</p>
      )}
    </div>
  );
}

// ─── Auditor View: Decrypt Risk Metrics ───────────────────────────────────────
function AuditorMetricsView() {
  const { client, isInitializing, error: clientError } = useCofheClient();
  const publicClient = usePublicClient();

  const [riskState, setRiskState] = useState<DecryptState>({ ...initialDecryptState });
  const [complianceState, setComplianceState] = useState<DecryptState>({ ...initialDecryptState });

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

      const decryptResult = await client
        .decryptHandle(handle, FheTypes.Uint64)
        .decrypt();

      if (!decryptResult.success) {
        throw decryptResult.error;
      }

      setRiskState({
        status: "decrypted",
        decryptedValue: BigInt(decryptResult.data.toString()),
        error: null,
      });
    } catch (err: any) {
      setRiskState((prev) => ({
        ...prev,
        status: "idle",
        error: err?.message ?? "Decryption failed — you may not have access to this handle",
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

      const decryptResult = await client
        .decryptHandle(handle, FheTypes.Uint8)
        .decrypt();

      if (!decryptResult.success) {
        throw decryptResult.error;
      }

      setComplianceState({
        status: "decrypted",
        decryptedValue: BigInt(decryptResult.data.toString()),
        error: null,
      });
    } catch (err: any) {
      setComplianceState((prev) => ({
        ...prev,
        status: "idle",
        error: err?.message ?? "Decryption failed — you may not have access to this handle",
      }));
    }
  }, [client, publicClient]);

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
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          Auditor Metrics View
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          You have limited access to view aggregated risk metrics. Decrypt
          weighted risk exposure and compliance tier below.
        </p>
      </div>

      {/* Permitted Metrics */}
      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
        {/* Risk Exposure */}
        <div className="rounded-lg border border-border/60 bg-card p-5 shadow-sm">
          <h4 className="text-sm font-semibold text-foreground">
            Weighted Risk Exposure
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Aggregated risk across all treasury positions.
          </p>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {riskState.status === "decrypted" && riskState.decryptedValue !== null ? (
                <>
                  <span className="text-sm" title="Decrypted" aria-label="Unlocked">
                    🔓
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {riskState.decryptedValue.toString()} bps
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
              onClick={handleDecryptRisk}
              disabled={riskState.status === "decrypting" || riskState.status === "decrypted" || !client}
              className="rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {riskState.status === "decrypting" ? (
                <span className="flex items-center gap-1">
                  <LoadingSpinner />
                  Decrypting...
                </span>
              ) : riskState.status === "decrypted" ? (
                "Revealed"
              ) : (
                "Decrypt"
              )}
            </button>
          </div>
          {riskState.error && (
            <p className="mt-2 text-xs text-destructive">{riskState.error}</p>
          )}
        </div>

        {/* Compliance Tier */}
        <div className="rounded-lg border border-border/60 bg-card p-5 shadow-sm">
          <h4 className="text-sm font-semibold text-foreground">
            Compliance Tier
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Risk classification derived from encrypted thresholds.
          </p>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {complianceState.status === "decrypted" && complianceState.decryptedValue !== null ? (
                <>
                  <span className="text-sm" title="Decrypted" aria-label="Unlocked">
                    🔓
                  </span>
                  {getTierBadge(Number(complianceState.decryptedValue))}
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
              onClick={handleDecryptCompliance}
              disabled={complianceState.status === "decrypting" || complianceState.status === "decrypted" || !client}
              className="rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {complianceState.status === "decrypting" ? (
                <span className="flex items-center gap-1">
                  <LoadingSpinner />
                  Decrypting...
                </span>
              ) : complianceState.status === "decrypted" ? (
                "Revealed"
              ) : (
                "Decrypt"
              )}
            </button>
          </div>
          {complianceState.error && (
            <p className="mt-2 text-xs text-destructive">{complianceState.error}</p>
          )}
        </div>
      </div>

      {/* Access Denied Section */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <h4 className="text-sm font-semibold text-amber-400">
          🚫 Restricted Access
        </h4>
        <p className="mt-1 text-xs text-muted-foreground">
          The following metrics are not accessible with auditor permissions:
        </p>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground/80">
          <li className="flex items-center gap-2">
            <span className="text-amber-500">✕</span>
            Individual asset balances (getBalance) — Access Denied
          </li>
          <li className="flex items-center gap-2">
            <span className="text-amber-500">✕</span>
            Health factor (getHealthFactor) — Access Denied
          </li>
        </ul>
      </div>
    </div>
  );
}

// ─── Access Denied View ───────────────────────────────────────────────────────
function AccessDeniedView() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <span className="text-4xl mb-4" aria-hidden="true">🔒</span>
      <h3 className="text-lg font-semibold text-foreground">Access Denied</h3>
      <p className="mt-2 text-sm text-muted-foreground text-center max-w-md">
        Your connected wallet is neither the contract owner nor an authorized
        auditor. Only the owner can grant auditor access, and only the auditor
        can view aggregated risk metrics.
      </p>
    </div>
  );
}

// ─── Main AuditorViewTab Component ────────────────────────────────────────────
export function AuditorViewTab() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [role, setRole] = useState<Role>("loading");

  useEffect(() => {
    async function determineRole() {
      if (!address || !publicClient) {
        setRole("none");
        return;
      }

      try {
        const [ownerAddress, auditorAddress] = await Promise.all([
          publicClient.readContract({
            address: GHOSTBAG_GUARD_ADDRESS,
            abi: GHOSTBAG_GUARD_ABI,
            functionName: "owner",
            args: [],
          }) as Promise<string>,
          publicClient.readContract({
            address: GHOSTBAG_GUARD_ADDRESS,
            abi: GHOSTBAG_GUARD_ABI,
            functionName: "auditor",
            args: [],
          }) as Promise<string>,
        ]);

        const lowerAddress = address.toLowerCase();

        if (lowerAddress === ownerAddress.toLowerCase()) {
          setRole("owner");
        } else if (
          auditorAddress !== "0x0000000000000000000000000000000000000000" &&
          lowerAddress === auditorAddress.toLowerCase()
        ) {
          setRole("auditor");
        } else {
          setRole("none");
        }
      } catch {
        // If contract is not deployed or calls fail, show access denied
        setRole("none");
      }
    }

    determineRole();
  }, [address, publicClient]);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">Auditor View</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Grant auditor access and view aggregated risk metrics with limited
          permissions.
        </p>
      </div>

      {role === "loading" && (
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner />
          <span className="ml-2 text-sm text-muted-foreground">
            Checking permissions...
          </span>
        </div>
      )}

      {role === "owner" && <OwnerGrantForm />}
      {role === "auditor" && <AuditorMetricsView />}
      {role === "none" && <AccessDeniedView />}
    </div>
  );
}
