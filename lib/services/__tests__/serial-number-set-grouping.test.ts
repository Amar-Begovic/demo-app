/**
 * Bug Condition Exploration Test — Serial Number Set Grouping
 *
 * Validates: Requirements 1.1, 1.2
 *
 * This test extracts the serial assignment logic from the complementary set
 * branch of createProductionOrder and tests it as a pure function.
 *
 * The bug: when complementary items are added as separate line items (each qty=1),
 * `Math.max(...items.map(i => i.quantity))` returns 1 instead of the actual
 * number of sets needed (which should be max of per-article-type quantity sums).
 */

import { describe, it, expect } from "vitest";
import { test as fcTest } from "@fast-check/vitest";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// Types mirroring the production order item shape
// ---------------------------------------------------------------------------
interface ArticleInfo {
  id: string;
  name: string;
  model: string | null;
  dimensions: string | null;
}

interface SerialItem {
  articleId: string;
  quantity: number;
  fabricId?: string;
  deliveryDeadline?: Date;
  serialNumber?: string;
}

// ---------------------------------------------------------------------------
// Pure extraction of the serial assignment logic (UNFIXED — mirrors production code)
// ---------------------------------------------------------------------------

/**
 * extractModelAndDims — identical to the one in production-order.service.ts
 */
function extractModelAndDims(article: {
  name: string;
  model: string | null;
  dimensions: string | null;
}) {
  if (article.model && article.dimensions) {
    return {
      model: article.model.toUpperCase(),
      dims: article.dimensions.toUpperCase(),
    };
  }
  const match = article.name.match(/^(\S+)\s+(\d+[Xx]\d+)/);
  if (match) {
    return { model: match[1].toUpperCase(), dims: match[2].toUpperCase() };
  }
  return { model: article.name.toUpperCase(), dims: "" };
}

/**
 * setKey — identical to the one in production-order.service.ts
 */
function setKey(
  item: SerialItem,
  articleMap: Map<string, ArticleInfo>
): string {
  const art = articleMap.get(item.articleId);
  const { model, dims } = art
    ? extractModelAndDims(art)
    : { model: "", dims: "" };
  const dl = item.deliveryDeadline?.toISOString() ?? "";
  return model + "|" + dims + "|" + (item.fabricId ?? "") + "|" + dl;
}

/**
 * assignSerialsToGroup — extracted from the complementary set branch.
 * This is the UNFIXED (buggy) version that uses Math.max(...items.map(i => i.quantity)).
 *
 * Takes a pre-grouped list of items (already grouped by setKey) and an articleMap,
 * assigns serial numbers, and returns the items with serialNumber populated.
 */
