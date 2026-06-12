"use server";

import { FabricService } from "@/lib/services/fabric.service";
import type { CreateFabricInput, UpdateFabricInput } from "@/lib/services/fabric.service";
import { updateTag } from "next/cache";
import type { ActionResult } from "@/lib/types/actions";
import type { Fabric } from "@/app/generated/prisma";

export async function getFabrics(): Promise<ActionResult<Fabric[]>> {
  try {
    const fabrics = await FabricService.getAll();
    return { success: true, data: fabrics };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Greška pri dohvatanju stofova" };
  }
}

export async function createFabric(input: CreateFabricInput): Promise<ActionResult<Fabric>> {
  try {
    const fabric = await FabricService.create(input);
    updateTag("fabrics");
    return { success: true, data: fabric };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Greška pri kreiranju stofa" };
  }
}

export async function updateFabric(id: string, input: UpdateFabricInput): Promise<ActionResult<Fabric>> {
  try {
    const fabric = await FabricService.update(id, input);
    updateTag("fabrics");
    return { success: true, data: fabric };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Greška pri ažuriranju stofa" };
  }
}

export async function deleteFabric(id: string): Promise<ActionResult<void>> {
  try {
    await FabricService.delete(id);
    updateTag("fabrics");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Greška pri brisanju stofa" };
  }
}

export async function importFabrics(
  items: Array<{ name: string; code: string }>
): Promise<ActionResult<{ created: number; updated: number }>> {
  try {
    const result = await FabricService.upsertMany(items);
    updateTag("fabrics");
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Greška pri uvozu stofova",
    };
  }
}
