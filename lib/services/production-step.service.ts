import { prisma } from "@/lib/db";
import type { ProductionStep } from "@/app/generated/prisma";
import type { StepInfo } from "@/lib/types";

export interface CreateStepInput {
  stepName: string;
  sequenceOrder: number;
  departmentId: string;
  estimatedTime?: number | null;
  instructions?: string | null;
}

export interface UpdateStepInput {
  stepName?: string;
  sequenceOrder?: number;
  departmentId?: string;
  estimatedTime?: number | null;
  instructions?: string | null;
}

export const ProductionStepService = {
  async getByArticlePart(articlePartId: string): Promise<ProductionStep[]> {
    return prisma.productionStep.findMany({
      where: { articlePartId },
      orderBy: { sequenceOrder: "asc" },
      include: { materials: { include: { material: true } } },
    });
  },

  async getEffectiveSteps(articlePartId: string): Promise<StepInfo[]> {
    const steps = await prisma.productionStep.findMany({
      where: { articlePartId },
      orderBy: { sequenceOrder: "asc" },
      include: { department: true, materials: { include: { material: true } } },
    });

    return steps.map((s) => ({
      stepId: s.id,
      stepName: s.stepName,
      sequenceOrder: s.sequenceOrder,
      departmentId: s.departmentId,
      estimatedTime: s.estimatedTime,
      instructions: s.instructions,
      isVersioned: false,
    }));
  },

  async createStep(
    articlePartId: string,
    data: CreateStepInput
  ): Promise<ProductionStep> {
    // Validate required fields
    if (!data.stepName) {
      throw new Error("Polje stepName je obavezno");
    }
    if (data.sequenceOrder == null) {
      throw new Error("Polje sequenceOrder je obavezno");
    }
    if (!data.departmentId) {
      throw new Error("Polje departmentId je obavezno");
    }

    // Validate ArticlePart exists
    const part = await prisma.articlePart.findUnique({
      where: { id: articlePartId },
      select: { id: true },
    });
    if (!part) {
      throw new Error("Dio artikla nije pronađen");
    }

    // Validate Department exists
    const department = await prisma.department.findUnique({
      where: { id: data.departmentId },
      select: { id: true },
    });
    if (!department) {
      throw new Error("Odjel nije pronađen");
    }

    // Check unique sequenceOrder constraint
    const existing = await prisma.productionStep.findUnique({
      where: {
        articlePartId_sequenceOrder: {
          articlePartId,
          sequenceOrder: data.sequenceOrder,
        },
      },
    });
    if (existing) {
      throw new Error("Redni broj koraka već postoji za ovaj dio");
    }

    return prisma.productionStep.create({
      data: {
        articlePartId,
        stepName: data.stepName,
        sequenceOrder: data.sequenceOrder,
        departmentId: data.departmentId,
        estimatedTime: data.estimatedTime ?? null,
        instructions: data.instructions ?? null,
      },
    });
  },

  async updateStep(
    stepId: string,
    data: UpdateStepInput
  ): Promise<ProductionStep> {
    const step = await prisma.productionStep.findUnique({
      where: { id: stepId },
    });
    if (!step) {
      throw new Error("Korak nije pronađen");
    }

    // If changing sequenceOrder, check uniqueness
    if (
      data.sequenceOrder != null &&
      data.sequenceOrder !== step.sequenceOrder
    ) {
      const existing = await prisma.productionStep.findUnique({
        where: {
          articlePartId_sequenceOrder: {
            articlePartId: step.articlePartId,
            sequenceOrder: data.sequenceOrder,
          },
        },
      });
      if (existing) {
        throw new Error("Redni broj koraka već postoji za ovaj dio");
      }
    }

    // If changing department, validate it exists
    if (data.departmentId && data.departmentId !== step.departmentId) {
      const department = await prisma.department.findUnique({
        where: { id: data.departmentId },
        select: { id: true },
      });
      if (!department) {
        throw new Error("Odjel nije pronađen");
      }
    }

    return prisma.productionStep.update({
      where: { id: stepId },
      data: {
        ...(data.stepName !== undefined && { stepName: data.stepName }),
        ...(data.sequenceOrder !== undefined && {
          sequenceOrder: data.sequenceOrder,
        }),
        ...(data.departmentId !== undefined && {
          departmentId: data.departmentId,
        }),
        ...(data.estimatedTime !== undefined && {
          estimatedTime: data.estimatedTime,
        }),
        ...(data.instructions !== undefined && {
          instructions: data.instructions,
        }),
      },
    });
  },

  async deleteStep(stepId: string): Promise<void> {
    const step = await prisma.productionStep.findUnique({
      where: { id: stepId },
      include: { workOrders: { select: { id: true }, take: 1 } },
    });
    if (!step) {
      throw new Error("Korak nije pronađen");
    }

    // Reject if step has work orders
    if (step.workOrders.length > 0) {
      throw new Error("Nije moguće obrisati korak koji ima radne naloge");
    }

    const articlePartId = step.articlePartId;
    const deletedOrder = step.sequenceOrder;

    await prisma.productionStep.delete({ where: { id: stepId } });

    // Resequence remaining steps
    const remaining = await prisma.productionStep.findMany({
      where: { articlePartId },
      orderBy: { sequenceOrder: "asc" },
    });

    for (let i = 0; i < remaining.length; i++) {
      const newOrder = i + 1;
      if (remaining[i].sequenceOrder !== newOrder) {
        await prisma.productionStep.update({
          where: { id: remaining[i].id },
          data: { sequenceOrder: newOrder },
        });
      }
    }
  },

  async reorderSteps(
    articlePartId: string,
    stepIds: string[]
  ): Promise<ProductionStep[]> {
    // Validate all steps belong to the article part
    const steps = await prisma.productionStep.findMany({
      where: { articlePartId },
    });

    const existingIds = new Set(steps.map((s) => s.id));
    for (const id of stepIds) {
      if (!existingIds.has(id)) {
        throw new Error(`Korak ${id} ne pripada ovom dijelu artikla`);
      }
    }

    if (stepIds.length !== steps.length) {
      throw new Error(
        "Lista koraka mora sadržavati sve korake za ovaj dio artikla"
      );
    }

    // Use a transaction to temporarily set sequenceOrder to negative values
    // to avoid unique constraint violations during reorder
    await prisma.$transaction(async (tx) => {
      // First pass: set temporary negative values
      for (let i = 0; i < stepIds.length; i++) {
        await tx.productionStep.update({
          where: { id: stepIds[i] },
          data: { sequenceOrder: -(i + 1) },
        });
      }
      // Second pass: set final positive values
      for (let i = 0; i < stepIds.length; i++) {
        await tx.productionStep.update({
          where: { id: stepIds[i] },
          data: { sequenceOrder: i + 1 },
        });
      }
    });

    return prisma.productionStep.findMany({
      where: { articlePartId },
      orderBy: { sequenceOrder: "asc" },
    });
  },

  async addMaterial(
    stepId: string,
    materialId: string,
    quantity: number,
    options?: {
      length?: number | null;
      width?: number | null;
      height?: number | null;
      isEdgebanded?: boolean | null;
    }
  ) {
    return prisma.stepMaterial.create({
      data: {
        productionStepId: stepId,
        materialId,
        quantity,
        length: options?.length ?? null,
        width: options?.width ?? null,
        height: options?.height ?? null,
        isEdgebanded: options?.isEdgebanded ?? null,
      },
      include: { material: true },
    });
  },

  async removeMaterial(stepId: string, materialId: string) {
    const record = await prisma.stepMaterial.findFirst({
      where: { productionStepId: stepId, materialId },
    });
    if (record) {
      await prisma.stepMaterial.delete({ where: { id: record.id } });
    }
  },

  async updateMaterialQuantity(stepId: string, materialId: string, quantity: number) {
    const record = await prisma.stepMaterial.findFirst({
      where: { productionStepId: stepId, materialId },
    });
    if (!record) throw new Error("StepMaterial not found");
    return prisma.stepMaterial.update({
      where: { id: record.id },
      data: { quantity },
    });
  },

  async updateMaterial(
    stepId: string,
    materialId: string,
    data: {
      quantity?: number;
      length?: number | null;
      width?: number | null;
      height?: number | null;
      isEdgebanded?: boolean | null;
    }
  ) {
    const record = await prisma.stepMaterial.findFirst({
      where: { productionStepId: stepId, materialId },
    });
    if (!record) throw new Error("StepMaterial not found");
    return prisma.stepMaterial.update({
      where: { id: record.id },
      data: {
        ...(data.quantity !== undefined && { quantity: data.quantity }),
        ...(data.length !== undefined && { length: data.length }),
        ...(data.width !== undefined && { width: data.width }),
        ...(data.height !== undefined && { height: data.height }),
        ...(data.isEdgebanded !== undefined && { isEdgebanded: data.isEdgebanded }),
      },
      include: { material: true },
    });
  },

  async getMaterials(stepId: string) {
    return prisma.stepMaterial.findMany({
      where: { productionStepId: stepId },
      include: { material: true },
    });
  },

  async batchSaveSteps(
    articlePartId: string,
    steps: Array<{
      id?: string;
      stepName: string;
      departmentId: string;
      estimatedTime?: number | null;
      instructions?: string | null;
      materials: Array<{
        materialId: string;
        quantity: number;
        length?: number | null;
        width?: number | null;
        height?: number | null;
        isEdgebanded?: boolean | null;
      }>;
    }>
  ) {
    // Validate ArticlePart exists
    const part = await prisma.articlePart.findUnique({
      where: { id: articlePartId },
      select: { id: true },
    });
    if (!part) {
      throw new Error("Dio artikla nije pronađen");
    }

    // Validate all department IDs exist; resolve empty departmentId to "Ostalo"
    const OSTALO_DEPT_NAME = "Ostalo";
    for (const step of steps) {
      if (!step.departmentId || !step.departmentId.trim()) {
        // Find or create "Ostalo" department
        let ostaloDept = await prisma.department.findFirst({
          where: { name: OSTALO_DEPT_NAME },
          select: { id: true },
        });
        if (!ostaloDept) {
          ostaloDept = await prisma.department.create({
            data: { name: OSTALO_DEPT_NAME },
            select: { id: true },
          });
        }
        step.departmentId = ostaloDept.id;
      }
    }

    const departmentIds = [...new Set(steps.map((s) => s.departmentId))];
    const departments = await prisma.department.findMany({
      where: { id: { in: departmentIds } },
      select: { id: true },
    });
    if (departments.length !== departmentIds.length) {
      throw new Error("Jedan ili više odjela nije pronađeno");
    }

    // Validate all material IDs exist
    const materialIds = [
      ...new Set(steps.flatMap((s) => s.materials.map((m) => m.materialId))),
    ];
    if (materialIds.length > 0) {
      const materials = await prisma.material.findMany({
        where: { id: { in: materialIds } },
        select: { id: true },
      });
      if (materials.length !== materialIds.length) {
        throw new Error("Jedan ili više materijala nije pronađeno");
      }
    }

    // Validate step names are not empty; default to "Ostalo" when department is "Ostalo"
    for (const step of steps) {
      if (!step.stepName?.trim()) {
        step.stepName = OSTALO_DEPT_NAME;
      }
    }

    // Validate material quantities
    for (const step of steps) {
      for (const mat of step.materials) {
        if (mat.quantity <= 0) {
          throw new Error("Količina materijala mora biti veća od 0");
        }
      }
    }

    const incomingStepIds = steps
      .filter((s) => s.id)
      .map((s) => s.id as string);

    return prisma.$transaction(async (tx) => {
      // Delete steps that are no longer in the incoming list
      await tx.productionStep.deleteMany({
        where: {
          articlePartId,
          ...(incomingStepIds.length > 0
            ? { id: { notIn: incomingStepIds } }
            : {}),
        },
      });

      const savedSteps = [];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const sequenceOrder = i + 1;

        let savedStep;

        if (step.id) {
          // Update existing step — use temporary negative sequenceOrder to avoid unique constraint
          savedStep = await tx.productionStep.update({
            where: { id: step.id },
            data: {
              stepName: step.stepName,
              sequenceOrder: -(sequenceOrder),
              departmentId: step.departmentId,
              estimatedTime: step.estimatedTime ?? null,
              instructions: step.instructions ?? null,
            },
          });
        } else {
          // Create new step with temporary negative sequenceOrder
          savedStep = await tx.productionStep.create({
            data: {
              articlePartId,
              stepName: step.stepName,
              sequenceOrder: -(sequenceOrder),
              departmentId: step.departmentId,
              estimatedTime: step.estimatedTime ?? null,
              instructions: step.instructions ?? null,
            },
          });
        }

        // Replace all materials for this step: delete old, create new
        await tx.stepMaterial.deleteMany({
          where: { productionStepId: savedStep.id },
        });

        for (const mat of step.materials) {
          await tx.stepMaterial.create({
            data: {
              productionStepId: savedStep.id,
              materialId: mat.materialId,
              quantity: mat.quantity,
              length: mat.length ?? null,
              width: mat.width ?? null,
              height: mat.height ?? null,
              isEdgebanded: mat.isEdgebanded ?? null,
            },
          });
        }

        savedSteps.push(savedStep);
      }

      // Set final positive sequenceOrder values
      for (let i = 0; i < savedSteps.length; i++) {
        await tx.productionStep.update({
          where: { id: savedSteps[i].id },
          data: { sequenceOrder: i + 1 },
        });
      }

      // Return the final state with materials included
      return tx.productionStep.findMany({
        where: { articlePartId },
        orderBy: { sequenceOrder: "asc" },
        include: { materials: { include: { material: true } } },
      });
    });
  },
};
