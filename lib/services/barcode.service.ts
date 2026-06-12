import { prisma } from "@/lib/db";
import type { Barcode } from "@/app/generated/prisma";
import { BarcodeType, WorkOrderStatus } from "@/app/generated/prisma";
import { v4 as uuidv4 } from "uuid";
import bwipjs from "bwip-js/node";
import type { BarcodeData, BarcodeInfo, PartIdentifierData, PartScanResult, StepProgress } from "@/lib/types";
import { AuditLogService } from "@/lib/services/audit-log.service";

/**
 * Generate a unique barcode value string.
 * Format: WO-<short-uuid> for work orders, PR-<short-uuid> for products, PT-<short-uuid> for part identifiers.
 */
function generateBarcodeValue(type: BarcodeType): string {
  const prefixMap: Record<BarcodeType, string> = {
    [BarcodeType.work_order]: "WO",
    [BarcodeType.product]: "PR",
    [BarcodeType.part_identifier]: "PT",
  };
  const prefix = prefixMap[type];
  const id = uuidv4().replace(/-/g, "").substring(0, 12).toUpperCase();
  return `${prefix}-${id}`;
}

/**
 * Generate a barcode PNG image as a base64 string using bwip-js.
 */
async function generateBarcodeImage(value: string): Promise<string> {
  const pngBuffer = await bwipjs.toBuffer({
    bcid: "code128",
    text: value,
    scale: 2,
    height: 30,
    includetext: true,
    textxalign: "center",
    paddingwidth: 4,
    paddingheight: 4,
    backgroundcolor: "FFFFFF",
    barcolor: "000000",
  });
  return pngBuffer.toString("base64");
}

