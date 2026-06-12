/**
 * Unit tests for ProductionOrderService.checkMaterialAvailability
 * with category item material requirements.
 *
 * Validates:
 * - Requirement 6.5: Insufficient stock for category item material sets order to waiting_material
 * - Requirement 6.8: Re-evaluating material availability includes category item requirements
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Prisma mock setup (hoisted so vi.mock factory can reference it) ----
const { mockPrisma } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    mockPrisma: {
      productionOrder: { findUnique: fn(), update: fn() },
      material: { findMany: fn() },
      fabric: { findMany: fn() },
      rucka: { findMany: fn() },
      paspul: { findMany: fn() },
      nogica: { findMany: fn() },
    } as any,
  };
});

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/services/article.service", () => ({
  ArticleService: {
    calculateMaterialRequirements: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/services/audit-log.service", () => ({
  AuditLogService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/services/normative-version.service", () => ({
  NormativeVersionService: {
    getActiveVersion: vi.fn().mockResolvedValue(null),
  },
}));

import { ProductionOrderService } from "../production-order.service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProductionOrderService.checkMaterialAvailability - Category Items", () => {
  it("should set status to waiting_material when category item material has insufficient stock (Req 6.5)", async () => {
    const orderId = "order-1";
    const materialId = "mat-rucka-1";

    // Order with an item that has a rucka with linked material
    mockPrisma.productionOrder.findUnique.mockResolvedValue({
      id: orderId,
      articleId: null,
      quantity: null,
      status: "ready",
      items: [
        {
          id: "item-1",
          articleId: "article-1",
          quantity: 10,
          fabricId: null,
          ruckaId: "rucka-1",
          paspulId: null,
          nogice1Id: null,
          nogice2Id: null,
        },
      ],
    });

    // Rucka has a linked material
    mockPrisma.rucka.findMany.mockResolvedValue([
      { id: "rucka-1", materialId, material: { id: materialId, name: "Rucka Material" } },
    ]);
    mockPrisma.paspul.findMany.mockResolvedValue([]);
    mockPrisma.nogica.findMany.mockResolvedValue([]);
    mockPrisma.fabric.findMany.mockResolvedValue([]);

    // Material has insufficient stock (only 3 available, need 10)
    mockPrisma.material.findMany.mockResolvedValue([
      { id: materialId, name: "Rucka Material", currentQuantity: 3 },
    ]);

    mockPrisma.productionOrder.update.mockResolvedValue({});

    const result = await ProductionOrderService.checkMaterialAvailability(orderId);

    // Should report not all available
    expect(result.allAvailable).toBe(false);

    // Should include the category item material requirement with deficit
    const ruckaMaterialReq = result.requirements.find((r) => r.materialId === materialId);
    expect(ruckaMaterialReq).toBeDefined();
    expect(ruckaMaterialReq!.requiredQuantity).toBe(10);
    expect(ruckaMaterialReq!.availableQuantity).toBe(3);
    expect(ruckaMaterialReq!.deficit).toBe(7);

    // Should update order status to waiting_material
    expect(mockPrisma.productionOrder.update).toHaveBeenCalledWith({
      where: { id: orderId },
      data: { status: "waiting_material" },
    });
  });

  it("should set status to ready when all category item materials have sufficient stock", async () => {
    const orderId = "order-2";
    const materialId = "mat-paspul-1";

    mockPrisma.productionOrder.findUnique.mockResolvedValue({
      id: orderId,
      articleId: null,
      quantity: null,
      status: "waiting_material",
      items: [
        {
          id: "item-1",
          articleId: "article-1",
          quantity: 5,
          fabricId: null,
          ruckaId: null,
          paspulId: "paspul-1",
          nogice1Id: null,
          nogice2Id: null,
        },
      ],
    });

    mockPrisma.rucka.findMany.mockResolvedValue([]);
    mockPrisma.paspul.findMany.mockResolvedValue([
      { id: "paspul-1", materialId, material: { id: materialId, name: "Paspul Material" } },
    ]);
    mockPrisma.nogica.findMany.mockResolvedValue([]);
    mockPrisma.fabric.findMany.mockResolvedValue([]);

    // Material has sufficient stock (20 available, need 5)
    mockPrisma.material.findMany.mockResolvedValue([
      { id: materialId, name: "Paspul Material", currentQuantity: 20 },
    ]);

    mockPrisma.productionOrder.update.mockResolvedValue({});

    const result = await ProductionOrderService.checkMaterialAvailability(orderId);

    expect(result.allAvailable).toBe(true);
    expect(mockPrisma.productionOrder.update).toHaveBeenCalledWith({
      where: { id: orderId },
      data: { status: "ready" },
    });
  });

  it("should include nogice1 and nogice2 material requirements in availability check (Req 6.8)", async () => {
    const orderId = "order-3";
    const materialId = "mat-nogice-1";

    mockPrisma.productionOrder.findUnique.mockResolvedValue({
      id: orderId,
      articleId: null,
      quantity: null,
      status: "ready",
      items: [
        {
          id: "item-1",
          articleId: "article-1",
          quantity: 8,
          fabricId: null,
          ruckaId: null,
          paspulId: null,
          nogice1Id: "nogica-1",
          nogice2Id: "nogica-1", // same nogica for both
        },
      ],
    });

    mockPrisma.rucka.findMany.mockResolvedValue([]);
    mockPrisma.paspul.findMany.mockResolvedValue([]);
    // Both nogice1 and nogice2 reference the same nogica with same material
    mockPrisma.nogica.findMany.mockResolvedValue([
      { id: "nogica-1", materialId, material: { id: materialId, name: "Nogice Material" } },
    ]);
    mockPrisma.fabric.findMany.mockResolvedValue([]);

    // Material has insufficient stock (10 available, need 16 = 8 × 2)
    mockPrisma.material.findMany.mockResolvedValue([
      { id: materialId, name: "Nogice Material", currentQuantity: 10 },
    ]);

    mockPrisma.productionOrder.update.mockResolvedValue({});

    const result = await ProductionOrderService.checkMaterialAvailability(orderId);

    expect(result.allAvailable).toBe(false);

    // Should aggregate both nogice1 and nogice2 requirements (8 + 8 = 16)
    const nogiceMaterialReq = result.requirements.find((r) => r.materialId === materialId);
    expect(nogiceMaterialReq).toBeDefined();
    expect(nogiceMaterialReq!.requiredQuantity).toBe(16);
    expect(nogiceMaterialReq!.availableQuantity).toBe(10);
    expect(nogiceMaterialReq!.deficit).toBe(6);

    // Should set status to waiting_material
    expect(mockPrisma.productionOrder.update).toHaveBeenCalledWith({
      where: { id: orderId },
      data: { status: "waiting_material" },
    });
  });

  it("should not update status for completed or in_progress orders", async () => {
    const orderId = "order-4";
    const materialId = "mat-rucka-2";

    mockPrisma.productionOrder.findUnique.mockResolvedValue({
      id: orderId,
      articleId: null,
      quantity: null,
      status: "completed",
      items: [
        {
          id: "item-1",
          articleId: "article-1",
          quantity: 10,
          fabricId: null,
          ruckaId: "rucka-1",
          paspulId: null,
          nogice1Id: null,
          nogice2Id: null,
        },
      ],
    });

    mockPrisma.rucka.findMany.mockResolvedValue([
      { id: "rucka-1", materialId, material: { id: materialId, name: "Rucka Material" } },
    ]);
    mockPrisma.paspul.findMany.mockResolvedValue([]);
    mockPrisma.nogica.findMany.mockResolvedValue([]);
    mockPrisma.fabric.findMany.mockResolvedValue([]);

    // Insufficient stock
    mockPrisma.material.findMany.mockResolvedValue([
      { id: materialId, name: "Rucka Material", currentQuantity: 2 },
    ]);

    const result = await ProductionOrderService.checkMaterialAvailability(orderId);

    // Should still report the deficit
    expect(result.allAvailable).toBe(false);
    const req = result.requirements.find((r) => r.materialId === materialId);
    expect(req!.deficit).toBe(8);

    // Should NOT update status for completed orders
    expect(mockPrisma.productionOrder.update).not.toHaveBeenCalled();
  });

  it("should skip category items with null materialId without error (Req 6.7 via 6.8)", async () => {
    const orderId = "order-5";

    mockPrisma.productionOrder.findUnique.mockResolvedValue({
      id: orderId,
      articleId: null,
      quantity: null,
      status: "ready",
      items: [
        {
          id: "item-1",
          articleId: "article-1",
          quantity: 5,
          fabricId: null,
          ruckaId: "rucka-no-material",
          paspulId: null,
          nogice1Id: null,
          nogice2Id: null,
        },
      ],
    });

    // Rucka has no linked material
    mockPrisma.rucka.findMany.mockResolvedValue([
      { id: "rucka-no-material", materialId: null, material: null },
    ]);
    mockPrisma.paspul.findMany.mockResolvedValue([]);
    mockPrisma.nogica.findMany.mockResolvedValue([]);
    mockPrisma.fabric.findMany.mockResolvedValue([]);
    mockPrisma.material.findMany.mockResolvedValue([]);

    mockPrisma.productionOrder.update.mockResolvedValue({});

    const result = await ProductionOrderService.checkMaterialAvailability(orderId);

    // No requirements should be generated for category items without materialId
    expect(result.requirements).toHaveLength(0);
    expect(result.allAvailable).toBe(true);
  });
});
