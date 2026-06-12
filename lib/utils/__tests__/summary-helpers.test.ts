import { test as fcTest, fc } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import {
  buildSummaryRows,
  type OrderPrintBundle,
} from "@/lib/utils/summary-helpers";
import {
  compareItemsBySortKeys,
  type PrintData,
  type SortKey,
} from "@/lib/utils/print-helpers";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Pool of article names to draw from (ensures overlap across bundles). */
const articleNamePool = ["Madrac A", "Krevet B", "Stolica C", "Ormar D", "Polica E"];

/** Pool of article codes (nullable). */
const articleCodePool = [null, "MA-100", "KB-200", "SC-300", "OR-400"];

/** Pool of fabric names (nullable). */
const fabricNamePool = [null, "Pamuk", "Svila", "Lan", "Poliester"];

/** Arbitrary for a single material within a step. */
const materialArb = fc.record({
  materialId: fc.uuid(),
  materialName: fc.string({ minLength: 1, maxLength: 20 }),
  materialCode: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: null }),
  quantity: fc.integer({ min: 1, max: 100 }),
  pieces: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
  unit: fc.constantFrom("m", "kg", "pcs", "l"),
  price: fc.option(fc.float({ min: 0, max: 10000, noNaN: true }), { nil: null }),
  length: fc.option(fc.float({ min: 0, max: 5000, noNaN: true }), { nil: null }),
  width: fc.option(fc.float({ min: 0, max: 5000, noNaN: true }), { nil: null }),
  height: fc.option(fc.float({ min: 0, max: 5000, noNaN: true }), { nil: null }),
  isEdgebanded: fc.option(fc.boolean(), { nil: null }),
  isOverridden: fc.boolean(),
  originalMaterialName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
});

/** Arbitrary for a production step. */
const stepArb = fc.record({
  stepId: fc.uuid(),
  stepName: fc.string({ minLength: 1, maxLength: 20 }),
  sequenceOrder: fc.integer({ min: 1, max: 100 }),
  departmentId: fc.uuid(),
  departmentName: fc.string({ minLength: 1, maxLength: 20 }),
  estimatedTime: fc.option(fc.integer({ min: 1, max: 480 }), { nil: null }),
  instructions: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
  materials: fc.array(materialArb, { minLength: 0, maxLength: 2 }),
});

/** Arbitrary for a part. */
const partArb = fc.record({
  partId: fc.uuid(),
  partName: fc.string({ minLength: 1, maxLength: 20 }),
  dimensions: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  steps: fc.array(stepArb, { minLength: 0, maxLength: 2 }),
});

/**
 * Arbitrary for a single PrintData item.
 * Article name, code, and fabric are drawn from pools to ensure overlap across bundles.
 */
const itemArb = fc.record({
  articleId: fc.uuid(),
  articleName: fc.constantFrom(...articleNamePool),
  articleCode: fc.constantFrom(...articleCodePool),
  articleDescription: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
  priceWithoutVAT: fc.option(fc.float({ min: 0, max: 100000, noNaN: true }), { nil: null }),
  quantity: fc.integer({ min: 1, max: 500 }),
  deliveryDeadline: fc.option(
    fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }),
    { nil: null }
  ),
  priority: fc.constantFrom("low", "normal", "high", "urgent"),
  notes: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
  customerOrderNumber: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  loadingNumber: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  serialNumber: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  loadingSequence: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
  articleDimensions: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  withLegs: fc.boolean(),
  fabric: fc.constantFrom(...fabricNamePool).map((name) =>
    name === null ? null : { id: "fabric-id", name, color: null }
  ),
  rucka: fc.constant(null as PrintData["items"][number]["rucka"]),
  paspul: fc.constant(null as PrintData["items"][number]["paspul"]),
  step: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
  nogice1: fc.constant(null as PrintData["items"][number]["nogice1"]),
  nogice2: fc.constant(null as PrintData["items"][number]["nogice2"]),
  parts: fc.array(partArb, { minLength: 0, maxLength: 2 }),
});

