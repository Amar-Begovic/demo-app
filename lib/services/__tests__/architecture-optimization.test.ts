/**
 * Property-based and unit tests for Next.js Architecture Optimization spec.
 *
 * Feature: nextjs-architecture-optimization
 *
 * Covers:
 * - Property 1: Pagination response structure invariant
 * - Property 2: Server action error response shape
 * - Property 3: Cache invalidation after successful mutation
 * - Property 4: Optimized list query field restriction
 * - Unit tests: Pagination edge cases
 */

import { test as fcTest, fc } from "@fast-check/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Prisma mock setup (hoisted so vi.mock factory can reference it) ----
const { mockPrisma } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    mockPrisma: {
      article: {
        findMany: fn(),
        count: fn(),
        create: fn(),
        findUnique: fn(),
        update: fn(),
      },
      material: {
        findMany: fn(),
        count: fn(),
        create: fn(),
        findUnique: fn(),
        update: fn(),
      },
      department: {
        findMany: fn(),
        count: fn(),
        create: fn(),
        findUnique: fn(),
      },
      supplier: {
        findMany: fn(),
        count: fn(),
        create: fn(),
      },
      articlePart: { deleteMany: fn() },
    },
  };
});

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

// ---- next/cache mock (hoisted) ----
const { mockUpdateTag } = vi.hoisted(() => ({
  mockUpdateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({
  updateTag: mockUpdateTag,
  revalidateTag: vi.fn(),
}));

// ---- Imports after mocks ----
import { ArticleService } from "../article.service";
import { MaterialService } from "../material.service";
import { DepartmentService } from "../department.service";

beforeEach(() => {
  vi.clearAllMocks();
});


// ============================================================
// Property 1: Pagination response structure invariant
// **Validates: Requirements 6.1**
// ============================================================
describe("Feature: nextjs-architecture-optimization, Property 1: Pagination response structure invariant", () => {
  /**
   * Helper: set up prisma mocks to simulate a database with `totalItems` rows.
   * Returns the correct slice for the given page/pageSize.
   */
  function setupPaginatedMock(totalItems: number) {
    const allItems = Array.from({ length: totalItems }, (_, i) => ({
      id: `item-${i}`,
      name: `Item ${i}`,
      description: null,
      createdAt: new Date(),
      _count: { parts: 0 },
    }));

    mockPrisma.article.findMany.mockImplementation(
      ({ skip, take }: { skip: number; take: number }) => {
        return Promise.resolve(allItems.slice(skip, skip + take));
      }
    );
    mockPrisma.article.count.mockResolvedValue(totalItems);
  }

  fcTest.prop(
    [
      fc.integer({ min: 1, max: 100 }),
      fc.integer({ min: 1, max: 50 }),
      fc.integer({ min: 0, max: 200 }),
    ],
    { numRuns: 100 }
  )(
    "ArticleService.getAllPaginated satisfies structural invariants for any page/pageSize/totalItems",
    async (page, pageSize, totalItems) => {
      setupPaginatedMock(totalItems);

      const result = await ArticleService.getAllPaginated({ page, pageSize });

      // data.length <= pageSize
      expect(result.data.length).toBeLessThanOrEqual(pageSize);

      // page equals the requested page
      expect(result.page).toBe(page);

      // pageSize equals the requested pageSize
      expect(result.pageSize).toBe(pageSize);

      // total >= 0
      expect(result.total).toBeGreaterThanOrEqual(0);

      const totalPages = Math.ceil(totalItems / pageSize);

      // If total > 0 and page is within range, then data.length > 0
      if (totalItems > 0 && page <= totalPages) {
        expect(result.data.length).toBeGreaterThan(0);
      }

      // If page exceeds total pages, then data.length === 0
      if (page > totalPages) {
        expect(result.data.length).toBe(0);
      }
    }
  );

  // Also test MaterialService to ensure the pattern holds across services
  fcTest.prop(
    [
      fc.integer({ min: 1, max: 100 }),
      fc.integer({ min: 1, max: 50 }),
      fc.integer({ min: 0, max: 200 }),
    ],
    { numRuns: 100 }
  )(
    "MaterialService.getAllPaginated satisfies structural invariants",
    async (page, pageSize, totalItems) => {
      const allItems = Array.from({ length: totalItems }, (_, i) => ({
        id: `mat-${i}`,
        name: `Material ${i}`,
        unit: "kg",
        currentQuantity: 0,
        minimumQuantity: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      mockPrisma.material.findMany.mockImplementation(
        ({ skip, take }: { skip: number; take: number }) => {
          return Promise.resolve(allItems.slice(skip, skip + take));
        }
      );
      mockPrisma.material.count.mockResolvedValue(totalItems);

      const result = await MaterialService.getAllPaginated({ page, pageSize });

      expect(result.data.length).toBeLessThanOrEqual(pageSize);
      expect(result.page).toBe(page);
      expect(result.pageSize).toBe(pageSize);
      expect(result.total).toBeGreaterThanOrEqual(0);

      const totalPages = Math.ceil(totalItems / pageSize);
      if (totalItems > 0 && page <= totalPages) {
        expect(result.data.length).toBeGreaterThan(0);
      }
      if (page > totalPages) {
        expect(result.data.length).toBe(0);
      }
    }
  );
});


// ============================================================
// Property 2: Server action error response shape
// **Validates: Requirements 3.5**
// ============================================================
describe("Feature: nextjs-architecture-optimization, Property 2: Server action error response shape", () => {
  fcTest.prop(
    [fc.string({ minLength: 1, maxLength: 200 })],
    { numRuns: 100 }
  )(
    "createArticle returns { success: false, error: string } when service throws",
    async (errorMessage) => {
      // Make the service throw with the generated error message
      mockPrisma.material.findMany.mockResolvedValue([]);
      mockPrisma.article.create.mockRejectedValue(new Error(errorMessage));

      // Dynamic import to get the server action (which uses the mocked modules)
      const { createArticle } = await import("@/app/actions/articles");

      const result = await createArticle({
        name: "Test",
        parts: [],
      });

      // Must have success: false
      expect(result.success).toBe(false);

      // Must have a non-empty error string
      if (!result.success) {
        expect(typeof result.error).toBe("string");
        expect(result.error.length).toBeGreaterThan(0);
      }
    }
  );

  fcTest.prop(
    [fc.string({ minLength: 1, maxLength: 200 })],
    { numRuns: 100 }
  )(
    "createDepartment returns { success: false, error: string } when service throws",
    async (errorMessage) => {
      mockPrisma.department.create.mockRejectedValue(new Error(errorMessage));

      const { createDepartment } = await import("@/app/actions/departments");

      const result = await createDepartment({ name: "Test Dept" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(typeof result.error).toBe("string");
        expect(result.error.length).toBeGreaterThan(0);
      }
    }
  );

  fcTest.prop(
    [fc.string({ minLength: 1, maxLength: 200 })],
    { numRuns: 100 }
  )(
    "createSupplier returns { success: false, error: string } when service throws",
    async (errorMessage) => {
      mockPrisma.supplier.create.mockRejectedValue(new Error(errorMessage));

      const { createSupplier } = await import("@/app/actions/suppliers");

      const result = await createSupplier({
        companyName: "Test",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(typeof result.error).toBe("string");
        expect(result.error.length).toBeGreaterThan(0);
      }
    }
  );

  it("server actions never throw unhandled exceptions", async () => {
    // Simulate a non-Error throw (e.g., string thrown)
    mockPrisma.article.create.mockRejectedValue("raw string error");
    mockPrisma.material.findMany.mockResolvedValue([]);

    const { createArticle } = await import("@/app/actions/articles");

    // Should NOT throw — should return error result
    const result = await createArticle({ name: "Test", parts: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});


// ============================================================
// Property 3: Cache invalidation after successful mutation
// **Validates: Requirements 3.4, 5.6**
// ============================================================
describe("Feature: nextjs-architecture-optimization, Property 3: Cache invalidation after successful mutation", () => {
  fcTest.prop(
    [fc.string({ minLength: 1, maxLength: 50 }), fc.option(fc.string({ maxLength: 100 }))],
    { numRuns: 100 }
  )(
    "createArticle calls updateTag(CACHE_TAGS.ARTICLES) on success",
    async (name, description) => {
      const mockArticle = {
        id: "art-1",
        name,
        description: description ?? null,
        parts: [],
      };
      mockPrisma.material.findMany.mockResolvedValue([]);
      mockPrisma.article.create.mockResolvedValue(mockArticle);

      const { createArticle } = await import("@/app/actions/articles");

      const result = await createArticle({
        name,
        description: description ?? undefined,
        parts: [],
      });

      expect(result.success).toBe(true);
      expect(mockUpdateTag).toHaveBeenCalledWith("articles");
    }
  );

  fcTest.prop(
    [fc.string({ minLength: 1, maxLength: 50 })],
    { numRuns: 100 }
  )(
    "createDepartment calls updateTag(CACHE_TAGS.DEPARTMENTS) on success",
    async (name) => {
      const mockDept = { id: "dept-1", name, description: null };
      mockPrisma.department.create.mockResolvedValue(mockDept);

      const { createDepartment } = await import("@/app/actions/departments");

      const result = await createDepartment({ name });

      expect(result.success).toBe(true);
      expect(mockUpdateTag).toHaveBeenCalledWith("departments");
    }
  );

  fcTest.prop(
    [fc.string({ minLength: 1, maxLength: 50 })],
    { numRuns: 100 }
  )(
    "createMaterial calls updateTag(CACHE_TAGS.MATERIALS) on success",
    async (name) => {
      const mockMaterial = {
        id: "mat-1",
        name,
        unit: "kg",
        currentQuantity: 0,
        minimumQuantity: 0,
      };
      mockPrisma.material.create.mockResolvedValue(mockMaterial);

      const { createMaterial } = await import("@/app/actions/materials");

      const result = await createMaterial({ name, unit: "kg" });

      expect(result.success).toBe(true);
      expect(mockUpdateTag).toHaveBeenCalledWith("materials");
    }
  );

  fcTest.prop(
    [fc.string({ minLength: 1, maxLength: 50 })],
    { numRuns: 100 }
  )(
    "createSupplier calls updateTag(CACHE_TAGS.SUPPLIERS) on success",
    async (companyName) => {
      const mockSupplier = {
        id: "sup-1",
        companyName,
        code: "S001",
        city: "City",
        country: "BA",
        contactEmail: "e@e.com",
        contactPhone: "123",
      };
      mockPrisma.supplier.create.mockResolvedValue(mockSupplier);

      const { createSupplier } = await import("@/app/actions/suppliers");

      const result = await createSupplier({
        companyName,
      });

      expect(result.success).toBe(true);
      expect(mockUpdateTag).toHaveBeenCalledWith("suppliers");
    }
  );
});


// ============================================================
// Property 4: Optimized list query field restriction
// **Validates: Requirements 7.2, 7.3**
// ============================================================
describe("Feature: nextjs-architecture-optimization, Property 4: Optimized list query field restriction", () => {
  const ARTICLE_LIST_ALLOWED_KEYS = new Set(["id", "name", "description", "createdAt", "_count"]);

  fcTest.prop(
    [fc.integer({ min: 1, max: 10 }), fc.integer({ min: 1, max: 50 })],
    { numRuns: 100 }
  )(
    "ArticleService.getAllPaginated returns only restricted fields (no full parts array)",
    async (page, pageSize) => {
      const mockData = Array.from({ length: Math.min(pageSize, 5) }, (_, i) => ({
        id: `art-${i}`,
        name: `Article ${i}`,
        description: null,
        createdAt: new Date(),
        _count: { parts: i },
      }));

      mockPrisma.article.findMany.mockResolvedValue(mockData);
      mockPrisma.article.count.mockResolvedValue(mockData.length);

      const result = await ArticleService.getAllPaginated({ page: 1, pageSize });

      for (const item of result.data) {
        const keys = Object.keys(item);
        // Every key must be in the allowed set
        for (const key of keys) {
          expect(ARTICLE_LIST_ALLOWED_KEYS.has(key)).toBe(true);
        }
        // Must NOT have full 'parts' array with materials
        expect(item).not.toHaveProperty("parts");
        expect(item).not.toHaveProperty("dimensions");
        expect(item).not.toHaveProperty("code");
        expect(item).not.toHaveProperty("type");
        expect(item).not.toHaveProperty("unit");
        expect(item).not.toHaveProperty("inactive");
        expect(item).not.toHaveProperty("currency");
        expect(item).not.toHaveProperty("priceWithoutVAT");
        expect(item).not.toHaveProperty("taxPercentage");
      }
    }
  );

  fcTest.prop(
    [fc.integer({ min: 1, max: 10 }), fc.integer({ min: 1, max: 50 })],
    { numRuns: 100 }
  )(
    "ArticleService.getAllPaginated uses select (not include) in Prisma call",
    async (page, pageSize) => {
      mockPrisma.article.findMany.mockResolvedValue([]);
      mockPrisma.article.count.mockResolvedValue(0);

      await ArticleService.getAllPaginated({ page, pageSize });

      // Verify the Prisma findMany was called with 'select' (not 'include')
      const callArgs = mockPrisma.article.findMany.mock.calls[0][0];
      expect(callArgs).toHaveProperty("select");
      expect(callArgs).not.toHaveProperty("include");

      // Verify select contains only the expected fields
      expect(callArgs.select).toHaveProperty("id", true);
      expect(callArgs.select).toHaveProperty("name", true);
      expect(callArgs.select).toHaveProperty("description", true);
      expect(callArgs.select).toHaveProperty("createdAt", true);
      expect(callArgs.select).toHaveProperty("_count");
    }
  );
});


// ============================================================
// Unit tests: Pagination edge cases
// ============================================================
describe("Unit tests: Pagination edge cases", () => {
  describe("Empty database (0 results)", () => {
    it("ArticleService.getAllPaginated returns empty data with total=0", async () => {
      mockPrisma.article.findMany.mockResolvedValue([]);
      mockPrisma.article.count.mockResolvedValue(0);

      const result = await ArticleService.getAllPaginated({ page: 1, pageSize: 20 });

      expect(result.data).toEqual([]);
      expect(result.data.length).toBe(0);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it("DepartmentService.getAllPaginated returns empty data with total=0", async () => {
      mockPrisma.department.findMany.mockResolvedValue([]);
      mockPrisma.department.count.mockResolvedValue(0);

      const result = await DepartmentService.getAllPaginated({ page: 1, pageSize: 20 });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it("MaterialService.getAllPaginated returns empty data with total=0", async () => {
      mockPrisma.material.findMany.mockResolvedValue([]);
      mockPrisma.material.count.mockResolvedValue(0);

      const result = await MaterialService.getAllPaginated({ page: 1, pageSize: 20 });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });
  });

  describe("Single item", () => {
    it("ArticleService.getAllPaginated returns single item correctly", async () => {
      const singleItem = {
        id: "art-1",
        name: "Only Article",
        description: "The one",
        createdAt: new Date("2024-01-01"),
        _count: { parts: 2 },
      };
      mockPrisma.article.findMany.mockResolvedValue([singleItem]);
      mockPrisma.article.count.mockResolvedValue(1);

      const result = await ArticleService.getAllPaginated({ page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(singleItem);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it("DepartmentService.getAllPaginated returns single item correctly", async () => {
      const singleDept = { id: "dept-1", name: "Only Dept", description: null };
      mockPrisma.department.findMany.mockResolvedValue([singleDept]);
      mockPrisma.department.count.mockResolvedValue(1);

      const result = await DepartmentService.getAllPaginated({ page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(singleDept);
      expect(result.total).toBe(1);
    });
  });

  describe("Page out of range", () => {
    it("ArticleService.getAllPaginated returns empty data when page exceeds total pages", async () => {
      mockPrisma.article.findMany.mockResolvedValue([]);
      mockPrisma.article.count.mockResolvedValue(5);

      const result = await ArticleService.getAllPaginated({ page: 100, pageSize: 20 });

      expect(result.data).toEqual([]);
      expect(result.data.length).toBe(0);
      expect(result.total).toBe(5);
      expect(result.page).toBe(100);
      expect(result.pageSize).toBe(20);
    });

    it("DepartmentService.getAllPaginated returns empty data when page exceeds total pages", async () => {
      mockPrisma.department.findMany.mockResolvedValue([]);
      mockPrisma.department.count.mockResolvedValue(3);

      const result = await DepartmentService.getAllPaginated({ page: 50, pageSize: 10 });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(3);
      expect(result.page).toBe(50);
      expect(result.pageSize).toBe(10);
    });

    it("MaterialService.getAllPaginated returns empty data when page exceeds total pages", async () => {
      mockPrisma.material.findMany.mockResolvedValue([]);
      mockPrisma.material.count.mockResolvedValue(10);

      const result = await MaterialService.getAllPaginated({ page: 999, pageSize: 5 });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(10);
      expect(result.page).toBe(999);
      expect(result.pageSize).toBe(5);
    });
  });
});
