/**
 * Integration tests for Purchase Import Service orchestration
 * 
 * Tests verify tasks 6.2, 6.5, 6.8, and 6.10:
 * - Row processing with validation
 * - MaterialPurchaseHistory record creation
 * - Material price update logic
 * - Import summary generation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Prisma mock setup ----
const { mockPrisma, mockTx } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    mockTx: {
      materialPurchaseHistory: {
        create: fn(),
      },
      material: {
        update: fn(),
      },
    },
    mockPrisma: {
      material: {
        findFirst: fn(),
        create: fn(),
      },
      supplier: {
        findFirst: fn(),
        create: fn(),
      },
      $transaction: fn(),
    },
  };
});

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

// ---- CSV Parser mock setup ----
const { mockParsePurchaseCSV } = vi.hoisted(() => ({
  mockParsePurchaseCSV: vi.fn(),
}));

vi.mock("../purchase-csv-parser.service", () => ({
  parsePurchaseCSV: mockParsePurchaseCSV,
}));

import { importPurchaseHistory } from "../purchase-import.service";

describe("Purchase Import Service - Orchestration (Tasks 6.2, 6.5, 6.8, 6.10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Task 6.2: Row processing with validation", () => {
    it("should validate purchase date is valid date", async () => {
      const parseResult = {
        rows: [
          {
            documentType: "DOC1",
            sequenceNumber: "1",
            date: new Date("invalid"), // Invalid date
            supplierName: "Supplier A",
            supplierCode: "SUP001",
            materialName: "Material A",
            materialCode: "MAT001",
            unit: "kg",
            quantity: 10,
            invoicePrice: 5.0,
            invoiceValue: 50.0,
            totalCost: 52.0,
            purchasePrice: 5.2,
            purchaseValue: 52.0,
            costPercentage: 4.0,
          },
        ],
        errors: [],
      };

      mockParsePurchaseCSV.mockReturnValueOnce(parseResult);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      const result = await importPurchaseHistory("csv content", {
        updateMaterialPrices: false,
      });

      expect(result.summary.skipped).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe("Invalid purchase date");
      expect(result.summary.imported).toBe(0);
    });

    it("should validate quantity is positive number", async () => {
      const parseResult = {
        rows: [
          {
            documentType: "DOC1",
            sequenceNumber: "1",
            date: new Date("2024-01-15"),
            supplierName: "Supplier A",
            supplierCode: "SUP001",
            materialName: "Material A",
            materialCode: "MAT001",
            unit: "kg",
            quantity: -5, // Negative quantity
            invoicePrice: 5.0,
            invoiceValue: 50.0,
            totalCost: 52.0,
            purchasePrice: 5.2,
            purchaseValue: 52.0,
            costPercentage: 4.0,
          },
        ],
        errors: [],
      };

      mockParsePurchaseCSV.mockReturnValueOnce(parseResult);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      const result = await importPurchaseHistory("csv content", {
        updateMaterialPrices: false,
      });

      expect(result.summary.skipped).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe("Quantity must be a positive number");
      expect(result.summary.imported).toBe(0);
    });

    it("should validate purchase price is positive number", async () => {
      const parseResult = {
        rows: [
          {
            documentType: "DOC1",
            sequenceNumber: "1",
            date: new Date("2024-01-15"),
            supplierName: "Supplier A",
            supplierCode: "SUP001",
            materialName: "Material A",
            materialCode: "MAT001",
            unit: "kg",
            quantity: 10,
            invoicePrice: 5.0,
            invoiceValue: 50.0,
            totalCost: 52.0,
            purchasePrice: 0, // Zero price
            purchaseValue: 52.0,
            costPercentage: 4.0,
          },
        ],
        errors: [],
      };

      mockParsePurchaseCSV.mockReturnValueOnce(parseResult);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      const result = await importPurchaseHistory("csv content", {
        updateMaterialPrices: false,
      });

      expect(result.summary.skipped).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe("Purchase price must be a positive number");
      expect(result.summary.imported).toBe(0);
    });

    it("should continue processing after validation errors", async () => {
      const parseResult = {
        rows: [
          {
            documentType: "DOC1",
            sequenceNumber: "1",
            date: new Date("2024-01-15"),
            supplierName: "Supplier A",
            supplierCode: "SUP001",
            materialName: "Material A",
            materialCode: "MAT001",
            unit: "kg",
            quantity: -5, // Invalid
            invoicePrice: 5.0,
            invoiceValue: 50.0,
            totalCost: 52.0,
            purchasePrice: 5.2,
            purchaseValue: 52.0,
            costPercentage: 4.0,
          },
          {
            documentType: "DOC2",
            sequenceNumber: "2",
            date: new Date("2024-01-16"),
            supplierName: "Supplier B",
            supplierCode: "SUP002",
            materialName: "Material B",
            materialCode: "MAT002",
            unit: "m",
            quantity: 20, // Valid
            invoicePrice: 10.0,
            invoiceValue: 200.0,
            totalCost: 210.0,
            purchasePrice: 10.5,
            purchaseValue: 210.0,
            costPercentage: 5.0,
          },
        ],
        errors: [],
      };

      mockParsePurchaseCSV.mockReturnValueOnce(parseResult);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      // Mock material and supplier matching
      mockPrisma.material.findFirst.mockResolvedValue({
        id: "material-1",
        code: "MAT002",
        name: "Material B",
      });
      mockPrisma.supplier.findFirst.mockResolvedValue({
        id: "supplier-1",
        code: "SUP002",
        companyName: "Supplier B",
      });

      const result = await importPurchaseHistory("csv content", {
        updateMaterialPrices: false,
      });

      expect(result.summary.skipped).toBe(1);
      expect(result.summary.imported).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe("Task 6.5: MaterialPurchaseHistory record creation", () => {
    it("should create MaterialPurchaseHistory record with all fields", async () => {
      const parseResult = {
        rows: [
          {
            documentType: "DOC1",
            sequenceNumber: "1",
            date: new Date("2024-01-15"),
            supplierName: "Supplier A",
            supplierCode: "SUP001",
            materialName: "Material A",
            materialCode: "MAT001",
            unit: "kg",
            quantity: 10,
            invoicePrice: 5.0,
            invoiceValue: 50.0,
            totalCost: 52.0,
            purchasePrice: 5.2,
            purchaseValue: 52.0,
            costPercentage: 4.0,
          },
        ],
        errors: [],
      };

      mockParsePurchaseCSV.mockReturnValueOnce(parseResult);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      // Mock material matching
      mockPrisma.material.findFirst.mockResolvedValue({
        id: "material-1",
        code: "MAT001",
        name: "Material A",
      });

      // Mock supplier matching
      mockPrisma.supplier.findFirst.mockResolvedValue({
        id: "supplier-1",
        code: "SUP001",
        companyName: "Supplier A",
      });

      const result = await importPurchaseHistory("csv content", {
        updateMaterialPrices: false,
      });

      expect(mockTx.materialPurchaseHistory.create).toHaveBeenCalledWith({
        data: {
          materialId: "material-1",
          supplierId: "supplier-1",
          purchaseDate: parseResult.rows[0].date,
          quantity: 10,
          purchasePrice: 5.2,
          totalValue: 52, // quantity * purchasePrice
          unit: "kg",
          invoiceNumber: null,
        },
      });
      expect(result.summary.imported).toBe(1);
    });

    it("should calculate totalValue as quantity * purchasePrice", async () => {
      const parseResult = {
        rows: [
          {
            documentType: "DOC1",
            sequenceNumber: "1",
            date: new Date("2024-01-15"),
            supplierName: "Supplier A",
            supplierCode: "SUP001",
            materialName: "Material A",
            materialCode: "MAT001",
            unit: "kg",
            quantity: 15.5,
            invoicePrice: 5.0,
            invoiceValue: 50.0,
            totalCost: 52.0,
            purchasePrice: 7.25,
            purchaseValue: 52.0,
            costPercentage: 4.0,
          },
        ],
        errors: [],
      };

      mockParsePurchaseCSV.mockReturnValueOnce(parseResult);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      mockPrisma.material.findFirst.mockResolvedValue({
        id: "material-1",
        code: "MAT001",
      });
      mockPrisma.supplier.findFirst.mockResolvedValue({
        id: "supplier-1",
        code: "SUP001",
      });

      await importPurchaseHistory("csv content", {
        updateMaterialPrices: false,
      });

      expect(mockTx.materialPurchaseHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalValue: 112.375, // 15.5 * 7.25
          }),
        })
      );
    });

    it("should track materialsCreated when new material is created", async () => {
      const parseResult = {
        rows: [
          {
            documentType: "DOC1",
            sequenceNumber: "1",
            date: new Date("2024-01-15"),
            supplierName: "Supplier A",
            supplierCode: "SUP001",
            materialName: "New Material",
            materialCode: "NEW001",
            unit: "kg",
            quantity: 10,
            invoicePrice: 5.0,
            invoiceValue: 50.0,
            totalCost: 52.0,
            purchasePrice: 5.2,
            purchaseValue: 52.0,
            costPercentage: 4.0,
          },
        ],
        errors: [],
      };

      mockParsePurchaseCSV.mockReturnValueOnce(parseResult);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      // No existing material found
      mockPrisma.material.findFirst.mockResolvedValue(null);
      mockPrisma.material.create.mockResolvedValue({
        id: "new-material-1",
        code: "NEW001",
        name: "New Material",
      });

      mockPrisma.supplier.findFirst.mockResolvedValue({
        id: "supplier-1",
        code: "SUP001",
      });

      const result = await importPurchaseHistory("csv content", {
        updateMaterialPrices: false,
      });

      expect(result.summary.materialsCreated).toBe(1);
      expect(result.summary.imported).toBe(1);
    });

    it("should track suppliersCreated when new supplier is created", async () => {
      const parseResult = {
        rows: [
          {
            documentType: "DOC1",
            sequenceNumber: "1",
            date: new Date("2024-01-15"),
            supplierName: "New Supplier",
            supplierCode: "NEWSUP001",
            materialName: "Material A",
            materialCode: "MAT001",
            unit: "kg",
            quantity: 10,
            invoicePrice: 5.0,
            invoiceValue: 50.0,
            totalCost: 52.0,
            purchasePrice: 5.2,
            purchaseValue: 52.0,
            costPercentage: 4.0,
          },
        ],
        errors: [],
      };

      mockParsePurchaseCSV.mockReturnValueOnce(parseResult);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      mockPrisma.material.findFirst.mockResolvedValue({
        id: "material-1",
        code: "MAT001",
      });

      // No existing supplier found
      mockPrisma.supplier.findFirst.mockResolvedValue(null);
      mockPrisma.supplier.create.mockResolvedValue({
        id: "new-supplier-1",
        code: "NEWSUP001",
        companyName: "New Supplier",
      });

      const result = await importPurchaseHistory("csv content", {
        updateMaterialPrices: false,
      });

      expect(result.summary.suppliersCreated).toBe(1);
      expect(result.summary.imported).toBe(1);
    });
  });

  describe("Task 6.8: Material price update logic", () => {
    it("should update material price when updateMaterialPrices is enabled", async () => {
      const parseResult = {
        rows: [
          {
            documentType: "DOC1",
            sequenceNumber: "1",
            date: new Date("2024-01-15"),
            supplierName: "Supplier A",
            supplierCode: "SUP001",
            materialName: "Material A",
            materialCode: "MAT001",
            unit: "kg",
            quantity: 10,
            invoicePrice: 5.0,
            invoiceValue: 50.0,
            totalCost: 52.0,
            purchasePrice: 5.2,
            purchaseValue: 52.0,
            costPercentage: 4.0,
          },
        ],
        errors: [],
      };

      mockParsePurchaseCSV.mockReturnValueOnce(parseResult);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      mockPrisma.material.findFirst.mockResolvedValue({
        id: "material-1",
        code: "MAT001",
      });
      mockPrisma.supplier.findFirst.mockResolvedValue({
        id: "supplier-1",
        code: "SUP001",
      });

      const result = await importPurchaseHistory("csv content", {
        updateMaterialPrices: true,
      });

      expect(mockTx.material.update).toHaveBeenCalledWith({
        where: { id: "material-1" },
        data: { price: 5.2 },
      });
      expect(result.summary.pricesUpdated).toBe(1);
    });

    it("should NOT update material price when updateMaterialPrices is disabled", async () => {
      const parseResult = {
        rows: [
          {
            documentType: "DOC1",
            sequenceNumber: "1",
            date: new Date("2024-01-15"),
            supplierName: "Supplier A",
            supplierCode: "SUP001",
            materialName: "Material A",
            materialCode: "MAT001",
            unit: "kg",
            quantity: 10,
            invoicePrice: 5.0,
            invoiceValue: 50.0,
            totalCost: 52.0,
            purchasePrice: 5.2,
            purchaseValue: 52.0,
            costPercentage: 4.0,
          },
        ],
        errors: [],
      };

      mockParsePurchaseCSV.mockReturnValueOnce(parseResult);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      mockPrisma.material.findFirst.mockResolvedValue({
        id: "material-1",
        code: "MAT001",
      });
      mockPrisma.supplier.findFirst.mockResolvedValue({
        id: "supplier-1",
        code: "SUP001",
      });

      const result = await importPurchaseHistory("csv content", {
        updateMaterialPrices: false,
      });

      expect(mockTx.material.update).not.toHaveBeenCalled();
      expect(result.summary.pricesUpdated).toBe(0);
    });

    it("should track number of prices updated in summary", async () => {
      const parseResult = {
        rows: [
          {
            documentType: "DOC1",
            sequenceNumber: "1",
            date: new Date("2024-01-15"),
            supplierName: "Supplier A",
            supplierCode: "SUP001",
            materialName: "Material A",
            materialCode: "MAT001",
            unit: "kg",
            quantity: 10,
            invoicePrice: 5.0,
            invoiceValue: 50.0,
            totalCost: 52.0,
            purchasePrice: 5.2,
            purchaseValue: 52.0,
            costPercentage: 4.0,
          },
          {
            documentType: "DOC2",
            sequenceNumber: "2",
            date: new Date("2024-01-16"),
            supplierName: "Supplier B",
            supplierCode: "SUP002",
            materialName: "Material B",
            materialCode: "MAT002",
            unit: "m",
            quantity: 20,
            invoicePrice: 10.0,
            invoiceValue: 200.0,
            totalCost: 210.0,
            purchasePrice: 10.5,
            purchaseValue: 210.0,
            costPercentage: 5.0,
          },
        ],
        errors: [],
      };

      mockParsePurchaseCSV.mockReturnValueOnce(parseResult);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      mockPrisma.material.findFirst
        .mockResolvedValueOnce({ id: "material-1", code: "MAT001" })
        .mockResolvedValueOnce({ id: "material-2", code: "MAT002" });
      mockPrisma.supplier.findFirst
        .mockResolvedValueOnce({ id: "supplier-1", code: "SUP001" })
        .mockResolvedValueOnce({ id: "supplier-2", code: "SUP002" });

      const result = await importPurchaseHistory("csv content", {
        updateMaterialPrices: true,
      });

      expect(result.summary.pricesUpdated).toBe(2);
      expect(mockTx.material.update).toHaveBeenCalledTimes(2);
    });
  });

  describe("Task 6.10: Import summary generation", () => {
    it("should track totalRows, imported, skipped, materialsCreated, suppliersCreated, pricesUpdated", async () => {
      const parseResult = {
        rows: [
          {
            documentType: "DOC1",
            sequenceNumber: "1",
            date: new Date("2024-01-15"),
            supplierName: "New Supplier",
            supplierCode: "NEWSUP001",
            materialName: "New Material",
            materialCode: "NEWMAT001",
            unit: "kg",
            quantity: 10,
            invoicePrice: 5.0,
            invoiceValue: 50.0,
            totalCost: 52.0,
            purchasePrice: 5.2,
            purchaseValue: 52.0,
            costPercentage: 4.0,
          },
          {
            documentType: "DOC2",
            sequenceNumber: "2",
            date: new Date("invalid"), // Invalid date - will be skipped
            supplierName: "Supplier B",
            supplierCode: "SUP002",
            materialName: "Material B",
            materialCode: "MAT002",
            unit: "m",
            quantity: 20,
            invoicePrice: 10.0,
            invoiceValue: 200.0,
            totalCost: 210.0,
            purchasePrice: 10.5,
            purchaseValue: 210.0,
            costPercentage: 5.0,
          },
        ],
        errors: [{ row: 4, message: "Parse error" }], // 1 parse error
      };

      mockParsePurchaseCSV.mockReturnValueOnce(parseResult);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      // First row: create new material and supplier
      // Material matching: code lookup (null), name lookup (null), then create
      mockPrisma.material.findFirst
        .mockResolvedValueOnce(null) // code lookup
        .mockResolvedValueOnce(null); // name lookup
      mockPrisma.material.create.mockResolvedValueOnce({
        id: "new-material-1",
        code: "NEWMAT001",
      });
      // Supplier matching: code lookup (null), name lookup (null), then create
      mockPrisma.supplier.findFirst
        .mockResolvedValueOnce(null) // code lookup
        .mockResolvedValueOnce(null); // name lookup
      mockPrisma.supplier.create.mockResolvedValueOnce({
        id: "new-supplier-1",
        code: "NEWSUP001",
      });

      const result = await importPurchaseHistory("csv content", {
        updateMaterialPrices: true,
      });

      expect(result.summary.totalRows).toBe(3); // 2 rows + 1 parse error
      expect(result.summary.imported).toBe(1); // Only first row is valid
      expect(result.summary.skipped).toBe(2); // 1 parse error + 1 validation error
      expect(result.summary.materialsCreated).toBe(1);
      expect(result.summary.suppliersCreated).toBe(1);
      expect(result.summary.pricesUpdated).toBe(1);
    });

    it("should return accurate counts in ImportResult", async () => {
      const parseResult = {
        rows: [
          {
            documentType: "DOC1",
            sequenceNumber: "1",
            date: new Date("2024-01-15"),
            supplierName: "Supplier A",
            supplierCode: "SUP001",
            materialName: "Material A",
            materialCode: "MAT001",
            unit: "kg",
            quantity: 10,
            invoicePrice: 5.0,
            invoiceValue: 50.0,
            totalCost: 52.0,
            purchasePrice: 5.2,
            purchaseValue: 52.0,
            costPercentage: 4.0,
          },
        ],
        errors: [],
      };

      mockParsePurchaseCSV.mockReturnValueOnce(parseResult);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      mockPrisma.material.findFirst.mockResolvedValue({
        id: "material-1",
        code: "MAT001",
      });
      mockPrisma.supplier.findFirst.mockResolvedValue({
        id: "supplier-1",
        code: "SUP001",
      });

      const result = await importPurchaseHistory("csv content", {
        updateMaterialPrices: false,
      });

      expect(result).toMatchObject({
        success: true,
        summary: {
          totalRows: 1,
          imported: 1,
          skipped: 0,
          materialsCreated: 0,
          suppliersCreated: 0,
          pricesUpdated: 0,
        },
        errors: [],
      });
    });
  });
});
