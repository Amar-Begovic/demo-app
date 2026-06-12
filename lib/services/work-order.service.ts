import { prisma } from "@/lib/db";
import type { WorkOrder } from "@/app/generated/prisma";
import { WorkOrderStatus } from "@/app/generated/prisma";
import type { CanStartResult } from "@/lib/types";
import { ProductionOrderService } from "@/lib/services/production-order.service";
import { AuditLogService } from "@/lib/services/audit-log.service";

const workOrderInclude = {
  articlePart: true,
  department: true,
  productionOrder: {
    include: {
      items: {
        select: { priority: true, quantity: true },
      },
    },
  },
  barcode: true,
  productionStep: { include: { department: true } },
} as const;

export const WorkOrderService = {
  /**
   * Get all work orders assigned to a specific department.
   */
  async getByDepartment(departmentId: string): Promise<WorkOrder[]> {
    return prisma.workOrder.findMany({
      where: { departmentId },
      include: workOrderInclude,
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Start work on a work order: pending → in_progress.
   * Records the start timestamp.
   */
  async startWork(workOrderId: string): Promise<WorkOrder> {
    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
    });
    if (!wo) {
      throw new Error(`Work order with id "${workOrderId}" does not exist`);
    }

    if (wo.status !== WorkOrderStatus.pending) {
      throw new Error(
        `Cannot start work order in status "${wo.status}". Only "pending" work orders can be started.`
      );
    }

    // Provjera sekvencijalnog izvršavanja
    const canStart = await this.canStartWorkOrder(wo);
    if (!canStart.allowed) {
      throw new Error("Prethodni korak nije završen");
    }

    const updated = await prisma.workOrder.update({
      where: { id: workOrderId },
      data: {
        status: WorkOrderStatus.in_progress,
        startedAt: new Date(),
      },
      include: workOrderInclude,
    });

    try {
      await AuditLogService.log({
        entityType: "work_order",
        entityId: workOrderId,
        action: "status_change",
        details: { oldStatus: WorkOrderStatus.pending, newStatus: WorkOrderStatus.in_progress },
      });
    } catch (e) {
      console.error("Greška pri zapisivanju u revizijski dnevnik:", e);
    }

    return updated;
  },

  /**
   * Complete a work order: in_progress → completed.
   * Records the end timestamp and checks if the parent production order should auto-complete.
   */
  async completeWork(workOrderId: string): Promise<WorkOrder> {
    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
    });
    if (!wo) {
      throw new Error(`Work order with id "${workOrderId}" does not exist`);
    }

    if (wo.status !== WorkOrderStatus.in_progress) {
      throw new Error(
        `Cannot complete work order in status "${wo.status}". Only "in_progress" work orders can be completed.`
      );
    }

    const updated = await prisma.workOrder.update({
      where: { id: workOrderId },
      data: {
        status: WorkOrderStatus.completed,
        completedAt: new Date(),
      },
      include: workOrderInclude,
    });

    try {
      await AuditLogService.log({
        entityType: "work_order",
        entityId: workOrderId,
        action: "status_change",
        details: { oldStatus: WorkOrderStatus.in_progress, newStatus: WorkOrderStatus.completed },
      });
    } catch (e) {
      console.error("Greška pri zapisivanju u revizijski dnevnik:", e);
    }

    // Check if all work orders for the parent production order are now completed
    await ProductionOrderService.checkAutoCompletion(wo.productionOrderId);

    return updated;
  },

  /**
   * Get elapsed production time in milliseconds for a completed work order.
   * Returns 0 if timestamps are missing.
   */
  getElapsedTime(workOrder: WorkOrder): number {
    if (!workOrder.startedAt || !workOrder.completedAt) {
      return 0;
    }
    return new Date(workOrder.completedAt).getTime() - new Date(workOrder.startedAt).getTime();
  },

  /**
   * Check if a work order can be started based on sequential step execution.
   * Returns allowed: true if no productionStepId (backward compat), first step, or all previous steps completed.
   */
  async canStartWorkOrder(workOrder: WorkOrder): Promise<CanStartResult> {
    // Backward kompatibilnost: ako nema productionStepId, dozvoli
    if (!workOrder.productionStepId || !workOrder.stepSequence) {
      return { allowed: true };
    }

    // Ako je prvi korak (stepSequence === 1), dozvoli
    if (workOrder.stepSequence === 1) {
      return { allowed: true };
    }

    // Pronađi prethodni korak za isti dio i istu stavku
    const previousSteps = await prisma.workOrder.findMany({
      where: {
        productionOrderId: workOrder.productionOrderId,
        articlePartId: workOrder.articlePartId,
        itemIndex: workOrder.itemIndex,
        stepSequence: { lt: workOrder.stepSequence },
      },
      orderBy: { stepSequence: "desc" },
      take: 1,
    });

    if (previousSteps.length === 0) {
      return { allowed: true };
    }

    const prevStep = previousSteps[0];
    if (prevStep.status !== "completed") {
      return {
        allowed: false,
        reason: "Prethodni korak nije završen",
        activeStep: prevStep,
      };
    }

    return { allowed: true };
  },

  /**
   * Get a single work order by ID.
   */
  async getById(id: string): Promise<WorkOrder | null> {
    return prisma.workOrder.findUnique({
      where: { id },
      include: workOrderInclude,
    });
  },
};
