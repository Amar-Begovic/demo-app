"use server";

import { ProductionStepService } from "@/lib/services/production-step.service";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/config";

/**
 * Server Action: Add a material to a production step
 */
export async function addStepMaterial(
  stepId: string,
  materialId: string,
  quantity: number,
  options?: {
    length?: number | null;
    width?: number | null;
    height?: number | null;
    isEdgebanded?: boolean | null;
  }
) {
  try {
    const stepMaterial = await ProductionStepService.addMaterial(
      stepId,
      materialId,
      quantity,
      options
    );
    updateTag(CACHE_TAGS.ARTICLES);
    return { success: true, data: stepMaterial };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to add material to step",
    };
  }
}

/**
 * Server Action: Remove a material from a production step
 */
export async function removeStepMaterial(stepId: string, materialId: string) {
  try {
    await ProductionStepService.removeMaterial(stepId, materialId);
    updateTag(CACHE_TAGS.ARTICLES);
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to remove material from step",
    };
  }
}

/**
 * Server Action: Update the quantity of a material on a production step
 */
export async function updateStepMaterialQuantity(
  stepId: string,
  materialId: string,
  quantity: number
) {
  try {
    const stepMaterial = await ProductionStepService.updateMaterialQuantity(
      stepId,
      materialId,
      quantity
    );
    updateTag(CACHE_TAGS.ARTICLES);
    return { success: true, data: stepMaterial };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update material quantity",
    };
  }
}


/**
 * Server Action: Batch save all steps (with materials) for an article part.
 * Replaces all existing steps with the provided list in a single transaction.
 */
export async function batchSaveSteps(
  articleId: string,
  partId: string,
  steps: Array<{
    id?: string;
    stepName: string;
    departmentId: string;
    estimatedTime?: number | null;
    instructions?: string | null;
    materials: Array<{
      materialId: string;
      quantity: number;
      length?: number | null;
      width?: number | null;
      height?: number | null;
      isEdgebanded?: boolean | null;
    }>;
  }>
) {
  try {
    const savedSteps = await ProductionStepService.batchSaveSteps(partId, steps);
    updateTag(CACHE_TAGS.ARTICLES);
    updateTag(CACHE_TAGS.article(articleId));
    updateTag(CACHE_TAGS.PRODUCTION_ORDERS);
    return { success: true, data: savedSteps };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to batch save steps",
    };
  }
}