function assignSerialsToGroup(
  items: SerialItem[],
  articleMap: Map<string, ArticleInfo>,
  startSerial: number = 1
): { items: SerialItem[]; nextSerial: number } {
  let nextSerial = startSerial;

  // Check if all items share the same articleId
  const uniqueArticleIds = new Set(items.map((i) => i.articleId));
  const isSameArticle = uniqueArticleIds.size === 1;

  // Check if items are a complementary set
  let isComplementarySet = false;
  if (!isSameArticle) {
    const articleNames = items.map((i) => {
      const art = articleMap.get(i.articleId);
      return art ? art.name.toLowerCase() : "";
    });
    const contentTypes = new Set(
      articleNames.map((name) => {
        const match = name.match(/\d+[x×]\d+\s+(.+)/i);
        return match ? match[1].trim() : name;
      })
    );
    isComplementarySet = contentTypes.size > 1;
  }

  if (isComplementarySet) {
    // Group items by articleId for cursor-based assignment
    const itemsByArticle = new Map<string, typeof items>();
    for (const item of items) {
      if (!itemsByArticle.has(item.articleId)) itemsByArticle.set(item.articleId, []);
      itemsByArticle.get(item.articleId)!.push(item);
    }

    // Sum quantities per article type, take max as number of serials
    const maxQty = Math.max(
      ...[...itemsByArticle.values()].map(
        (articleItems) => articleItems.reduce((sum, i) => sum + i.quantity, 0)
      )
    );

    // For each unit/serial, assign to one item per article type using cursors
    const articleCursors = new Map<string, { items: typeof items; itemIdx: number; unitIdx: number }>();
    for (const [artId, artItems] of itemsByArticle) {
      articleCursors.set(artId, { items: artItems, itemIdx: 0, unitIdx: 0 });
    }

    for (let unit = 0; unit < maxQty; unit++) {
      const serial = `P-${String(nextSerial++).padStart(3, "0")}`;
      for (const cursor of articleCursors.values()) {
        if (cursor.itemIdx >= cursor.items.length) continue;
        const item = cursor.items[cursor.itemIdx];
        item.serialNumber = item.serialNumber
          ? item.serialNumber + "," + serial
          : serial;
        cursor.unitIdx++;
        if (cursor.unitIdx >= item.quantity) {
          cursor.itemIdx++;
          cursor.unitIdx = 0;
        }
      }
    }
  } else {
    // Non-complementary: each item gets its own serial per unit
    for (const item of items) {
      for (let unit = 0; unit < item.quantity; unit++) {
        const serial = `P-${String(nextSerial++).padStart(3, "0")}`;
        item.serialNumber = item.serialNumber
          ? item.serialNumber + "," + serial
          : serial;
      }
    }
  }

  return { items, nextSerial };
}


// ---------------------------------------------------------------------------
// Bug condition checker — matches the formal spec from bugfix.md
// ---------------------------------------------------------------------------

function hasDistinctContentTypes(
  items: SerialItem[],
  articleMap: Map<string, ArticleInfo>
): boolean {
  const articleNames = items.map((i) => {
    const art = articleMap.get(i.articleId);
    return art ? art.name.toLowerCase() : "";
  });
  const contentTypes = new Set(
    articleNames.map((name) => {
      const match = name.match(/\d+[x×]\d+\s+(.+)/i);
      return match ? match[1].trim() : name;
    })
  );
  return contentTypes.size > 1;
}

