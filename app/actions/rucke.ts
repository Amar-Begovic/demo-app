"use server";

import { RuckaService } from "@/lib/services/rucka.service";
import type { CreateCategoryItemInput, UpdateCategoryItemInput } from "@/lib/services/rucka.service";
import { updateTag } from "next/cache";
import type { ActionResult } from "@/lib/types/actions";
import type { Rucka } from "@/app/generated/prisma";

export async function createRucka(input: CreateCategoryItemInput): Promise<ActionResult<Rucka>> {
  try {
    const rucka = await RuckaService.create(input);
    updateTag("rucke");
    return { success: true, data: rucka };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Greška pri kreiranju ručke" };
  }
}

export async function updateRucka(id: string, input: UpdateCategoryItemInput): Promise<ActionResult<Rucka>> {
  try {
    const rucka = await RuckaService.update(id, input);
    updateTag("rucke");
    return { success: true, data: rucka };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Greška pri ažuriranju ručke" };
  }
}

export async function deleteRucka(id: string): Promise<ActionResult<void>> {
  try {
    await RuckaService.delete(id);
    updateTag("rucke");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Greška pri brisanju ručke" };
  }
}

export async function importRucke(
  items: Array<{ name: string; code: string; materialId?: string }>
): Promise<ActionResult<{ created: number; updated: number }>> {
  try {
    const result = await RuckaService.upsertMany(items);
    updateTag("rucke");
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Greška pri uvozu ručki",
    };
  }
}
