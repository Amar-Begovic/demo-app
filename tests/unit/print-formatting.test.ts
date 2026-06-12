import { describe, it, expect } from "vitest";
import fc from "fast-check";

// Pure formatting functions extracted from the print page logic
// (app/(dashboard)/production/[id]/print/[deptId]/page.tsx)

/**
 * Formats dimension string for a material on the print page.
 * Returns the dimension string (e.g., "100×200×50") if at least one dimension is non-null,
 * or null if all dimensions are null.
 */
export function formatMaterialDimensions(material: {
  length: number | null;
  width: number | null;
  height: number | null;
}): string | null {
  const dims = [material.length, material.width, material.height].filter(
    (v) => v != null
  );
  if (dims.length === 0) return null;
  return `${material.length ?? "—"}×${material.width ?? "—"}×${material.height ?? "—"}`;
}

/**
 * Determines if the "Kantovana" label should be shown for a material.
 * Returns true iff isEdgebanded is exactly true.
 */
export function shouldShowEdgebanding(isEdgebanded: boolean | null): boolean {
  return isEdgebanded === true;
}

// Feature: material-dimensions-and-production-steps-ui, Property 6: Print dimensions rendering
// Validates: Requirements 4.1, 4.4

describe("Property 6: Print dimensions rendering", () => {
  it("dimension format string includes dimensions iff at least one is non-null", () => {
    fc.assert(
      fc.property(
        fc.option(fc.float({ min: 0, max: Math.fround(10000), noNaN: true }), { nil: null }),
        fc.option(fc.float({ min: 0, max: Math.fround(10000), noNaN: true }), { nil: null }),
        fc.option(fc.float({ min: 0, max: Math.fround(10000), noNaN: true }), { nil: null }),
        (length, width, height) => {
          const result = formatMaterialDimensions({ length, width, height });
          const anyNonNull =
            length !== null || width !== null || height !== null;

          if (anyNonNull) {
            // Should return a string containing "×"
            expect(result).not.toBeNull();
            expect(result).toContain("×");
          } else {
            // All null → no dimension text
            expect(result).toBeNull();
          }
        }
      )
    );
  });

  it("dimension string contains actual non-null values", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: Math.fround(10000), noNaN: true }),
        fc.option(fc.float({ min: 0, max: Math.fround(10000), noNaN: true }), { nil: null }),
        fc.option(fc.float({ min: 0, max: Math.fround(10000), noNaN: true }), { nil: null }),
        (length, width, height) => {
          const result = formatMaterialDimensions({ length, width, height });
          expect(result).not.toBeNull();
          // The length value should appear in the string
          expect(result!).toContain(String(length));
        }
      )
    );
  });
});

// Feature: material-dimensions-and-production-steps-ui, Property 7: Print edgebanding rendering
// Validates: Requirements 4.2, 4.3

describe("Property 7: Print edgebanding rendering", () => {
  it('"Kantovana" label appears iff isEdgebanded is true', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(true),
          fc.constant(false),
          fc.constant(null)
        ),
        (isEdgebanded) => {
          const show = shouldShowEdgebanding(isEdgebanded);

          if (isEdgebanded === true) {
            expect(show).toBe(true);
          } else {
            // false or null → no label
            expect(show).toBe(false);
          }
        }
      )
    );
  });
});
