import { prisma } from "@/lib/db";
import type { Article } from "@/app/generated/prisma";
import type { PaginationParams, PaginatedResponse } from "@/lib/types/pagination";
import { calculateMaterialRequirements } from "@/lib/utils/calculations";
import type { MaterialRequirement } from "@/lib/types";

export interface CreateArticlePartInput {
  partName: string;
  dimensions?: string;
  notes?: string;
}

export interface CreateArticleInput {
  name: string;
  description?: string;
  dimensions?: string;
  code?: string;
  model?: string;
  type?: string;
  articleGroup?: string;
  unit?: string;
  inactive?: boolean;
  currency?: string;
  priceWithoutVAT?: number;
  taxPercentage?: number;
  relatedArticleCode?: string | null;
  parts: CreateArticlePartInput[];
}

export interface BOMEntry {
  partId: string;
  partName: string;
  dimensions: string | null;
  notes: string | null;
  steps: {
    stepId: string;
    stepName: string;
    sequenceOrder: number;
    departmentName: string;
    materials: {
      materialId: string;
      materialName: string;
      quantity: number;
      unit: string;
    }[];
  }[];
}

const articleInclude = {
  parts: {
    include: {
      productionSteps: {
        include: {
          department: true,
          materials: {
            include: {
              material: true,
            },
          },
        },
        orderBy: {
          sequenceOrder: 'asc' as const,
        },
      },
    },
  },
} as const;

