"use server";

import { WorkOrderService } from "@/lib/services/work-order.service";
import { CacheInvalidator } from "@/lib/cache/invalidation";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/config";

/**
 * Server Action: Create a new work order
 * Invalidates the work-orders cache immediately using revalidateTag
 * 
 * Note: Work orders are typically created via ProductionOrderService.generateWorkOrders()
 * This action is provided for completeness but may not be used directly
 */
export async function createWorkOrder(data: {
  productionOrderId: string;
  articlePartId: string;
  departmentId: string;
  productionStepId: string;
  stepSequence: number;
  itemIndex: number;
}) {
  try {
    // Note: WorkOrderService doesn't have a create method
    // Work orders are created via ProductionOrderService.generateWorkOrders()
    throw new Error("Work orders should be created via ProductionOrderService.generateWorkOrders()");
    
    // If direct creation is needed in the future:
    // const workOrder = await WorkOrderService.create(data);
    // revalidateTag(CACHE_TAGS.WORK_ORDERS, "max");
    // return { success: true, data: workOrder };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to create work order" 
    };
  }
}

/**
 * Server Action: Update a work order
 * Invalidates both global work-orders cache and specific work order cache
 */
export async function updateWorkOrder(
  id: string,
  data: { status?: string }
) {
  try {
    // Note: WorkOrderService doesn't have a generic update method
    // Status changes are handled by startWork() and completeWork()
    throw new Error("Update functionality not yet implemented in WorkOrderService. Use startWork() or completeWork() instead.");
    
    // When implemented, it should look like:
    // const workOrder = await WorkOrderService.update(id, data);
    // await CacheInvalidator.invalidateWorkOrder(id);
    // return { success: true, data: workOrder };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to update work order" 
    };
  }
}

/**
 * Server Action: Delete a work order
 * Invalidates both global work-orders cache and specific work order cache
 */
export async function deleteWorkOrder(id: string) {
  try {
    // Note: WorkOrderService doesn't have a delete method
    // This is a placeholder for when it's implemented
    throw new Error("Delete functionality not yet implemented in WorkOrderService");
    
    // When implemented, it should look like:
    // await WorkOrderService.delete(id);
    // await CacheInvalidator.invalidateWorkOrder(id);
    // return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to delete work order" 
    };
  }
}

/**
 * Server Action: Start work on a work order
 * Changes status from pending to in_progress
 * Invalidates work order cache
 */
export async function startWorkOrder(id: string) {
  try {
    const workOrder = await WorkOrderService.startWork(id);
    
    // Invalidate both global and granular cache
    await CacheInvalidator.invalidateWorkOrder(id);
    
    return { success: true, data: workOrder };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to start work order" 
    };
  }
}

/**
 * Server Action: Complete a work order
 * Changes status from in_progress to completed
 * Invalidates work order cache and may trigger production order completion
 */
export async function completeWorkOrder(id: string) {
  try {
    const workOrder = await WorkOrderService.completeWork(id);
    
    // Invalidate both global and granular cache
    await CacheInvalidator.invalidateWorkOrder(id);
    
    // Also invalidate the parent production order cache (status may have changed)
    await CacheInvalidator.invalidateProductionOrder(workOrder.productionOrderId);
    
    return { success: true, data: workOrder };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to complete work order" 
    };
  }
}

/**
 * Server Action: Check if a work order can be started
 * Returns whether the work order can be started based on sequential step execution
 */
export async function canStartWorkOrder(id: string) {
  try {
    const workOrder = await WorkOrderService.getById(id);
    if (!workOrder) {
      throw new Error(`Work order with id "${id}" does not exist`);
    }
    
    const result = await WorkOrderService.canStartWorkOrder(workOrder);
    
    return { success: true, data: result };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to check work order status" 
    };
  }
}
