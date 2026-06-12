"use server";

import { ProductionOrderService } from "@/lib/services/production-order.service";
import type {
  CreateProductionOrderInput,
  UpdateProductionOrderInput,
} from "@/lib/services/production-order.service";
import type { ActionResult } from "@/lib/types/actions";
import type { OrderPriority } from "@/app/generated/prisma";
import { CacheInvalidator } from "@/lib/cache/invalidation";
import { AuditLogService } from "@/lib/services/audit-log.service";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/config";

/**
 * Server Action: Create a new production order with per-item fields.
 * Accepts items with deliveryDeadline, priority, notes, customerOrderNumber per item.
 * Root-level order fields (customerName, customerPhone, etc.) are passed through.
 */
export async function createProductionOrder(input: CreateProductionOrderInput) {
  try {
    // Destructure only the fields that belong on CreateProductionOrderInput.
    // Per-item fields (deliveryDeadline, priority, notes, customerOrderNumber)
    // are already on each item — strip any stale root-level copies.
    const serviceInput: CreateProductionOrderInput = {
      items: input.items.map((item) => ({
        articleId: item.articleId,
        quantity: item.quantity,
        fabricId: item.fabricId,
        ruckaId: item.ruckaId || undefined,
        paspulId: item.paspulId || undefined,
        nogice1Id: item.nogice1Id || undefined,
        nogice2Id: item.nogice2Id || undefined,
        deliveryDeadline: item.deliveryDeadline,
        priority: item.priority,
        notes: item.notes,
        customerOrderNumber: item.customerOrderNumber,
        loadingNumber: item.loadingNumber,
        withLegs: item.withLegs,
        loadingSequence: item.loadingSequence,
        serialNumber: item.serialNumber,
        step: item.step,
      })),
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      documentNumber: input.documentNumber,
      deliveryLocation: input.deliveryLocation,
      receivedBy: input.receivedBy,
    };

    const productionOrder = await ProductionOrderService.create(serviceInput);
    updateTag(CACHE_TAGS.PRODUCTION_ORDERS);
    return { success: true, data: productionOrder };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to create production order",
    };
  }
}

/**
 * Server Action: Update a production order.
 * Accepts all order-level fields, existing item updates, new items, and item IDs to delete.
 * All changes are persisted in a single Prisma transaction via the service layer.
 */
export async function updateProductionOrder(
  id: string,
  data: UpdateProductionOrderInput
) {
  try {
    const productionOrder = await ProductionOrderService.update(id, {
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      documentNumber: data.documentNumber,
      deliveryLocation: data.deliveryLocation,
      receivedBy: data.receivedBy,
      workOrderNumber: data.workOrderNumber,
      workOrderDate: data.workOrderDate,
      items: data.items,
      newItems: data.newItems,
      deleteItemIds: data.deleteItemIds,
    });
    updateTag(CACHE_TAGS.PRODUCTION_ORDERS);
    updateTag(CACHE_TAGS.productionOrder(id));
    return { success: true, data: productionOrder };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Greška pri spremanju. Pokušajte ponovo.",
    };
  }
}

/**
 * Server Action: Delete a production order
 */
export async function deleteProductionOrder(id: string) {
  try {
    throw new Error("Delete functionality not yet implemented in ProductionOrderService");
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete production order",
    };
  }
}

/**
 * Server Action: Generate purchase orders for a production order
 */
export async function generatePurchaseOrders(orderId: string) {
  try {
    const result = await ProductionOrderService.generatePurchaseOrders(orderId);
    await CacheInvalidator.invalidateProductionOrder(orderId);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate purchase orders",
    };
  }
}

/**
 * Server Action: Generate work orders for a production order
 */
export async function generateWorkOrders(orderId: string) {
  try {
    const workOrders = await ProductionOrderService.generateWorkOrders(orderId);
    await CacheInvalidator.invalidateProductionOrder(orderId);
    updateTag(CACHE_TAGS.WORK_ORDERS);
    return { success: true, data: workOrders };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate work orders",
    };
  }
}

/**
 * Server Action: Check material availability for a production order
 */
export async function checkMaterialAvailability(orderId: string) {
  try {
    const result = await ProductionOrderService.checkMaterialAvailability(orderId);
    await CacheInvalidator.invalidateProductionOrder(orderId);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to check material availability",
    };
  }
}


/**
 * Server Action: Bulk generate work orders for multiple production orders.
 * Processes each order sequentially, catching errors per order so that
 * one failure does not prevent the remaining orders from being processed.
 */
export async function bulkGenerateWorkOrders(
  orderIds: string[]
): Promise<{
  success: boolean;
  results: Array<{ orderId: string; success: boolean; error?: string }>;
}> {
  const results: Array<{ orderId: string; success: boolean; error?: string }> = [];

  for (const orderId of orderIds) {
    try {
      await ProductionOrderService.generateWorkOrders(orderId);
      results.push({ orderId, success: true });
    } catch (error) {
      results.push({
        orderId,
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate work orders",
      });
    }
  }

  // Invalidate cache tags on completion
  updateTag(CACHE_TAGS.PRODUCTION_ORDERS);
  updateTag(CACHE_TAGS.WORK_ORDERS);
  for (const r of results) {
    if (r.success) {
      updateTag(CACHE_TAGS.productionOrder(r.orderId));
    }
  }

  const allSucceeded = results.every((r) => r.success);
  return { success: allSucceeded, results };
}

