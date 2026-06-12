import { describe, it, expect } from "vitest";
import { test as fcTest } from "@fast-check/vitest";
import fc from "fast-check";
import { computeEffectiveOrders } from "../export-orders-excel-button";
import type { OrderRow } from "../selectable-order-table";

// ─── Helpers ─────────────────────────────────────────────

/** Minimal OrderRow generator with unique IDs */
function arbOrderRows(): fc.Arbitrary<OrderRow[]> {
  return fc
    .uniqueArray(fc.uuid(), { minLength: 1, maxLength: 20 })
    .map((ids) =>
      ids.map((id, i) => ({
        id,
        orderNumber: i + 1,
        workOrderNumber: null,
        workOrderDate: null,
        quantity: 1,
        status: "ACTIVE",
        customerName: null,
        createdAt: new Date().toISOString(),
        article: null,
        items: [],
        _count: { workOrders: 0 },
        workOrders: [],
      }))
    );
}

/** Generate a non-empty subset of IDs from the given orders */
function arbNonEmptySubset(orders: OrderRow[]): fc.Arbitrary<Set<string>> {
  const ids = orders.map((o) => o.id);
  return fc
    .subarray(ids, { minLength: 1, maxLength: ids.length })
    .map((subset) => new Set(subset));
}

// ─── Property-Based Tests: Bug Condition (selectedIds.size > 0) ──

describe("computeEffectiveOrders — Bug Condition (selection active)", () => {
  /**
   * Property 1: Bug Condition — Export only selected orders
   * Validates: Requirements 1.1, 1.2, 2.1
   *
   * For any set of orders and a non-empty selectedIds,
   * computeEffectiveOrders should return ONLY orders whose IDs are in selectedIds.
   */
  fcTest.prop(
    [arbOrderRows().chain((orders) => fc.tuple(fc.constant(orders), arbNonEmptySubset(orders)))]
  )(
    "returns only orders whose IDs are in selectedIds",
    ([orders, selectedIds]) => {
      const result = computeEffectiveOrders(orders, selectedIds);
      // Every returned order must be in selectedIds
      for (const order of result) {
        expect(selectedIds.has(order.id)).toBe(true);
      }
      // No selected order should be missing
      const resultIds = new Set(result.map((o) => o.id));
      for (const id of selectedIds) {
        expect(resultIds.has(id)).toBe(true);
      }
    }
  );

  fcTest.prop(
    [arbOrderRows().chain((orders) => fc.tuple(fc.constant(orders), arbNonEmptySubset(orders)))]
  )(
    "result length equals selectedIds size",
    ([orders, selectedIds]) => {
      const result = computeEffectiveOrders(orders, selectedIds);
      expect(result.length).toBe(selectedIds.size);
    }
  );

  fcTest.prop(
    [arbOrderRows().chain((orders) => fc.tuple(fc.constant(orders), arbNonEmptySubset(orders)))]
  )(
    "preserves original order from input array",
    ([orders, selectedIds]) => {
      const result = computeEffectiveOrders(orders, selectedIds);
      // Check that result items appear in the same relative order as in orders
      let lastIndex = -1;
      for (const order of result) {
        const idx = orders.findIndex((o) => o.id === order.id);
        expect(idx).toBeGreaterThan(lastIndex);
        lastIndex = idx;
      }
    }
  );

  // ─── Concrete Failing Cases ──────────────────────────────

  it("3 orders with 2 selected → expect 2 exported", () => {
    const orders: OrderRow[] = [
      makeOrder("a", 1),
      makeOrder("b", 2),
      makeOrder("c", 3),
    ];
    const selectedIds = new Set(["a", "c"]);
    const result = computeEffectiveOrders(orders, selectedIds);
    expect(result.length).toBe(2);
    expect(result.map((o) => o.id)).toEqual(["a", "c"]);
  });

  it("5 orders with 1 selected → expect 1 exported", () => {
    const orders: OrderRow[] = [
      makeOrder("a", 1),
      makeOrder("b", 2),
      makeOrder("c", 3),
      makeOrder("d", 4),
      makeOrder("e", 5),
    ];
    const selectedIds = new Set(["d"]);
    const result = computeEffectiveOrders(orders, selectedIds);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("d");
  });
});

// ─── Helper to create minimal OrderRow ───────────────────

function makeOrder(id: string, orderNumber: number): OrderRow {
  return {
    id,
    orderNumber,
    workOrderNumber: null,
    workOrderDate: null,
    quantity: 1,
    status: "ACTIVE",
    customerName: null,
    createdAt: new Date().toISOString(),
    article: null,
    items: [],
    _count: { workOrders: 0 },
    workOrders: [],
  };
}

// ─── Property-Based Tests: Preservation (no selection active) ──

describe("computeEffectiveOrders — Preservation (no selection)", () => {
  /**
   * Property 2: Preservation — All orders exported when no selection
   * Validates: Requirements 2.2, 3.1
   *
   * When selectedIds is empty or undefined, computeEffectiveOrders
   * must return the full orders array unchanged.
   */

  fcTest.prop([arbOrderRows()])(
    "returns all orders unchanged when selectedIds is empty Set",
    (orders) => {
      const result = computeEffectiveOrders(orders, new Set());
      expect(result).toEqual(orders);
      expect(result.length).toBe(orders.length);
    }
  );

  fcTest.prop([arbOrderRows()])(
    "returns all orders unchanged when selectedIds is undefined",
    (orders) => {
      const result = computeEffectiveOrders(orders, undefined);
      expect(result).toEqual(orders);
      expect(result.length).toBe(orders.length);
    }
  );

  it("returns empty array when orders is empty and selectedIds is non-empty", () => {
    const result = computeEffectiveOrders([], new Set(["x"]));
    expect(result).toEqual([]);
    expect(result.length).toBe(0);
  });

  it("returns empty array when orders is empty and selectedIds is undefined", () => {
    const result = computeEffectiveOrders([], undefined);
    expect(result).toEqual([]);
    expect(result.length).toBe(0);
  });
});
