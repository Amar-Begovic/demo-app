/**
 * Unit tests for NormativeVersionService
 * 
 * Tests verify:
 * - Snapshot creation captures complete BOM structure
 * - Version numbers auto-increment correctly
 * - Active version retrieval works correctly
 * - Version cleanup preserves active versions
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Prisma mock setup ----
const { mockPrisma } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    mockPrisma: {
      article: { findUnique: fn() },
      articlePart: { findUnique: fn() },
      normativeVersion: {
        findFirst: fn(),
        findMany: fn(),
        create: fn(),
        update: fn(),
        deleteMany: fn(),
      },
      normativeVersionPart: { findMany: fn() },
      productionStep: { findMany: fn() },
      productionOrder: { findMany: fn() },
    },
  };
});

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { NormativeVersionService } from "../normative-version.service";

describe("NormativeVersionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createSnapshot", () => {
    it("should create a snapshot with auto-incremented version number", async () => {
      const articleId = "article-1";
      const mockArticle = {
        id: articleId,
        name: "Test Article",
        parts: [
          {
            id: "part-1",
            partName: "Part 1",
            dimensions: "100x200",
            notes: "Test notes",
            productionSteps: [
              {
                id: "step-1",
                stepName: "Step 1",
                sequenceOrder: 1,
                departmentId: "dept-1",
                estimatedTime: 60,
                instructions: "Test instructions",
                materials: [
                  {
                    id: "mat-1",
                    materialId: "material-1",
                    quantity: 10,
                    pieces: 5,
                    length: 100,
                    width: 50,
                    height: 10,
                    isEdgebanded: true,
                  },
                ],
              },
            ],
          },
        ],
      };

      const mockLastVersion = { versionNumber: 2 };
      const mockCreatedVersion = {
        id: "version-3",
        articleId,
        versionNumber: 3,
        isActive: true,
      };

      mockPrisma.article.findUnique.mockResolvedValue(mockArticle);
      mockPrisma.normativeVersion.findFirst.mockResolvedValue(mockLastVersion);
      mockPrisma.normativeVersion.create.mockResolvedValue(mockCreatedVersion);

      const versionId = await NormativeVersionService.createSnapshot(articleId);

      expect(versionId).toBe("version-3");
      expect(mockPrisma.normativeVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          articleId,
          versionNumber: 3,
          isActive: true,
          parts: {
            create: expect.arrayContaining([
              expect.objectContaining({
                partName: "Part 1",
                dimensions: "100x200",
                notes: "Test notes",
                steps: {
                  create: expect.arrayContaining([
                    expect.objectContaining({
                      stepName: "Step 1",
                      sequenceOrder: 1,
                      departmentId: "dept-1",
                      estimatedTime: 60,
                      instructions: "Test instructions",
                      materials: {
                        create: expect.arrayContaining([
                          expect.objectContaining({
                            materialId: "material-1",
                            quantity: 10,
                            pieces: 5,
                            length: 100,
                            width: 50,
                            height: 10,
                            isEdgebanded: true,
                          }),
                        ]),
                      },
                    }),
                  ]),
                },
              }),
            ]),
          },
        }),
      });
    });

    it("should create version 1 when no previous versions exist", async () => {
      const articleId = "article-new";
      const mockArticle = {
        id: articleId,
        name: "New Article",
        parts: [],
      };

      const mockCreatedVersion = {
        id: "version-1",
        articleId,
        versionNumber: 1,
        isActive: true,
      };

      mockPrisma.article.findUnique.mockResolvedValue(mockArticle);
      mockPrisma.normativeVersion.findFirst.mockResolvedValue(null);
      mockPrisma.normativeVersion.create.mockResolvedValue(mockCreatedVersion);

      const versionId = await NormativeVersionService.createSnapshot(articleId);

      expect(versionId).toBe("version-1");
      expect(mockPrisma.normativeVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          versionNumber: 1,
        }),
      });
    });

    it("should throw error when article does not exist", async () => {
      mockPrisma.article.findUnique.mockResolvedValue(null);

      await expect(
        NormativeVersionService.createSnapshot("non-existent")
      ).rejects.toThrow('Article with id "non-existent" does not exist');
    });
  });

  describe("getActiveVersion", () => {
    it("should return the active version with highest version number", async () => {
      const mockVersion = {
        id: "version-3",
        articleId: "article-1",
        versionNumber: 3,
        isActive: true,
      };

      mockPrisma.normativeVersion.findFirst.mockResolvedValue(mockVersion);

      const result = await NormativeVersionService.getActiveVersion("article-1");

      expect(result).toEqual(mockVersion);
      expect(mockPrisma.normativeVersion.findFirst).toHaveBeenCalledWith({
        where: {
          articleId: "article-1",
          isActive: true,
        },
        orderBy: {
          versionNumber: "desc",
        },
      });
    });

    it("should return null when no active version exists", async () => {
      mockPrisma.normativeVersion.findFirst.mockResolvedValue(null);

      const result = await NormativeVersionService.getActiveVersion("article-new");

      expect(result).toBeNull();
    });
  });

  describe("getOrdersUsingVersion", () => {
    it("should return all orders using the specified version", async () => {
      const mockOrders = [
        {
          id: "order-1",
          normativeVersionId: "version-1",
          article: { id: "article-1", name: "Article 1" },
        },
        {
          id: "order-2",
          normativeVersionId: "version-1",
          article: { id: "article-1", name: "Article 1" },
        },
      ];

      mockPrisma.productionOrder.findMany.mockResolvedValue(mockOrders);

      const result = await NormativeVersionService.getOrdersUsingVersion("version-1");

      expect(result).toEqual(mockOrders);
      expect(mockPrisma.productionOrder.findMany).toHaveBeenCalledWith({
        where: {
          normativeVersionId: "version-1",
        },
        include: {
          article: true,
        },
      });
    });
  });

  describe("markObsoleteVersions", () => {
    it("should mark versions as inactive when all orders are archived", async () => {
      const mockVersions = [
        {
          id: "version-1",
          isActive: true,
          productionOrders: [
            { id: "order-1", isArchived: true },
            { id: "order-2", isArchived: true },
          ],
        },
        {
          id: "version-2",
          isActive: true,
          productionOrders: [
            { id: "order-3", isArchived: false },
          ],
        },
      ];

      mockPrisma.normativeVersion.findMany.mockResolvedValue(mockVersions);
      mockPrisma.normativeVersion.update.mockResolvedValue({});

      await NormativeVersionService.markObsoleteVersions("article-1");

      expect(mockPrisma.normativeVersion.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.normativeVersion.update).toHaveBeenCalledWith({
        where: { id: "version-1" },
        data: { isActive: false },
      });
    });

    it("should not mark versions with active orders as inactive", async () => {
      const mockVersions = [
        {
          id: "version-1",
          isActive: true,
          productionOrders: [
            { id: "order-1", isArchived: false },
          ],
        },
      ];

      mockPrisma.normativeVersion.findMany.mockResolvedValue(mockVersions);

      await NormativeVersionService.markObsoleteVersions("article-1");

      expect(mockPrisma.normativeVersion.update).not.toHaveBeenCalled();
    });
  });

  describe("cleanupObsoleteVersions", () => {
    it("should delete inactive versions but preserve active version", async () => {
      const mockActiveVersion = {
        id: "version-3",
        isActive: true,
      };

      mockPrisma.normativeVersion.findFirst.mockResolvedValue(mockActiveVersion);
      mockPrisma.normativeVersion.deleteMany.mockResolvedValue({ count: 2 });

      const count = await NormativeVersionService.cleanupObsoleteVersions("article-1");

      expect(count).toBe(2);
      expect(mockPrisma.normativeVersion.deleteMany).toHaveBeenCalledWith({
        where: {
          articleId: "article-1",
          isActive: false,
          id: {
            not: "version-3",
          },
        },
      });
    });

    it("should handle case when no active version exists", async () => {
      mockPrisma.normativeVersion.findFirst.mockResolvedValue(null);
      mockPrisma.normativeVersion.deleteMany.mockResolvedValue({ count: 0 });

      const count = await NormativeVersionService.cleanupObsoleteVersions("article-1");

      expect(count).toBe(0);
      expect(mockPrisma.normativeVersion.deleteMany).toHaveBeenCalledWith({
        where: {
          articleId: "article-1",
          isActive: false,
          id: {
            not: undefined,
          },
        },
      });
    });
  });

  describe("getEffectiveSteps", () => {
    it("should return versioned steps when versionId is provided", async () => {
      const mockArticlePart = {
        id: "part-1",
        partName: "Test Part",
      };

      const mockVersionParts = [
        {
          id: "vpart-1",
          partName: "Test Part",
          steps: [
            {
              id: "vstep-1",
              stepName: "Versioned Step 1",
              sequenceOrder: 1,
              departmentId: "dept-1",
              estimatedTime: 60,
              instructions: "Test instructions",
              department: { id: "dept-1", name: "Department 1" },
              materials: [],
            },
          ],
        },
      ];

      mockPrisma.articlePart.findUnique.mockResolvedValue(mockArticlePart);
      mockPrisma.normativeVersionPart.findMany.mockResolvedValue(mockVersionParts);

      const result = await NormativeVersionService.getEffectiveSteps(
        "part-1",
        "version-1"
      );

      expect(result).toEqual([
        {
          stepId: "vstep-1",
          stepName: "Versioned Step 1",
          sequenceOrder: 1,
          departmentId: "dept-1",
          estimatedTime: 60,
          instructions: "Test instructions",
        },
      ]);
      expect(mockPrisma.articlePart.findUnique).toHaveBeenCalledWith({
        where: { id: "part-1" },
        select: { partName: true },
      });
      expect(mockPrisma.normativeVersionPart.findMany).toHaveBeenCalledWith({
        where: {
          normativeVersionId: "version-1",
          partName: "Test Part",
        },
        include: expect.any(Object),
      });
    });

    it("should return current production steps when no versionId is provided", async () => {
      const mockSteps = [
        {
          id: "step-1",
          stepName: "Current Step 1",
          sequenceOrder: 1,
          departmentId: "dept-1",
          estimatedTime: 60,
          instructions: "Test instructions",
          department: { id: "dept-1", name: "Department 1" },
          materials: [],
        },
      ];

      mockPrisma.productionStep.findMany.mockResolvedValue(mockSteps);

      const result = await NormativeVersionService.getEffectiveSteps("part-1");

      expect(result).toEqual([
        {
          stepId: "step-1",
          stepName: "Current Step 1",
          sequenceOrder: 1,
          departmentId: "dept-1",
          estimatedTime: 60,
          instructions: "Test instructions",
        },
      ]);
      expect(mockPrisma.productionStep.findMany).toHaveBeenCalledWith({
        where: {
          articlePartId: "part-1",
        },
        include: expect.any(Object),
        orderBy: {
          sequenceOrder: "asc",
        },
      });
    });
  });
});
