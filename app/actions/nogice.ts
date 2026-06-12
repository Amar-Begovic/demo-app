"use server";

import { NogicaService } from "@/lib/services/nogica.service";
import type { CreateCategoryItemInput, UpdateCategoryItemInput } from "@/lib/services/nogica.service";
import { updateTag } from "next/cache";
import type { ActionResult } from "@/lib/types/actions";
import type { Nogica } from "@/app/generated/prisma";

export async function createNogica(input: CreateCategoryItemInput): Promise<ActionResult<Nogica>> {
  try {
    const nogica = await NogicaService.create(input);
    updateTag("nogice");
    return { success: true, data: nogica };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Greška pri kreiranju nogice" };
  }
}

export async function updateNogica(id: string, input: UpdateCategoryItemInput): Promise<ActionResult<Nogica>> {
  try {
    const nogica = await NogicaService.update(id, input);
    updateTag("nogice");
    return { success: true, data: nogica };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Greška pri ažuriranju nogice" };
  }
}

export async function deleteNogica(id: string): Promise<ActionResult<void>> {
  try {
    await NogicaService.delete(id);
    updateTag("nogice");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Greška pri brisanju nogice" };
  }
}

export async function importNogice(
  items: Array<{ name: string; code: string; materialId?: string }>
): Promise<ActionResult<{ created: number; updated: number }>> {
  try {
    const result = await NogicaService.upsertMany(items);
    updateTag("nogice");
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Greška pri uvozu nogica",
    };
  }
}
