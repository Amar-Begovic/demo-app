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
    const workOrders = await ProductionOrderService.generateWorkOrders(id);
    revalidateTag(CACHE_TAGS.PRODUCTION_ORDERS, "max");
    revalidateTag(CACHE_TAGS.productionOrder(id), "max");
    revalidateTag(CACHE_TAGS.WORK_ORDERS, "max");
    return NextResponse.json(workOrders, { status: 201 });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("does not exist") || message.includes("Cannot generate")) {
      const status = message.includes("does not exist") ? 404 : 422;
      const code = status === 404 ? "NOT_FOUND" : "BUSINESS_LOGIC_ERROR";
      return NextResponse.json(
        { status, code, message },
        { status }
      );
    }
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
