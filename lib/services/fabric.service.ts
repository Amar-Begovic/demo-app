import { prisma } from "@/lib/db";
import type { Fabric } from "@/app/generated/prisma";

export type FabricWithMaterial = Fabric & {
  material: {
    id: string;
    name: string;
    code: string | null;
    unit: string;
    currentQuantity: number;
    minimumQuantity: number;
  } | null;
};

export interface CreateFabricInput {
  name: string;
  code?: string;
  description?: string;
  color?: string;
  materialId?: string | null;
}

export interface UpdateFabricInput {
  name?: string;
  code?: string;
  description?: string;
  color?: string;
  materialId?: string | null;
}

export const FabricService = {
  async getAll(): Promise<FabricWithMaterial[]> {
    return prisma.fabric.findMany({
      orderBy: { name: "asc" },
      include: {
        material: {
          select: {
            id: true,
            name: true,
            code: true,
            unit: true,
            currentQuantity: true,
            minimumQuantity: true,
          },
        },
      },
    });
  },

  async getById(id: string): Promise<Fabric | null> {
    return prisma.fabric.findUnique({
      where: { id },
    });
  },

  async create(input: CreateFabricInput): Promise<Fabric> {
    return prisma.fabric.create({
      data: {
        name: input.name,
        code: input.code ?? null,
        description: input.description ?? null,
        color: input.color ?? null,
        materialId: input.materialId ?? null,
      },
    });
  },

  async update(id: string, input: UpdateFabricInput): Promise<Fabric> {
    return prisma.fabric.update({
      where: { id },
      data: {
        name: input.name,
        code: input.code,
        description: input.description,
        color: input.color,
        materialId: input.materialId,
      },
    });
  },

  async delete(id: string): Promise<void> {
    await prisma.fabric.delete({
      where: { id },
    });
  },

  async upsertMany(
    items: Array<{ name: string; code: string }>
  ): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const item of items) {
      const existing = await prisma.fabric.findUnique({
        where: { code: item.code },
      });

      if (existing) {
        await prisma.fabric.update({
          where: { code: item.code },
          data: { name: item.name },
        });
        updated++;
      } else {
        await prisma.fabric.create({
          data: { name: item.name, code: item.code },
        });
        created++;
      }
    }

    return { created, updated };
  },
};
