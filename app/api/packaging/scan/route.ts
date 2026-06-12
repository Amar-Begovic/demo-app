import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ProductionOrderStatus } from "@/app/generated/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.barcodeValue || typeof body.barcodeValue !== "string") {
      return NextResponse.json(
        {
          status: 400,
          code: "VALIDATION_ERROR",
          message: "Barcode value is required",
        },
        { status: 400 }
      );
    }

    const componentBarcode = await prisma.componentBarcode.findUnique({
      where: { value: body.barcodeValue },
      include: { packagingScan: true },
    });

    if (!componentBarcode) {
      return NextResponse.json(
        {
          status: 404,
          code: "NOT_FOUND",
          message: "Barkod nije pronađen",
        },
        { status: 404 }
      );
    }

    const alreadyScanned = !!componentBarcode.packagingScan;

    if (!alreadyScanned) {
      await prisma.packagingScan.create({
        data: { componentBarcodeId: componentBarcode.id },
      });
    }

    // Check all components for this specific item
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

    // When all components for this item are scanned, check if ALL items in the order are complete
    let orderCompleted = false;
    if (isComplete) {
      const allOrderBarcodes = await prisma.componentBarcode.findMany({
        where: { productionOrderId: componentBarcode.productionOrderId },
        include: { packagingScan: true },
      });

      const allOrderComplete = allOrderBarcodes.every((bc) => !!bc.packagingScan);

      if (allOrderComplete) {
        // Mark the production order as completed
        const order = await prisma.productionOrder.findUnique({
          where: { id: componentBarcode.productionOrderId },
        });
        if (order && order.status !== ProductionOrderStatus.completed) {
          await prisma.productionOrder.update({
            where: { id: componentBarcode.productionOrderId },
            data: { status: ProductionOrderStatus.completed },
          });
          orderCompleted = true;
        }
      }
    }

    const scannedComponent = alreadyScanned
      ? componentBarcode.packagingScan!
      : await prisma.packagingScan.findUnique({
          where: { componentBarcodeId: componentBarcode.id },
        });

    // Get order number for the response
    const orderInfo = await prisma.productionOrder.findUnique({
      where: { id: componentBarcode.productionOrderId },
      select: { orderNumber: true },
    });

    return NextResponse.json({
      component: {
        name: componentBarcode.componentName,
        ...(scannedComponent
          ? { scannedAt: scannedComponent.scannedAt.toISOString() }
          : {}),
      },
      allComponents,
      isComplete,
      alreadyScanned,
      orderCompleted,
      orderNumber: orderInfo?.orderNumber ?? null,
    });
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