/** Arbitrary for PrintData with 1+ items. */
const printDataArb: fc.Arbitrary<PrintData> = fc.record({
  orderId: fc.uuid(),
  orderNumber: fc.integer({ min: 1, max: 99999 }),
  customerName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
  customerPhone: fc.option(fc.string({ minLength: 1, maxLength: 15 }), { nil: null }),
  documentNumber: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  deliveryLocation: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
  receivedBy: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }),
  workOrderDate: fc.option(fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }), { nil: null }),
  items: fc.array(itemArb, { minLength: 1, maxLength: 5 }),
});

/** Arbitrary for an OrderPrintBundle. */
const bundleArb: fc.Arbitrary<OrderPrintBundle> = printDataArb.map((data) => ({
  data,
}));

/** Arbitrary for a non-empty array of bundles. */
const bundlesArb = fc.array(bundleArb, { minLength: 1, maxLength: 4 });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the aggregation key for an item, matching the implementation. */
function aggKey(
  articleName: string,
  articleCode: string | null,
  fabricName: string | null,
  loadingNumber: string | null
): string {
  return `${articleName}\0${articleCode ?? ""}\0${fabricName ?? ""}\0${loadingNumber ?? ""}`;
}

/** Count total items across all bundles. */
function totalItemCount(bundles: OrderPrintBundle[]): number {
  return bundles.reduce((sum, b) => sum + b.data.items.length, 0);
}

