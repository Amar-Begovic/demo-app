import { test as fcTest, fc } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { groupBySerialNumber, type PakovanjeLabelGroup } from "@/lib/utils/print-helpers";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Pool of serial numbers to draw from (ensures overlap between items). */
const serialNumberPool = ["SN-001", "SN-002", "SN-003", "SN-004", "SN-005"];

/** Arbitrary for a serial number: either a value from the pool, null, or empty string. */
const serialNumberArb = fc.oneof(
  { weight: 5, arbitrary: fc.constantFrom(...serialNumberPool) },
  { weight: 2, arbitrary: fc.constant(null) },
  { weight: 1, arbitrary: fc.constant("") }
);

/** Minimal article label for testing groupBySerialNumber. */
const articleLabelArb = (serialNumber: fc.Arbitrary<string | null>) =>
  fc.record({
    articleName: fc.constantFrom("Madrac A", "Krevet B", "Stolica C", "Ormar D"),
    articleCode: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: null }),
    allParts: fc.constant("part1+part2"),
    footerComponents: fc.constant("footer"),
    fabricName: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: null }),
    serialNumber,
    notes: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
    orderNumber: fc.integer({ min: 1, max: 99999 }),
    date: fc.constant("01.01.2025"),
    customerName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  });

/** Minimal component label for testing. */
const componentLabelArb = fc.record({
  articleName: fc.constantFrom("Madrac A", "Krevet B"),
  articleCode: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: null }),
  componentName: fc.constantFrom("Jezgro", "Navlaka", "Podnica"),
  fabricName: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: null }),
  serialNumber: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: null }),
  notes: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  barcodeValue: fc.string({ minLength: 5, maxLength: 20 }),
  barcodeImage: fc.string({ minLength: 10, maxLength: 30 }),
  orderNumber: fc.integer({ min: 1, max: 99999 }),
  date: fc.constant("01.01.2025"),
  customerName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
});

/** Arbitrary for a LabelGroup with serial number from the pool/null/empty. */
const labelGroupArb: fc.Arbitrary<PakovanjeLabelGroup> = fc.record({
  article: articleLabelArb(serialNumberArb),
  componentLabels: fc.array(componentLabelArb, { minLength: 0, maxLength: 2 }),
});

/** Arbitrary for a non-empty array of LabelGroups. */
const labelGroupsArb = fc.array(labelGroupArb, { minLength: 1, maxLength: 20 });

// ---------------------------------------------------------------------------
// Feature: packaging-label-print-filters, Property 4: Serial number grouping consecutiveness
// **Validates: Requirements 3.1, 3.4**
// ---------------------------------------------------------------------------
describe("Feature: packaging-label-print-filters, Property 4: Serial number grouping consecutiveness", () => {
  fcTest.prop([labelGroupsArb], { numRuns: 200 })(
    "all items with same non-null serial number are consecutive in output",
    (groups) => {
      const result = groupBySerialNumber(groups);

      // For each non-null, non-empty serial number, find all indices in the result
      const serialIndices = new Map<string, number[]>();
      for (let i = 0; i < result.length; i++) {
        const sn = result[i].article.serialNumber;
        if (sn != null && sn !== "") {
          if (!serialIndices.has(sn)) serialIndices.set(sn, []);
          serialIndices.get(sn)!.push(i);
        }
      }

      // All indices for each serial number must be consecutive (no gaps)
      for (const [sn, indices] of serialIndices) {
        for (let i = 1; i < indices.length; i++) {
          expect(indices[i]).toBe(
            indices[i - 1] + 1,
          );
        }
      }
    }
  );

  fcTest.prop([labelGroupsArb], { numRuns: 200 })(
    "null/empty serial items are not grouped with each other",
    (groups) => {
      const result = groupBySerialNumber(groups);

      // Count null/empty serial items in input and output — should be the same count
      const inputNullCount = groups.filter(
        (g) => g.article.serialNumber == null || g.article.serialNumber === ""
      ).length;
      const outputNullCount = result.filter(
        (g) => g.article.serialNumber == null || g.article.serialNumber === ""
      ).length;
      expect(outputNullCount).toBe(inputNullCount);

      // Total output length should equal input length (no items lost or duplicated)
      expect(result.length).toBe(groups.length);
    }
  );

  fcTest.prop([labelGroupsArb], { numRuns: 200 })(
    "output contains exactly the same items as input (no items lost or duplicated)",
    (groups) => {
      const result = groupBySerialNumber(groups);
      expect(result.length).toBe(groups.length);

      // Every item in the input should appear in the output (by reference)
      const resultSet = new Set(result);
      for (const group of groups) {
        expect(resultSet.has(group)).toBe(true);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// Feature: packaging-label-print-filters, Property 5: Grouping preserves relative sort order
// **Validates: Requirements 3.3**
// ---------------------------------------------------------------------------
describe("Feature: packaging-label-print-filters, Property 5: Grouping preserves relative sort order", () => {
  fcTest.prop([labelGroupsArb], { numRuns: 200 })(
    "relative order within each serial group is preserved from input",
    (groups) => {
      const result = groupBySerialNumber(groups);

      // For each non-null, non-empty serial number, collect items in input order
      // and verify they appear in the same relative order in the output
      const inputOrder = new Map<string, PakovanjeLabelGroup[]>();
      for (const group of groups) {
        const sn = group.article.serialNumber;
        if (sn != null && sn !== "") {
          if (!inputOrder.has(sn)) inputOrder.set(sn, []);
          inputOrder.get(sn)!.push(group);
        }
      }

      const outputOrder = new Map<string, PakovanjeLabelGroup[]>();
      for (const group of result) {
        const sn = group.article.serialNumber;
        if (sn != null && sn !== "") {
          if (!outputOrder.has(sn)) outputOrder.set(sn, []);
          outputOrder.get(sn)!.push(group);
        }
      }

      // For each serial number, the items should appear in the same order
      for (const [sn, inputItems] of inputOrder) {
        const outputItems = outputOrder.get(sn)!;
        expect(outputItems.length).toBe(inputItems.length);
        for (let i = 0; i < inputItems.length; i++) {
          // Same reference — the grouping should not create new objects
          expect(outputItems[i]).toBe(inputItems[i]);
        }
      }
    }
  );

  fcTest.prop([labelGroupsArb], { numRuns: 200 })(
    "null/empty serial items maintain their relative order from input",
    (groups) => {
      const result = groupBySerialNumber(groups);

      // Extract null/empty serial items from input and output in order
      const inputNulls = groups.filter(
        (g) => g.article.serialNumber == null || g.article.serialNumber === ""
      );
      const outputNulls = result.filter(
        (g) => g.article.serialNumber == null || g.article.serialNumber === ""
      );

      expect(outputNulls.length).toBe(inputNulls.length);
      for (let i = 0; i < inputNulls.length; i++) {
        expect(outputNulls[i]).toBe(inputNulls[i]);
      }
    }
  );
});
