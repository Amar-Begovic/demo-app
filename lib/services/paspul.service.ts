import { prisma } from "@/lib/db";
import type { Paspul } from "@/app/generated/prisma";

export type PaspulWithMaterial = Paspul & {
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

export const PaspulService = {
  async getAll(): Promise<PaspulWithMaterial[]> {
    return prisma.paspul.findMany({
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

  async create(input: CreateCategoryItemInput): Promise<Paspul> {
    if (!input.name || input.name.trim().length === 0) {
      throw new Error("Naziv ne može biti prazan");
    }

    if (input.code) {
      const existing = await prisma.paspul.findUnique({
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

    return prisma.paspul.create({
      data: {
        name: input.name,
        code: input.code ?? null,
        description: input.description ?? null,
        materialId: input.materialId ?? null,
      },
    });
  },

  async update(id: string, input: UpdateCategoryItemInput): Promise<Paspul> {
    const existing = await prisma.paspul.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new Error("Stavka nije pronađena");
    }

    if (input.name !== undefined && input.name.trim().length === 0) {
      throw new Error("Naziv ne može biti prazan");
    }

    if (input.code) {
      const duplicate = await prisma.paspul.findUnique({
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

    return prisma.paspul.update({
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
    const existing = await prisma.paspul.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new Error("Stavka nije pronađena");
    }

    await prisma.paspul.delete({
      where: { id },
    });
  },

  async upsertMany(
    items: Array<{ name: string; code: string; materialId?: string }>
  ): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const item of items) {
      const existing = await prisma.paspul.findUnique({
        where: { code: item.code },
      });

      if (existing) {
        await prisma.paspul.update({
          where: { code: item.code },
          data: { name: item.name, materialId: item.materialId ?? null },
        });
        updated++;
      } else {
        await prisma.paspul.create({
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