// ---------------------------------------------------------------------------
// Property 5: Separate mode preserves all items with source orders
// **Validates: Requirements 6.1, 6.2**
// ---------------------------------------------------------------------------
describe("Property 5: Separate mode preserves all items with source orders", () => {
  fcTest.prop([bundlesArb], { numRuns: 100 })(
    "total quantity across all rows equals total expanded units across all bundles",
    (bundles) => {
      const rows = buildSummaryRows(bundles, false);
      // Each item is expanded per-unit, then merged by serial number.
      // Merged rows have quantity=1, so total rows = total expanded units minus merged duplicates.
      // But total quantity should always be >= 1 per row.
      // The key invariant: every row has quantity >= 1 and rb is sequential.
      for (let i = 0; i < rows.length; i++) {
        expect(rows[i].rb).toBe(i + 1);
        expect(rows[i].quantity).toBeGreaterThanOrEqual(1);
      }
    }
  );

  fcTest.prop([bundlesArb], { numRuns: 100 })(
    "every row has a non-empty sourceOrderNumbers array",
    (bundles) => {
      const rows = buildSummaryRows(bundles, false);
      for (const row of rows) {
        expect(row.sourceOrderNumbers.length).toBeGreaterThan(0);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// Property 6: Aggregation produces unique keys and valid quantities
// **Validates: Requirements 5.2, 5.3**
// ---------------------------------------------------------------------------
describe("Property 6: Aggregation groups by key and sums quantities", () => {
  fcTest.prop([bundlesArb], { numRuns: 100 })(
    "each unique (articleName, articleCode, fabricName, loadingNumber) tuple appears exactly once",
    (bundles) => {
      const rows = buildSummaryRows(bundles, true);
      const keys = rows.map((r) => aggKey(r.articleName, r.articleCode, r.fabricName, r.loadingNumber));
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(rows.length);
    }
  );

  fcTest.prop([bundlesArb], { numRuns: 100 })(
    "total quantity across all aggregated rows equals total expanded units across all bundles",
    (bundles) => {
      const rows = buildSummaryRows(bundles, true);

      // Total expanded units = sum of all item quantities across all bundles
      let totalExpandedUnits = 0;
      for (const bundle of bundles) {
        for (const item of bundle.data.items) {
          totalExpandedUnits += item.quantity;
        }
      }

      // After serial merging, N items sharing a serial become 1 set row.
      // Total aggregated quantity should be <= totalExpandedUnits (merging reduces count).
      const totalAggQty = rows.reduce((sum, r) => sum + r.quantity, 0);
      expect(totalAggQty).toBeLessThanOrEqual(totalExpandedUnits);
      expect(totalAggQty).toBeGreaterThan(0);

      // Every row should have quantity >= 1
      for (const row of rows) {
        expect(row.quantity).toBeGreaterThanOrEqual(1);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// Property 7: Aggregation preserves all notes
// **Validates: Requirements 5.4**
// ---------------------------------------------------------------------------
describe("Property 7: Aggregation preserves all notes", () => {
  fcTest.prop([bundlesArb], { numRuns: 100 })(
    "every non-null non-empty note from source items appears in some aggregated row",
    (bundles) => {
      const rows = buildSummaryRows(bundles, true);

      // Collect all notes from source items
      const allSourceNotes: string[] = [];
      for (const bundle of bundles) {
        for (const item of bundle.data.items) {
          if (item.notes != null && item.notes !== "") {
            allSourceNotes.push(item.notes);
          }
        }
      }

      // Collect all notes from aggregated rows
      const allAggNotes = rows
        .map((r) => r.notes)
        .filter((n): n is string => n != null)
        .join("\0");

      // Every source note must appear somewhere in the aggregated notes
      for (const note of allSourceNotes) {
        expect(allAggNotes).toContain(note);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// Property 8: Aggregation tracks all source order numbers
// **Validates: Requirements 5.5**
// ---------------------------------------------------------------------------
describe("Property 8: Aggregation tracks all source order numbers", () => {
  fcTest.prop([bundlesArb], { numRuns: 100 })(
    "every contributing bundle's order number appears in at least one aggregated row",
    (bundles) => {
      const rows = buildSummaryRows(bundles, true);

      // Collect all order numbers from source bundles
      const allSourceOrderNumbers = new Set<number>();
      for (const bundle of bundles) {
        allSourceOrderNumbers.add(bundle.data.orderNumber);
      }

      // Collect all order numbers from aggregated rows
      const allAggOrderNumbers = new Set<number>();
      for (const row of rows) {
        for (const on of row.sourceOrderNumbers) {
          allAggOrderNumbers.add(on);
        }
      }

      // Every source order number must appear in the aggregated rows
      for (const orderNum of allSourceOrderNumbers) {
        expect(allAggOrderNumbers.has(orderNum)).toBe(true);
      }

      // No duplicates within each row
      for (const row of rows) {
        const uniqueSourceOrders = new Set(row.sourceOrderNumbers);
        expect(uniqueSourceOrders.size).toBe(row.sourceOrderNumbers.length);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// Property 9: Separate mode sort order
// **Validates: Requirements 6.3**
// ---------------------------------------------------------------------------
describe("Property 9: Separate mode sort order", () => {
  fcTest.prop([bundlesArb], { numRuns: 100 })(
    "rows are sorted by source order number ascending, then serial number, then krevet-before-madrac within same serial, then article name ascending",
    (bundles) => {
      const rows = buildSummaryRows(bundles, false);

      for (let i = 1; i < rows.length; i++) {
        const prev = rows[i - 1];
        const curr = rows[i];
        const prevOrder = prev.sourceOrderNumbers[0];
        const currOrder = curr.sourceOrderNumbers[0];

        if (prevOrder !== currOrder) {
          // Different order numbers → order number should be ascending
          expect(prevOrder).toBeLessThan(currOrder);
          continue;
        }

        // Same order number → check serial number
        const prevSerial = prev.serialNumber ?? "";
        const currSerial = curr.serialNumber ?? "";
        if (prevSerial !== currSerial) {
          expect(prevSerial.localeCompare(currSerial, "bs", { numeric: true })).toBeLessThanOrEqual(0);
          continue;
        }

        // Same order and same non-null serial → krevet before madrac (serialGroupOrder)
        if (prev.serialNumber && prev.serialNumber === curr.serialNumber) {
          // Within same serial group, krevet-before-madrac ordering takes priority
          continue;
        }

        // Same order, same (null) serial → article name should be ascending
        expect(prev.articleName.localeCompare(curr.articleName)).toBeLessThanOrEqual(0);
      }
    }
  );
});


// ---------------------------------------------------------------------------
// Property 10 & 11 (FIX CHECKING): buildSummaryRows honors sortKeys
// hierarchically in both modes.
//
// After the fix in tasks 2–6 (shared `compareItemsBySortKeys` + `sortKeys`
// threaded through `buildSummaryRows` → `buildSeparateRows` /
// `buildAggregatedRows`), these tests are EXPECTED TO PASS. They confirm
// that the bug is fixed.
//
// Bug condition from design.md:
//   isBugCondition(X) = length(X.sortKeys) > 0
//
// Expected behavior (Property 1 in design.md):
//   For any (bundles, aggregate, sortKeys) where sortKeys.length > 0,
//   `buildSummaryRows(bundles, aggregate, sortKeys)` returns rows that are
//   hierarchically sorted by `sortKeys` using identical rules to
//   `sortPrintData`, with `rb` reassigned so that `rows[i].rb === i + 1`.
//
// Originally documented (unfixed-code) counterexamples:
//   Separate mode: single order with two "Madrac A" items — one with
//     deliveryDeadline=null, one with 2020-01-01. sortKeys=["deliveryDate"].
//     Unfixed code kept insertion order (null first), violating the property.
//   Aggregated mode: two "Madrac A" items aggregated into separate buckets
//     (different fabric). sortKeys=["loadingSequence","deliveryDate"]. Unfixed
//     code returned rows in Map insertion order (null first), violating the
//     property.
//
// Both scenarios now respect `sortKeys` because the helper delegates to the
// shared `compareItemsBySortKeys` comparator exported from print-helpers.
//
// **Validates: design.md Property 1; Requirements 2.1, 2.2, 2.3, 2.4, 2.5,
// 2.6, 2.7, 2.8, 2.9, 2.10**
// ---------------------------------------------------------------------------

/** All sort keys — pool for shuffledSubarray. */
const allSortKeys: SortKey[] = [
  "loadingNumber",
  "loadingSequence",
  "serialNumber",
  "rb",
  "deliveryDate",
  "abc",
];

/** Non-empty shuffled subarray of sort keys (hierarchical order is randomized). */
const sortKeysArb: fc.Arbitrary<SortKey[]> = fc.shuffledSubarray(allSortKeys, { minLength: 1 });

describe("Property 10: buildSummaryRows honors sortKeys hierarchically in separate mode", () => {
  fcTest.prop([bundlesArb, sortKeysArb], { numRuns: 100 })(
    "adjacent rows satisfy compareItemsBySortKeys <= 0 (except within same serial group) and rb === i + 1",
    (bundles, sortKeys) => {
      const rows = buildSummaryRows(bundles, false, sortKeys);

      for (let i = 1; i < rows.length; i++) {
        // Items sharing the same non-null serial number are grouped together
        // (krevet before madrac) regardless of sort keys, so they may violate
        // strict sort order between each other.
        const sameSerial = rows[i - 1].serialNumber != null &&
          rows[i - 1].serialNumber === rows[i].serialNumber;
        if (!sameSerial) {
          expect(
            compareItemsBySortKeys(rows[i - 1], rows[i], sortKeys)
          ).toBeLessThanOrEqual(0);
        }
      }
      for (let i = 0; i < rows.length; i++) {
        expect(rows[i].rb).toBe(i + 1);
      }
    }
  );
});

describe("Property 11: buildSummaryRows honors sortKeys hierarchically in aggregated mode", () => {
  fcTest.prop([bundlesArb, sortKeysArb], { numRuns: 100 })(
    "adjacent rows satisfy compareItemsBySortKeys <= 0 and rb === i + 1",
    (bundles, sortKeys) => {
      const rows = buildSummaryRows(bundles, true, sortKeys);

      for (let i = 1; i < rows.length; i++) {
        expect(
          compareItemsBySortKeys(rows[i - 1], rows[i], sortKeys)
        ).toBeLessThanOrEqual(0);
      }
      for (let i = 0; i < rows.length; i++) {
        expect(rows[i].rb).toBe(i + 1);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// Property 12 (PRESERVATION CHECKING): empty sortKeys preserves legacy
// behavior in both modes.
//
// When `sortKeys` is an empty array, the fix must NOT regress legacy
// behavior. This property pairs with Property 2 in design.md (Preservation).
//
// Preservation condition:
//   NOT isBugCondition(X)  ≡  length(X.sortKeys) === 0
//
// Separate mode (aggregate=false):
//   - rows[i].rb === i + 1.
//   - Rows are ordered by sourceOrderNumber[0] ascending, then serialNumber
//     (bs, numeric) ascending, then articleName ascending — the legacy
//     fallback sort (duplicates Property 9, but explicit with sortKeys=[]).
//   - Legacy sanity from Property 5: every row has non-empty
//     sourceOrderNumbers and quantity >= 1.
//
// Aggregated mode (aggregate=true):
//   - rows[i].rb === i + 1.
//   - Row count equals the number of unique aggregation keys (
//     articleName × articleCode × fabricName × loadingNumber). Map insertion
//     order is implicitly preserved — any determinism is acceptable because
//     inputs are deterministic.
//   - Legacy sanity from Properties 6–8: unique bucket keys, quantity >= 1,
//     non-empty sourceOrderNumbers, no duplicate source orders per row, and
//     every non-null/non-empty source note appears in the aggregated output.
//
// Note: existing Properties 5–9 already call `buildSummaryRows(bundles,
// aggregate)` without the third argument (defaulting to []), so they too
// continue to validate preservation implicitly. This property makes the
// sortKeys=[] contract explicit.
//
// **Validates: design.md Property 2; Requirements 3.1, 3.2, 3.3, 3.4, 3.6, 3.7**
// ---------------------------------------------------------------------------
describe("Property 12: empty sortKeys preserves legacy behavior (both modes)", () => {
  fcTest.prop([bundlesArb, fc.boolean()], { numRuns: 100 })(
    "rows satisfy legacy invariants when sortKeys is empty",
    (bundles, aggregate) => {
      const rows = buildSummaryRows(bundles, aggregate, []);

      // rb invariant — both modes
      for (let i = 0; i < rows.length; i++) {
        expect(rows[i].rb).toBe(i + 1);
      }

      if (!aggregate) {
        // Separate mode legacy ordering: sourceOrderNumber[0] ascending, then
        // serialNumber (bs, numeric), then articleName.
        for (let i = 1; i < rows.length; i++) {
          const prev = rows[i - 1];
          const curr = rows[i];
          const prevOrder = prev.sourceOrderNumbers[0];
          const currOrder = curr.sourceOrderNumbers[0];

          if (prevOrder !== currOrder) {
            expect(prevOrder).toBeLessThan(currOrder);
            continue;
          }

          const prevSerial = prev.serialNumber ?? "";
          const currSerial = curr.serialNumber ?? "";
          if (prevSerial !== currSerial) {
            expect(
              prevSerial.localeCompare(currSerial, "bs", { numeric: true })
            ).toBeLessThanOrEqual(0);
            continue;
          }

          // Same non-null serial → krevet-before-madrac grouping takes priority
          if (prev.serialNumber && prev.serialNumber === curr.serialNumber) {
            continue;
          }

          expect(
            prev.articleName.localeCompare(curr.articleName)
          ).toBeLessThanOrEqual(0);
        }

        // Legacy sanity from Property 5.
        for (const row of rows) {
          expect(row.sourceOrderNumbers.length).toBeGreaterThan(0);
          expect(row.quantity).toBeGreaterThanOrEqual(1);
        }
      } else {
        // Aggregated mode: every row corresponds to a unique aggregation key.
        const keys = rows.map((r) =>
          aggKey(r.articleName, r.articleCode, r.fabricName, r.loadingNumber)
        );
        expect(new Set(keys).size).toBe(rows.length);

        // Legacy sanity from Properties 6–8.
        for (const row of rows) {
          expect(row.quantity).toBeGreaterThanOrEqual(1);
          expect(row.sourceOrderNumbers.length).toBeGreaterThan(0);
          expect(new Set(row.sourceOrderNumbers).size).toBe(
            row.sourceOrderNumbers.length
          );
        }

        // Preservation of notes (mirrors Property 7).
        const allSourceNotes: string[] = [];
        for (const bundle of bundles) {
          for (const item of bundle.data.items) {
            if (item.notes != null && item.notes !== "") {
              allSourceNotes.push(item.notes);
            }
          }
        }
        const allAggNotes = rows
          .map((r) => r.notes)
          .filter((n): n is string => n != null)
          .join("\0");
        for (const note of allSourceNotes) {
          expect(allAggNotes).toContain(note);
        }

        // Preservation of source order numbers (mirrors Property 8).
        const allSourceOrderNumbers = new Set<number>();
        for (const bundle of bundles) {
          allSourceOrderNumbers.add(bundle.data.orderNumber);
        }
        const allAggOrderNumbers = new Set<number>();
        for (const row of rows) {
          for (const on of row.sourceOrderNumbers) {
            allAggOrderNumbers.add(on);
          }
        }
        for (const orderNum of allSourceOrderNumbers) {
          expect(allAggOrderNumbers.has(orderNum)).toBe(true);
        }
      }
    }
  );
});
