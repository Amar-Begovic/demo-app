import { prisma } from "@/lib/db";
import type { Prisma, NormativeVersion } from "@/app/generated/prisma";

/**
 * Service for managing normative versions (BOM snapshots)
 * 
 * This service handles:
 * - Creating immutable snapshots of article BOM structures
 * - Querying active versions for production orders
 * - Managing version lifecycle and cleanup
 */
export const NormativeVersionService = {
  /**
   * Create a snapshot of the current article BOM structure
   * 
   * This method captures the entire BOM hierarchy:
   * - Article parts
   * - Production steps (with department references)
   * - Step materials (with quantities and dimensions)
   * 
   * Version numbers are auto-incremented per article.
   * 
   * @param articleId - The article to snapshot
   * @param tx - Optional transaction context (defaults to prisma)
   * @returns The created normative version ID
   */
  async createSnapshot(
    articleId: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<string> {
    // Get the current BOM structure
    const article = await tx.article.findUnique({
      where: { id: articleId },
      include: {
        parts: {
          include: {
            productionSteps: {
              include: {
                materials: true,
              },
              orderBy: {
                sequenceOrder: 'asc',
              },
            },
          },
        },
      },
    });

    if (!article) {
      throw new Error(`Article with id "${articleId}" does not exist`);
    }

    // Get the next version number for this article
    const lastVersion = await tx.normativeVersion.findFirst({
      where: { articleId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });

    const versionNumber = (lastVersion?.versionNumber ?? 0) + 1;

    // Create the normative version with nested BOM structure
    const normativeVersion = await tx.normativeVersion.create({
      data: {
        articleId,
        versionNumber,
        isActive: true,
        parts: {
          create: article.parts.map((part) => ({
            partName: part.partName,
            dimensions: part.dimensions,
            notes: part.notes,
            steps: {
              create: part.productionSteps.map((step) => ({
                stepName: step.stepName,
                sequenceOrder: step.sequenceOrder,
                departmentId: step.departmentId,
                estimatedTime: step.estimatedTime,
                instructions: step.instructions,
                materials: {
                  create: step.materials.map((material) => ({
                    materialId: material.materialId,
                    quantity: material.quantity,
                    pieces: material.pieces,
                    length: material.length,
                    width: material.width,
                    height: material.height,
                    isEdgebanded: material.isEdgebanded,
                  })),
                },
              })),
            },
          })),
        },
      },
    });

    return normativeVersion.id;
  },

  /**
   * Get the active normative version for an article
   * 
   * Returns null if no versions exist (new article without versions)
   * 
   * @param articleId - The article to query
   * @returns The active version or null
   */
  async getActiveVersion(articleId: string): Promise<NormativeVersion | null> {
    return prisma.normativeVersion.findFirst({
      where: {
        articleId,
        isActive: true,
      },
      orderBy: {
        versionNumber: 'desc',
      },
    });
  },

  /**
   * Get all production orders using a specific normative version
   * 
   * @param versionId - The version to query
   * @returns Array of production orders
   */
  async getOrdersUsingVersion(versionId: string) {
    return prisma.productionOrder.findMany({
      where: {
        normativeVersionId: versionId,
      },
      include: {
        article: true,
      },
    });
  },

  /**
   * Mark versions as eligible for cleanup when all orders are archived
   * 
   * Sets isActive = false for versions where all associated production orders
   * have isArchived = true.
   * 
   * @param articleId - The article to check
   */
  async markObsoleteVersions(articleId: string): Promise<void> {
    // Get all versions for this article
    const versions = await prisma.normativeVersion.findMany({
      where: { articleId },
      include: {
        productionOrders: {
          select: {
            id: true,
            isArchived: true,
          },
        },
      },
    });

    // Mark versions as inactive if all their orders are archived
    for (const version of versions) {
      const hasActiveOrders = version.productionOrders.some(
        (order) => !order.isArchived
      );

      if (!hasActiveOrders && version.isActive) {
        await prisma.normativeVersion.update({
          where: { id: version.id },
          data: { isActive: false },
        });
      }
    }
  },

  /**
   * Delete obsolete versions (no active production orders)
   * 
   * Deletes versions where isActive = false, except the current active version.
   * Cascade rules automatically delete related parts, steps, and materials.
   * 
   * @param articleId - The article to clean up
   * @returns Number of versions deleted
   */
  async cleanupObsoleteVersions(articleId: string): Promise<number> {
    // Get the current active version (must be preserved)
    const activeVersion = await this.getActiveVersion(articleId);

    // Delete inactive versions (excluding the active one)
    const result = await prisma.normativeVersion.deleteMany({
      where: {
        articleId,
        isActive: false,
        id: {
          not: activeVersion?.id,
        },
      },
    });

    return result.count;
  },

  /**
   * Get effective production steps for work order generation
   * 
   * If versionId is provided, returns versioned steps.
   * Otherwise, returns current production steps.
   * 
   * @param articlePartId - The article part (for current steps)
   * @param versionId - Optional version ID (for versioned steps)
   * @returns Array of steps with stepId, stepName, sequenceOrder, departmentId, etc.
   */
  async getEffectiveSteps(
    articlePartId: string,
    versionId?: string
  ): Promise<Array<{
    stepId: string;
    stepName: string;
    sequenceOrder: number;
    departmentId: string;
    estimatedTime: number | null;
    instructions: string | null;
    isVersioned: boolean;
  }>> {
    if (versionId) {
      // Get the original article part to find its name
      const articlePart = await prisma.articlePart.findUnique({
        where: { id: articlePartId },
        select: { partName: true },
      });

      if (!articlePart) {
        throw new Error(`Article part with id "${articlePartId}" not found`);
      }

      // Get versioned steps matching the part name (case-insensitive)
      const versionParts = await prisma.normativeVersionPart.findMany({
        where: {
          normativeVersionId: versionId,
          partName: { equals: articlePart.partName, mode: 'insensitive' },
        },
        include: {
          steps: {
            include: {
              department: true,
              materials: {
                include: {
                  material: true,
                },
              },
            },
            orderBy: {
              sequenceOrder: 'asc',
            },
          },
        },
      });

      // Flatten all steps from matching parts
      const versionSteps = versionParts.flatMap((part) =>
        part.steps.map((s) => ({
          stepId: s.id,
          stepName: s.stepName,
          sequenceOrder: s.sequenceOrder,
          departmentId: s.departmentId,
          estimatedTime: s.estimatedTime,
          instructions: s.instructions,
          isVersioned: true,
        }))
      );

      // If version has steps, use them; otherwise fallback to defaults
      if (versionSteps.length > 0) {
        return versionSteps;
      }
    }

    // Default production steps (used when no versionId, or version has no steps for this part)
    const steps = await prisma.productionStep.findMany({
      where: { articlePartId },
      include: {
        department: true,
        materials: { include: { material: true } },
      },
      orderBy: { sequenceOrder: 'asc' },
    });

    return steps.map((s) => ({
      stepId: s.id,
      stepName: s.stepName,
      sequenceOrder: s.sequenceOrder,
      departmentId: s.departmentId,
      estimatedTime: s.estimatedTime,
      instructions: s.instructions,
      isVersioned: false,
    }));
  },
};
