import { prisma } from "@/lib/db";
import type { Department } from "@/app/generated/prisma";
import type { PaginationParams, PaginatedResponse } from "@/lib/types/pagination";

export interface CreateDepartmentInput {
  name: string;
  description?: string;
}

export const DepartmentService = {
  async create(data: CreateDepartmentInput): Promise<Department> {
    return prisma.department.create({
      data: {
        name: data.name,
        description: data.description ?? null,
      },
    });
  },

  async getAll(): Promise<Department[]> {
    return prisma.department.findMany({
      orderBy: { name: "asc" },
    });
  },

  async getAllPaginated({ page, pageSize }: PaginationParams): Promise<PaginatedResponse<Department>> {
    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      prisma.department.findMany({
        skip,
        take: pageSize,
        orderBy: { name: "asc" },
      }),
      prisma.department.count(),
    ]);
    return { data, total, page, pageSize };
  },

  async getById(id: string): Promise<Department | null> {
    return prisma.department.findUnique({ where: { id } });
  },

  /**
   * Validates that a department exists. Throws if not found.
   * Used when other entities reference a department (e.g. ArticlePart).
   */
  async validateExists(id: string): Promise<Department> {
    const department = await prisma.department.findUnique({ where: { id } });
    if (!department) {
      throw new Error(`Department with id "${id}" does not exist`);
    }
    return department;
  },
};
