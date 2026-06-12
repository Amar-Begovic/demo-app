import { test as fcTest, fc } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import {
  filterItemsByArticle,
  sortPrintData,
  type PrintData,
  type SortKey,
} from "@/lib/utils/print-helpers";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Pool of article names to draw from (ensures overlap between items and filter sets). */
const articleNamePool = [
  "Madrac A",
  "Krevet B",
  "Stolica C",
  "Ormar D",
  "Polica E",
  "Stol F",
];

/** Arbitrary for a single PrintData item with fields relevant to filter/sort. */
const itemArb = fc.record({
  articleId: fc.uuid(),
  articleName: fc.constantFrom(...articleNamePool),
  articleCode: fc.option(fc.string({ minLength: 1, maxLength: 10 }), {
    nil: null,
  }),
  articleDescription: fc.option(fc.string({ minLength: 1, maxLength: 30 }), {
    nil: null,
  }),
  priceWithoutVAT: fc.option(
    fc.float({ min: 0, max: 100000, noNaN: true }),
    { nil: null }
  ),
  quantity: fc.integer({ min: 1, max: 50 }),
  deliveryDeadline: fc.option(
    fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }),
    { nil: null }
  ),
  priority: fc.constantFrom("low", "normal", "high", "urgent"),
  notes: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
  customerOrderNumber: fc.option(
    fc.string({ minLength: 1, maxLength: 20 }),
    { nil: null }
  ),
  loadingNumber: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
    nil: null,
  }),
  serialNumber: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
    nil: null,
  }),
  articleDimensions: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
    nil: null,
  }),
  loadingSequence: fc.option(fc.integer({ min: 1, max: 1000 }), {
    nil: null,
  }),
  withLegs: fc.boolean(),
  fabric: fc.option(
    fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 20 }),
      color: fc.option(fc.string({ minLength: 1, maxLength: 10 }), {
        nil: null,
      }),
    }),
    { nil: null }
  ),
  rucka: fc.constant(null as PrintData["items"][number]["rucka"]),
  paspul: fc.constant(null as PrintData["items"][number]["paspul"]),
  step: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
  nogice1: fc.constant(null as PrintData["items"][number]["nogice1"]),
  nogice2: fc.constant(null as PrintData["items"][number]["nogice2"]),
  parts: fc.constant([] as PrintData["items"][number]["parts"]),
});

/** Arbitrary for PrintData with 1+ items. */
const printDataArb: fc.Arbitrary<PrintData> = fc.record({
  orderId: fc.uuid(),
  orderNumber: fc.integer({ min: 1, max: 99999 }),
  customerName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), {
    nil: null,
  }),
  customerPhone: fc.option(fc.string({ minLength: 1, maxLength: 15 }), {
    nil: null,
  }),
  documentNumber: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
    nil: null,
  }),
  deliveryLocation: fc.option(fc.string({ minLength: 1, maxLength: 30 }), {
    nil: null,
  }),
  receivedBy: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
    nil: null,
  }),
  createdAt: fc.date({
    min: new Date("2020-01-01"),
    max: new Date("2030-12-31"),
  }),
  workOrderDate: fc.option(
    fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }),
    { nil: null }
  ),
  items: fc.array(itemArb, { minLength: 1, maxLength: 15 }),
});

/** Arbitrary for a non-empty set of article names from the pool. */
const nonEmptyArticleSetArb = fc
  .subarray(articleNamePool, { minLength: 1 })
  .map((names) => new Set(names));

/** All valid sort keys (excluding "rb" which is a no-op). */
const sortKeyArb: fc.Arbitrary<SortKey> = fc.constantFrom(
  "abc",
  "deliveryDate",
  "loadingNumber",
  "serialNumber",
  "loadingSequence"
);

// ---------------------------------------------------------------------------
// Feature: packaging-label-print-filters, Property 1: Article filter correctness
// **Validates: Requirements 1.1**
// ---------------------------------------------------------------------------
describe("Feature: packaging-label-print-filters, Property 1: Article filter correctness", () => {
  fcTest.prop([printDataArb, nonEmptyArticleSetArb], { numRuns: 200 })(
    "all remaining items have articleName in the filter set",
    (data, articleNames) => {
      const result = filterItemsByArticle(data, articleNames);

      // Every returned item must have a matching article name
      for (const item of result.items) {
        expect(articleNames.has(item.articleName)).toBe(true);
      }
    }
  );

  fcTest.prop([printDataArb, nonEmptyArticleSetArb], { numRuns: 200 })(
    "no items outside the filter set are present",
    (data, articleNames) => {
      const result = filterItemsByArticle(data, articleNames);

      // Count of matching items in original should equal result length
      const expectedCount = data.items.filter((item) =>
        articleNames.has(item.articleName)
      ).length;
      expect(result.items.length).toBe(expectedCount);
    }
  );

  fcTest.prop([printDataArb, nonEmptyArticleSetArb], { numRuns: 200 })(
    "order-level fields are preserved after filtering",
    (data, articleNames) => {
      const result = filterItemsByArticle(data, articleNames);

      expect(result.orderId).toBe(data.orderId);
      expect(result.orderNumber).toBe(data.orderNumber);
      expect(result.customerName).toBe(data.customerName);
      expect(result.createdAt).toEqual(data.createdAt);
    }
  );
});

