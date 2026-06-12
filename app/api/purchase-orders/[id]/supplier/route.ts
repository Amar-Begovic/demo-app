import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { PurchaseOrderService } from "@/lib/services/purchase-order.service";
import { CACHE_TAGS } from "@/lib/cache/config";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updatedPO = await PurchaseOrderService.updateSupplier(id, body.supplierId);

    revalidateTag(CACHE_TAGS.PRODUCTION_ORDERS, "max");

    return NextResponse.json(updatedPO);
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("does not exist")) {
      return NextResponse.json(
        { status: 404, code: "NOT_FOUND", message },
        { status: 404 }
      );
    }
    if (message.includes("Dobavljač se može promijeniti")) {
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
