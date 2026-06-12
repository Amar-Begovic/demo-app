/**
 * Tests for purchase history import server action
 * 
 * Validates:
 * - Task 8.1: Server action extracts CSV and calls import service
 * - Task 8.2: Authentication and authorization checks
 * - Requirements 6.1, 6.2
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/headers
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

// Mock import service
vi.mock("@/lib/services/purchase-import.service", () => ({
  importPurchaseHistory: vi.fn(),
}));

import { cookies } from "next/headers";
import { importPurchaseHistory } from "@/lib/services/purchase-import.service";
import { importPurchaseHistoryAction } from "../purchase-history-import";

const mockCookies = vi.mocked(cookies);
const mockImportPurchaseHistory = vi.mocked(importPurchaseHistory);

describe("importPurchaseHistoryAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Task 8.2: Authentication and authorization checks", () => {
    it("should reject unauthenticated requests", async () => {
      // Mock no session cookie
      mockCookies.mockResolvedValue({
        get: vi.fn().mockReturnValue(undefined),
      } as any);

      const formData = new FormData();
      const result = await importPurchaseHistoryAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unauthorized");
      expect(mockImportPurchaseHistory).not.toHaveBeenCalled();
    });

    it("should reject requests with empty session cookie", async () => {
      // Mock empty session cookie
      mockCookies.mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: "" }),
      } as any);

      const formData = new FormData();
      const result = await importPurchaseHistoryAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unauthorized");
      expect(mockImportPurchaseHistory).not.toHaveBeenCalled();
    });

    it("should allow authenticated requests", async () => {
      // Mock valid session cookie
      mockCookies.mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: "valid-session-token" }),
      } as any);

      // Mock successful import
      mockImportPurchaseHistory.mockResolvedValue({
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

      const formData = new FormData();
      const file = new File(["test,data"], "test.csv", { type: "text/csv" });
      formData.append("file", file);
      formData.append("updateMaterialPrices", "true");

      const result = await importPurchaseHistoryAction(formData);

      expect(result.success).toBe(true);
      expect(mockImportPurchaseHistory).toHaveBeenCalled();
    });
  });

  describe("Task 8.1: CSV file extraction and processing", () => {
    beforeEach(() => {
      // Mock authenticated session for all tests in this block
      mockCookies.mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: "valid-session-token" }),
      } as any);
    });

    it("should reject requests without file", async () => {
      const formData = new FormData();

      const result = await importPurchaseHistoryAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toContain("No file provided");
      expect(mockImportPurchaseHistory).not.toHaveBeenCalled();
    });

    it("should reject non-CSV files", async () => {
      const formData = new FormData();
      const file = new File(["test data"], "test.txt", { type: "text/plain" });
      formData.append("file", file);

      const result = await importPurchaseHistoryAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid file type");
      expect(mockImportPurchaseHistory).not.toHaveBeenCalled();
    });

    it("should extract CSV content and call import service", async () => {
      const csvContent = "header1,header2\nvalue1,value2";
      const file = new File([csvContent], "test.csv", { type: "text/csv" });
      
      const formData = new FormData();
      formData.append("file", file);
      formData.append("updateMaterialPrices", "true");

      mockImportPurchaseHistory.mockResolvedValue({
        success: true,
        summary: {
          totalRows: 1,
          imported: 1,
          skipped: 0,
          materialsCreated: 0,
          suppliersCreated: 0,
          pricesUpdated: 1,
        },
        errors: [],
      });

      const result = await importPurchaseHistoryAction(formData);

      expect(result.success).toBe(true);
      expect(mockImportPurchaseHistory).toHaveBeenCalledWith(
        csvContent,
        { updateMaterialPrices: true }
      );
    });

    it("should default updateMaterialPrices to false when not provided", async () => {
      const csvContent = "header1,header2\nvalue1,value2";
      const file = new File([csvContent], "test.csv", { type: "text/csv" });
      
      const formData = new FormData();
      formData.append("file", file);
      // Not setting updateMaterialPrices

      mockImportPurchaseHistory.mockResolvedValue({
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

      await importPurchaseHistoryAction(formData);

      expect(mockImportPurchaseHistory).toHaveBeenCalledWith(
        csvContent,
        { updateMaterialPrices: false }
      );
    });

    it("should return ImportResult to client", async () => {
      const csvContent = "header1,header2\nvalue1,value2";
      const file = new File([csvContent], "test.csv", { type: "text/csv" });
      
      const formData = new FormData();
      formData.append("file", file);
      formData.append("updateMaterialPrices", "true");

      const expectedResult = {
        success: true,
        summary: {
          totalRows: 5,
          imported: 4,
          skipped: 1,
          materialsCreated: 2,
          suppliersCreated: 1,
          pricesUpdated: 4,
        },
        errors: [
          { row: 3, message: "Invalid date format" },
        ],
      };

      mockImportPurchaseHistory.mockResolvedValue(expectedResult);

      const result = await importPurchaseHistoryAction(formData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(expectedResult);
    });

    it("should handle import service errors", async () => {
      const csvContent = "header1,header2\nvalue1,value2";
      const file = new File([csvContent], "test.csv", { type: "text/csv" });
      
      const formData = new FormData();
      formData.append("file", file);

      mockImportPurchaseHistory.mockRejectedValue(
        new Error("Database connection failed")
      );

      const result = await importPurchaseHistoryAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Database connection failed");
    });
  });
});
