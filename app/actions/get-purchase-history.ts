"use server";

import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/types/actions";
import type { MaterialPurchaseHistory } from "@/app/generated/prisma";

/**
 * Query parameters for fetching purchase history
 */
export interface PurchaseHistoryQuery {
  materialId: string;
  page?: number;
  pageSize?: number;
  dateFrom?: string; // ISO date string
  dateTo?: string; // ISO date string
  supplierId?: string;
  sortBy?: "purchaseDate" | "quantity" | "purchasePrice" | "totalValue";
  sortOrder?: "asc" | "desc";
}

/**
 * Result type for purchase history query
 */
export interface PurchaseHistoryResult {
  data: MaterialPurchaseHistory[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Server Action: Fetch purchase history for a material
 * 
 * This action retrieves purchase history records with support for:
 * - Filtering by material, date range, and supplier
 * - Sorting by various fields
 * - Pagination
 * 
 * Requirements:
 * - 7.1: Display purchase history with pagination
 * - 7.4: Filter by date range
 * - 7.5: Filter by supplier
 * 
 * @param query - Query parameters for filtering, sorting, and pagination
 * @returns ActionResult with purchase history data and pagination info
 */
export async function getPurchaseHistoryAction(
  query: PurchaseHistoryQuery
): Promise<ActionResult<PurchaseHistoryResult>> {
  try {
    const {
      materialId,
      page = 1,
      pageSize = 10,
      dateFrom,
      dateTo,
      supplierId,
      sortBy = "purchaseDate",
      sortOrder = "desc",
    } = query;

    // Build where clause for filtering
    const where: any = {
      materialId,
    };

    // Add date range filter if provided
    if (dateFrom || dateTo) {
      where.purchaseDate = {};
      if (dateFrom) {
        where.purchaseDate.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.purchaseDate.lte = new Date(dateTo);
      }
    }

    // Add supplier filter if provided
    if (supplierId) {
      where.supplierId = supplierId;
    }

    // Calculate pagination
    const skip = (page - 1) * pageSize;

    // Fetch total count for pagination
    const total = await prisma.materialPurchaseHistory.count({ where });

    // Fetch purchase history records with relations
    const data = await prisma.materialPurchaseHistory.findMany({
      where,
      include: {
        supplier: {
          select: {
            id: true,
            companyName: true,
            code: true,
          },
        },
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip,
      take: pageSize,
    });

    return {
      success: true,
      data: {
        data,
        total,
        page,
        pageSize,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch purchase history",
    };
  }
}


/**
 * Server Action: Update a purchase history record
 */
export async function updatePurchaseHistoryAction(
  id: string,
  data: {
    purchaseDate?: string;
    supplierId?: string | null;
    quantity?: number;
    purchasePrice?: number;
    unit?: string;
    invoiceNumber?: string | null;
  }
): Promise<ActionResult<MaterialPurchaseHistory>> {
  try {
    const updateData: Record<string, unknown> = {};
    if (data.purchaseDate !== undefined) updateData.purchaseDate = new Date(data.purchaseDate);
    if (data.supplierId !== undefined) updateData.supplierId = data.supplierId || null;
    if (data.quantity !== undefined) updateData.quantity = data.quantity;
    if (data.purchasePrice !== undefined) updateData.purchasePrice = data.purchasePrice;
    if (data.unit !== undefined) updateData.unit = data.unit;
    if (data.invoiceNumber !== undefined) updateData.invoiceNumber = data.invoiceNumber || null;

    // Auto-calculate totalValue when quantity or price changes
    if (data.quantity !== undefined || data.purchasePrice !== undefined) {
      const existing = await prisma.materialPurchaseHistory.findUnique({ where: { id } });
      if (!existing) return { success: false, error: "Zapis nije pronađen" };
      const qty = data.quantity ?? existing.quantity;
      const price = data.purchasePrice ?? existing.purchasePrice;
      updateData.totalValue = qty * price;
    }

    const updated = await prisma.materialPurchaseHistory.update({
      where: { id },
      data: updateData,
    });
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Greška pri ažuriranju" };
  }
}

/**
 * Server Action: Delete a purchase history record
 */
export async function deletePurchaseHistoryAction(
  id: string
): Promise<ActionResult<void>> {
  try {
    await prisma.materialPurchaseHistory.delete({ where: { id } });
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Greška pri brisanju" };
  }
}