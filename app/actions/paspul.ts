"use server";

import { PaspulService } from "@/lib/services/paspul.service";
import type { CreateCategoryItemInput, UpdateCategoryItemInput } from "@/lib/services/paspul.service";
import { updateTag } from "next/cache";
import type { ActionResult } from "@/lib/types/actions";
import type { Paspul } from "@/app/generated/prisma";

export async function createPaspul(input: CreateCategoryItemInput): Promise<ActionResult<Paspul>> {
  try {
    const paspul = await PaspulService.create(input);
    updateTag("paspul");
    return { success: true, data: paspul };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Greška pri kreiranju paspula" };
  }
}

export async function updatePaspul(id: string, input: UpdateCategoryItemInput): Promise<ActionResult<Paspul>> {
  try {
    const paspul = await PaspulService.update(id, input);
    updateTag("paspul");
    return { success: true, data: paspul };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Greška pri ažuriranju paspula" };
  }
}

export async function deletePaspul(id: string): Promise<ActionResult<void>> {
  try {
    await PaspulService.delete(id);
    updateTag("paspul");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Greška pri brisanju paspula" };
  }
}

export async function importPaspuli(
  items: Array<{ name: string; code: string; materialId?: string }>
): Promise<ActionResult<{ created: number; updated: number }>> {
  try {
    const result = await PaspulService.upsertMany(items);
    updateTag("paspul");
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Greška pri uvozu paspula",
    };
  }
}
