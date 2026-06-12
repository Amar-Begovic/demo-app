import { test as fcTest, fc } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import {
  filterItemsByArticle,
  aggregateArticleInfo,
  type PrintData,
  type ArticleInfo,
} from "@/lib/utils/print-helpers";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Arbitrary for a single material within a step. */
const materialArb = fc.record({
  materialId: fc.uuid(),
  materialName: fc.string({ minLength: 1, maxLength: 20 }),
  materialCode: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: null }),
  quantity: fc.integer({ min: 1, max: 1000 }),
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
  materials: fc.array(materialArb, { minLength: 0, maxLength: 3 }),
});

/** Arbitrary for a part. */
const partArb = fc.record({
  partId: fc.uuid(),
  partName: fc.string({ minLength: 1, maxLength: 20 }),
  dimensions: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  steps: fc.array(stepArb, { minLength: 0, maxLength: 3 }),
});

/** Pool of article names to draw from (ensures overlap between items and filter sets). */
const articleNamePool = ["Madrac A", "Krevet B", "Stolica C", "Ormar D", "Polica E", "Stol F"];

/** Arbitrary for a single PrintData item with article name drawn from a pool. */
const itemArb = fc.record({
  articleId: fc.uuid(),
  articleName: fc.constantFrom(...articleNamePool),
  articleCode: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: null }),
  articleDescription: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
  priceWithoutVAT: fc.option(fc.float({ min: 0, max: 100000, noNaN: true }), { nil: null }),
  quantity: fc.integer({ min: 1, max: 500 }),
  deliveryDeadline: fc.option(fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }), { nil: null }),
  priority: fc.constantFrom("low", "normal", "high", "urgent"),
  notes: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
  customerOrderNumber: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  loadingNumber: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  serialNumber: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  articleDimensions: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  loadingSequence: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
  withLegs: fc.boolean(),
  fabric: fc.option(
    fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 20 }),
      color: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: null }),
    }),
    { nil: null }
  ),
  rucka: fc.constant(null),
  paspul: fc.constant(null),
  step: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
  nogice1: fc.constant(null),
  nogice2: fc.constant(null),
  parts: fc.array(partArb, { minLength: 0, maxLength: 2 }),
});

/** Arbitrary for PrintData with 1+ items. */
const printDataArb = fc.record({
  orderId: fc.uuid(),
  orderNumber: fc.integer({ min: 1, max: 99999 }),
  customerName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
  customerPhone: fc.option(fc.string({ minLength: 1, maxLength: 15 }), { nil: null }),
  documentNumber: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  deliveryLocation: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
  receivedBy: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }),
  workOrderDate: fc.option(fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }), { nil: null }),
  items: fc.array(itemArb, { minLength: 1, maxLength: 10 }),
});

/** Arbitrary for PrintData with 0+ items (used for identity test). */
const printDataWithAnyItemsArb = fc.record({
  orderId: fc.uuid(),
  orderNumber: fc.integer({ min: 1, max: 99999 }),
  customerName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
  customerPhone: fc.option(fc.string({ minLength: 1, maxLength: 15 }), { nil: null }),
  documentNumber: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  deliveryLocation: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
  receivedBy: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }),
  workOrderDate: fc.option(fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }), { nil: null }),
  items: fc.array(itemArb, { minLength: 0, maxLength: 10 }),
});

/** Arbitrary for a non-empty set of article names from the pool. */
const nonEmptyArticleSetArb = fc
  .subarray(articleNamePool, { minLength: 1 })
  .map((names) => new Set(names));

