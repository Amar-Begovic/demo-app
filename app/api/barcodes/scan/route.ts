import { NextRequest, NextResponse } from "next/server";
import { BarcodeService } from "@/lib/services/barcode.service";
import { WorkOrderService } from "@/lib/services/work-order.service";
import { BarcodeType, WorkOrderStatus } from "@/app/generated/prisma";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/config";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.value || typeof body.value !== "string") {
      return NextResponse.json(
        {
          status: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: { value: ["Barcode value is required"] },
        },
        { status: 400 }
      );
    }

    const departmentId: string | undefined = body.departmentId;

    // First, try a quick lookup to determine barcode type
    let info;
    try {
      info = await BarcodeService.lookup(body.value);
    } catch (lookupError) {
      // If not found in Barcode table, check ComponentBarcode table (CB- barcodes for packaging)
      const componentBarcode = await prisma.componentBarcode.findUnique({
        where: { value: body.value },
        include: { packagingScan: true },
      });

      if (componentBarcode) {
        // Handle as packaging scan
        const alreadyScanned = !!componentBarcode.packagingScan;

        if (!alreadyScanned) {
          await prisma.packagingScan.create({
            data: { componentBarcodeId: componentBarcode.id },
          });
        }

        const allBarcodes = await prisma.componentBarcode.findMany({
          where: {
            productionOrderId: componentBarcode.productionOrderId,
            itemIndex: componentBarcode.itemIndex,
          },
          include: { packagingScan: true },
          orderBy: { createdAt: "asc" },
        });

        const allComponents = allBarcodes.map((bc) => ({
          name: bc.componentName,
          scanned: !!bc.packagingScan,
          ...(bc.packagingScan
            ? { scannedAt: bc.packagingScan.scannedAt.toISOString() }
            : {}),
        }));

        const isComplete = allComponents.every((c) => c.scanned);

        return NextResponse.json({
          barcode: {
            id: componentBarcode.id,
            value: componentBarcode.value,
            type: "component",
            imageBase64: "",
          },
          action: "packaging_scan",
          componentName: componentBarcode.componentName,
          alreadyScanned,
          allComponents,
          isComplete,
        });
      }

      // Not found in either table
      throw lookupError;
    }

    // Handle part_identifier type
    if (info.barcode.type === BarcodeType.part_identifier) {
      const result = await BarcodeService.lookupPartIdentifier(body.value);

      // Department validation: if departmentId is provided and action is "started" or "needs_confirmation"
      if (departmentId && (result.action === "started" || result.action === "needs_confirmation") && result.workOrder) {
        const wo = result.workOrder as any;
        const stepDepartmentId = wo.productionStep?.departmentId ?? wo.departmentId;
        if (stepDepartmentId && stepDepartmentId !== departmentId) {
          const stepDepartmentName = wo.productionStep?.department?.name ?? wo.department?.name ?? "";
          return NextResponse.json({
            ...result,
            action: "wrong_department",
            expectedDepartment: { id: stepDepartmentId, name: stepDepartmentName },
          });
        }
      }

      // If action is "started", actually start the work order
      if (result.action === "started" && result.workOrder) {
        try {
          const updated = await WorkOrderService.startWork(result.workOrder.id);
          revalidateTag(CACHE_TAGS.WORK_ORDERS, "max");
          revalidateTag(CACHE_TAGS.PRODUCTION_ORDERS, "max");
          return NextResponse.json({ ...result, workOrder: updated });
        } catch (startError) {
          const startMessage = (startError as Error).message;
          if (startMessage === "Prethodni korak nije završen") {
            return NextResponse.json({
              ...result,
              action: "blocked",
              reason: startMessage,
            });
          }
          throw startError;
        }
      }

      return NextResponse.json(result);
    }

    // Handle product type — PR scan = mark order as completed immediately
    if (info.barcode.type === BarcodeType.product && info.productionOrder) {
      const po = info.productionOrder as { id: string };
      const barcode = await prisma.barcode.findUnique({
        where: { value: body.value },
      });
      const itemIndex = barcode?.itemIndex;

      // Check component barcodes status (don't auto-scan, just report)
      let packagingStatus: { allScanned: boolean; missing: string[]; allComponents: { name: string; scanned: boolean }[] } | null = null;
      if (itemIndex != null) {
        const componentBarcodes = await prisma.componentBarcode.findMany({
          where: { productionOrderId: po.id, itemIndex },
          include: { packagingScan: true },
        });

        if (componentBarcodes.length > 0) {
          const missing = componentBarcodes.filter((cb) => !cb.packagingScan).map((cb) => cb.componentName);
          packagingStatus = {
            allScanned: missing.length === 0,
            missing,
            allComponents: componentBarcodes.map((cb) => ({
              name: cb.componentName,
              scanned: !!cb.packagingScan,
            })),
          };
        }
      }

      // Mark production order as completed immediately
      let orderCompleted = false;
      try {
        await prisma.productionOrder.update({
          where: { id: po.id },
          data: { status: "completed" },
        });
        orderCompleted = true;
        revalidateTag(CACHE_TAGS.PRODUCTION_ORDERS, "max");
      } catch { /* ignore */ }

      return NextResponse.json({
        ...info,
        action: "packaging_completed",
        packagingStatus,
        orderCompleted,
      });
    }

    // Handle work_order type (existing logic — backward compatibility)
    if (info.barcode.type === BarcodeType.work_order && info.workOrder) {
      const wo = info.workOrder as { id: string; status: WorkOrderStatus };

      if (wo.status === WorkOrderStatus.pending) {
        try {
          const updated = await WorkOrderService.startWork(wo.id);
          revalidateTag(CACHE_TAGS.WORK_ORDERS, "max");
          revalidateTag(CACHE_TAGS.PRODUCTION_ORDERS, "max");
          return NextResponse.json({ ...info, workOrder: updated, action: "started" });
        } catch (startError) {
          const startMessage = (startError as Error).message;
          if (startMessage === "Prethodni korak nije završen") {
            return NextResponse.json({ ...info, action: "blocked", reason: startMessage });
          }
          throw startError;
        }
      }

      if (wo.status === WorkOrderStatus.in_progress) {
        // Don't auto-complete - return needs_confirmation so UI can show checklist
        return NextResponse.json({ ...info, action: "needs_confirmation" });
      }
    }

    return NextResponse.json({ ...info, action: "none" });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("not found")) {
      return NextResponse.json(
        { status: 404, code: "NOT_FOUND", message },
        { status: 404 }
      );
    }
    if (message.includes("Cannot")) {
      return NextResponse.json(
        { status: 422, code: "BUSINESS_LOGIC_ERROR", message },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
