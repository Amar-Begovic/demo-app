"use server";

import { SupplierService } from "@/lib/services/supplier.service";
import type { CreateSupplierInput } from "@/lib/services/supplier.service";
import type { ActionResult } from "@/lib/types/actions";
import type { Supplier } from "@/app/generated/prisma";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/config";

/**
 * Server Action: Create a new supplier
 * Uses updateTag for immediate read-your-own-writes semantics
 */
export async function createSupplier(
  data: CreateSupplierInput
): Promise<ActionResult<Supplier>> {
  try {
    const supplier = await SupplierService.create(data);
    updateTag(CACHE_TAGS.SUPPLIERS);
    return { success: true, data: supplier };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create supplier",
    };
  }
}