export const BarcodeService = {
  /**
   * Generate a unique barcode for a work order.
   * If the work order already has a barcode, returns the existing one.
   */
  async generateForWorkOrder(workOrderId: string): Promise<BarcodeData> {
    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: { barcode: true },
    });
    if (!wo) {
      throw new Error(`Work order with id "${workOrderId}" does not exist`);
    }

    // Return existing barcode if already generated
    if (wo.barcode) {
      const imageBase64 = await generateBarcodeImage(wo.barcode.value);
      return {
        id: wo.barcode.id,
        value: wo.barcode.value,
        type: wo.barcode.type,
        imageBase64,
      };
    }

    const value = generateBarcodeValue(BarcodeType.work_order);
    const barcode = await prisma.barcode.create({
      data: {
        value,
        type: BarcodeType.work_order,
        workOrderId,
        productionOrderId: wo.productionOrderId,
        itemIndex: wo.itemIndex,
      },
    });

    const imageBase64 = await generateBarcodeImage(barcode.value);
    return {
      id: barcode.id,
      value: barcode.value,
      type: barcode.type,
      imageBase64,
    };
  },

  /**
   * Generate a barcode for a completed product (all work orders for that item finished).
   * Checks that all work orders for the given production order + itemIndex are completed.
   */
  async generateForProduct(
    productionOrderId: string,
    itemIndex: number
  ): Promise<BarcodeData> {
    const order = await prisma.productionOrder.findUnique({
      where: { id: productionOrderId },
    });
    if (!order) {
      throw new Error(
        `Production order with id "${productionOrderId}" does not exist`
      );
    }

    // Check if a product barcode already exists for this item
    const existing = await prisma.barcode.findFirst({
      where: {
        productionOrderId,
        itemIndex,
        type: BarcodeType.product,
      },
    });
    if (existing) {
      const imageBase64 = await generateBarcodeImage(existing.value);
      return {
        id: existing.id,
        value: existing.value,
        type: existing.type,
        imageBase64,
      };
    }

    const value = generateBarcodeValue(BarcodeType.product);
    const barcode = await prisma.barcode.create({
      data: {
        value,
        type: BarcodeType.product,
        productionOrderId,
        itemIndex,
      },
    });

    const imageBase64 = await generateBarcodeImage(barcode.value);
    return {
      id: barcode.id,
      value: barcode.value,
      type: barcode.type,
      imageBase64,
    };
  },

  /**
   * Generate a unique part identifier for a (productionOrder, articlePart, itemIndex) combination.
   * If an identifier already exists for this combination, returns the existing one (idempotent).
   */
  async generatePartIdentifier(
    productionOrderId: string,
    articlePartId: string,
    itemIndex: number
  ): Promise<PartIdentifierData> {
    // Check for existing part identifier using the unique constraint fields
    const existing = await prisma.barcode.findUnique({
      where: {
        unique_part_identifier: {
          productionOrderId,
          articlePartId,
          itemIndex,
          type: BarcodeType.part_identifier,
        },
      },
    });

    if (existing) {
      const imageBase64 = await generateBarcodeImage(existing.value);
      return {
        id: existing.id,
        value: existing.value,
        type: existing.type,
        imageBase64,
        productionOrderId,
        articlePartId,
        itemIndex,
      };
    }

    const value = generateBarcodeValue(BarcodeType.part_identifier);
    const barcode = await prisma.barcode.create({
      data: {
        value,
        type: BarcodeType.part_identifier,
        productionOrderId,
        articlePartId,
        itemIndex,
      },
    });

    const imageBase64 = await generateBarcodeImage(barcode.value);
    return {
      id: barcode.id,
      value: barcode.value,
      type: barcode.type,
      imageBase64,
      productionOrderId,
      articlePartId,
      itemIndex,
    };
  },

  /**
   * Look up a part identifier barcode and determine the next action.
   * Finds the barcode by value (type=part_identifier), fetches all WorkOrders
   * for the combination, and determines the appropriate action based on WO statuses.
   */
  async lookupPartIdentifier(value: string): Promise<PartScanResult> {
    const barcode = await prisma.barcode.findUnique({
      where: { value },
      include: {
        articlePart: true,
        productionOrder: true,
      },
    });

    if (!barcode || barcode.type !== BarcodeType.part_identifier) {
      throw new Error(`Barcode "${value}" not found`);
    }

    const imageBase64 = await generateBarcodeImage(barcode.value);

    const barcodeData: PartIdentifierData = {
      id: barcode.id,
      value: barcode.value,
      type: barcode.type,
      imageBase64,
      productionOrderId: barcode.productionOrderId!,
      articlePartId: barcode.articlePartId!,
      itemIndex: barcode.itemIndex!,
    };

    // Fetch all WorkOrders for this (productionOrderId, articlePartId, itemIndex) sorted by stepSequence asc
    const workOrders = await prisma.workOrder.findMany({
      where: {
        productionOrderId: barcode.productionOrderId!,
        articlePartId: barcode.articlePartId!,
        itemIndex: barcode.itemIndex!,
      },
      orderBy: { stepSequence: "asc" },
      include: {
        productionStep: { include: { department: true } },
        department: true,
        articlePart: true,
        productionOrder: true,
      },
    });

    // Build stepsProgress list
    const stepsProgress: StepProgress[] = workOrders.map((wo) => ({
      stepName: wo.productionStep?.stepName ?? "",
      stepSequence: wo.stepSequence,
      departmentName: wo.productionStep?.department?.name ?? wo.department?.name ?? "",
      status: wo.status as "pending" | "in_progress" | "completed",
    }));

    const totalSteps = stepsProgress.length;
    const partName = (barcode as any).articlePart?.partName ?? "";
    const dimensions = (barcode as any).articlePart?.dimensions ?? null;
    const productionOrderRef = barcode.productionOrderId ?? "";

    // Determine the next step and action
    // 1. Check for in_progress WO
    const inProgressWO = workOrders.find((wo) => wo.status === WorkOrderStatus.in_progress);
    if (inProgressWO) {
      const currentStep = workOrders.indexOf(inProgressWO) + 1;
      return {
        barcode: barcodeData,
        action: "needs_confirmation",
        workOrder: inProgressWO,
        stepsProgress,
        totalSteps,
        currentStep,
        partName,
        dimensions,
        productionOrderRef,
      };
    }

    // 2. Check if all completed
    const allCompleted = workOrders.length > 0 && workOrders.every((wo) => wo.status === WorkOrderStatus.completed);
    if (allCompleted) {
      return {
        barcode: barcodeData,
        action: "all_completed",
        stepsProgress,
        totalSteps,
        currentStep: totalSteps,
        partName,
        dimensions,
        productionOrderRef,
      };
    }

    // 3. Find first pending WO and check if all predecessors are completed
    for (let i = 0; i < workOrders.length; i++) {
      const wo = workOrders[i];
      if (wo.status === WorkOrderStatus.pending) {
        const allPreviousCompleted = workOrders
          .slice(0, i)
          .every((prev) => prev.status === WorkOrderStatus.completed);

        if (allPreviousCompleted) {
          // Can start this step — but DON'T start it here, that's done in the API
          return {
            barcode: barcodeData,
            action: "started",
            workOrder: wo,
            stepsProgress,
            totalSteps,
            currentStep: i + 1,
            partName,
            dimensions,
            productionOrderRef,
          };
        } else {
          // Blocked — find the blocking step (first non-completed predecessor)
          const blockingWO = workOrders.slice(0, i).find((prev) => prev.status !== WorkOrderStatus.completed);
          return {
            barcode: barcodeData,
            action: "blocked",
            workOrder: wo,
            blockingStep: blockingWO
              ? {
                  stepName: blockingWO.productionStep?.stepName ?? "",
                  stepSequence: blockingWO.stepSequence ?? 0,
                  departmentName: blockingWO.productionStep?.department?.name ?? blockingWO.department?.name ?? "",
                }
              : undefined,
            stepsProgress,
            totalSteps,
            currentStep: i + 1,
            partName,
            dimensions,
            productionOrderRef,
          };
        }
      }
    }

    // Fallback — shouldn't normally reach here, but handle gracefully
    return {
      barcode: barcodeData,
      action: "all_completed",
      stepsProgress,
      totalSteps,
      currentStep: totalSteps,
      partName,
      dimensions,
      productionOrderRef,
    };
  },

  /**
   * Look up an entity by barcode value.
   * Returns the barcode data along with the associated work order or production order.
   */
  async lookup(barcodeValue: string): Promise<BarcodeInfo> {
    const barcode = await prisma.barcode.findUnique({
      where: { value: barcodeValue },
      include: {
        workOrder: {
          include: {
            articlePart: {
              include: {
                productionSteps: { include: { department: true }, orderBy: { sequenceOrder: 'asc' } },
              },
            },
            department: true,
            productionOrder: true,
            productionStep: { include: { department: true } },
          },
        },
        productionOrder: {
          include: {
            article: true,
          },
        },
      },
    });

    if (!barcode) {
      throw new Error(`Barcode "${barcodeValue}" not found`);
    }

    const imageBase64 = await generateBarcodeImage(barcode.value);

    const result: BarcodeInfo = {
      barcode: {
        id: barcode.id,
        value: barcode.value,
        type: barcode.type,
        imageBase64,
      },
      workOrder: barcode.workOrder ?? undefined,
      productionOrder: barcode.productionOrder ?? undefined,
      articlePart: barcode.workOrder?.articlePart ?? undefined,
    };

    // Add step info if this is a work order with a production step
    const wo = barcode.workOrder as any;
    if (wo?.productionStep) {
      result.stepName = wo.productionStep.stepName;
      result.stepSequence = wo.stepSequence;
      result.departmentName = wo.productionStep.department?.name ?? '';
      result.instructions = wo.productionStep.instructions;
      result.estimatedTime = wo.productionStep.estimatedTime;

      // Get all steps progress for this part/item
      const allStepsForItem = await prisma.workOrder.findMany({
        where: {
          productionOrderId: wo.productionOrderId,
          articlePartId: wo.articlePartId,
          itemIndex: wo.itemIndex,
          stepSequence: { not: null },
        },
        orderBy: { stepSequence: 'asc' },
        include: { productionStep: { include: { department: true } } },
      });

      result.totalSteps = allStepsForItem.length;
      result.stepsProgress = allStepsForItem.map((stepWo: any) => ({
        stepName: stepWo.productionStep?.stepName ?? '',
        stepSequence: stepWo.stepSequence,
        departmentName: stepWo.productionStep?.department?.name ?? '',
        status: stepWo.status,
      }));
    }

    try {
      await AuditLogService.log({
        entityType: "barcode",
        entityId: barcode.id,
        action: "barcode_scan",
        details: { barcodeValue, result: { type: barcode.type, workOrderId: barcode.workOrderId, productionOrderId: barcode.productionOrderId } },
      });
    } catch (e) {
      console.error("Greška pri zapisivanju u revizijski dnevnik:", e);
    }

    return result;
  },

  /**
   * Generate a printable barcode label as a PNG buffer.
   * The label contains the barcode image, part name, dimensions, and production order reference.
   */
  async generateLabel(barcodeId: string): Promise<Buffer> {
    const barcode = await prisma.barcode.findUnique({
      where: { id: barcodeId },
      include: {
        workOrder: {
          include: {
            articlePart: true,
            productionOrder: true,
          },
        },
        productionOrder: {
          include: { article: true },
        },
        articlePart: true,
      },
    });

    if (!barcode) {
      throw new Error(`Barcode with id "${barcodeId}" does not exist`);
    }

    // Build the label text based on barcode type
    let altText = "";
    if (barcode.type === BarcodeType.part_identifier && barcode.articlePart) {
      const part = barcode.articlePart;
      const orderRef = (barcode.productionOrderId ?? "").substring(0, 8);
      const displayIndex = (barcode.itemIndex ?? 0) + 1;
      altText = `${part.partName}`;
      if (part.dimensions) {
        altText += ` | ${part.dimensions}`;
      }
      altText += ` | PO:${orderRef} | #${displayIndex}`;
    } else if (barcode.workOrder) {
      const part = barcode.workOrder.articlePart;
      const orderRef = barcode.workOrder.productionOrder.id.substring(0, 8);
      altText = `${part.partName}`;
      if (part.dimensions) {
        altText += ` | ${part.dimensions}`;
      }
      altText += ` | PO:${orderRef}`;
    } else if (barcode.productionOrder) {
      const article = barcode.productionOrder.article;
      const orderRef = barcode.productionOrder.id.substring(0, 8);
      if (article) {
        altText = `${article.name} | PO:${orderRef}`;
      } else {
        altText = `PO:${orderRef}`;
      }
    }

    const pngBuffer = await bwipjs.toBuffer({
      bcid: "code128",
      text: barcode.value,
      scale: 4,
      height: 60,
      includetext: true,
      textxalign: "center",
      paddingwidth: 10,
      paddingheight: 10,
      backgroundcolor: "FFFFFF",
      barcolor: "000000",
      alttext: altText,
    });

    return pngBuffer;
  },

  /**
   * Generate a barcode for an expanded bed component (e.g. "Lijeva Baza", "Desna Baza", "Nogice").
   * Uses the ComponentBarcode table. Idempotent — returns existing record if one already exists
   * for the same (productionOrderId, componentName, itemIndex) combination.
   */
  async generateComponentIdentifier(
    productionOrderId: string,
    sourceArticlePartId: string,
    componentName: string,
    itemIndex: number
  ): Promise<{ id: string; value: string; componentName: string; imageBase64: string }> {
    // Try to find existing record first (idempotent)
    const existing = await prisma.componentBarcode.findUnique({
      where: {
        unique_component_barcode: {
          productionOrderId,
          componentName,
          itemIndex,
        },
      },
    });

    if (existing) {
      const imageBase64 = await generateBarcodeImage(existing.value);
      return {
        id: existing.id,
        value: existing.value,
        componentName: existing.componentName,
        imageBase64,
      };
    }

    const value = `CB-${uuidv4().replace(/-/g, "").substring(0, 8).toUpperCase()}`;

    const record = await prisma.componentBarcode.create({
      data: {
        value,
        productionOrderId,
        articlePartId: sourceArticlePartId === "no-part" ? null : sourceArticlePartId,
        componentName,
        itemIndex,
      },
    });

    const imageBase64 = await generateBarcodeImage(record.value);
    return {
      id: record.id,
      value: record.value,
      componentName: record.componentName,
      imageBase64,
    };
  },

  /**
   * Remove orphaned component barcodes for a specific item.
   * Deletes any unscanned barcodes whose componentName is NOT in the expected set.
   * This cleans up barcodes from previous prints that used wrong component sets
   * (e.g., "Nogice" when withLegs=false, or "Lijeva Baza"/"Desna Baza" for narrow beds).
   */
  async cleanupOrphanedComponentBarcodes(
    productionOrderId: string,
    itemIndex: number,
    expectedComponentNames: string[]
  ): Promise<void> {
    const expectedSet = new Set(expectedComponentNames);

    // Find all barcodes for this item
    const allBarcodes = await prisma.componentBarcode.findMany({
      where: { productionOrderId, itemIndex },
      include: { packagingScan: true },
    });

    // Delete unscanned barcodes that are NOT in the expected set
    const orphanIds = allBarcodes
      .filter((bc) => !expectedSet.has(bc.componentName) && !bc.packagingScan)
      .map((bc) => bc.id);

    if (orphanIds.length > 0) {
      await prisma.componentBarcode.deleteMany({
        where: { id: { in: orphanIds } },
      });
    }
  },

  /**
   * Generate labels for all part_identifier barcodes of a production order.
   * Returns an array of label objects with barcode value, image, part info, and metadata.
   */
  async generatePartIdentifierLabels(productionOrderId: string): Promise<Array<{
    value: string;
    imageBase64: string;
    partName: string;
    dimensions: string | null;
    productionOrderRef: string;
    itemIndex: number;
    departmentName: string;
  }>> {
    const barcodes = await prisma.barcode.findMany({
      where: {
        productionOrderId,
        type: BarcodeType.part_identifier,
      },
      include: {
        articlePart: true,
      },
      orderBy: [
        { articlePartId: "asc" },
        { itemIndex: "asc" },
      ],
    });

    // Get work orders to find departments for each part
    const workOrders = await prisma.workOrder.findMany({
      where: {
        productionOrderId,
      },
      include: {
        department: true,
      },
    });

    // Create a map of articlePartId -> departmentName
    const partDepartmentMap = new Map<string, string>();
    for (const wo of workOrders) {
      if (!partDepartmentMap.has(wo.articlePartId)) {
        partDepartmentMap.set(wo.articlePartId, wo.department.name);
      }
    }

    const labels = await Promise.all(
      barcodes.map(async (barcode) => {
        const imageBase64 = await generateBarcodeImage(barcode.value);
        const departmentName = barcode.articlePartId 
          ? partDepartmentMap.get(barcode.articlePartId) ?? "Nepoznat odjel"
          : "Nepoznat odjel";
        
        return {
          value: barcode.value,
          imageBase64,
          partName: barcode.articlePart?.partName ?? "",
          dimensions: barcode.articlePart?.dimensions ?? null,
          productionOrderRef: productionOrderId.substring(0, 8),
          itemIndex: barcode.itemIndex ?? 0,
          departmentName,
        };
      })
    );

    return labels;
  },
};
