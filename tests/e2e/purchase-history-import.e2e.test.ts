/**
 * End-to-End Test for Material Purchase History Import
 * 
 * Task 12.1: Test end-to-end import flow
 * - Upload sample CSV file through UI (simulated via action)
 * - Verify database records created correctly
 * - Verify material prices updated when enabled
 * - Verify error handling for invalid rows
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { importPurchaseHistory } from "@/lib/services/purchase-import.service";
import fs from "fs";
import path from "path";

describe("End-to-End: Purchase History Import", () => {
  const testMaterialIds: string[] = [];
  const testSupplierIds: string[] = [];
  const testPurchaseHistoryIds: string[] = [];

  afterAll(async () => {
    // Cleanup test data
    if (testPurchaseHistoryIds.length > 0) {
      await prisma.materialPurchaseHistory.deleteMany({
        where: { id: { in: testPurchaseHistoryIds } },
      });
    }
    if (testMaterialIds.length > 0) {
      await prisma.material.deleteMany({
        where: { id: { in: testMaterialIds } },
      });
    }
    if (testSupplierIds.length > 0) {
      await prisma.supplier.deleteMany({
        where: { id: { in: testSupplierIds } },
      });
    }
  });

  it("should import sample CSV file and create database records", async () => {
    // Read the sample CSV file
    const samplePath = path.join(
      process.cwd(),
      "imports",
      "KALKULACIJE ULAZI ZA PERIOD 1.1.2026-10.4.2026 IZ NEMANJINOG PROGRAMA ANALITIKA.xlsx - expdata (1).csv"
    );

    expect(fs.existsSync(samplePath)).toBe(true);

    const csvContent = fs.readFileSync(samplePath, "utf-8");

    // Import with price updates disabled for this test
    const result = await importPurchaseHistory(csvContent, {
      updateMaterialPrices: false,
    });

    // Verify import was successful
    expect(result.success).toBe(true);
    expect(result.summary.totalRows).toBeGreaterThan(0);
    expect(result.summary.imported).toBeGreaterThan(0);

    console.log("Import Summary:", result.summary);

    // Verify database records were created
    const purchaseHistoryCount = await prisma.materialPurchaseHistory.count();
    expect(purchaseHistoryCount).toBeGreaterThan(0);

    // Get a sample record to verify structure
    const sampleRecord = await prisma.materialPurchaseHistory.findFirst({
      include: {
        material: true,
        supplier: true,
      },
    });

    expect(sampleRecord).toBeDefined();
    expect(sampleRecord?.materialId).toBeDefined();
    expect(sampleRecord?.purchaseDate).toBeInstanceOf(Date);
    expect(sampleRecord?.quantity).toBeGreaterThan(0);
    expect(sampleRecord?.purchasePrice).toBeGreaterThan(0);
    expect(sampleRecord?.totalValue).toBeGreaterThan(0);
    expect(sampleRecord?.unit).toBeDefined();

    console.log("Sample Purchase History Record:", {
      id: sampleRecord?.id,
      materialName: sampleRecord?.material.name,
      supplierName: sampleRecord?.supplier?.companyName,
      purchaseDate: sampleRecord?.purchaseDate,
      quantity: sampleRecord?.quantity,
      purchasePrice: sampleRecord?.purchasePrice,
      totalValue: sampleRecord?.totalValue,
    });
  }, 60000); // 60 second timeout for large file

  it("should update material prices when enabled", async () => {
    // Create a test material with a known price
    const testMaterial = await prisma.material.create({
      data: {
        name: "E2E Test Material",
        code: "E2E-TEST-001",
        unit: "kom",
        price: 10.0,
        currentQuantity: 0,
        minimumQuantity: 0,
      },
    });
    testMaterialIds.push(testMaterial.id);

    // Create a test supplier
    const testSupplier = await prisma.supplier.create({
      data: {
        companyName: "E2E Test Supplier",
        code: "E2E-SUP-001",
      },
    });
    testSupplierIds.push(testSupplier.id);

    // Create CSV content with new price
    const csvContent = `VrstaFixDokument,RedniBroj,Datum,DobavljacNaziv,DobavljacSifra,ArtikalNaziv,ArtikalSifra,JedinicaMjere,Kolicina,FakturnaCijena,FakturnaVrijednost,TrosakUkupno,NabavnaCijena,NabavnaVrijednost,trosak %
ULAZ,1,01.01.26,E2E Test Supplier,E2E-SUP-001,E2E Test Material,E2E-TEST-001,kom,"10,00","15,00","150,00","5,00","20,00","200,00","3,33"`;

    // Import with price updates enabled
    const result = await importPurchaseHistory(csvContent, {
      updateMaterialPrices: true,
    });

    expect(result.success).toBe(true);
    expect(result.summary.imported).toBe(1);
    expect(result.summary.pricesUpdated).toBe(1);

    // Verify material price was updated
    const updatedMaterial = await prisma.material.findUnique({
      where: { id: testMaterial.id },
    });

    expect(updatedMaterial?.price).toBe(20.0); // NabavnaCijena from CSV

    // Verify purchase history was created
    const purchaseHistory = await prisma.materialPurchaseHistory.findFirst({
      where: { materialId: testMaterial.id },
    });

    expect(purchaseHistory).toBeDefined();
    expect(purchaseHistory?.purchasePrice).toBe(20.0);
    expect(purchaseHistory?.quantity).toBe(10.0);
    expect(purchaseHistory?.totalValue).toBe(200.0);

    if (purchaseHistory) {
      testPurchaseHistoryIds.push(purchaseHistory.id);
    }
  });

  it("should handle invalid rows and continue processing", async () => {
    // Create CSV with mix of valid and invalid rows
    const csvContent = `VrstaFixDokument,RedniBroj,Datum,DobavljacNaziv,DobavljacSifra,ArtikalNaziv,ArtikalSifra,JedinicaMjere,Kolicina,FakturnaCijena,FakturnaVrijednost,TrosakUkupno,NabavnaCijena,NabavnaVrijednost,trosak %
ULAZ,1,01.01.26,Valid Supplier,VS-001,Valid Material,VM-001,kom,"10,00","15,00","150,00","5,00","20,00","200,00","3,33"
ULAZ,2,INVALID_DATE,Invalid Supplier,IS-001,Invalid Material,IM-001,kom,"10,00","15,00","150,00","5,00","20,00","200,00","3,33"
ULAZ,3,02.01.26,Valid Supplier 2,VS-002,Valid Material 2,VM-002,kom,"-5,00","15,00","150,00","5,00","20,00","200,00","3,33"
ULAZ,4,03.01.26,Valid Supplier 3,VS-003,Valid Material 3,VM-003,kom,"10,00","15,00","150,00","5,00","20,00","200,00","3,33"`;

    const result = await importPurchaseHistory(csvContent, {
      updateMaterialPrices: false,
    });

    // Should have processed all rows
    expect(result.summary.totalRows).toBe(4);
    
    // Should have imported valid rows
    expect(result.summary.imported).toBeGreaterThanOrEqual(2);
    
    // Should have skipped invalid rows
    expect(result.summary.skipped).toBeGreaterThanOrEqual(1);
    
    // Should have error messages
    expect(result.errors.length).toBeGreaterThan(0);

    console.log("Error handling test results:", {
      totalRows: result.summary.totalRows,
      imported: result.summary.imported,
      skipped: result.summary.skipped,
      errors: result.errors,
    });

    // Cleanup created materials
    const createdMaterials = await prisma.material.findMany({
      where: {
        code: { in: ["VM-001", "VM-002", "VM-003"] },
      },
    });
    testMaterialIds.push(...createdMaterials.map((m) => m.id));

    const createdSuppliers = await prisma.supplier.findMany({
      where: {
        code: { in: ["VS-001", "VS-002", "VS-003"] },
      },
    });
    testSupplierIds.push(...createdSuppliers.map((s) => s.id));

    const createdHistory = await prisma.materialPurchaseHistory.findMany({
      where: {
        materialId: { in: testMaterialIds },
      },
    });
    testPurchaseHistoryIds.push(...createdHistory.map((h) => h.id));
  });

  it("should not update material prices when disabled", async () => {
    // Create a test material with a known price
    const testMaterial = await prisma.material.create({
      data: {
        name: "E2E Test Material No Update",
        code: "E2E-TEST-002",
        unit: "kom",
        price: 50.0,
        currentQuantity: 0,
        minimumQuantity: 0,
      },
    });
    testMaterialIds.push(testMaterial.id);

    // Create CSV content with different price
    const csvContent = `VrstaFixDokument,RedniBroj,Datum,DobavljacNaziv,DobavljacSifra,ArtikalNaziv,ArtikalSifra,JedinicaMjere,Kolicina,FakturnaCijena,FakturnaVrijednost,TrosakUkupno,NabavnaCijena,NabavnaVrijednost,trosak %
ULAZ,1,01.01.26,Test Supplier,TS-001,E2E Test Material No Update,E2E-TEST-002,kom,"10,00","15,00","150,00","5,00","100,00","1000,00","3,33"`;

    // Import with price updates disabled
    const result = await importPurchaseHistory(csvContent, {
      updateMaterialPrices: false,
    });

    expect(result.success).toBe(true);
    expect(result.summary.imported).toBe(1);
    expect(result.summary.pricesUpdated).toBe(0);

    // Verify material price was NOT updated
    const updatedMaterial = await prisma.material.findUnique({
      where: { id: testMaterial.id },
    });

    expect(updatedMaterial?.price).toBe(50.0); // Original price unchanged

    // Verify purchase history was created with CSV price
    const purchaseHistory = await prisma.materialPurchaseHistory.findFirst({
      where: { materialId: testMaterial.id },
    });

    expect(purchaseHistory).toBeDefined();
    expect(purchaseHistory?.purchasePrice).toBe(100.0); // CSV price stored in history

    if (purchaseHistory) {
      testPurchaseHistoryIds.push(purchaseHistory.id);
    }

    // Cleanup supplier
    const supplier = await prisma.supplier.findFirst({
      where: { code: "TS-001" },
    });
    if (supplier) {
      testSupplierIds.push(supplier.id);
    }
  });
});