/**
 * Server Action: Archive (soft-delete) a production order
 */
export async function archiveProductionOrder(
  id: string
): Promise<ActionResult<void>> {
  try {
    await ProductionOrderService.archive(id);
    updateTag(CACHE_TAGS.PRODUCTION_ORDERS);
    updateTag(CACHE_TAGS.productionOrder(id));
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to archive production order",
    };
  }
}

/**
 * Server Action: Restore an archived production order
 */
export async function restoreProductionOrder(
  id: string
): Promise<ActionResult<void>> {
  try {
    await ProductionOrderService.restore(id);
    updateTag(CACHE_TAGS.PRODUCTION_ORDERS);
    updateTag(CACHE_TAGS.productionOrder(id));
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to restore production order",
    };
  }
}

/**
 * Input type for bulk Excel import updates.
 */
interface BulkExcelUpdateInput {
  updates: Array<{
    orderId: string;
    workOrderNumber?: string | null;
    workOrderDate?: Date | null;
    items: Array<{
      id: string;
      quantity?: number;
      priority?: OrderPriority;
      deliveryDeadline?: Date | null;
      notes?: string | null;
      customerOrderNumber?: string | null;
      loadingNumber?: string | null;
      loadingSequence?: number | null;
    }>;
  }>;
}

/**
 * Server Action: Bulk update production order items from an Excel import.
 * Processes each order sequentially, catching errors per order so that
 * one failure does not prevent the remaining orders from being processed.
 * Creates an audit log entry for each successfully updated order.
 */
export async function bulkUpdateFromExcel(
  input: BulkExcelUpdateInput
): Promise<{
  success: boolean;
  results: Array<{ orderId: string; success: boolean; error?: string }>;
}> {
  const results: Array<{ orderId: string; success: boolean; error?: string }> = [];

  for (const { orderId, workOrderNumber, workOrderDate, items } of input.updates) {
    try {
      await ProductionOrderService.update(orderId, { workOrderNumber, workOrderDate, items });
      results.push({ orderId, success: true });

      // Fire-and-forget audit log
      try {
        await AuditLogService.log({
          entityType: "ProductionOrder",
          entityId: orderId,
          action: "bulk_update",
          details: {
            source: "excel_import",
            itemsUpdated: items.length,
            itemIds: items.map((item) => item.id),
          },
        });
      } catch {
        // Audit log failure should not affect the operation
      }
    } catch (error) {
      results.push({
        orderId,
        success: false,
        error: error instanceof Error ? error.message : "Failed to update production order",
      });
    }
  }

  // Invalidate cache tags on completion
  updateTag(CACHE_TAGS.PRODUCTION_ORDERS);
  for (const r of results) {
    if (r.success) {
      updateTag(CACHE_TAGS.productionOrder(r.orderId));
    }
  }

  const allSucceeded = results.every((r) => r.success);
  return { success: allSucceeded, results };
}


/**
 * Server Action: Auto-create missing articles and fabrics during production order import.
 * Takes arrays of unknown article/fabric codes+names, creates them in the database,
 * and returns the newly created entities so the client can retry mapping.
 */
export async function autoCreateMissingEntities(input: {
  articles: Array<{ code: string; name: string | null }>;
  fabrics: Array<{ code: string; name: string | null }>;
}): Promise<ActionResult<{
  createdArticles: Array<{ id: string; name: string; code: string }>;
  createdFabrics: Array<{ id: string; name: string; code: string }>;
}>> {
  try {
    const { prisma } = await import("@/lib/db");

    const createdArticles: Array<{ id: string; name: string; code: string }> = [];
    const createdFabrics: Array<{ id: string; name: string; code: string }> = [];

    // Create missing articles
    for (const art of input.articles) {
      // Double-check it doesn't exist (case-insensitive)
      const existing = await prisma.article.findFirst({
        where: { code: { equals: art.code, mode: "insensitive" } },
        select: { id: true, name: true, code: true },
      });
      if (existing) {
        createdArticles.push({ id: existing.id, name: existing.name, code: existing.code ?? art.code });
        continue;
      }
      const created = await prisma.article.create({
        data: {
          code: art.code,
          name: art.name ?? art.code,
        },
        select: { id: true, name: true, code: true },
      });
      createdArticles.push({ id: created.id, name: created.name, code: created.code ?? art.code });
    }

    // Create missing fabrics — auto-link to material with matching code
    for (const fab of input.fabrics) {
      const existing = await prisma.fabric.findFirst({
        where: { code: { equals: fab.code, mode: "insensitive" } },
        select: { id: true, name: true, code: true },
      });
      if (existing) {
        createdFabrics.push({ id: existing.id, name: existing.name, code: existing.code ?? fab.code });
        continue;
      }

      // Try to find a material with the same code to auto-link
      const matchingMaterial = await prisma.material.findFirst({
        where: { code: { equals: fab.code, mode: "insensitive" } },
        select: { id: true },
      });

      const created = await prisma.fabric.create({
        data: {
          code: fab.code,
          name: fab.name ?? fab.code,
          materialId: matchingMaterial?.id ?? null,
        },
        select: { id: true, name: true, code: true },
      });
      createdFabrics.push({ id: created.id, name: created.name, code: created.code ?? fab.code });
    }

    if (createdArticles.length > 0) {
      updateTag(CACHE_TAGS.ARTICLES);
    }

    return { success: true, data: { createdArticles, createdFabrics } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Greška pri kreiranju nedostajućih entiteta",
    };
  }
}
