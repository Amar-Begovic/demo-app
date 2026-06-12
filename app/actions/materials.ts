"use server";

import { MaterialService } from "@/lib/services/material.service";
import type { CreateMaterialInput, UpdateMaterialInput } from "@/lib/services/material.service";
import { updateTag, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/config";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/types/actions";

/**
 * Server Action: Create a new material
 * Uses updateTag for immediate read-your-own-writes semantics
 */
export async function createMaterial(data: CreateMaterialInput) {
  try {
    const material = await MaterialService.create(data);
    updateTag(CACHE_TAGS.MATERIALS);
    return { success: true, data: material };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create material",
    };
  }
}

/**
 * Server Action: Update an existing material
 */
export async function updateMaterial(id: string, data: UpdateMaterialInput) {
  try {
    const material = await MaterialService.update(id, data);
    updateTag(CACHE_TAGS.MATERIALS);
    updateTag(CACHE_TAGS.material(id));
    return { success: true, data: material };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update material",
    };
  }
}

/**
 * Server Action: Adjust material stock (add or subtract)
 * Uses MaterialService.updateStock which records history and re-evaluates production orders.
 */
export async function adjustStock(
  id: string,
  quantityChange: number,
  notes?: string
) {
  try {
    const material = await MaterialService.updateStock(id, quantityChange, {
      changeType: quantityChange >= 0 ? "inflow" : "outflow",
      referenceType: "manual_adjustment",
      notes: notes || (quantityChange >= 0 ? "Ručno dodavanje" : "Ručno oduzimanje"),
    });
    updateTag(CACHE_TAGS.MATERIALS);
    updateTag(CACHE_TAGS.material(id));
    updateTag(CACHE_TAGS.PRODUCTION_ORDERS);
    return { success: true, data: material };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to adjust stock",
    };
  }
}

/**
 * Server Action: Delete a material
 */
export async function deleteMaterial(id: string) {
  try {
    throw new Error("Delete functionality not yet implemented in MaterialService");
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete material",
    };
  }
}

/**
 * Server Action: Batch import materials
 * Uses revalidateTag for background invalidation
 */
export async function batchImportMaterials(materials: CreateMaterialInput[]) {
  try {
    const results = [];
    const errors = [];

    for (let i = 0; i < materials.length; i++) {
      try {
        const material = await MaterialService.create(materials[i]);
        results.push(material);
      } catch (error) {
        errors.push({
          index: i,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    revalidateTag(CACHE_TAGS.MATERIALS, "days");

    return {
      success: true,
      data: results,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to batch import materials",
    };
  }
}

/**
 * Server Action: Get materials list for linking in fabric dialogs
 * Returns { id, name, code }[] ordered by name
 */
export async function getMaterialsForLinking(): Promise<
  ActionResult<{ id: string; name: string; code: string | null }[]>
> {
  try {
    const materials = await prisma.material.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    });
    return { success: true, data: materials };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Greška pri dohvatanju materijala",
    };
  }
}
