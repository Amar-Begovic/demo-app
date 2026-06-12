import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const productionOrderId = request.nextUrl.searchParams.get("productionOrderId");
    const itemIndexParam = request.nextUrl.searchParams.get("itemIndex");

    if (!productionOrderId || !itemIndexParam) {
      return NextResponse.json(
        {
          status: 400,
          code: "VALIDATION_ERROR",
          message: "productionOrderId and itemIndex are required",
        },
        { status: 400 }
      );
    }

    const itemIndex = parseInt(itemIndexParam, 10);

    if (isNaN(itemIndex)) {
      return NextResponse.json(
        {
          status: 400,
          code: "VALIDATION_ERROR",
          message: "itemIndex must be a valid integer",
        },
        { status: 400 }
      );
    }

    const barcodes = await prisma.componentBarcode.findMany({
      where: { productionOrderId, itemIndex },
      include: { packagingScan: true },
      orderBy: { createdAt: "asc" },
    });

    const components = barcodes.map((bc) => ({
      name: bc.componentName,
      scanned: !!bc.packagingScan,
      ...(bc.packagingScan
        ? { scannedAt: bc.packagingScan.scannedAt.toISOString() }
        : {}),
    }));

    const isComplete = components.length > 0 && components.every((c) => c.scanned);

    return NextResponse.json({ components, isComplete });
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
