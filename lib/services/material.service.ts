import { prisma } from "@/lib/db";
import { Prisma } from "@/app/generated/prisma";
import type { Material, StockChangeType } from "@/app/generated/prisma";
import type { PaginationParams, PaginatedResponse } from "@/lib/types/pagination";
import { AuditLogService } from "@/lib/services/audit-log.service";
import { StockHistoryService } from "@/lib/services/stock-history.service";

export interface CreateMaterialInput {
  name: string;
  unit: string;
  code?: string | null;
  price?: number | null;
  currentQuantity?: number;
  minimumQuantity?: number;
  hasDimensions?: boolean;
  isEdgebanded?: boolean;
}

export interface UpdateMaterialInput {
  name?: string;
  unit?: string;
  code?: string | null;
  price?: number | null;
  currentQuantity?: number;
  minimumQuantity?: number;
  hasDimensions?: boolean;
  isEdgebanded?: boolean;
}

export interface MaterialFilters {
  search?: string;
  sortBy?: "name" | "currentQuantity";
  sortOrder?: "asc" | "desc";
}

export const MaterialService = {
  async create(data: CreateMaterialInput): Promise<Material> {
    try {
      return await prisma.material.create({
        data: {
          name: data.name,
          unit: data.unit,
          code: data.code,
          price: data.price,
          currentQuantity: data.currentQuantity ?? 0,
          minimumQuantity: data.minimumQuantity ?? 0,
          hasDimensions: data.hasDimensions ?? false,
          isEdgebanded: data.isEdgebanded ?? false,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new Error("Šifra materijala već postoji");
      }
      throw error;
    }
  },

  async getAll(filters?: MaterialFilters): Promise<Material[]> {
    const where: Record<string, unknown> = {};

    if (filters?.search) {
      where.name = { contains: filters.search, mode: "insensitive" };
    }

    const orderBy: Record<string, string> = {};
    if (filters?.sortBy) {
      orderBy[filters.sortBy] = filters.sortOrder ?? "asc";
    }

    return prisma.material.findMany({
      where,
      orderBy: Object.keys(orderBy).length > 0 ? orderBy : undefined,
    });
  },

  async getAllPaginated({ page, pageSize, search }: PaginationParams & { search?: string }): Promise<PaginatedResponse<Material>> {
    const skip = (page - 1) * pageSize;
    const where: Record<string, unknown> = {};
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }
    const [data, total] = await Promise.all([
      prisma.material.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: "asc" },
      }),
      prisma.material.count({ where }),
    ]);
    return { data, total, page, pageSize };
  },

  async getById(id: string): Promise<Material | null> {
    return prisma.material.findUnique({ where: { id } });
  },

  async update(id: string, data: UpdateMaterialInput): Promise<Material> {
    try {
      return await prisma.material.update({
        where: { id },
        data,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new Error("Šifra materijala već postoji");
      }
      throw error;
    }
  },

  async updateStock(
    id: string,
    quantityChange: number,
    options?: {
      referenceType?: string;
      referenceId?: string;
      notes?: string;
      changeType?: StockChangeType;
    }
  ): Promise<Material> {
    // Fetch current quantity before the update
    const current = await prisma.material.findUniqueOrThrow({
      where: { id },
      select: { currentQuantity: true },
    });
    const previousQuantity = current.currentQuantity;

    const material = await prisma.material.update({
      where: { id },
      data: {
        currentQuantity: { increment: quantityChange },
      },
    });

    const newQuantity = material.currentQuantity;
    const changeType: StockChangeType =
      options?.changeType ??
      (quantityChange >= 0 ? "inflow" : "outflow");

    // Fire-and-forget: record stock history
    try {
      await StockHistoryService.record({
        materialId: id,
        changeType,
        quantity: Math.abs(quantityChange),
        previousQuantity,
        newQuantity,
        referenceType: options?.referenceType,
        referenceId: options?.referenceId,
        notes: options?.notes,
      });
    } catch (e) {
      console.error("Greška pri zapisivanju historije zaliha:", e);
    }

    // Fire-and-forget: audit log
    try {
      await AuditLogService.log({
        entityType: "material",
        entityId: id,
        action: "stock_change",
        details: {
          quantityChange,
          previousQuantity,
          newQuantity,
        },
      });
    } catch (e) {
      console.error("Greška pri zapisivanju u revizijski dnevnik:", e);
    }

    // Re-evaluate production orders waiting for this material
    if (quantityChange > 0) {
      const affectedOrders = await prisma.productionOrder.findMany({
        where: {
          status: "waiting_material",
          OR: [
            // Legacy single-article orders
            {
              article: {
                parts: {
                  some: {
                    productionSteps: {
                      some: {
                        materials: {
                          some: { materialId: id },
                        },
                      },
                    },
                  },
                },
              },
            },
            // New multi-item orders
            {
              items: {
                some: {
                  article: {
                    parts: {
                      some: {
                        productionSteps: {
                          some: {
                            materials: {
                              some: { materialId: id },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          ],
        },
        select: { id: true },
      });

      // Dynamic import to avoid circular dependency
      const { ProductionOrderService } = await import("@/lib/services/production-order.service");

      for (const order of affectedOrders) {
        await ProductionOrderService.checkMaterialAvailability(order.id);
      }
    }

    return material;
  },

  async checkLowStock(): Promise<Material[]> {
    return prisma.$queryRaw<Material[]>`
      SELECT * FROM "Material"
      WHERE "currentQuantity" < "minimumQuantity"
      ORDER BY "name" ASC
    `;
  },
};
