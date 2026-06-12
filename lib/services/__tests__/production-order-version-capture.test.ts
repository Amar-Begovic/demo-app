/**
 * Unit tests for ProductionOrderService - Normative Version Capture
 * 
 * Tests verify:
 * - Production orders capture normative version at creation time
 * - Null version is handled for new articles without versions
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Prisma mock setup ----
const { mockPrisma, mockNormativeVersionService } = vi.hoisted(() => {
  const fn = () => vi.fn();
  const mockNormativeVersionService = {
    getActiveVersion: vi.fn(),
  };
  
  const mockPrisma: any = {
    article: { findMany: fn() },
    fabric: { findUnique: fn() },
    material: { findMany: fn() },
    productionOrder: {
      create: fn(),
      findUnique: fn(),
      update: fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ max: null }]),
    $transaction: vi.fn(async (callback: any) => {
      // Execute the callback with the mock prisma as the transaction client
      return await callback(mockPrisma);
    }),
  };
  
  return {
    mockPrisma,
    mockNormativeVersionService,
  };
});

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

// ---- Mock NormativeVersionService ----
vi.mock("@/lib/services/normative-version.service", () => ({
  NormativeVersionService: mockNormativeVersionService,
}));

// ---- Mock other services ----
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

vi.mock("@/lib/utils/calculations", () => ({
  checkMaterialAvailability: vi.fn().mockReturnValue({
    allAvailable: true,
    requirements: [],
  }),
  calculateProgress: vi.fn(),
  getEarliestDeadline: vi.fn(),
}));

import { ProductionOrderService } from "../production-order.service";
import type { CreateProductionOrderInput } from "../production-order.service";

describe("ProductionOrderService - Version Capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("should capture active normative version when creating production order", async () => {
      const articleId = "article-1";
      const versionId = "version-1";
      
      const input: CreateProductionOrderInput = {
        items: [
          {
            articleId,
            quantity: 10,
          },
        ],
        customerName: "Test Customer",
      };

      const mockActiveVersion = {
        id: versionId,
        articleId,
        versionNumber: 1,
        isActive: true,
        createdAt: new Date(),
      };

      const mockCreatedOrder = {
        id: "order-1",
        orderNumber: 1,
        status: "ready",
        normativeVersionId: versionId,
        customerName: "Test Customer",
        items: [
          {
            id: "item-1",
            articleId,
            quantity: 10,
            article: {
              id: articleId,
              name: "Test Article",
              parts: [],
            },
          },
        ],
        workOrders: [],
        purchaseOrders: [],
      };

      mockPrisma.article.findMany.mockResolvedValue([{ id: articleId }]);
      mockPrisma.material.findMany.mockResolvedValue([]);
      mockNormativeVersionService.getActiveVersion.mockResolvedValue(mockActiveVersion);
      mockPrisma.productionOrder.create.mockResolvedValue(mockCreatedOrder);

      const result = await ProductionOrderService.create(input);

      expect(mockNormativeVersionService.getActiveVersion).toHaveBeenCalledWith(articleId);
      expect(mockPrisma.productionOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          normativeVersionId: versionId,
        }),
        include: expect.any(Object),
      });
      expect(result.normativeVersionId).toBe(versionId);
    });

    it("should handle null version for new articles without versions", async () => {
      const articleId = "article-new";
      
      const input: CreateProductionOrderInput = {
        items: [
          {
            articleId,
            quantity: 5,
          },
        ],
      };

      const mockCreatedOrder = {
        id: "order-2",
        orderNumber: 2,
        status: "ready",
        normativeVersionId: null,
        items: [
          {
            id: "item-2",
            articleId,
            quantity: 5,
            article: {
              id: articleId,
              name: "New Article",
              parts: [],
            },
          },
        ],
        workOrders: [],
        purchaseOrders: [],
      };

      mockPrisma.article.findMany.mockResolvedValue([{ id: articleId }]);
      mockPrisma.material.findMany.mockResolvedValue([]);
      mockNormativeVersionService.getActiveVersion.mockResolvedValue(null);
      mockPrisma.productionOrder.create.mockResolvedValue(mockCreatedOrder);

      const result = await ProductionOrderService.create(input);

      expect(mockNormativeVersionService.getActiveVersion).toHaveBeenCalledWith(articleId);
      expect(mockPrisma.productionOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          normativeVersionId: null,
        }),
        include: expect.any(Object),
      });
      expect(result.normativeVersionId).toBeNull();
    });

    it("should use first article's version for multi-item orders", async () => {
      const article1Id = "article-1";
      const article2Id = "article-2";
      const versionId = "version-1";
      
      const input: CreateProductionOrderInput = {
        items: [
          {
            articleId: article1Id,
            quantity: 10,
          },
          {
            articleId: article2Id,
            quantity: 5,
          },
        ],
      };

      const mockActiveVersion = {
        id: versionId,
        articleId: article1Id,
        versionNumber: 1,
        isActive: true,
        createdAt: new Date(),
      };

      const mockCreatedOrder = {
        id: "order-3",
        orderNumber: 3,
        status: "ready",
        normativeVersionId: versionId,
        items: [
          {
            id: "item-3",
            articleId: article1Id,
            quantity: 10,
            article: { id: article1Id, name: "Article 1", parts: [] },
          },
          {
            id: "item-4",
            articleId: article2Id,
            quantity: 5,
            article: { id: article2Id, name: "Article 2", parts: [] },
          },
        ],
        workOrders: [],
        purchaseOrders: [],
      };

      mockPrisma.article.findMany.mockResolvedValue([
        { id: article1Id },
        { id: article2Id },
      ]);
      mockPrisma.material.findMany.mockResolvedValue([]);
      mockNormativeVersionService.getActiveVersion.mockResolvedValue(mockActiveVersion);
      mockPrisma.productionOrder.create.mockResolvedValue(mockCreatedOrder);

      const result = await ProductionOrderService.create(input);

      // Should query version for the first article only
      expect(mockNormativeVersionService.getActiveVersion).toHaveBeenCalledWith(article1Id);
      expect(mockNormativeVersionService.getActiveVersion).toHaveBeenCalledTimes(1);
      expect(result.normativeVersionId).toBe(versionId);
    });
  });
});
