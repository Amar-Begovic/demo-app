"use server";

import { PurchaseOrderService } from "@/lib/services/purchase-order.service";
import type { ActionResult } from "@/lib/types/actions";
import type { PurchaseOrder } from "@/app/generated/prisma";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/config";

/**
 * Server Action: Create a manual purchase order
 */
export async function createPurchaseOrder(data: {
  materialId: string;
  supplierId?: string | null;
  requiredQuantity: number;
  productionOrderId?: string | null;
}): Promise<ActionResult<PurchaseOrder>> {
  try {
    const po = await PurchaseOrderService.createManual(data);
    updateTag(CACHE_TAGS.PRODUCTION_ORDERS);
    updateTag(CACHE_TAGS.MATERIALS);
    return { success: true, data: po };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to create purchase order",
    };
  }
}

/**
 * Server Action: Mark a purchase order as received
 * Updates PO status, increases material stock, and re-evaluates production order.
 * Invalidates PRODUCTION_ORDERS and MATERIALS tags since both are affected.
 */
export async function markReceived(
  id: string
): Promise<ActionResult<PurchaseOrder>> {
  try {
    const purchaseOrder = await PurchaseOrderService.markReceived(id);
    updateTag(CACHE_TAGS.PRODUCTION_ORDERS);
    updateTag(CACHE_TAGS.MATERIALS);
    return { success: true, data: purchaseOrder };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to mark purchase order as received",
    };
  }
}

/**
 * Server Action: Change the supplier on a purchase order
 * Only allowed on pending POs.
 * Invalidates PRODUCTION_ORDERS and SUPPLIERS tags.
 */
export async function changeSupplier(
  purchaseOrderId: string,
  supplierId: string | null
): Promise<ActionResult<PurchaseOrder>> {
  try {
    const purchaseOrder = await PurchaseOrderService.updateSupplier(
      purchaseOrderId,
      supplierId
    );
    updateTag(CACHE_TAGS.PRODUCTION_ORDERS);
    updateTag(CACHE_TAGS.SUPPLIERS);
    return { success: true, data: purchaseOrder };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to change supplier",
    };
  }
}

/**
 * Server Action: Get available suppliers for a purchase order's material
 */
export async function getAvailableSuppliers(
  materialId: string
): Promise<ActionResult<{ id: string; companyName: string }[]>> {
  try {
    const suppliers = await PurchaseOrderService.getAvailableSuppliers(materialId);
    return {
      success: true,
      data: suppliers.map((s) => ({ id: s.id, companyName: s.companyName })),
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get available suppliers",
    };
  }
}

/**
 * Server Action: Generate email template for a purchase order
 */
export async function generateEmailTemplate(
  purchaseOrderId: string
): Promise<ActionResult<{ to: string | null; subject: string; body: string }>> {
  try {
    const template =
      await PurchaseOrderService.generateEmailTemplate(purchaseOrderId);
    return { success: true, data: template };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to generate email template",
    };
  }
}
