import { describe, it, expect } from "vitest";
import {
  filterItemsByArticle,
  sortPrintData,
  type PrintData,
} from "@/lib/utils/print-helpers";

// ---------------------------------------------------------------------------
// Helper: build a minimal PrintData with the given items
// ---------------------------------------------------------------------------

function makePrintData(
  items: Partial<PrintData["items"][number]>[]
): PrintData {
  return {
    orderId: "order-1",
    orderNumber: 1,
    customerName: "Test Customer",
    customerPhone: null,
    documentNumber: null,
    deliveryLocation: null,
    receivedBy: null,
    createdAt: new Date("2025-01-01"),
    workOrderDate: null,
    items: items.map((partial, i) => ({
      articleId: partial.articleId ?? `art-${i}`,
      articleName: partial.articleName ?? `Article ${i}`,
      articleCode: partial.articleCode ?? null,
      articleDescription: partial.articleDescription ?? null,
      priceWithoutVAT: partial.priceWithoutVAT ?? null,
      quantity: partial.quantity ?? 1,
      deliveryDeadline: partial.deliveryDeadline ?? null,
      priority: partial.priority ?? "normal",
      notes: partial.notes ?? null,
      customerOrderNumber: partial.customerOrderNumber ?? null,
      loadingNumber: partial.loadingNumber ?? null,
      serialNumber: partial.serialNumber ?? null,
      articleDimensions: partial.articleDimensions ?? null,
      loadingSequence: partial.loadingSequence ?? null,
      withLegs: partial.withLegs ?? false,
      fabric: partial.fabric ?? null,
      step: partial.step ?? null,
      rucka: partial.rucka ?? null,
      paspul: partial.paspul ?? null,
      nogice1: partial.nogice1 ?? null,
      nogice2: partial.nogice2 ?? null,
      parts: partial.parts ?? [],
    })),
  };
}

// ---------------------------------------------------------------------------
// 5.1 Empty/absent articles parameter returns all items unchanged
// ---------------------------------------------------------------------------
describe("filterItemsByArticle — empty filter set", () => {
  it("returns all items unchanged when articleNames set is empty", () => {
    const data = makePrintData([
      { articleName: "Madrac A" },
      { articleName: "Krevet B" },
      { articleName: "Stolica C" },
    ]);

    const result = filterItemsByArticle(data, new Set());

    // Should return the exact same reference (identity)
    expect(result).toBe(data);
    expect(result.items).toHaveLength(3);
    expect(result.items[0].articleName).toBe("Madrac A");
    expect(result.items[1].articleName).toBe("Krevet B");
    expect(result.items[2].articleName).toBe("Stolica C");
  });
});

// ---------------------------------------------------------------------------
// 5.2 Filter with non-matching names results in empty items array
// ---------------------------------------------------------------------------
describe("filterItemsByArticle — non-matching filter", () => {
  it("returns data with empty items when no article names match", () => {
    const data = makePrintData([
      { articleName: "Madrac A" },
      { articleName: "Krevet B" },
    ]);

    const result = filterItemsByArticle(data, new Set(["NonExistent"]));

    expect(result.items).toHaveLength(0);
    // Order-level fields should still be preserved
    expect(result.orderId).toBe("order-1");
    expect(result.orderNumber).toBe(1);
    expect(result.customerName).toBe("Test Customer");
  });
});

// ---------------------------------------------------------------------------
// 5.3 No sort parameter preserves original item order
// ---------------------------------------------------------------------------
describe("sortPrintData — empty sort keys", () => {
  it("preserves original item order when sort keys array is empty", () => {
    const data = makePrintData([
      { articleName: "Zebra" },
      { articleName: "Apple" },
      { articleName: "Mango" },
    ]);

    const result = sortPrintData(data, []);

    // Should return the exact same reference (identity)
    expect(result).toBe(data);
    expect(result.items[0].articleName).toBe("Zebra");
    expect(result.items[1].articleName).toBe("Apple");
    expect(result.items[2].articleName).toBe("Mango");
  });
});

// ---------------------------------------------------------------------------
// 5.4 loadingSequence sort key orders items numerically (null handling)
// ---------------------------------------------------------------------------
describe("sortPrintData — loadingSequence sort key", () => {
  it("orders items numerically by loadingSequence with nulls last", () => {
    const data = makePrintData([
      { articleName: "C", loadingSequence: 30 },
      { articleName: "A", loadingSequence: 10 },
      { articleName: "Null-1", loadingSequence: null },
      { articleName: "B", loadingSequence: 20 },
      { articleName: "Null-2", loadingSequence: null },
    ]);

    const result = sortPrintData(data, ["loadingSequence"]);

    expect(result.items.map((i) => i.articleName)).toEqual([
      "A",       // loadingSequence: 10
      "B",       // loadingSequence: 20
      "C",       // loadingSequence: 30
      "Null-1",  // loadingSequence: null (last)
      "Null-2",  // loadingSequence: null (last)
    ]);
  });

  it("handles all-null loadingSequence values without error", () => {
    const data = makePrintData([
      { articleName: "X", loadingSequence: null },
      { articleName: "Y", loadingSequence: null },
    ]);

    const result = sortPrintData(data, ["loadingSequence"]);

    // Both null — order is stable (unchanged)
    expect(result.items).toHaveLength(2);
    expect(result.items[0].articleName).toBe("X");
    expect(result.items[1].articleName).toBe("Y");
  });
});