// ---------------------------------------------------------------------------
// Comparator helpers (mirror the logic in sortPrintData for verification)
// ---------------------------------------------------------------------------

function comparatorForKey(
  key: SortKey
): (
  a: PrintData["items"][number],
  b: PrintData["items"][number]
) => number {
  switch (key) {
    case "abc":
      return (a, b) => a.articleName.localeCompare(b.articleName, "bs");
    case "deliveryDate":
      return (a, b) => {
        const aRaw = a.deliveryDeadline?.getTime();
        const bRaw = b.deliveryDeadline?.getTime();
        const aTime = (aRaw != null && !Number.isNaN(aRaw)) ? aRaw : null;
        const bTime = (bRaw != null && !Number.isNaN(bRaw)) ? bRaw : null;
        if (aTime == null && bTime == null) return 0;
        if (aTime == null) return 1;
        if (bTime == null) return -1;
        return aTime - bTime;
      };
    case "loadingNumber":
      return (a, b) => {
        const aVal = a.loadingNumber ?? "";
        const bVal = b.loadingNumber ?? "";
        return aVal.localeCompare(bVal, "bs", { numeric: true });
      };
    case "serialNumber":
      return (a, b) => {
        const aS = a.serialNumber ?? "";
        const bS = b.serialNumber ?? "";
        return aS.localeCompare(bS, "bs", { numeric: true });
      };
    case "loadingSequence":
      return (a, b) => {
        const aSeq = a.loadingSequence;
        const bSeq = b.loadingSequence;
        if (aSeq == null && bSeq == null) return 0;
        if (aSeq == null) return 1;
        if (bSeq == null) return -1;
        return aSeq - bSeq;
      };
    case "rb":
      return () => 0;
  }
}

// ---------------------------------------------------------------------------
// Feature: packaging-label-print-filters, Property 2: Sort correctness
// **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
// ---------------------------------------------------------------------------
describe("Feature: packaging-label-print-filters, Property 2: Sort correctness for any single key", () => {
  fcTest.prop([printDataArb, sortKeyArb], { numRuns: 200 })(
    "output is ordered by the given key's comparator",
    (data, key) => {
      const result = sortPrintData(data, [key]);
      const cmp = comparatorForKey(key);

      for (let i = 1; i < result.items.length; i++) {
        const order = cmp(result.items[i - 1], result.items[i]);
        expect(order).toBeLessThanOrEqual(0);
      }
    }
  );

  fcTest.prop([printDataArb, sortKeyArb], { numRuns: 200 })(
    "sort preserves all items (no items lost or added)",
    (data, key) => {
      const result = sortPrintData(data, [key]);
      expect(result.items.length).toBe(data.items.length);

      // Every item in the result should be present in the original (by reference)
      const resultSet = new Set(result.items);
      for (const item of data.items) {
        expect(resultSet.has(item)).toBe(true);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// Feature: packaging-label-print-filters, Property 3: Hierarchical sort
// **Validates: Requirements 2.7**
// ---------------------------------------------------------------------------
describe("Feature: packaging-label-print-filters, Property 3: Hierarchical sort respects key priority", () => {
  /** Generate 2-3 distinct sort keys for hierarchical sort testing. */
  const multiSortKeysArb = fc
    .shuffledSubarray(
      ["abc", "deliveryDate", "loadingNumber", "serialNumber", "loadingSequence"] as SortKey[],
      { minLength: 2, maxLength: 3 }
    );

  fcTest.prop([printDataArb, multiSortKeysArb], { numRuns: 200 })(
    "primary key dominates: consecutive items are ordered by primary key",
    (data, keys) => {
      const result = sortPrintData(data, keys);
      const primaryCmp = comparatorForKey(keys[0]);

      // The primary key must be non-decreasing across all consecutive pairs
      for (let i = 1; i < result.items.length; i++) {
        const order = primaryCmp(result.items[i - 1], result.items[i]);
        expect(order).toBeLessThanOrEqual(0);
      }
    }
  );

  fcTest.prop([printDataArb, multiSortKeysArb], { numRuns: 200 })(
    "secondary keys break ties: when primary key is equal, secondary key is non-decreasing",
    (data, keys) => {
      const result = sortPrintData(data, keys);
      const primaryCmp = comparatorForKey(keys[0]);
      const secondaryCmp = comparatorForKey(keys[1]);

      for (let i = 1; i < result.items.length; i++) {
        const primaryOrder = primaryCmp(result.items[i - 1], result.items[i]);
        if (primaryOrder === 0) {
          // Primary key is tied — secondary key must be non-decreasing
          const secondaryOrder = secondaryCmp(
            result.items[i - 1],
            result.items[i]
          );
          expect(secondaryOrder).toBeLessThanOrEqual(0);
        }
      }
    }
  );

  fcTest.prop([printDataArb, multiSortKeysArb], { numRuns: 200 })(
    "full hierarchical comparison: no pair violates the combined key ordering",
    (data, keys) => {
      const result = sortPrintData(data, keys);

      for (let i = 1; i < result.items.length; i++) {
        // Walk through keys in order; the first non-zero comparison determines order
        let overallCmp = 0;
        for (const key of keys) {
          const cmp = comparatorForKey(key)(
            result.items[i - 1],
            result.items[i]
          );
          if (cmp !== 0) {
            overallCmp = cmp;
            break;
          }
        }
        expect(overallCmp).toBeLessThanOrEqual(0);
      }
    }
  );
});
