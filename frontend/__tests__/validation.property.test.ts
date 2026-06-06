// Feature: ghostbag, Property 7: Frontend Input Validation
// **Validates: Requirements 10.1, 10.6**

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { validateAmount, UINT64_MAX } from "@/lib/validation";

describe("Property 7: Frontend Input Validation", () => {
  // Helper: independently determine if a string represents a valid amount
  function isValidAmount(s: string): boolean {
    if (!s || s.trim() === "") return false;
    const trimmed = s.trim();
    if (!/^\d+$/.test(trimmed)) return false;
    const num = BigInt(trimmed);
    return num >= 1n && num <= UINT64_MAX;
  }

  it("validation passes iff input represents a positive integer in [1, 2^64 - 1] (arbitrary strings)", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const result = validateAmount(s);
        const expected = isValidAmount(s);
        expect(result.valid).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  it("validation passes for all valid positive integers in [1, 2^64 - 1]", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: UINT64_MAX }).map((n) => n.toString()),
        (s) => {
          const result = validateAmount(s);
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("validation fails for known invalid inputs", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "0",
          "",
          "-1",
          "abc",
          "1.5",
          (UINT64_MAX + 1n).toString(),
          " ",
          "  ",
          "-0",
          "1e5",
          "0x1A",
          "+1",
          "99999999999999999999999999999999"
        ),
        (s) => {
          const result = validateAmount(s);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("validation fails for non-numeric arbitrary strings", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => {
          const trimmed = s.trim();
          return trimmed.length > 0 && !/^\d+$/.test(trimmed);
        }),
        (s) => {
          const result = validateAmount(s);
          expect(result.valid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("validation fails for zero", () => {
    const result = validateAmount("0");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("greater than zero");
  });

  it("validation fails for values exceeding uint64 max", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: UINT64_MAX + 1n, max: UINT64_MAX * 10n }).map((n) =>
          n.toString()
        ),
        (s) => {
          const result = validateAmount(s);
          expect(result.valid).toBe(false);
          expect(result.error).toContain("must not exceed");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("validation handles boundary values correctly", () => {
    // Minimum valid
    expect(validateAmount("1").valid).toBe(true);
    // Maximum valid
    expect(validateAmount(UINT64_MAX.toString()).valid).toBe(true);
    // Just above max
    expect(validateAmount((UINT64_MAX + 1n).toString()).valid).toBe(false);
    // Zero (just below min)
    expect(validateAmount("0").valid).toBe(false);
  });

  it("validation fails for empty and whitespace-only strings", () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.constantFrom(" ", "\t", "\n", "\r"), { minLength: 1, maxLength: 20 })
          .map((chars) => chars.join("")),
        (s) => {
          const result = validateAmount(s);
          expect(result.valid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
