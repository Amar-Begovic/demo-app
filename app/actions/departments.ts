"use server";

import { DepartmentService } from "@/lib/services/department.service";
import type { CreateDepartmentInput } from "@/lib/services/department.service";
import type { ActionResult } from "@/lib/types/actions";
import type { Department } from "@/app/generated/prisma";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/config";

/**
 * Server Action: Create a new department
 * Uses updateTag for immediate read-your-own-writes semantics
 */
export async function createDepartment(
  data: CreateDepartmentInput
): Promise<ActionResult<Department>> {
  try {
    const department = await DepartmentService.create(data);
    updateTag(CACHE_TAGS.DEPARTMENTS);
    return { success: true, data: department };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create department",
    };
  }
}

/**
 * Server Action: Update an existing department
 * Invalidates both global departments cache and specific department cache
 */
export async function updateDepartment(
  id: string,
  data: CreateDepartmentInput
): Promise<ActionResult<Department>> {
  try {
    const existing = await DepartmentService.getById(id);
    if (!existing) {
      throw new Error(`Department with id "${id}" does not exist`);
    }
    // DepartmentService doesn't have an update method yet,
    // so we use prisma directly via a minimal approach
    const { prisma } = await import("@/lib/db");
    const department = await prisma.department.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description ?? null,
      },
    });
    updateTag(CACHE_TAGS.DEPARTMENTS);
    updateTag(CACHE_TAGS.department(id));
    return { success: true, data: department };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update department",
    };
  }
}
