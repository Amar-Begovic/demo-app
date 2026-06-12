import { describe, expect, it } from "vitest";
import {
  filterPackagingOrders,
  computePackagingProgress,
  getAvailableComponentTypes,
  type PackagingOrderReport,
} from "@/lib/utils/packaging-filter-helpers";

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeOrder(
  overrides: Partial<PackagingOrderReport> = {}
): PackagingOrderReport {
  return {
    orderId: "o1",
    orderNumber: 100,
    status: "active",
    customerName: "Acme Corp",
    createdAt: "2024-01-01",
    totalItems: 4,
    packedItems: 2,
    isFullyPacked: false,
    items: [
      {
        itemIndex: 0,
        articleName: "Madrac",
        articleCode: null,
        components: [
          { name: "Desna Baza", scanned: true, scannedAt: "2024-01-01" },
          { name: "Lijeva Baza", scanned: false, scannedAt: null },
        ],
        allComponentsScanned: false,
        itemCompleted: false,
        hasProductBarcode: false,
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// filterPackagingOrders
// ---------------------------------------------------------------------------

describe("filterPackagingOrders", () => {
  it("returns all orders when no filters are active", () => {
    const orders = [makeOrder(), makeOrder({ orderId: "o2" })];
    const result = filterPackagingOrders(orders, {});
    expect(result).toHaveLength(2);
  });

  it("filters by customerName case-insensitively", () => {
    const orders = [
      makeOrder({ customerName: "Acme Corp" }),
      makeOrder({ orderId: "o2", customerName: "Beta Inc" }),
    ];
    const result = filterPackagingOrders(orders, { customerName: "acme" });
    expect(result).toHaveLength(1);
    expect(result[0].customerName).toBe("Acme Corp");
  });

  it("excludes orders with null customerName when filter is active", () => {
    const orders = [
      makeOrder({ customerName: null }),
      makeOrder({ orderId: "o2", customerName: "Test" }),
    ];
    const result = filterPackagingOrders(orders, { customerName: "test" });
    expect(result).toHaveLength(1);
    expect(result[0].customerName).toBe("Test");
  });

  it("filters by orderNumber with string-contains", () => {
    const orders = [
      makeOrder({ orderNumber: 12345 }),
      makeOrder({ orderId: "o2", orderNumber: 67890 }),
    ];
    const result = filterPackagingOrders(orders, { orderNumber: "234" });
    expect(result).toHaveLength(1);
    expect(result[0].orderNumber).toBe(12345);
  });

  it("filters by completionStatus fully_packed", () => {
    const orders = [
      makeOrder({ isFullyPacked: true, packedItems: 4 }),
      makeOrder({ orderId: "o2", isFullyPacked: false, packedItems: 2 }),
    ];
    const result = filterPackagingOrders(orders, {
      completionStatus: "fully_packed",
    });
    expect(result).toHaveLength(1);
    expect(result[0].isFullyPacked).toBe(true);
  });

  it("filters by completionStatus partially_packed", () => {
    const orders = [
      makeOrder({ isFullyPacked: false, packedItems: 2 }),
      makeOrder({ orderId: "o2", isFullyPacked: false, packedItems: 0 }),
      makeOrder({ orderId: "o3", isFullyPacked: true, packedItems: 4 }),
    ];
    const result = filterPackagingOrders(orders, {
      completionStatus: "partially_packed",
    });
    expect(result).toHaveLength(1);
    expect(result[0].packedItems).toBe(2);
  });

  it("filters by completionStatus not_started", () => {
    const orders = [
      makeOrder({ packedItems: 0, isFullyPacked: false }),
      makeOrder({ orderId: "o2", packedItems: 1, isFullyPacked: false }),
    ];
    const result = filterPackagingOrders(orders, {
      completionStatus: "not_started",
    });
    expect(result).toHaveLength(1);
    expect(result[0].packedItems).toBe(0);
  });

  it("completionStatus 'all' returns everything", () => {
    const orders = [makeOrder(), makeOrder({ orderId: "o2" })];
    const result = filterPackagingOrders(orders, { completionStatus: "all" });
    expect(result).toHaveLength(2);
  });

  it("filters by componentTypes", () => {
    const orders = [
      makeOrder({
        items: [
          {
            itemIndex: 0,
            articleName: "A",
            articleCode: null,
            components: [{ name: "Madrac", scanned: false, scannedAt: null }],
            allComponentsScanned: false,
            itemCompleted: false,
            hasProductBarcode: false,
          },
        ],
      }),
      makeOrder({
        orderId: "o2",
        items: [
          {
            itemIndex: 0,
            articleName: "B",
            articleCode: null,
            components: [{ name: "Uzglavlje", scanned: false, scannedAt: null }],
            allComponentsScanned: false,
            itemCompleted: false,
            hasProductBarcode: false,
          },
        ],
      }),
    ];
    const result = filterPackagingOrders(orders, {
      componentTypes: ["Madrac"],
    });
    expect(result).toHaveLength(1);
    expect(result[0].items[0].components[0].name).toBe("Madrac");
  });

  it("applies AND logic across multiple filters", () => {
    const orders = [
      makeOrder({
        customerName: "Acme Corp",
        orderNumber: 100,
        packedItems: 0,
        isFullyPacked: false,
      }),
      makeOrder({
        orderId: "o2",
        customerName: "Acme Ltd",
        orderNumber: 200,
        packedItems: 2,
        isFullyPacked: false,
      }),
    ];
    const result = filterPackagingOrders(orders, {
      customerName: "acme",
      completionStatus: "not_started",
    });
    expect(result).toHaveLength(1);
    expect(result[0].orderNumber).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// computePackagingProgress
// ---------------------------------------------------------------------------

describe("computePackagingProgress", () => {
  it("computes correct totals and percentage", () => {
    const orders = [
      makeOrder({ totalItems: 10, packedItems: 3 }),
      makeOrder({ orderId: "o2", totalItems: 10, packedItems: 7 }),
    ];
    const result = computePackagingProgress(orders);
    expect(result.totalItems).toBe(20);
    expect(result.packedItems).toBe(10);
    expect(result.percentage).toBe(50);
  });

  it("returns 0 percentage when totalItems is 0", () => {
    const result = computePackagingProgress([]);
    expect(result.totalItems).toBe(0);
    expect(result.packedItems).toBe(0);
    expect(result.percentage).toBe(0);
  });

  it("rounds percentage to nearest integer", () => {
    const orders = [makeOrder({ totalItems: 3, packedItems: 1 })];
    const result = computePackagingProgress(orders);
    // 1/3 = 33.33... → rounds to 33
    expect(result.percentage).toBe(33);
  });
});

// ---------------------------------------------------------------------------
// getAvailableComponentTypes
// ---------------------------------------------------------------------------

describe("getAvailableComponentTypes", () => {
  it("returns unique sorted component names", () => {
    const orders = [
      makeOrder({
        items: [
          {
            itemIndex: 0,
            articleName: "A",
            articleCode: null,
            components: [
              { name: "Uzglavlje", scanned: false, scannedAt: null },
              { name: "Desna Baza", scanned: false, scannedAt: null },
            ],
            allComponentsScanned: false,
            itemCompleted: false,
            hasProductBarcode: false,
          },
        ],
      }),
      makeOrder({
        orderId: "o2",
        items: [
          {
            itemIndex: 0,
            articleName: "B",
            articleCode: null,
            components: [
              { name: "Desna Baza", scanned: false, scannedAt: null },
              { name: "Madrac", scanned: false, scannedAt: null },
            ],
            allComponentsScanned: false,
            itemCompleted: false,
            hasProductBarcode: false,
          },
        ],
      }),
    ];
    const result = getAvailableComponentTypes(orders);
    expect(result).toEqual(["Desna Baza", "Madrac", "Uzglavlje"]);
  });

  it("returns empty array for empty orders", () => {
    expect(getAvailableComponentTypes([])).toEqual([]);
  });
});