// ---------------------------------------------------------------------------
// Property 1: Article filter only passes matching items
// **Validates: Requirements 2.1, 2.3, 3.1, 3.3, 7.1, 8.1**
// ---------------------------------------------------------------------------
describe("Property 1: Article filter only passes matching items", () => {
  fcTest.prop([printDataArb, nonEmptyArticleSetArb], { numRuns: 100 })(
    "every item in the result has an articleName contained in the filter set",
    (data, articleNames) => {
      const result = filterItemsByArticle(data, articleNames);

      // Every returned item must have a matching article name
      for (const item of result.items) {
        expect(articleNames.has(item.articleName)).toBe(true);
      }
    }
  );

  fcTest.prop([printDataArb, nonEmptyArticleSetArb], { numRuns: 100 })(
    "no items with non-matching names are present in the result",
    (data, articleNames) => {
      const result = filterItemsByArticle(data, articleNames);

      // Count of matching items in original should equal result length
      const expectedCount = data.items.filter((item) =>
        articleNames.has(item.articleName)
      ).length;
      expect(result.items.length).toBe(expectedCount);
    }
  );

  fcTest.prop([printDataArb, nonEmptyArticleSetArb], { numRuns: 100 })(
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
// Property 2: Empty article filter is identity
// **Validates: Requirements 1.3**
// ---------------------------------------------------------------------------
describe("Property 2: Empty article filter is identity", () => {
  const emptySet = new Set<string>();

  fcTest.prop([printDataWithAnyItemsArb], { numRuns: 100 })(
    "applying filterItemsByArticle with an empty set returns the same items array",
    (data) => {
      const result = filterItemsByArticle(data, emptySet);

      // Should return the exact same reference (identity)
      expect(result).toBe(data);
      expect(result.items).toBe(data.items);
      expect(result.items.length).toBe(data.items.length);
    }
  );
});

// ---------------------------------------------------------------------------
// Property 3: Article quantity summation across orders
// **Validates: Requirements 1.4**
// ---------------------------------------------------------------------------
describe("Property 3: Article quantity summation across orders", () => {
  /** Arbitrary for an array of PrintData (multiple orders). */
  const ordersDataArb = fc.array(printDataArb, { minLength: 1, maxLength: 5 });

  fcTest.prop([ordersDataArb], { numRuns: 100 })(
    "total quantity for each article equals the sum of quantities across all orders",
    (ordersData) => {
      const result = aggregateArticleInfo(ordersData);

      // Build expected totals manually
      const expectedTotals = new Map<string, number>();
      for (const order of ordersData) {
        for (const item of order.items) {
          const current = expectedTotals.get(item.articleName) ?? 0;
          expectedTotals.set(item.articleName, current + item.quantity);
        }
      }

      // Result should have exactly the same set of article names
      const resultMap = new Map<string, number>();
      for (const info of result) {
        // No duplicate names in result
        expect(resultMap.has(info.name)).toBe(false);
        resultMap.set(info.name, info.totalQuantity);
      }

      expect(resultMap.size).toBe(expectedTotals.size);

      // Each article's total quantity should match
      for (const [name, expectedQty] of expectedTotals) {
        expect(resultMap.get(name)).toBe(expectedQty);
      }
    }
  );

  fcTest.prop([ordersDataArb], { numRuns: 100 })(
    "result contains no duplicate article names",
    (ordersData) => {
      const result = aggregateArticleInfo(ordersData);
      const names = result.map((info) => info.name);
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    }
  );

  fcTest.prop([ordersDataArb], { numRuns: 100 })(
    "every article name from the input appears in the result",
    (ordersData) => {
      const result = aggregateArticleInfo(ordersData);
      const resultNames = new Set(result.map((info) => info.name));

      for (const order of ordersData) {
        for (const item of order.items) {
          expect(resultNames.has(item.articleName)).toBe(true);
        }
      }
    }
  );
});

import { buildRadniNalogRows } from "@/lib/utils/print-helpers";

// ---------------------------------------------------------------------------
// Property 4: Sequential row numbering after filtering
// **Validates: Requirements 3.2**
// ---------------------------------------------------------------------------
describe("Property 4: Sequential row numbering after filtering", () => {
  fcTest.prop([printDataArb, nonEmptyArticleSetArb], { numRuns: 100 })(
    "rows from filtered PrintData have rb values forming a contiguous sequence starting at 1",
    (data, articleNames) => {
      const filtered = filterItemsByArticle(data, articleNames);
      const rows = buildRadniNalogRows(filtered);

      for (let i = 0; i < rows.length; i++) {
        expect(rows[i].rb).toBe(i + 1);
      }
    }
  );

  fcTest.prop([printDataWithAnyItemsArb], { numRuns: 100 })(
    "rows from unfiltered PrintData have rb values forming a contiguous sequence starting at 1",
    (data) => {
      const rows = buildRadniNalogRows(data);

      for (let i = 0; i < rows.length; i++) {
        expect(rows[i].rb).toBe(i + 1);
      }
    }
  );

  fcTest.prop([printDataArb, nonEmptyArticleSetArb], { numRuns: 100 })(
    "total row count equals sum of quantities of filtered items",
    (data, articleNames) => {
      const filtered = filterItemsByArticle(data, articleNames);
      const rows = buildRadniNalogRows(filtered);

      const expectedRowCount = filtered.items.reduce((sum, item) => sum + item.quantity, 0);
      expect(rows.length).toBe(expectedRowCount);
    }
  );
});

import { buildDeptSections, filterDepartmentSteps, calculateDepartmentMaterials } from "@/lib/utils/print-helpers";

// ---------------------------------------------------------------------------
// Property 10: Filtered department materials match only filtered items
// **Validates: Requirements 8.2, 8.3**
// ---------------------------------------------------------------------------
describe("Property 10: Filtered department materials match only filtered items", () => {
  /**
   * Generator for PrintData that guarantees at least one item with at least one
   * part that has at least one step with at least one material. This ensures
   * buildDeptSections produces non-empty output for meaningful testing.
   */
  const materialWithCodeArb = fc.record({
    materialId: fc.uuid(),
    materialName: fc.string({ minLength: 1, maxLength: 20 }),
    materialCode: fc.string({ minLength: 1, maxLength: 10 }),
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

  const stepWithMaterialsArb = fc.record({
    stepId: fc.uuid(),
    stepName: fc.string({ minLength: 1, maxLength: 20 }),
    sequenceOrder: fc.integer({ min: 1, max: 100 }),
    departmentId: fc.constantFrom("dept-1", "dept-2", "dept-3"),
    departmentName: fc.constantFrom("Tapaciranje", "Šivanje", "Montaža"),
    estimatedTime: fc.option(fc.integer({ min: 1, max: 480 }), { nil: null }),
    instructions: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
    materials: fc.array(materialWithCodeArb, { minLength: 1, maxLength: 3 }),
  });

  const partWithStepsArb = fc.record({
    partId: fc.uuid(),
    partName: fc.string({ minLength: 1, maxLength: 20 }),
    dimensions: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
    steps: fc.array(stepWithMaterialsArb, { minLength: 1, maxLength: 3 }),
  });

  const itemWithMaterialsArb = fc.record({
    articleId: fc.uuid(),
    articleName: fc.constantFrom(...articleNamePool),
    articleCode: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: null }),
    articleDescription: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
    priceWithoutVAT: fc.option(fc.float({ min: 0, max: 100000, noNaN: true }), { nil: null }),
    quantity: fc.integer({ min: 1, max: 50 }),
    deliveryDeadline: fc.option(fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }), { nil: null }),
    priority: fc.constantFrom("low", "normal", "high", "urgent"),
    notes: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
    customerOrderNumber: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
    loadingNumber: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
    serialNumber: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
    articleDimensions: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
    loadingSequence: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
    withLegs: fc.boolean(),
    fabric: fc.option(
      fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 20 }),
        color: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: null }),
      }),
      { nil: null }
    ),
    rucka: fc.constant(null),
    paspul: fc.constant(null),
    step: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
    nogice1: fc.constant(null),
    nogice2: fc.constant(null),
    parts: fc.array(partWithStepsArb, { minLength: 1, maxLength: 2 }),
  });

  const printDataWithMaterialsArb = fc.record({
    orderId: fc.uuid(),
    orderNumber: fc.integer({ min: 1, max: 99999 }),
    customerName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
    customerPhone: fc.option(fc.string({ minLength: 1, maxLength: 15 }), { nil: null }),
    documentNumber: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
    deliveryLocation: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
    receivedBy: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
    createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }),
    workOrderDate: fc.option(fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }), { nil: null }),
    items: fc.array(itemWithMaterialsArb, { minLength: 2, maxLength: 6 }),
  });

  fcTest.prop([printDataWithMaterialsArb, nonEmptyArticleSetArb], { numRuns: 100 })(
    "recap material quantities in each department equal the sum of material quantities from filtered items' steps only",
    (data, articleNames) => {
      // Apply article filter
      const filtered = filterItemsByArticle(data, articleNames);
      const deptSections = buildDeptSections(filtered);

      // Independently compute expected recap per department from filtered items
      // Collect all (departmentId → materialKey → totalQuantity) from filtered items
      const expectedRecap = new Map<string, Map<string, number>>();

      for (const item of filtered.items) {
        for (const part of item.parts) {
          for (const step of part.steps) {
            if (step.materials.length === 0) continue;
            if (!expectedRecap.has(step.departmentId)) {
              expectedRecap.set(step.departmentId, new Map());
            }
            const deptRecap = expectedRecap.get(step.departmentId)!;
            for (const mat of step.materials) {
              const key = mat.materialCode ?? mat.materialName;
              const totalQty = mat.quantity * item.quantity;
              const existing = deptRecap.get(key) ?? 0;
              deptRecap.set(key, existing + totalQty);
            }
          }
        }
      }

      // Verify each department section's recap matches expected
      for (const section of deptSections) {
        const expectedDeptRecap = expectedRecap.get(section.departmentId);
        expect(expectedDeptRecap).toBeDefined();

        const actualRecapMap = new Map<string, number>();
        for (const r of section.recap) {
          const key = r.materialCode ?? r.materialName;
          actualRecapMap.set(key, r.totalQuantity);
        }

        // Every expected material should be in the actual recap with matching quantity
        for (const [key, expectedQty] of expectedDeptRecap!) {
          expect(actualRecapMap.has(key)).toBe(true);
          expect(actualRecapMap.get(key)).toBeCloseTo(expectedQty, 5);
        }

        // No extra materials in the actual recap
        expect(actualRecapMap.size).toBe(expectedDeptRecap!.size);
      }
    }
  );

  fcTest.prop([printDataWithMaterialsArb, nonEmptyArticleSetArb], { numRuns: 100 })(
    "department sections only contain articles from the filtered set",
    (data, articleNames) => {
      const filtered = filterItemsByArticle(data, articleNames);
      const deptSections = buildDeptSections(filtered);

      for (const section of deptSections) {
        for (const article of section.articles) {
          expect(articleNames.has(article.articleName)).toBe(true);
        }
      }
    }
  );

  fcTest.prop([printDataWithMaterialsArb, nonEmptyArticleSetArb], { numRuns: 100 })(
    "no materials from excluded articles appear in department recaps",
    (data, articleNames) => {
      // Get sections from unfiltered data
      const unfilteredSections = buildDeptSections(data);
      // Get sections from filtered data
      const filtered = filterItemsByArticle(data, articleNames);
      const filteredSections = buildDeptSections(filtered);

      // For each department, the filtered recap total should be <= unfiltered recap total
      // (unless all items match the filter, in which case they're equal)
      const unfilteredTotals = new Map<string, number>();
      for (const section of unfilteredSections) {
        let total = 0;
        for (const r of section.recap) total += r.totalQuantity;
        unfilteredTotals.set(section.departmentId, total);
      }

      for (const section of filteredSections) {
        let filteredTotal = 0;
        for (const r of section.recap) filteredTotal += r.totalQuantity;
        const unfilteredTotal = unfilteredTotals.get(section.departmentId) ?? 0;
        expect(filteredTotal).toBeLessThanOrEqual(unfilteredTotal + 0.0001);
      }
    }
  );
});
