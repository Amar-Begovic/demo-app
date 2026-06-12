import { prisma } from "@/lib/db";
import type { StockHistory, StockChangeType } from "@/app/generated/prisma";

export const StockHistoryService = {
  /**
   * Zapisuje promjenu zaliha materijala. Greške se loguju, nikad ne bacaju.
   */
  async record(entry: {
    materialId: string;
    changeType: StockChangeType;
    quantity: number;
    previousQuantity: number;
    newQuantity: number;
    referenceType?: string;
    referenceId?: string;
    notes?: string;
  }): Promise<void> {
    try {
      await prisma.stockHistory.create({
        data: {
          materialId: entry.materialId,
          changeType: entry.changeType,
          quantity: entry.quantity,
          previousQuantity: entry.previousQuantity,
          newQuantity: entry.newQuantity,
          referenceType: entry.referenceType,
          referenceId: entry.referenceId,
          notes: entry.notes,
        },
      });
    } catch (error) {
      console.error("Greška pri zapisivanju historije zaliha:", error);
    }
  },

  async getByMaterial(
    materialId: string,
    filters?: {
      changeType?: StockChangeType;
      from?: Date;
      to?: Date;
    }
  ): Promise<StockHistory[]> {
    const where: Record<string, unknown> = { materialId };

    if (filters?.changeType) {
      where.changeType = filters.changeType;
    }

    if (filters?.from || filters?.to) {
      const createdAt: Record<string, Date> = {};
      if (filters.from) createdAt.gte = filters.from;
      if (filters.to) createdAt.lte = filters.to;
      where.createdAt = createdAt;
    }

    return prisma.stockHistory.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  },
};
