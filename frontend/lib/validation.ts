// ─── Constants ────────────────────────────────────────────────────────────────
export const UINT64_MAX = BigInt("18446744073709551615"); // 2^64 - 1

// ─── Input Validation ─────────────────────────────────────────────────────────
export function validateAmount(value: string): { valid: boolean; error?: string } {
  if (!value || value.trim() === "") {
    return { valid: false, error: "Amount is required" };
  }

  const trimmed = value.trim();

  // Reject non-numeric
  if (!/^\d+$/.test(trimmed)) {
    return {
      valid: false,
      error: "Amount must be a positive integer (no decimals, signs, or letters)",
    };
  }

  const num = BigInt(trimmed);

  if (num === BigInt(0)) {
    return { valid: false, error: "Amount must be greater than zero" };
  }

  if (num > UINT64_MAX) {
    return {
      valid: false,
      error: `Amount must not exceed ${UINT64_MAX.toString()} (uint64 max)`,
    };
  }

  return { valid: true };
}
