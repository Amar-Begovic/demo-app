import { prisma } from "@/lib/db";
import type { Nogica } from "@/app/generated/prisma";

export type NogicaWithMaterial = Nogica & {
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

export const NogicaService = {
  async getAll(): Promise<NogicaWithMaterial[]> {
    return prisma.nogica.findMany({
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

  async create(input: CreateCategoryItemInput): Promise<Nogica> {
    if (!input.name || input.name.trim().length === 0) {
      throw new Error("Naziv ne može biti prazan");
    }

    if (input.code) {
      const existing = await prisma.nogica.findUnique({
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

    return prisma.nogica.create({
      data: {
        name: input.name,
        code: input.code ?? null,
        description: input.description ?? null,
        materialId: input.materialId ?? null,
      },
    });
  },

  async update(id: string, input: UpdateCategoryItemInput): Promise<Nogica> {
    const existing = await prisma.nogica.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new Error("Stavka nije pronađena");
    }

    if (input.name !== undefined && input.name.trim().length === 0) {
      throw new Error("Naziv ne može biti prazan");
    }

    if (input.code) {
      const duplicate = await prisma.nogica.findUnique({
        where: { code: input.code },
      });
      if (duplicate && duplicate.id !== id) {
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

    return prisma.nogica.update({
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
    const existing = await prisma.nogica.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new Error("Stavka nije pronađena");
    }

    await prisma.nogica.delete({
      where: { id },
    });
  },

  async upsertMany(
    items: Array<{ name: string; code: string; materialId?: string }>
  ): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const item of items) {
      const existing = await prisma.nogica.findUnique({
        where: { code: item.code },
      });

      if (existing) {
        await prisma.nogica.update({
          where: { code: item.code },
          data: { name: item.name, materialId: item.materialId ?? null },
        });
        updated++;
      } else {
        await prisma.nogica.create({
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
