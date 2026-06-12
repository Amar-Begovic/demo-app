/**
 * Unit tests for Purchase Import Service
 * 
 * Tests verify:
 * - Material matching by code (case-insensitive)
 * - Material matching by name (case-insensitive)
 * - Material creation when no match found
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Prisma mock setup ----
const { mockPrisma } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    mockPrisma: {
      material: {
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

import { matchMaterial, importPurchaseHistory } from "../purchase-import.service";

describe("Purchase Import Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("matchMaterial", () => {
    it("should match material by code (case-insensitive)", async () => {
      const existingMaterial = {
        id: "material-1",
        code: "MAT001",
        name: "Test Material",
        unit: "kg",
        price: 10.5,
        currentQuantity: 100,
        minimumQuantity: 10,
        hasDimensions: false,
        isEdgebanded: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.material.findFirst.mockResolvedValueOnce(existingMaterial);

      const result = await matchMaterial("mat001", "Different Name", "kg", 15.5);

      expect(result).toEqual({
        id: "material-1",
        created: false,
      });
      expect(mockPrisma.material.findFirst).toHaveBeenCalledWith({
        where: { code: { equals: "mat001", mode: "insensitive" } },
      });
    });

    it("should fall back to name matching when code match fails", async () => {
      const existingMaterial = {
        id: "material-2",
        code: "MAT002",
        name: "Test Material",
        unit: "kg",
        price: 10.5,
        currentQuantity: 100,
        minimumQuantity: 10,
        hasDimensions: false,
        isEdgebanded: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // First call (by code) returns null, second call (by name) returns material
      mockPrisma.material.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingMaterial);

      const result = await matchMaterial("NONEXISTENT", "test material", "kg", 20.0);

      expect(result).toEqual({
        id: "material-2",
        created: false,
      });
      expect(mockPrisma.material.findFirst).toHaveBeenCalledTimes(2);
      expect(mockPrisma.material.findFirst).toHaveBeenNthCalledWith(1, {
        where: { code: { equals: "NONEXISTENT", mode: "insensitive" } },
      });
      expect(mockPrisma.material.findFirst).toHaveBeenNthCalledWith(2, {
        where: { name: { equals: "test material", mode: "insensitive" } },
      });
    });

    it("should create new material when no match found", async () => {
      const newMaterial = {
        id: "material-3",
        code: "NEW001",
        name: "New Material",
        unit: "m",
        price: 25.5,
        currentQuantity: 0,
        minimumQuantity: 0,
        hasDimensions: false,
        isEdgebanded: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Both findFirst calls return null (no match)
      mockPrisma.material.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockPrisma.material.create.mockResolvedValueOnce(newMaterial);

      const result = await matchMaterial("NEW001", "New Material", "m", 25.5);

      expect(result).toEqual({
        id: "material-3",
        created: true,
      });
      expect(mockPrisma.material.create).toHaveBeenCalledWith({
        data: {
          code: "NEW001",
          name: "New Material",
          unit: "m",
          price: 25.5,
          currentQuantity: 0,
          minimumQuantity: 0,
        },
      });
    });

    it("should handle null material code", async () => {
      const existingMaterial = {
        id: "material-4",
        code: null,
        name: "Material Without Code",
        unit: "kg",
        price: 10.5,
        currentQuantity: 100,
        minimumQuantity: 10,
        hasDimensions: false,
        isEdgebanded: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // When code is null, skip code matching and go directly to name matching
      mockPrisma.material.findFirst.mockResolvedValueOnce(existingMaterial);

      const result = await matchMaterial(null, "material without code", "kg", 10.5);

      expect(result).toEqual({
        id: "material-4",
        created: false,
      });
      // Should only call findFirst once (by name), not twice
      expect(mockPrisma.material.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrisma.material.findFirst).toHaveBeenCalledWith({
        where: { name: { equals: "material without code", mode: "insensitive" } },
      });
    });

    it("should create material with null code when no match found", async () => {
      const newMaterial = {
        id: "material-5",
        code: null,
        name: "Material Without Code",
        unit: "pcs",
        price: 5.0,
        currentQuantity: 0,
        minimumQuantity: 0,
        hasDimensions: false,
        isEdgebanded: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.material.findFirst.mockResolvedValueOnce(null);
      mockPrisma.material.create.mockResolvedValueOnce(newMaterial);

      const result = await matchMaterial(null, "Material Without Code", "pcs", 5.0);

      expect(result).toEqual({
        id: "material-5",
        created: true,
      });
      expect(mockPrisma.material.create).toHaveBeenCalledWith({
        data: {
          code: null,
          name: "Material Without Code",
          unit: "pcs",
          price: 5.0,
          currentQuantity: 0,
          minimumQuantity: 0,
        },
      });
    });
  });

  describe("importPurchaseHistory", () => {
    it("should parse CSV and wrap operations in transaction", async () => {
      const csvContent = "header\nrow1\nrow2";
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
        return await callback(mockPrisma);
      });

      const result = await importPurchaseHistory(csvContent, {
        updateMaterialPrices: true,
      });

      expect(mockParsePurchaseCSV).toHaveBeenCalledWith(csvContent);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.summary.totalRows).toBe(1);
    });

    it("should handle parse errors and return them in result", async () => {
      const csvContent = "header\ninvalid row";
      const parseResult = {
        rows: [],
        errors: [
          { row: 2, message: "Invalid date format" },
          { row: 3, message: "Missing required field" },
        ],
      };

      mockParsePurchaseCSV.mockReturnValueOnce(parseResult);

      const result = await importPurchaseHistory(csvContent, {
        updateMaterialPrices: false,
      });

      expect(result.success).toBe(false);
      expect(result.summary.totalRows).toBe(2);
      expect(result.summary.skipped).toBe(2);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].message).toBe("Invalid date format");
    });

    it("should rollback transaction on critical error", async () => {
      const csvContent = "header\nrow1";
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
      mockPrisma.$transaction.mockRejectedValueOnce(
        new Error("Database connection failed")
      );

      const result = await importPurchaseHistory(csvContent, {
        updateMaterialPrices: true,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("Critical error during import");
      expect(result.errors[0].message).toContain("Database connection failed");
    });

    it("should return early if no valid rows after parsing", async () => {
      const csvContent = "header\ninvalid1\ninvalid2";
      const parseResult = {
        rows: [],
        errors: [
          { row: 2, message: "Invalid row 1" },
          { row: 3, message: "Invalid row 2" },
        ],
      };

      mockParsePurchaseCSV.mockReturnValueOnce(parseResult);

      const result = await importPurchaseHistory(csvContent, {
        updateMaterialPrices: false,
      });

      expect(result.success).toBe(false);
      expect(result.summary.totalRows).toBe(2);
      expect(result.summary.imported).toBe(0);
      expect(result.summary.skipped).toBe(2);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("should use default options when not provided", async () => {
      const csvContent = "header\nrow1";
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
        return await callback(mockPrisma);
      });

      const result = await importPurchaseHistory(csvContent);

      expect(result.success).toBe(true);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });
});
