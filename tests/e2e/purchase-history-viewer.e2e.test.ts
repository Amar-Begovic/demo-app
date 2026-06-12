/**
 * End-to-End Test for Purchase History Viewer
 * 
 * Task 12.2: Test purchase history viewer
 * - Navigate to material detail page (simulated via action)
 * - Verify purchase history displays correctly
 * - Test date range filter
 * - Test supplier filter
 * - Test pagination
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { getPurchaseHistoryAction } from "@/app/actions/get-purchase-history";

describe("End-to-End: Purchase History Viewer", () => {
  let testMaterialId: string;
  let testSupplier1Id: string;
  let testSupplier2Id: string;
  const testPurchaseHistoryIds: string[] = [];

  beforeAll(async () => {
    // Create test material
    const material = await prisma.material.create({
      data: {
        name: "E2E Viewer Test Material",
        code: "E2E-VIEWER-001",
        unit: "kom",
        price: 10.0,
        currentQuantity: 0,
        minimumQuantity: 0,
      },
    });
    testMaterialId = material.id;

    // Create test suppliers
    const supplier1 = await prisma.supplier.create({
      data: {
        companyName: "E2E Viewer Supplier 1",
        code: "E2E-VS-001",
      },
    });
    testSupplier1Id = supplier1.id;

    const supplier2 = await prisma.supplier.create({
      data: {
        companyName: "E2E Viewer Supplier 2",
        code: "E2E-VS-002",
      },
    });
    testSupplier2Id = supplier2.id;

    // Create test purchase history records with different dates and suppliers
    const records = [
      {
        materialId: testMaterialId,
        supplierId: testSupplier1Id,
        purchaseDate: new Date("2026-01-15"),
        quantity: 10,
        purchasePrice: 15.0,
        totalValue: 150.0,
        unit: "kom",
      },
      {
        materialId: testMaterialId,
        supplierId: testSupplier2Id,
        purchaseDate: new Date("2026-02-20"),
        quantity: 20,
        purchasePrice: 18.0,
        totalValue: 360.0,
        unit: "kom",
      },
      {
        materialId: testMaterialId,
        supplierId: testSupplier1Id,
        purchaseDate: new Date("2026-03-10"),
        quantity: 15,
        purchasePrice: 16.0,
        totalValue: 240.0,
        unit: "kom",
      },
      {
        materialId: testMaterialId,
        supplierId: testSupplier2Id,
        purchaseDate: new Date("2026-04-05"),
        quantity: 25,
        purchasePrice: 20.0,
        totalValue: 500.0,
        unit: "kom",
      },
    ];

    for (const record of records) {
      const created = await prisma.materialPurchaseHistory.create({
        data: record,
      });
      testPurchaseHistoryIds.push(created.id);
    }

    // Create additional records for pagination test (total 20 records)
    for (let i = 5; i <= 20; i++) {
      const created = await prisma.materialPurchaseHistory.create({
        data: {
          materialId: testMaterialId,
          supplierId: i % 2 === 0 ? testSupplier1Id : testSupplier2Id,
          purchaseDate: new Date(`2026-04-${i.toString().padStart(2, "0")}`),
          quantity: i * 2,
          purchasePrice: 10.0 + i,
          totalValue: (i * 2) * (10.0 + i),
          unit: "kom",
        },
      });
      testPurchaseHistoryIds.push(created.id);
    }
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.materialPurchaseHistory.deleteMany({
      where: { id: { in: testPurchaseHistoryIds } },
    });
    await prisma.material.delete({
      where: { id: testMaterialId },
    });
    await prisma.supplier.deleteMany({
      where: { id: { in: [testSupplier1Id, testSupplier2Id] } },
    });
  });

  it("should fetch and display purchase history for a material", async () => {
    const result = await getPurchaseHistoryAction({
      materialId: testMaterialId,
      page: 1,
      pageSize: 10,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.data.length).toBeGreaterThan(0);
    expect(result.data!.total).toBe(20); // Total records created

    // Verify record structure
    const firstRecord = result.data!.data[0];
    expect(firstRecord.materialId).toBe(testMaterialId);
    expect(firstRecord.purchaseDate).toBeDefined();
    expect(firstRecord.quantity).toBeGreaterThan(0);
    expect(firstRecord.purchasePrice).toBeGreaterThan(0);
    expect(firstRecord.totalValue).toBeGreaterThan(0);
    expect(firstRecord.unit).toBeDefined();

    console.log("Purchase History Records:", {
      total: result.data!.total,
      fetched: result.data!.data.length,
      sample: {
        date: firstRecord.purchaseDate,
        quantity: firstRecord.quantity,
        price: firstRecord.purchasePrice,
        total: firstRecord.totalValue,
      },
    });
  });

  it("should sort purchase history by date descending by default", async () => {
    const result = await getPurchaseHistoryAction({
      materialId: testMaterialId,
      page: 1,
      pageSize: 10,
    });

    expect(result.success).toBe(true);
    expect(result.data!.data.length).toBeGreaterThan(1);

    // Verify dates are in descending order
    for (let i = 0; i < result.data!.data.length - 1; i++) {
      const currentDate = new Date(result.data!.data[i].purchaseDate);
      const nextDate = new Date(result.data!.data[i + 1].purchaseDate);
      expect(currentDate.getTime()).toBeGreaterThanOrEqual(nextDate.getTime());
    }

    console.log("Date sorting verified - descending order");
  });

  it("should filter purchase history by date range", async () => {
    const result = await getPurchaseHistoryAction({
      materialId: testMaterialId,
      page: 1,
      pageSize: 100,
      dateFrom: new Date("2026-02-01").toISOString(),
      dateTo: new Date("2026-03-31").toISOString(),
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    // Verify all records are within date range
    for (const record of result.data!.data) {
      const purchaseDate = new Date(record.purchaseDate);
      expect(purchaseDate.getTime()).toBeGreaterThanOrEqual(
        new Date("2026-02-01").getTime()
      );
      expect(purchaseDate.getTime()).toBeLessThanOrEqual(
        new Date("2026-03-31").getTime()
      );
    }

    console.log("Date range filter verified:", {
      from: "2026-02-01",
      to: "2026-03-31",
      recordsFound: result.data!.data.length,
    });
  });

  it("should filter purchase history by supplier", async () => {
    const result = await getPurchaseHistoryAction({
      materialId: testMaterialId,
      page: 1,
      pageSize: 100,
      supplierId: testSupplier1Id,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.data.length).toBeGreaterThan(0);

    // Verify all records are from the specified supplier
    for (const record of result.data!.data) {
      expect(record.supplierId).toBe(testSupplier1Id);
    }

    console.log("Supplier filter verified:", {
      supplierId: testSupplier1Id,
      recordsFound: result.data!.data.length,
    });
  });

  it("should support pagination", async () => {
    // Fetch first page
    const page1 = await getPurchaseHistoryAction({
      materialId: testMaterialId,
      page: 1,
      pageSize: 5,
    });

    expect(page1.success).toBe(true);
    expect(page1.data!.data.length).toBe(5);
    expect(page1.data!.total).toBe(20);

    // Fetch second page
    const page2 = await getPurchaseHistoryAction({
      materialId: testMaterialId,
      page: 2,
      pageSize: 5,
    });

    expect(page2.success).toBe(true);
    expect(page2.data!.data.length).toBe(5);
    expect(page2.data!.total).toBe(20);

    // Verify pages contain different records
    const page1Ids = page1.data!.data.map((r) => r.id);
    const page2Ids = page2.data!.data.map((r) => r.id);
    const intersection = page1Ids.filter((id) => page2Ids.includes(id));
    expect(intersection.length).toBe(0);

    console.log("Pagination verified:", {
      page1Records: page1.data!.data.length,
      page2Records: page2.data!.data.length,
      totalRecords: page1.data!.total,
    });
  });

  it("should combine filters (date range + supplier)", async () => {
    const result = await getPurchaseHistoryAction({
      materialId: testMaterialId,
      page: 1,
      pageSize: 100,
      dateFrom: new Date("2026-02-01").toISOString(),
      dateTo: new Date("2026-04-30").toISOString(),
      supplierId: testSupplier2Id,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    // Verify all records match both filters
    for (const record of result.data!.data) {
      const purchaseDate = new Date(record.purchaseDate);
      expect(purchaseDate.getTime()).toBeGreaterThanOrEqual(
        new Date("2026-02-01").getTime()
      );
      expect(purchaseDate.getTime()).toBeLessThanOrEqual(
        new Date("2026-04-30").getTime()
      );
      expect(record.supplierId).toBe(testSupplier2Id);
    }

    console.log("Combined filters verified:", {
      dateRange: "2026-02-01 to 2026-04-30",
      supplierId: testSupplier2Id,
      recordsFound: result.data!.data.length,
    });
  });

  it("should handle empty results gracefully", async () => {
    const result = await getPurchaseHistoryAction({
      materialId: testMaterialId,
      page: 1,
      pageSize: 10,
      dateFrom: new Date("2025-01-01").toISOString(),
      dateTo: new Date("2025-12-31").toISOString(),
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.data.length).toBe(0);
    expect(result.data!.total).toBe(0);

    console.log("Empty results handled correctly");
  });
});