export const ArticleService = {
  async create(data: CreateArticleInput): Promise<Article> {
    return prisma.article.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        dimensions: data.dimensions ?? null,
        code: data.code ?? null,
        model: data.model ?? null,
        type: data.type ?? null,
        articleGroup: data.articleGroup ?? null,
        unit: data.unit ?? null,
        inactive: data.inactive ?? false,
        currency: data.currency ?? "BAM",
        priceWithoutVAT: data.priceWithoutVAT ?? null,
        taxPercentage: data.taxPercentage ?? 17.0,
        parts: {
          create: data.parts.map((part) => ({
            partName: part.partName,
            dimensions: part.dimensions ?? null,
            notes: part.notes ?? null,
          })),
        },
      },
      include: articleInclude,
    });
  },

  async update(id: string, data: CreateArticleInput): Promise<Article> {
    const existing = await prisma.article.findUnique({
      where: { id },
      include: {
        parts: {
          include: {
            workOrders: { select: { id: true }, take: 1 },
            productionSteps: { select: { id: true }, take: 1 },
          },
        },
      },
    });
    if (!existing) {
      throw new Error(`Article with id "${id}" does not exist`);
    }

    // Separate parts: those with work orders or production steps (can't delete) vs without (can delete)
    const partsToKeep = existing.parts.filter((p) => p.workOrders.length > 0 || p.productionSteps.length > 0);
    const partsToDelete = existing.parts.filter((p) => p.workOrders.length === 0 && p.productionSteps.length === 0);

    // Delete parts that have no work orders or production steps (safe to remove)
    if (partsToDelete.length > 0) {
      const idsToDelete = partsToDelete.map((p) => p.id);
      await prisma.articlePart.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    // Update parts that have work orders or production steps (update in-place)
    for (const existingPart of partsToKeep) {
      // Find matching part in new data by partName (best effort match)
      const matchingNew = data.parts.find((p) => p.partName.trim() === existingPart.partName);
      if (matchingNew) {
        // Update the part fields
        await prisma.articlePart.update({
          where: { id: existingPart.id },
          data: {
            partName: matchingNew.partName.trim(),
            dimensions: matchingNew.dimensions ?? null,
            notes: matchingNew.notes ?? null,
          },
        });
        // Remove from data.parts so we don't create it again
        data.parts = data.parts.filter((p) => p !== matchingNew);
      }
      // If no match found, keep the existing part as-is (don't delete it)
    }

    // Create remaining new parts
    return prisma.article.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description ?? null,
        dimensions: data.dimensions ?? null,
        code: data.code ?? null,
        model: data.model ?? null,
        type: data.type ?? null,
        articleGroup: data.articleGroup ?? null,
        unit: data.unit ?? null,
        inactive: data.inactive ?? false,
        currency: data.currency ?? "BAM",
        priceWithoutVAT: data.priceWithoutVAT ?? null,
        taxPercentage: data.taxPercentage ?? 17.0,
        ...(data.relatedArticleCode !== undefined && {
          relatedArticleCode: data.relatedArticleCode,
        }),
        parts: {
          create: data.parts.map((part) => ({
            partName: part.partName.trim(),
            dimensions: part.dimensions ?? null,
            notes: part.notes ?? null,
          })),
        },
      },
      include: articleInclude,
    });
  },

  async getAll(): Promise<Article[]> {
    return prisma.article.findMany({
      include: articleInclude,
      orderBy: { name: "asc" },
    });
  },

  async getByIds(ids: string[]): Promise<Article[]> {
    return prisma.article.findMany({
      where: { id: { in: ids } },
      include: articleInclude,
      orderBy: { name: "asc" },
    });
  },

  async getAllPaginated({ page, pageSize }: PaginationParams, search?: string, bom?: string): Promise<PaginatedResponse<{
    id: string;
    name: string;
    model: string | null;
    description: string | null;
    createdAt: Date;
    _count: { parts: number };
  }>> {
    const skip = (page - 1) * pageSize;
    const conditions: any[] = [];

    if (search) {
      conditions.push({
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { code: { contains: search, mode: "insensitive" as const } },
          { model: { contains: search, mode: "insensitive" as const } },
          { description: { contains: search, mode: "insensitive" as const } },
        ],
      });
    }

    if (bom === "has") {
      conditions.push({ parts: { some: {} } });
    } else if (bom === "empty") {
      conditions.push({ parts: { none: {} } });
    }

    const where = conditions.length > 0 ? { AND: conditions } : {};

    const [data, total] = await Promise.all([
      prisma.article.findMany({
        where,
        select: {
          id: true,
          name: true,
          model: true,
          description: true,
          createdAt: true,
          _count: { select: { parts: true } },
        },
        skip,
        take: pageSize,
        orderBy: { name: "asc" },
      }),
      prisma.article.count({ where }),
    ]);
    return { data, total, page, pageSize };
  },

  async getById(id: string): Promise<Article | null> {
    return prisma.article.findUnique({
      where: { id },
      include: articleInclude,
    });
  },

  async getBOM(articleId: string): Promise<BOMEntry[]> {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: articleInclude,
    });

    if (!article) {
      throw new Error(`Article with id "${articleId}" does not exist`);
    }

    return article.parts.map((part) => ({
      partId: part.id,
      partName: part.partName,
      dimensions: part.dimensions,
      notes: part.notes,
      steps: part.productionSteps.map((step) => ({
        stepId: step.id,
        stepName: step.stepName,
        sequenceOrder: step.sequenceOrder,
        departmentName: step.department.name,
        materials: step.materials.map((sm) => ({
          materialId: sm.materialId,
          materialName: sm.material.name,
          quantity: sm.quantity,
          unit: sm.material.unit,
        })),
      })),
    }));
  },

  async calculateMaterialRequirements(
    articleId: string,
    quantity: number,
    fabricOverride?: { fabricId: string; fabricName: string; materialId?: string }
  ): Promise<MaterialRequirement[]> {
    const bom = await this.getBOM(articleId);

    // Collect all materials from all steps
    const materialMap = new Map<string, { materialId: string; materialName: string; totalQuantity: number }>();
    
    for (const part of bom) {
      for (const step of part.steps) {
        for (const mat of step.materials) {
          const existing = materialMap.get(mat.materialId);
          if (existing) {
            existing.totalQuantity += mat.quantity * quantity;
          } else {
            materialMap.set(mat.materialId, {
              materialId: mat.materialId,
              materialName: mat.materialName,
              totalQuantity: mat.quantity * quantity,
            });
          }
        }
      }
    }

    // When fabric override is provided, identify fabric-type materials and replace them
    if (fabricOverride) {
      const materialIds = Array.from(materialMap.keys());
      if (materialIds.length > 0) {
        // Fetch hasDimensions, isEdgebanded, and name for all BOM materials
        const materialDetails = await prisma.material.findMany({
          where: { id: { in: materialIds } },
          select: { id: true, name: true, hasDimensions: true, isEdgebanded: true },
        });
        const detailsMap = new Map(materialDetails.map((m) => [m.id, m]));

        // Identify fabric placeholder materials: ONLY "Štof za sve" should be overridden.
        // Other non-dimensional materials (CO2, ljepilo, etc.) and category placeholders
        // (Ručka za sve, Paspul za sve, Nogice za sve) must NOT be treated as fabric.
        const fabricTypeIds = materialIds.filter((id) => {
          const details = detailsMap.get(id);
          if (!details) return false;
          return details.name.trim().toLowerCase() === "štof za sve";
        });

        if (fabricTypeIds.length > 0) {
          // Use real materialId when linked, otherwise synthetic key
          const overrideKey = fabricOverride.materialId ?? `fabric:${fabricOverride.fabricId}`;
          let overrideName = fabricOverride.fabricName;

          // When linked to a real material, fetch the material's name
          if (fabricOverride.materialId) {
            const linkedMaterial = await prisma.material.findUnique({
              where: { id: fabricOverride.materialId },
              select: { name: true },
            });
            if (linkedMaterial) {
              overrideName = linkedMaterial.name;
            }
          }

          let totalFabricQuantity = 0;

          for (const id of fabricTypeIds) {
            const entry = materialMap.get(id);
            if (entry) {
              totalFabricQuantity += entry.totalQuantity;
              materialMap.delete(id);
            }
          }

          // Add or merge the override fabric entry
          const existingOverride = materialMap.get(overrideKey);
          if (existingOverride) {
            existingOverride.totalQuantity += totalFabricQuantity;
          } else {
            materialMap.set(overrideKey, {
              materialId: overrideKey,
              materialName: overrideName,
              totalQuantity: totalFabricQuantity,
            });
          }
        }
      }
    }

    // Get current stock for all materials (fabric overrides won't have stock entries)
    const materialIds = Array.from(materialMap.keys());
    const materials = materialIds.length > 0
      ? await prisma.material.findMany({
          where: { id: { in: materialIds } },
          select: { id: true, currentQuantity: true },
        })
      : [];

    const stockMap = new Map(materials.map((m) => [m.id, m.currentQuantity]));

    return Array.from(materialMap.values()).map((mat) => {
      const available = stockMap.get(mat.materialId) ?? 0;
      const deficit = Math.max(0, mat.totalQuantity - available);
      return {
        materialId: mat.materialId,
        materialName: mat.materialName,
        requiredQuantity: mat.totalQuantity,
        availableQuantity: available,
        deficit,
      };
    });
  },
};
