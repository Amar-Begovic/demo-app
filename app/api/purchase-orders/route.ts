import { NextRequest, NextResponse } from "next/server";
import { PurchaseOrderService } from "@/lib/services/purchase-order.service";
import { PurchaseOrderStatus } from "@/app/generated/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const filters: { status?: PurchaseOrderStatus; productionOrderId?: string } = {};

    const statusParam = searchParams.get("status");
    if (statusParam && Object.values(PurchaseOrderStatus).includes(statusParam as PurchaseOrderStatus)) {
      filters.status = statusParam as PurchaseOrderStatus;
    }

    const poId = searchParams.get("productionOrderId");
    if (poId) filters.productionOrderId = poId;

    const orders = await PurchaseOrderService.getAll(filters);
    return NextResponse.json(orders);
  } catch (error) {
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message: (error as Error).message },
      { status: 500 }
    );
  }
}
