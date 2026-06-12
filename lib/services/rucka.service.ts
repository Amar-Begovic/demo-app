import { prisma } from "@/lib/db";
import type { Rucka } from "@/app/generated/prisma";

export type RuckaWithMaterial = Rucka & {
  material: {
    id: string;
    name: string;
    code: string | null;
    unit: string;
    currentQuantity: number;
    minimumQuantity: number;
  } | null;
};

export interface CreateCategoryItemInput {
  name: string;
  code?: string;
  description?: string;
  materialId?: string | null;
}

export interface UpdateCategoryItemInput {
  name?: string;
  code?: string;
  description?: string;
  materialId?: string | null;
}

export const RuckaService = {
  async getAll(): Promise<RuckaWithMaterial[]> {
    return prisma.rucka.findMany({
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

  async create(input: CreateCategoryItemInput): Promise<Rucka> {
    if (!input.name || input.name.trim().length === 0) {
      throw new Error("Naziv ne može biti prazan");
    }

    if (input.code) {
      const existing = await prisma.rucka.findUnique({
        where: { code: input.code },
      });
      if (existing) {
        throw new Error("Šifra već postoji");
      }
    }

    if (input.materialId) {
      const material = await prisma.material.findUnique({
        where: { id: input.materialId },
      });
      if (!material) {
        throw new Error("Referencirani materijal ne postoji");
      }
    }

    return prisma.rucka.create({
      data: {
        name: input.name,
        code: input.code ?? null,
        description: input.description ?? null,
        materialId: input.materialId ?? null,
      },
    });
  },

  async update(id: string, input: UpdateCategoryItemInput): Promise<Rucka> {
    const item = await prisma.rucka.findUnique({ where: { id } });
    if (!item) {
      throw new Error("Stavka nije pronađena");
    }

    if (input.name !== undefined && input.name.trim().length === 0) {
      throw new Error("Naziv ne može biti prazan");
    }

    if (input.code) {
      const existing = await prisma.rucka.findUnique({
        where: { code: input.code },
      });
      if (existing && existing.id !== id) {
        throw new Error("Šifra već postoji");
      }
    }

    if (input.materialId) {
      const material = await prisma.material.findUnique({
        where: { id: input.materialId },
      });
      if (!material) {
        throw new Error("Referencirani materijal ne postoji");
      }
    }

    return prisma.rucka.update({
      where: { id },
      data: {
        name: input.name,
        code: input.code,
        description: input.description,
        materialId: input.materialId,
      },
    });
  },

  async delete(id: string): Promise<void> {
    const item = await prisma.rucka.findUnique({ where: { id } });
    if (!item) {
      throw new Error("Stavka nije pronađena");
    }

    await prisma.rucka.delete({
      where: { id },
    });
  },

  async upsertMany(
    items: Array<{ name: string; code: string; materialId?: string }>
  ): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const item of items) {
      const existing = await prisma.rucka.findUnique({
        where: { code: item.code },
      });

      if (existing) {
        await prisma.rucka.update({
          where: { code: item.code },
          data: { name: item.name, materialId: item.materialId },
        });
        updated++;
      } else {
        await prisma.rucka.create({
          data: {
            name: item.name,
            code: item.code,
            materialId: item.materialId ?? null,
          },
        });
        created++;
      }
    }

    return { created, updated };
  },
};