function isBugCondition(
  items: SerialItem[],
  articleMap: Map<string, ArticleInfo>
): boolean {
  const uniqueArticleIds = new Set(items.map((i) => i.articleId));
  const isComplementarySet =
    uniqueArticleIds.size > 1 && hasDistinctContentTypes(items, articleMap);

  if (!isComplementarySet) return false;

  // Sum quantities per article type
  const perTypeTotals = new Map<string, number>();
  for (const item of items) {
    perTypeTotals.set(
      item.articleId,
      (perTypeTotals.get(item.articleId) ?? 0) + item.quantity
    );
  }
  const maxTotalUnits = Math.max(...perTypeTotals.values());
  const maxLineQty = Math.max(...items.map((i) => i.quantity));

  return maxTotalUnits > maxLineQty;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countSerials(item: SerialItem): number {
  if (!item.serialNumber) return 0;
  return item.serialNumber.split(",").length;
}

function uniqueSerials(items: SerialItem[]): Set<string> {
  const all = new Set<string>();
  for (const item of items) {
    if (item.serialNumber) {
      for (const s of item.serialNumber.split(",")) {
        all.add(s.trim());
      }
    }
  }
  return all;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generate a complementary set group that satisfies isBugCondition */
function bugConditionGroupArb() {
  return fc
    .record({
      model: fc.constantFrom("ADORA", "BELLA", "CORONA", "DIANA"),
      dims: fc.constantFrom("160X200", "180X200", "140X200", "200X200"),
      fabricId: fc.constantFrom("fab-1", "fab-2", "fab-3"),
      // N beds (each qty=1) and M mattresses (each qty=1), with max(N,M) > 1
      numBeds: fc.integer({ min: 1, max: 8 }),
      numMattresses: fc.integer({ min: 1, max: 8 }),
    })
    .filter(({ numBeds, numMattresses }) => Math.max(numBeds, numMattresses) > 1)
    .map(({ model, dims, fabricId, numBeds, numMattresses }) => {
      const bedArticleId = `art-bed-${model}-${dims}`;
      const mattressArticleId = `art-mattress-${model}-${dims}`;

      const articleMap = new Map<string, ArticleInfo>([
        [
          bedArticleId,
          {
            id: bedArticleId,
            name: `${model} ${dims} krevet`,
            model,
            dimensions: dims,
          },
        ],
        [
          mattressArticleId,
          {
            id: mattressArticleId,
            name: `${model} ${dims} madrac`,
            model,
            dimensions: dims,
          },
        ],
      ]);

      const items: SerialItem[] = [];
      // N bed line items, each qty=1
      for (let i = 0; i < numBeds; i++) {
        items.push({
          articleId: bedArticleId,
          quantity: 1,
          fabricId,
        });
      }
      // M mattress line items, each qty=1
      for (let i = 0; i < numMattresses; i++) {
        items.push({
          articleId: mattressArticleId,
          quantity: 1,
          fabricId,
        });
      }

      const expectedSets = Math.max(numBeds, numMattresses);

      return { items, articleMap, expectedSets, numBeds, numMattresses };
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Serial Number Set Grouping — Bug Condition Exploration", () => {
  /**
   * **Validates: Requirements 1.1, 1.2**
   *
   * Property 1: For any complementary set group satisfying isBugCondition,
   * the number of unique serial numbers assigned should equal max(N, M)
   * where N and M are the per-article-type quantity sums.
   *
   * This test SHOULD FAIL on unfixed code because the buggy maxQty computation
   * returns 1 instead of max(N, M).
   */
  fcTest.prop([bugConditionGroupArb()])(
    "Property: unique serial count = max(N, M) for split complementary sets",
    ({ items, articleMap, expectedSets }) => {
      // Deep clone items so we don't mutate across runs
      const clonedItems: SerialItem[] = items.map((i) => ({ ...i }));

      // Verify this is indeed a bug condition
      expect(isBugCondition(clonedItems, articleMap)).toBe(true);

      // Run the (buggy) serial assignment
      const result = assignSerialsToGroup(clonedItems, articleMap);

      // Assert: number of unique serials = expectedSets
      const serials = uniqueSerials(result.items);
      expect(serials.size).toBe(expectedSets);

      // Assert: each item receives exactly item.quantity serial numbers
      for (const item of result.items) {
        expect(countSerials(item)).toBe(item.quantity);
      }
    }
  );

  // -------------------------------------------------------------------------
  // Concrete failing cases
  // -------------------------------------------------------------------------

  it("3 beds + 3 mattresses (qty=1 each) → expect 3 serials", () => {
    const articleMap = new Map<string, ArticleInfo>([
      [
        "bed-1",
        { id: "bed-1", name: "ADORA 160X200 krevet", model: "ADORA", dimensions: "160X200" },
      ],
      [
        "mat-1",
        { id: "mat-1", name: "ADORA 160X200 madrac", model: "ADORA", dimensions: "160X200" },
      ],
    ]);

    const items: SerialItem[] = [
      { articleId: "bed-1", quantity: 1, fabricId: "f1" },
      { articleId: "bed-1", quantity: 1, fabricId: "f1" },
      { articleId: "bed-1", quantity: 1, fabricId: "f1" },
      { articleId: "mat-1", quantity: 1, fabricId: "f1" },
      { articleId: "mat-1", quantity: 1, fabricId: "f1" },
      { articleId: "mat-1", quantity: 1, fabricId: "f1" },
    ];

    expect(isBugCondition(items, articleMap)).toBe(true);

    const result = assignSerialsToGroup(items, articleMap);
    const serials = uniqueSerials(result.items);

    // Expected: 3 unique serials (one per set)
    expect(serials.size).toBe(3);

    // Each item should have exactly 1 serial
    for (const item of result.items) {
      expect(countSerials(item)).toBe(1);
    }
  });

  it("2 beds + 3 mattresses (qty=1 each) → expect 3 serials", () => {
    const articleMap = new Map<string, ArticleInfo>([
      [
        "bed-1",
        { id: "bed-1", name: "BELLA 180X200 krevet", model: "BELLA", dimensions: "180X200" },
      ],
      [
        "mat-1",
        { id: "mat-1", name: "BELLA 180X200 madrac", model: "BELLA", dimensions: "180X200" },
      ],
    ]);

    const items: SerialItem[] = [
      { articleId: "bed-1", quantity: 1, fabricId: "f2" },
      { articleId: "bed-1", quantity: 1, fabricId: "f2" },
      { articleId: "mat-1", quantity: 1, fabricId: "f2" },
      { articleId: "mat-1", quantity: 1, fabricId: "f2" },
      { articleId: "mat-1", quantity: 1, fabricId: "f2" },
    ];

    expect(isBugCondition(items, articleMap)).toBe(true);

    const result = assignSerialsToGroup(items, articleMap);
    const serials = uniqueSerials(result.items);

    // Expected: 3 unique serials (max(2, 3) = 3)
    expect(serials.size).toBe(3);

    // Each item should have exactly 1 serial (qty=1 each)
    for (const item of result.items) {
      expect(countSerials(item)).toBe(1);
    }
  });
});


// ---------------------------------------------------------------------------
// Preservation Tests — Non-bug-condition inputs on UNFIXED code
// ---------------------------------------------------------------------------

describe("Serial Number Set Grouping — Preservation", () => {
  /**
   * **Validates: Requirements 3.1**
   *
   * Single-line complementary preservation:
   * 1 bed (qty=3) + 1 mattress (qty=3) → 3 serials paired 1:1.
   * This works correctly because Math.max(3,3) = 3.
   */
  it("single-line complementary: 1 bed (qty=3) + 1 mattress (qty=3) → 3 serials paired 1:1", () => {
    const articleMap = new Map<string, ArticleInfo>([
      [
        "bed-1",
        { id: "bed-1", name: "ADORA 160X200 krevet", model: "ADORA", dimensions: "160X200" },
      ],
      [
        "mat-1",
        { id: "mat-1", name: "ADORA 160X200 madrac", model: "ADORA", dimensions: "160X200" },
      ],
    ]);

    const items: SerialItem[] = [
      { articleId: "bed-1", quantity: 3, fabricId: "f1" },
      { articleId: "mat-1", quantity: 3, fabricId: "f1" },
    ];

    // Verify this is NOT a bug condition
    expect(isBugCondition(items, articleMap)).toBe(false);

    const result = assignSerialsToGroup(items, articleMap);

    // Should produce 3 unique serials
    const serials = uniqueSerials(result.items);
    expect(serials.size).toBe(3);

    // Each item should get 3 serials (comma-separated)
    for (const item of result.items) {
      expect(countSerials(item)).toBe(3);
    }

    // Serials should be paired: bed and mattress get the same serials in the same order
    expect(result.items[0].serialNumber).toBe("P-001,P-002,P-003");
    expect(result.items[1].serialNumber).toBe("P-001,P-002,P-003");
  });

  /**
   * **Validates: Requirements 3.2**
   *
   * Same-article preservation:
   * 3 identical bed line items (qty=1 each, same articleId) → 3 independent serials.
   * These go through the non-complementary (else) branch.
   */
  it("same-article: 3 identical bed line items (qty=1 each) → 3 independent serials", () => {
    const articleMap = new Map<string, ArticleInfo>([
      [
        "bed-1",
        { id: "bed-1", name: "ADORA 160X200 krevet", model: "ADORA", dimensions: "160X200" },
      ],
    ]);

    const items: SerialItem[] = [
      { articleId: "bed-1", quantity: 1, fabricId: "f1" },
      { articleId: "bed-1", quantity: 1, fabricId: "f1" },
      { articleId: "bed-1", quantity: 1, fabricId: "f1" },
    ];

    // Same articleId → not complementary → not a bug condition
    expect(isBugCondition(items, articleMap)).toBe(false);

    const result = assignSerialsToGroup(items, articleMap);

    // Should produce 3 unique serials (one per item)
    const serials = uniqueSerials(result.items);
    expect(serials.size).toBe(3);

    // Each item should get exactly 1 serial
    for (const item of result.items) {
      expect(countSerials(item)).toBe(1);
    }

    // Each item gets its own unique serial
    expect(result.items[0].serialNumber).toBe("P-001");
    expect(result.items[1].serialNumber).toBe("P-002");
    expect(result.items[2].serialNumber).toBe("P-003");
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * Combined-article preservation:
   * 2 "krevet + madrac" combined line items (qty=1 each) → 2 independent serials.
   * Same content type → not complementary → each gets own serial.
   */
  it("combined-article: 2 'krevet + madrac' line items (qty=1 each) → 2 independent serials", () => {
    const articleMap = new Map<string, ArticleInfo>([
      [
        "combined-1",
        {
          id: "combined-1",
          name: "ADORA 160X200 krevet + madrac",
          model: "ADORA",
          dimensions: "160X200",
        },
      ],
      [
        "combined-2",
        {
          id: "combined-2",
          name: "ADORA 160X200 krevet + madrac",
          model: "ADORA",
          dimensions: "160X200",
        },
      ],
    ]);

    const items: SerialItem[] = [
      { articleId: "combined-1", quantity: 1, fabricId: "f1" },
      { articleId: "combined-2", quantity: 1, fabricId: "f1" },
    ];

    // Different articleIds but same content type → not complementary → not a bug condition
    expect(isBugCondition(items, articleMap)).toBe(false);

    const result = assignSerialsToGroup(items, articleMap);

    // Should produce 2 unique serials (one per item)
    const serials = uniqueSerials(result.items);
    expect(serials.size).toBe(2);

    // Each item should get exactly 1 serial
    for (const item of result.items) {
      expect(countSerials(item)).toBe(1);
    }

    // Each item gets its own unique serial
    expect(result.items[0].serialNumber).toBe("P-001");
    expect(result.items[1].serialNumber).toBe("P-002");
  });

  /**
   * **Validates: Requirements 3.5**
   *
   * Manual serial preservation:
   * Items with pre-assigned serialNumber get appended to, not overwritten.
   * (The extracted function doesn't skip pre-assigned serials — that's done
   * in the grouping loop before calling the function. But the function does
   * append to existing serialNumber values.)
   */
  it("manual serial: items with pre-assigned serialNumber get appended to", () => {
    const articleMap = new Map<string, ArticleInfo>([
      [
        "bed-1",
        { id: "bed-1", name: "ADORA 160X200 krevet", model: "ADORA", dimensions: "160X200" },
      ],
    ]);

    const items: SerialItem[] = [
      { articleId: "bed-1", quantity: 1, fabricId: "f1", serialNumber: "MANUAL-001" },
      { articleId: "bed-1", quantity: 1, fabricId: "f1" },
    ];

    // Same articleId → not complementary
    expect(isBugCondition(items, articleMap)).toBe(false);

    const result = assignSerialsToGroup(items, articleMap);

    // First item had a pre-assigned serial — it gets appended to
    expect(result.items[0].serialNumber).toBe("MANUAL-001,P-001");

    // Second item gets a new serial
    expect(result.items[1].serialNumber).toBe("P-002");
  });

  /**
   * **Validates: Requirements 3.1, 3.2, 3.3**
   *
   * PBT preservation: same-article groups.
   * All items share one articleId → each unit gets its own serial.
   */
  fcTest.prop([
    fc
      .record({
        model: fc.constantFrom("ADORA", "BELLA", "CORONA"),
        dims: fc.constantFrom("160X200", "180X200", "140X200"),
        fabricId: fc.constantFrom("fab-1", "fab-2"),
        numItems: fc.integer({ min: 1, max: 6 }),
        qtyPerItem: fc.integer({ min: 1, max: 4 }),
      })
      .map(({ model, dims, fabricId, numItems, qtyPerItem }) => {
        const articleId = `art-bed-${model}-${dims}`;
        const articleMap = new Map<string, ArticleInfo>([
          [
            articleId,
            {
              id: articleId,
              name: `${model} ${dims} krevet`,
              model,
              dimensions: dims,
            },
          ],
        ]);

        const items: SerialItem[] = [];
        for (let i = 0; i < numItems; i++) {
          items.push({ articleId, quantity: qtyPerItem, fabricId });
        }

        const totalUnits = numItems * qtyPerItem;
        return { items, articleMap, totalUnits };
      }),
  ])(
    "PBT: same-article groups → each unit gets its own serial",
    ({ items, articleMap, totalUnits }) => {
      const clonedItems: SerialItem[] = items.map((i) => ({ ...i }));

      // Same articleId → not a bug condition
      expect(isBugCondition(clonedItems, articleMap)).toBe(false);

      const result = assignSerialsToGroup(clonedItems, articleMap);

      // Total unique serials = total units across all items
      const serials = uniqueSerials(result.items);
      expect(serials.size).toBe(totalUnits);

      // Each item gets exactly item.quantity serials
      for (const item of result.items) {
        expect(countSerials(item)).toBe(item.quantity);
      }
    }
  );

  /**
   * **Validates: Requirements 3.1**
   *
   * PBT preservation: single-line complementary sets.
   * One line per article type with qty > 1 → maxQty serials paired 1:1.
   * This is NOT a bug condition because maxTotalUnits === maxLineQty.
   */
  fcTest.prop([
    fc
      .record({
        model: fc.constantFrom("ADORA", "BELLA", "CORONA"),
        dims: fc.constantFrom("160X200", "180X200", "140X200"),
        fabricId: fc.constantFrom("fab-1", "fab-2"),
        bedQty: fc.integer({ min: 1, max: 5 }),
        mattressQty: fc.integer({ min: 1, max: 5 }),
      })
      .map(({ model, dims, fabricId, bedQty, mattressQty }) => {
        const bedArticleId = `art-bed-${model}-${dims}`;
        const mattressArticleId = `art-mattress-${model}-${dims}`;

        const articleMap = new Map<string, ArticleInfo>([
          [
            bedArticleId,
            {
              id: bedArticleId,
              name: `${model} ${dims} krevet`,
              model,
              dimensions: dims,
            },
          ],
          [
            mattressArticleId,
            {
              id: mattressArticleId,
              name: `${model} ${dims} madrac`,
              model,
              dimensions: dims,
            },
          ],
        ]);

        // Single line per article type (not split)
        const items: SerialItem[] = [
          { articleId: bedArticleId, quantity: bedQty, fabricId },
          { articleId: mattressArticleId, quantity: mattressQty, fabricId },
        ];

        const maxQty = Math.max(bedQty, mattressQty);
        return { items, articleMap, maxQty, bedQty, mattressQty };
      }),
  ])(
    "PBT: single-line complementary sets → maxQty serials paired 1:1",
    ({ items, articleMap, maxQty, bedQty, mattressQty }) => {
      const clonedItems: SerialItem[] = items.map((i) => ({ ...i }));

      // Single line per type → not a bug condition
      expect(isBugCondition(clonedItems, articleMap)).toBe(false);

      const result = assignSerialsToGroup(clonedItems, articleMap);

      // Unique serials = max(bedQty, mattressQty)
      const serials = uniqueSerials(result.items);
      expect(serials.size).toBe(maxQty);

      // Bed item gets bedQty serials, mattress item gets mattressQty serials
      expect(countSerials(result.items[0])).toBe(bedQty);
      expect(countSerials(result.items[1])).toBe(mattressQty);
    }
  );
});
