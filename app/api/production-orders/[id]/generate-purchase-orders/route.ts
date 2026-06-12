import { NextRequest, NextResponse } from "next/server";
import { ProductionOrderService } from "@/lib/services/production-order.service";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/config";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await ProductionOrderService.generatePurchaseOrders(id);
    revalidateTag(CACHE_TAGS.PRODUCTION_ORDERS, "max");
    revalidateTag(CACHE_TAGS.productionOrder(id), "max");
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("does not exist")) {
      return NextResponse.json(
        { status: 404, code: "NOT_FOUND", message },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
