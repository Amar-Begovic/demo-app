import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PurchaseOrderService } from "@/lib/services/purchase-order.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { materialId: true },
    });
    if (!po) {
      return NextResponse.json(
        { status: 404, code: "NOT_FOUND", message: `Purchase order with id "${id}" does not exist` },
        { status: 404 }
      );
    }

    const suppliers = await PurchaseOrderService.getAvailableSuppliers(po.materialId);
    return NextResponse.json(suppliers);
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
